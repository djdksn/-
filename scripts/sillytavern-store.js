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
  getScripts, saveScript as dbSaveScript, deleteScript as dbDeleteScript,
  getTemplates, saveTemplate as dbSaveTemplate, deleteTemplate as dbDeleteTemplate,
} from './sillytavern/database.js';
import { createDefaultLorebook } from './sillytavern/editor-utils.js';
import { createDefaultPreset } from './sillytavern/types.js';
import { assemblePrompt } from './sillytavern/prompt-assembler.js';
import { aggregateEvents } from './sillytavern/variables.js';
import { StreamTagParser } from './sillytavern/stream-parser.js';
import { createApiRouter } from './sillytavern/api-router.js';
import { emit, EVENTS } from './sillytavern/event-bus.js';
import { bindStore as bindExtensionStore } from './sillytavern/extension-api.js';
import { loadScripts as loadScriptDefs } from './sillytavern/script-runtime.js';

class SillytavernStore {
  constructor() {
    this._listeners = new Set();

    // core state
    this.lorebooks = [];
    this.presets = [];
    this.settings = null;
    this.chats = [];
    this.scripts = [];
    this.templates = [];
    this.activeChatId = null;
    this.initialized = false;
    this.isSending = false;

    // stream state
    this.streamState = { thinking: '', maintext: '', options: [], sum: '', varsRaw: '', isStreaming: false };

    // modal flags
    this.showSettings = false;
    this.showLorebooks = false;
    this.showPresets = false;
    this.showVariables = false;
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
    const [l, p, s, c, sc, tp] = await Promise.all([
      getLorebooks(), getPresets(), getSettings(), getChats(),
      getScripts(), getTemplates(),
    ]);
    this.lorebooks = l;
    this.presets = p;
    this.settings = s ? { ...DEFAULT_SETTINGS, ...s } : { ...DEFAULT_SETTINGS };
    this.chats = c;
    this.scripts = sc;
    this.templates = tp;
    if (c.length > 0) this.activeChatId = c[0].id;
    this._router = createApiRouter(this.settings.api);
    bindExtensionStore(this);
    this._reloadEnabledScripts();
    this.initialized = true;
    emit(EVENTS.APP_INIT, { lorebooks: l.length, presets: p.length, scripts: sc.length, templates: tp.length });
    this._notify();
  }

  _reloadEnabledScripts() {
    const enabledIds = new Set(this.settings?.enabledScriptIds || []);
    const defs = (this.scripts || []).filter(s => s.enabled !== false && (enabledIds.size === 0 || enabledIds.has(s.id)));
    loadScriptDefs(defs);
  }

  // ========== DERIVED GETTERS ==========
  get activeChat() { return this.chats.find(c => c.id === this.activeChatId) ?? null; }
  get activePreset() {
    return this.presets.find(p => p.id === this.settings?.activePresetId) ?? this.presets[0] ?? null;
  }

  // ========== CHAT ACTIONS ==========
  async createChat(name, options) {
    if (!this.settings) throw new Error('Settings not loaded');
    // Derive default variables from variableSchema
    const schema = this.settings.variableSchema || [];
    const defaultVars = {};
    for (const def of schema) {
      if (def.enabled !== false) defaultVars[def.key] = def.default ?? (def.type === 'number' ? 0 : '');
    }
    // Fallback to legacy defaultVariables if no schema
    const legacyDefaults = this.settings.defaultVariables || {};
    const merged = { ...legacyDefaults, ...defaultVars };
    const chat = {
      id: crypto.randomUUID(),
      name: name || `${this.settings.characterName} - 新对话`,
      messages: [],
      characterName: this.settings.characterName,
      userName: this.settings.userName,
      presetId: options?.presetId ?? this.settings.activePresetId ?? null,
      lorebookIds: options?.lorebookIds ?? this.settings.activeLorebookIds ?? [],
      variables: JSON.parse(JSON.stringify(merged)),
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

    this.isSending = true;
    this._notify();

    const userMsg = { id: crypto.randomUUID(), role: 'user', content: userText, timestamp: Date.now() };
    let updatedChat = { ...chat, messages: [...chat.messages, userMsg], updatedAt: Date.now() };
    await this._db.table('chats').put(updatedChat);
    this.chats = this.chats.map(c => c.id === updatedChat.id ? updatedChat : c);
    await emit(EVENTS.MESSAGE_USER, { chatId: updatedChat.id, message: userMsg });
    this._notify();

    const activeLorebookIds = new Set(this.settings.activeLorebookIds ?? []);
    const activeBooks = this.lorebooks.filter(l => activeLorebookIds.has(l.id));
    const activePreset = this.activePreset;
    if (!activePreset) {
      this.isSending = false;
      this._notify();
      return;
    }

    // ===== prompt:before — scripts may mutate the payload =====
    const promptOpts = {
      userInput: userText,
      history: updatedChat.messages,
      preset: activePreset,
      lorebooks: activeBooks,
      userName: this.settings.userName,
      characterName: this.settings.characterName,
      extraVariables: updatedChat.variables,
      formatPrompt: this.settings.formatPromptTemplate,
      globalVariables: this.settings.globalVariables || {},
      templateEngineSettings: this.settings.templateEngine,
    };
    await emit(EVENTS.PROMPT_BEFORE, promptOpts);

    const assembled = assemblePrompt(promptOpts);
    const { messages } = assembled;
    await emit(EVENTS.PROMPT_AFTER, { messages, matchedEntries: assembled.matchedEntries });

    // Start streaming
    const tags = this.settings.customTags ?? [...DEFAULT_TAGS];
    const opaqueTags = [...DEFAULT_OPAQUE_TAGS];
    this._parser = new StreamTagParser(tags, opaqueTags);
    const eventBuf = [];
    this.streamState = { thinking: '', maintext: '', options: [], sum: '', varsRaw: '', isStreaming: true };
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
          emit(EVENTS.STREAM_CHUNK, { delta, state: this.streamState });
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
    const parsed = aggregateEvents(eventBuf);
    const nextVariables = this._applyVariableRules(updatedChat.variables ?? {}, parsed.varsCommands);
    const snapshot = JSON.parse(JSON.stringify(nextVariables));
    await emit(EVENTS.STREAM_DONE, { parsed, varsAfter: snapshot });

    const assistantMsg = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: eventBuf
        .filter(e => e.type === 'tag-chunk' || e.type === 'raw')
        .map(e => e.chunk)
        .join(''),
      timestamp: Date.now(),
      parsed,
      variablesAfter: snapshot,
      apiUsed: 'primary',
    };
    const finalChat = {
      ...updatedChat,
      messages: [...updatedChat.messages, assistantMsg],
      variables: nextVariables,
      updatedAt: Date.now(),
    };
    await this._db.table('chats').put(finalChat);
    this.chats = this.chats.map(c => c.id === finalChat.id ? finalChat : c);
    this.streamState = { thinking: '', maintext: '', options: [], sum: '', varsRaw: '', isStreaming: false };
    this.isSending = false;
    await emit(EVENTS.MESSAGE_ASSISTANT, { chatId: finalChat.id, message: assistantMsg });
    this._notify();
  }

  jumpToFloor(messageId) {
    const chat = this.activeChat;
    if (!chat) return;
    const idx = chat.messages.findIndex(m => m.id === messageId);
    if (idx < 0) return;
    const truncated = chat.messages.slice(0, idx + 1);
    const target = truncated[truncated.length - 1];
    const restoredVars = (target?.role === 'assistant' && target.variablesAfter)
      ? target.variablesAfter : chat.variables ?? {};
    const next = { ...chat, messages: truncated, variables: restoredVars, updatedAt: Date.now() };
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
      } else if (ev.type === 'option-line') {
        this.streamState.options = [...this.streamState.options, ev.line];
      }
    }
  }

  /** Apply variable update rules: whitelist, type coercion, min/max clamp, add vs set */
  _applyVariableRules(currentVars, parsedVars) {
    const rules = this.settings?.variableRules || {};
    if (rules.extractFromResponse === false) return currentVars;

    const schema = this.settings?.variableSchema || [];
    const allowedKeys = rules.allowedKeys || [];
    const schemaMap = {};
    for (const def of schema) schemaMap[def.key] = def;

    const next = { ...currentVars };
    for (const [key, rawValue] of Object.entries(parsedVars.merge || {})) {
      // Whitelist check
      if (allowedKeys.length > 0 && !allowedKeys.includes(key)) continue;

      const def = schemaMap[key];
      let value = rawValue;

      // Type coercion
      if (def?.type === 'number') {
        value = Number(rawValue);
        if (Number.isNaN(value)) continue;
      } else if (def?.type === 'boolean') {
        value = Boolean(rawValue);
      }

      // Update mode: add vs set
      if (def?.updateMode === 'add' && typeof next[key] === 'number' && typeof value === 'number') {
        value = next[key] + value;
      }

      // Clamp
      if (def?.type === 'number') {
        if (def.min !== undefined && value < def.min) value = def.min;
        if (def.max !== undefined && value > def.max) value = def.max;
      }

      next[key] = value;
    }
    return next;
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
    this.presets = this.presets.map(p => p.id === next.id ? next : p);
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

  async setChatVariables(vars) {
    const chat = this.activeChat;
    if (!chat) return;
    const next = { ...chat, variables: vars, updatedAt: Date.now() };
    await this._db.table('chats').put(next);
    this.chats = this.chats.map(c => c.id === next.id ? next : c);
    emit(EVENTS.VARS_CHANGE, { scope: 'chat', vars });
    this._notify();
  }

  // ========== SCRIPTS ==========
  async saveScript(script) {
    const next = { ...script, updatedAt: Date.now() };
    if (!next.id) next.id = crypto.randomUUID();
    if (!next.createdAt) next.createdAt = Date.now();
    await dbSaveScript(next);
    const exists = this.scripts.some(s => s.id === next.id);
    this.scripts = exists
      ? this.scripts.map(s => s.id === next.id ? next : s)
      : [...this.scripts, next];
    this._reloadEnabledScripts();
    this._notify();
    return next;
  }
  async deleteScript(id) {
    await dbDeleteScript(id);
    this.scripts = this.scripts.filter(s => s.id !== id);
    this._reloadEnabledScripts();
    this._notify();
  }

  // ========== TEMPLATES ==========
  async saveTemplate(template) {
    const next = { ...template, updatedAt: Date.now() };
    if (!next.id) next.id = crypto.randomUUID();
    if (!next.createdAt) next.createdAt = Date.now();
    await dbSaveTemplate(next);
    const exists = this.templates.some(t => t.id === next.id);
    this.templates = exists
      ? this.templates.map(t => t.id === next.id ? next : t)
      : [...this.templates, next];
    this._notify();
    return next;
  }
  async deleteTemplate(id) {
    await dbDeleteTemplate(id);
    this.templates = this.templates.filter(t => t.id !== id);
    this._notify();
  }

  showToast(msg) {
    this.toast = msg;
    this._notify();
    setTimeout(() => { this.toast = null; this._notify(); }, 2000);
  }
}

export const store = new SillytavernStore();
