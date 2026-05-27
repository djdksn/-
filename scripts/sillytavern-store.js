/**
 * Vanilla Pub-Sub Store — replaces React useSillytavern hook.
 * Single global state tree, subscribers notified on every change.
 */
import {
  DEFAULT_SETTINGS, DEFAULT_TAGS, DEFAULT_OPAQUE_TAGS,
} from './sillytavern/types.js';
import {
  getDatabase, initializeDatabase,
  getLorebooks, saveLorebook as dbSaveLorebook, deleteLorebook as dbDeleteLorebook,
  getPresets, savePreset as dbSavePreset, deletePreset as dbDeletePreset,
  getSettings, saveSettings as dbSaveSettings,
  getChats, saveChat as dbSaveChat, deleteChat as dbDeleteChat,
  getRegexScripts, saveRegexScript as dbSaveRegexScript, deleteRegexScript as dbDeleteRegexScript,
} from './sillytavern/database.js';
import { createDefaultLorebook } from './sillytavern/editor-utils.js';
import { createDefaultPreset } from './sillytavern/types.js';
import { assemblePrompt } from './sillytavern/prompt-assembler.js';
import { StreamTagParser } from './sillytavern/stream-parser.js';
import { createApiRouter } from './sillytavern/api-router.js';
import { createDefaultRegexScript, getRegexedString, REGEX_PLACEMENT } from './sillytavern/regex-engine.js';
import { execute as executeCommand, parse as parseCommand } from './sillytavern/slash-commands.js';
import { renderTemplate } from './sillytavern/ejs-engine.js';
import { runTriggered } from './sillytavern/script-manager.js';
import { processUpdateVariables } from './sillytavern/mvu-engine.js';
import { deepMerge } from './sillytavern/init-variables.js';

class SillytavernStore {
  constructor() {
    this._listeners = new Set();

    // core state
    this.lorebooks = [];
    this.presets = [];
    this.settings = null;
    this.chats = [];
    this.regexScripts = [];
    this.activeChatId = null;
    this.initialized = false;
    this.isSending = false;

    // stream state
    this.streamState = { thinking: '', maintext: '', options: [], sum: '', varsRaw: '', w2gRaw: '', isStreaming: false };

    // modal flags
    this.showSettings = false;
    this.showLorebooks = false;
    this.showPresets = false;
    this.showHistory = false;
    this.toast = null;

    // internal
    this._db = getDatabase();
    this._parser = null;
    this._router = null;
    this._abortController = null;
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify() {
    for (const fn of this._listeners) fn();
  }

  // ========== INIT ==========
  async loadAll() {
    await initializeDatabase();
    const [l, p, s, c, r] = await Promise.all([
      getLorebooks(), getPresets(), getSettings(), getChats(), getRegexScripts(),
    ]);
    this.lorebooks = l;
    this.presets = p;
    this.settings = s ? { ...DEFAULT_SETTINGS, ...s } : { ...DEFAULT_SETTINGS };
    this.chats = c;
    this.regexScripts = r;
    if (c.length > 0) this.activeChatId = c[0].id;
    this._router = createApiRouter(this.settings.api);
    this.initialized = true;
    this._notify();
  }

  // ========== DERIVED GETTERS ==========
  get activeChat() { return this.chats.find(c => c.id === this.activeChatId) ?? null; }
  get activePreset() {
    return this.presets.find(p => p.id === this.settings?.activePresetId) ?? this.presets[0] ?? null;
  }

  // ========== CHAT ACTIONS ==========
  async createChat(name, options) {
    if (!this.settings) throw new Error('Settings not loaded');
    const chat = {
      id: crypto.randomUUID(),
      name: name || `${this.settings.characterName} - 新对话`,
      messages: [],
      characterName: this.settings.characterName,
      userName: this.settings.userName,
      presetId: options?.presetId ?? this.settings.activePresetId ?? null,
      lorebookIds: options?.lorebookIds ?? this.settings.activeLorebookIds ?? [],
      variables: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await dbSaveChat(chat);
    this.chats = [...this.chats, chat];
    this.activeChatId = chat.id;
    this._notify();
    return chat.id;
  }

  selectChat(id) { this.activeChatId = id; this._notify(); }

  async removeChat(id) {
    await dbDeleteChat(id);
    this.chats = this.chats.filter(c => c.id !== id);
    if (this.activeChatId === id) {
      this.activeChatId = this.chats[0]?.id ?? null;
    }
    this._notify();
  }

  async sendMessage(text, role) {
    const chat = this.activeChat;
    if (!chat) return;
    const msg = { id: crypto.randomUUID(), role: role || 'user', content: text, timestamp: Date.now() };
    const next = { ...chat, messages: [...chat.messages, msg], updatedAt: Date.now() };
    await dbSaveChat(next);
    this.chats = this.chats.map(c => c.id === next.id ? next : c);
    this._notify();
  }

  async deleteMessage(messageId) {
    const chat = this.activeChat;
    if (!chat) return;
    const next = { ...chat, messages: chat.messages.filter(m => m.id !== messageId), updatedAt: Date.now() };
    await dbSaveChat(next);
    this.chats = this.chats.map(c => c.id === next.id ? next : c);
    this._notify();
  }

  async editMessage(messageId, newContent) {
    const chat = this.activeChat;
    if (!chat) return;
    const next = {
      ...chat,
      messages: chat.messages.map(m => m.id === messageId ? { ...m, content: newContent } : m),
      updatedAt: Date.now(),
    };
    await dbSaveChat(next);
    this.chats = this.chats.map(c => c.id === next.id ? next : c);
    this._notify();
  }

  async rollbackTo(messageId) {
    const chat = this.activeChat;
    if (!chat) return;
    const idx = chat.messages.findIndex(m => m.id === messageId);
    if (idx < 0) return;
    const next = { ...chat, messages: chat.messages.slice(0, idx + 1), updatedAt: Date.now() };
    await dbSaveChat(next);
    this.chats = this.chats.map(c => c.id === next.id ? next : c);
    this._notify();
  }

  // ========== v3 GAME MODE: sendGameMessage ==========
  async sendGameMessage(userText) {
    const chat = this.activeChat;
    if (!chat || !this.settings) return;

    // Slash command interception
    const cmdParsed = parseCommand(userText);
    if (cmdParsed.isCommand) {
      const result = await executeCommand(userText, {
        chat,
        userName: this.settings.userName,
        characterName: this.settings.characterName,
        userInput: userText,
      });
      if (result.handled && result.output) {
        this.showToast(result.output);
      }
      this._notify();
      return;
    }

    this.isSending = true;
    this._notify();

    const userMsg = { id: crypto.randomUUID(), role: 'user', content: userText, timestamp: Date.now() };
    let updatedChat = { ...chat, messages: [...chat.messages, userMsg], updatedAt: Date.now() };
    await this._db.table('chats').put(updatedChat);
    this.chats = this.chats.map(c => c.id === updatedChat.id ? updatedChat : c);
    this._notify();

    const activeLorebookIds = new Set(this.settings.activeLorebookIds ?? []);
    const activeBooks = this.lorebooks.filter(l => activeLorebookIds.has(l.id));
    const activePreset = this.activePreset;
    if (!activePreset) {
      this.isSending = false;
      this._notify();
      return;
    }

    const promptOpts = {
      userInput: userText,
      history: updatedChat.messages,
      preset: activePreset,
      lorebooks: activeBooks,
      userName: this.settings.userName,
      characterName: this.settings.characterName,
      variables: updatedChat.variables,
      formatPrompt: this.settings.formatPromptTemplate,
      regexScripts: this.regexScripts,
      characterTags: this.settings.characterTags || [],
      triggerFilter: 'normal',
      additionalContexts: {
        personaDescription: activePreset.settings.persona_description,
        characterDescription: activePreset.settings.character_description,
        characterPersonality: activePreset.settings.character_personality,
        scenario: activePreset.settings.scenario,
      },
    };

    const assembled = await assemblePrompt(promptOpts);
    const { messages } = assembled;

    // Store for prompt-viewer
    this._lastMessages = messages;
    this._lastAssembled = promptOpts;

    // Trigger onSend scripts
    try {
      await runTriggered({
        chat: updatedChat,
        userName: this.settings.userName,
        characterName: this.settings.characterName,
        userInput: userText,
      }, 'onSend');
    } catch (err) {
      console.error('[Store] Script onSend hook error:', err);
    }

    // Start streaming
    const tags = this.settings.customTags ?? [...DEFAULT_TAGS];
    const opaqueTags = [...DEFAULT_OPAQUE_TAGS];
    this._parser = new StreamTagParser(tags, opaqueTags);
    const eventBuf = [];
    this.streamState = { thinking: '', maintext: '', options: [], sum: '', varsRaw: '', w2gRaw: '', isStreaming: true };
    this._notify();

    if (!this._router) this._router = createApiRouter(this.settings.api);

    try {
      await this._router.sendStream({
        task: 'story',
        messages,
        onChunk: (delta) => {
          if (!this._parser) return;
          const events = this._parser.feed(delta);
          eventBuf.push(...events);
          this._applyEvents(events);
          this._notify();
        },
      });
    } catch (e) {
      this.streamState.isStreaming = false;
      this.isSending = false;
      this._notify();
      throw e;
    }

    // Finish
    if (this._parser) {
      const tail = this._parser.finish();
      eventBuf.push(...tail);
    }

    const STRUCTURAL_TAGS = new Set(['thinking', 'think', 'vars', 'sum', 'w2g']);
    let rawContent = eventBuf
      .filter(e => (e.type === 'tag-chunk' || e.type === 'raw') && !STRUCTURAL_TAGS.has(e.tag))
      .map(e => e.chunk)
      .join('');

    // MVU: process <UpdateVariable> blocks before EJS post-processing
    let mvuResults = [];
    try {
      const mvuResult = processUpdateVariables(rawContent, {
        chat: updatedChat,
        msgId: 'assistant-temp',
      });
      rawContent = mvuResult.cleanedContent;
      mvuResults = mvuResult.results;
      if (mvuResults.length > 0) {
        updatedChat = {
          ...updatedChat,
          variables: { ...updatedChat.variables },
        };
        console.log('[MVU] Processed %d UpdateVariable block(s):',
          mvuResults.length,
          mvuResults.map(r => `${r.patchesApplied} patches, ${r.errors.length} errors`).join('; ')
        );
      }
    } catch (err) {
      console.error('[Store] MVU processing error:', err);
    }

    // Process <vars> JSON block — deep-merge into chat variables
    try {
      if (this.streamState.varsRaw && this.streamState.varsRaw.trim()) {
        const varsJson = JSON.parse(this.streamState.varsRaw.trim());
        const merged = deepMerge(updatedChat.variables || {}, varsJson);
        updatedChat = { ...updatedChat, variables: merged };
        console.log('[Store] <vars> merged into chat variables:', Object.keys(varsJson));
      }
    } catch (err) {
      console.warn('[Store] <vars> parse error (skipped):', err.message);
    }

    // Sync new NPCs from variable store to GameData.characters (for sidebar roster)
    syncNpcsToGameData(updatedChat.variables);

    // EJS post-processing on assistant reply
    try {
      rawContent = await renderTemplate(rawContent, {
        chat: updatedChat,
        msg: { id: 'assistant-temp', role: 'assistant' },
        userName: this.settings.userName,
        characterName: this.settings.characterName,
        userInput: userText,
      });
    } catch (err) {
      console.error('[Store] EJS post-process error:', err);
    }

    const assistantMsg = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: rawContent,
      parsed: {
        thinking: this.streamState.thinking || undefined,
        maintext: this.streamState.maintext || rawContent,
        sum: this.streamState.sum || undefined,
        w2g: this.streamState.w2gRaw || undefined,
      },
      timestamp: Date.now(),
      apiUsed: 'primary',
    };
    const finalChat = {
      ...updatedChat,
      messages: [...updatedChat.messages, assistantMsg],
      variables: updatedChat.variables,
      updatedAt: Date.now(),
    };
    await this._db.table('chats').put(finalChat);
    this.chats = this.chats.map(c => c.id === finalChat.id ? finalChat : c);

    // Trigger onMessage scripts
    try {
      await runTriggered({
        chat: finalChat,
        userName: this.settings.userName,
        characterName: this.settings.characterName,
        userInput: userText,
      }, 'onMessage');
    } catch (err) {
      console.error('[Store] Script onMessage hook error:', err);
    }
    this.streamState = { thinking: '', maintext: '', options: [], sum: '', varsRaw: '', w2gRaw: '', isStreaming: false };
    this.isSending = false;
    this._notify();
  }

  jumpToFloor(messageId) {
    const chat = this.activeChat;
    if (!chat) return;
    const idx = chat.messages.findIndex(m => m.id === messageId);
    if (idx < 0) return;
    const truncated = chat.messages.slice(0, idx + 1);
    const next = { ...chat, messages: truncated, updatedAt: Date.now() };
    this._db.table('chats').put(next);
    this.chats = this.chats.map(c => c.id === next.id ? next : c);
    this._notify();
  }

  async regenerateLast() {
    const chat = this.activeChat;
    if (!chat) return;
    const lastUserIdx = [...chat.messages].reverse().findIndex(m => m.role === 'user');
    if (lastUserIdx < 0) return;
    const targetIdx = chat.messages.length - 1 - lastUserIdx;
    const truncated = chat.messages.slice(0, targetIdx);
    const next = { ...chat, messages: truncated, updatedAt: Date.now() };
    await this._db.table('chats').put(next);
    this.chats = this.chats.map(c => c.id === next.id ? next : c);
    this._notify();
    await this.sendGameMessage(chat.messages[targetIdx].content);
  }

  _applyEvents(events) {
    for (const ev of events) {
      if (ev.type === 'tag-chunk') {
        if (ev.tag === 'maintext') this.streamState.maintext += ev.chunk;
        else if (ev.tag === 'thinking' || ev.tag === 'think') this.streamState.thinking += ev.chunk;
        else if (ev.tag === 'sum') this.streamState.sum += ev.chunk;
        else if (ev.tag === 'vars') this.streamState.varsRaw += ev.chunk;
        else if (ev.tag === 'w2g') this.streamState.w2gRaw += ev.chunk;
      } else if (ev.type === 'option-line') {
        this.streamState.options = [...this.streamState.options, ev.line];
      }
    }
  }

  // ========== SETTINGS / PRESET / LOREBOOK MUTATIONS ==========
  async updateSettings(patch) {
    const prev = this.settings || { ...DEFAULT_SETTINGS };
    const next = { ...prev, ...patch };
    this.settings = next;
    try { await dbSaveSettings(next); } catch {}
    if (patch.api) this._router = createApiRouter(this.settings.api);
    this._notify();
  }

  async toggleLorebook(id) {
    if (!this.settings) return;
    const ids = new Set(this.settings.activeLorebookIds ?? []);
    if (ids.has(id)) ids.delete(id); else ids.add(id);
    const next = { ...this.settings, activeLorebookIds: Array.from(ids) };
    await dbSaveSettings(next);
    this.settings = next;
    this._notify();
  }

  async addLorebookFromDefault(name) {
    const book = createDefaultLorebook(name);
    await dbSaveLorebook(book);
    this.lorebooks = [...this.lorebooks, book];
    this._notify();
    return book;
  }

  async addPresetFromDefault(name) {
    const base = createDefaultPreset();
    const preset = { id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now(), ...base, name };
    await dbSavePreset(preset);
    this.presets = [...this.presets, preset];
    this._notify();
    return preset;
  }

  async updateLorebook(book) {
    const next = { ...book, updatedAt: Date.now() };
    await dbSaveLorebook(next);
    this.lorebooks = this.lorebooks.map(b => b.id === next.id ? next : b);
    this._notify();
  }

  async deleteLorebook(id) {
    await dbDeleteLorebook(id);
    this.lorebooks = this.lorebooks.filter(b => b.id !== id);
    if (this.settings?.activeLorebookIds?.includes(id)) {
      await this.updateSettings({ activeLorebookIds: this.settings.activeLorebookIds.filter(x => x !== id) });
    }
    this._notify();
  }

  async updatePreset(preset) {
    const next = { ...preset, updatedAt: Date.now() };
    await dbSavePreset(next);
    const idx = this.presets.findIndex(p => p.id === next.id);
    if (idx >= 0) {
      this.presets = [...this.presets.slice(0, idx), next, ...this.presets.slice(idx + 1)];
    } else {
      this.presets = [...this.presets, next];
    }
    this._notify();
  }

  async deletePreset(id) {
    await dbDeletePreset(id);
    this.presets = this.presets.filter(p => p.id !== id);
    if (this.settings?.activePresetId === id) {
      await this.updateSettings({ activePresetId: null });
    }
    this._notify();
  }

  // ========== REGEX SCRIPT MUTATIONS ==========
  async addRegexScript() {
    const script = createDefaultRegexScript();
    await dbSaveRegexScript(script);
    this.regexScripts = [...this.regexScripts, script];
    this._notify();
    return script;
  }

  async updateRegexScript(script) {
    const next = { ...script, updatedAt: Date.now() };
    await dbSaveRegexScript(next);
    const idx = this.regexScripts.findIndex(s => s.id === next.id);
    if (idx >= 0) {
      this.regexScripts = [...this.regexScripts.slice(0, idx), next, ...this.regexScripts.slice(idx + 1)];
    } else {
      this.regexScripts = [...this.regexScripts, next];
    }
    this._notify();
    return next;
  }

  async deleteRegexScript(id) {
    await dbDeleteRegexScript(id);
    this.regexScripts = this.regexScripts.filter(s => s.id !== id);
    this._notify();
  }

  async importRegexScripts(scripts) {
    for (const s of scripts) {
      s.id = s.id || crypto.randomUUID();
      s.createdAt = s.createdAt || Date.now();
      s.updatedAt = Date.now();
    }
    // Save each individually (upsert) and merge into memory
    for (const s of scripts) {
      await dbSaveRegexScript(s);
    }
    const existingIds = new Set(this.regexScripts.map(s => s.id));
    const merged = [...this.regexScripts];
    for (const s of scripts) {
      if (existingIds.has(s.id)) {
        const idx = merged.findIndex(x => x.id === s.id);
        if (idx >= 0) merged[idx] = s;
      } else {
        merged.push(s);
      }
    }
    this.regexScripts = merged;
    this._notify();
  }

  runRegexOnText(text, placement, params = {}) {
    return getRegexedString(text, placement, { ...params, scripts: this.regexScripts });
  }

  showToast(msg) {
    this.toast = msg;
    this._notify();
    setTimeout(() => { this.toast = null; this._notify(); }, 2000);
  }

  executeSlashCommand(input) {
    return executeCommand(input, {
      chat: this.activeChat,
      userName: this.settings?.userName,
      characterName: this.settings?.characterName,
      userInput: input,
    });
  }
}

// —— Normalize Japanese kanji to simplified Chinese for name matching ——
// AI models often output Japanese kanji (桜, 園, 島) instead of simplified Chinese (樱, 园, 岛)
// This normalizes names so that both forms match the same character.
const KANJI_NORM_MAP = {
  '桜': '樱', '園': '园', '島': '岛', '瀬': '濑', '綾': '绫',
  '結': '结', '穂': '穗', '倉': '仓', '嵐': '岚', '紀': '纪',
  '気': '气', '樹': '树', '葉': '叶', '絵': '绘', '亜': '亚',
  '歩': '步', '様': '样', '経': '经', '検': '检', '験': '验',
};
function normalizeName(name) {
  if (!name) return name;
  let result = '';
  for (const ch of name) {
    result += KANJI_NORM_MAP[ch] || ch;
  }
  return result;
}

// —— Infer category + orgs from NPC identity string ——
function inferCategoryOrg(identity) {
  if (!identity) return { category: 'student', orgs: [] };
  const id = identity.toLowerCase();

  // Category inference
  let category = 'external';
  if (/学生|大一|大二|大三|大四|年级|在校/.test(id)) category = 'student';
  else if (/教师|老师|教授|校医|护士|顾问|讲师|导员/.test(id)) category = 'staff';

  // Organization inference by keyword
  const orgs = [];
  if (/学生会/.test(identity)) orgs.push({ org: 'org-student-council', role: '干事' });
  if (/性爱部/.test(identity)) orgs.push({ org: 'org-sex-club', role: '部员' });
  if (/保健室/.test(identity)) orgs.push({ org: 'org-health-room', role: '校医' });
  if (/夕月|温泉/.test(identity)) orgs.push({ org: 'org-yuzuki-onsen', role: '工作人员' });
  if (/诊所|医疗|医师/.test(identity)) orgs.push({ org: 'org-sakuraoka-clinic', role: '医护人员' });

  return { category, orgs };
}

// —— Sync new NPCs from variable store to GameData for sidebar roster display ——
export function syncNpcsToGameData(variables) {
  if (typeof GameData === 'undefined' || !variables) return;
  const npcs = variables['NPC花名册'];
  if (!npcs) return;
  const existingNames = new Set(GameData.characters.map(c => c.name));
  const normalizedExisting = new Set(GameData.characters.map(c => normalizeName(c.name)));
  const tones = ['sakura', 'wisteria', 'amber', 'moss', 'ink', 'vermil'];

  for (const [npcName, npcData] of Object.entries(npcs)) {
    const s = npcData?.静态数据;
    if (!s) continue;
    const social = s.社会情况 || {};
    const identity = social.身份 || '';

    // Also patch existing entries that lack category/orgs
    const normName = normalizeName(npcName);
    if (existingNames.has(npcName) || normalizedExisting.has(normName)) {
      const existing = GameData.characters.find(c => c.name === npcName || normalizeName(c.name) === normName);
      if (existing && (!existing.category || (existing.orgs && existing.orgs.length === 0 && identity))) {
        const { category, orgs } = inferCategoryOrg(identity);
        if (!existing.category) existing.category = category;
        if (existing.orgs && existing.orgs.length === 0 && orgs.length > 0) {
          existing.orgs = orgs;
          console.log('[Store] Patched existing NPC:', npcName, { category, orgs: orgs.map(o => o.org) });
        }
      }
      continue;
    }
    const body = s.身体形状 || {};
    const details = s.个人细节 || {};
    const dynamic = npcData?.动态数据 || {};
    const clothes = dynamic.人物穿着 || {};
    const wearStr = Object.entries(clothes).filter(([,v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ') || '暂无数据';

    const { category, orgs } = inferCategoryOrg(identity);

    const charEntry = {
      id: 'ch-' + npcName.replace(/[^一-龥a-zA-Z]/g, '-').toLowerCase().replace(/-+/g, '-'),
      name: npcName,
      kana: social.全名 || npcName,
      tone: tones[Object.keys(npcs).length % tones.length],
      avatar: npcName.charAt(0),
      age: social.年龄 || 0,
      year: identity || '未知',
      height: body.身高 ? `${body.身高} cm` : '? cm',
      category,
      orgs,
      look: body.体型概述 || social.性格 || '暂无描述',
      build: body.体型概述 || '',
      wear: wearStr,
      thoughts: dynamic.内心想法 || '',
      relations: [],
      special: '',
      tagline: '',
    };

    GameData.characters.push(charEntry);
    existingNames.add(npcName);
    console.log('[Store] Synced new NPC to GameData:', npcName, { category, orgs: orgs.map(o => o.org) });
  }
}

export const store = new SillytavernStore();
