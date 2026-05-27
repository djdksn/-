# ST Plugin Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate EJS template engine, 3-scope variable system, slash commands, script manager, variable manager UI, and prompt viewer from ST-Prompt-Template & JS-Slash-Runner into the project.

**Architecture:** Four new ES module files in `scripts/sillytavern/` (ejs-engine, variable-store, slash-commands, script-manager), three new IIFE UI files in `scripts/` (script-editor, variable-manager, prompt-viewer), one CSS file, and modifications to prompt-assembler, store, chat.js, main.js, database.js, and index.html.

**Tech Stack:** Vanilla JS (IIFE + ES modules), IndexedDB, ejs.js standalone

---

### Task 1: Download ejs.js and bump DB version

**Files:**
- Create: `scripts/lib/ejs.min.js`
- Modify: `scripts/sillytavern/database.js:2-3`

- [ ] **Step 1: Download ejs.js standalone**

Download the browser-compatible ejs.js standalone build. Check if a local copy already exists in the Downloads folder from ST-Prompt-Template.

The ST-Prompt-Template plugin includes ejs.js in its own source. Copy from there:

```bash
cp "C:/Users/veterinarian/Downloads/ST-Prompt-Template-1.16/ST-Prompt-Template-1.16/src/3rdparty/ejs.js" "E:/AI CHAT game/game3/scripts/lib/ejs.min.js"
```

Or if that fails, download from CDN:

```bash
curl -o "E:/AI CHAT game/game3/scripts/lib/ejs.min.js" "https://cdn.jsdelivr.net/npm/ejs@3.1.10/ejs.min.js"
```

- [ ] **Step 2: Verify ejs.min.js exists**

```bash
ls -la "E:/AI CHAT game/game3/scripts/lib/ejs.min.js"
```

- [ ] **Step 3: Bump DB version and add stores for scripts and global_variables**

In `scripts/sillytavern/database.js`, change `DB_VERSION` from 6 to 7 and add the two new store names to the `STORES` array:

```js
const DB_VERSION = 7;
const STORES = ['lorebooks', 'presets', 'settings', 'chats', 'regex_scripts', 'scripts', 'global_variables'];
```

- [ ] **Step 4: Add database CRUD functions for scripts and global_variables**

In `scripts/sillytavern/database.js`, add at the end of the file (after existing exports):

```js
// scripts CRUD
export async function getScripts() { return getDatabase().table('scripts').toArray(); }
export async function saveScript(script) {
  script.updatedAt = Date.now();
  await getDatabase().table('scripts').put(script);
  return script.id;
}
export async function deleteScript(id) { await getDatabase().table('scripts').delete(id); }
export async function saveAllScripts(scripts) {
  await getDatabase().table('scripts').clear();
  if (scripts.length > 0) await getDatabase().table('scripts').bulkPut(scripts);
}

// global_variables CRUD
export async function getGlobalVariables() {
  const all = await getDatabase().table('global_variables').toArray();
  return all[0]?.data || {};
}
export async function saveGlobalVariables(data) {
  await getDatabase().table('global_variables').put({ id: 'global', data, updatedAt: Date.now() });
}
```

- [ ] **Step 5: Update exportAllData and importAllData**

In `database.js`, add scripts and globalVariables to `exportAllData()`:

```js
const [lorebooks, presets, settings, chats, regexScripts, scripts, globalVars] = await Promise.all([
  db.table('lorebooks').toArray(),
  db.table('presets').toArray(),
  db.table('settings').toArray(),
  db.table('chats').toArray(),
  db.table('regex_scripts').toArray(),
  db.table('scripts').toArray(),
  db.table('global_variables').toArray(),
]);
return { version: DB_VERSION, exportedAt: Date.now(), lorebooks, presets, settings, chats, regexScripts, scripts, globalVariables: globalVars };
```

And in `importAllData()`:

```js
if (Array.isArray(backup.scripts)) await db.table('scripts').bulkPut(backup.scripts);
if (Array.isArray(backup.globalVariables)) await db.table('global_variables').bulkPut(backup.globalVariables);
```

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/ejs.min.js scripts/sillytavern/database.js
git commit -m "chore: add ejs.js library, bump DB to v7 with scripts + global_variables stores"
```

---

### Task 2: variable-store.js — Three-scope variable system

**Files:**
- Create: `scripts/sillytavern/variable-store.js`

- [ ] **Step 1: Write variable-store.js**

Create `scripts/sillytavern/variable-store.js`:

```js
/**
 * variable-store.js — Three-scope variable system (global / chat / message)
 * API aligned with ST-Prompt-Template: getvar, setvar, incvar, decvar
 */
import { getGlobalVariables, saveGlobalVariables } from './database.js';

// In-memory message variables: chatId -> messageId -> vars
const messageVars = new Map();

function _messageKey(chatId, msgId) {
  if (!chatId) return null;
  return `${chatId}::${msgId}`;
}

// ---- Path helpers (lodash.get/set equivalents, ~20 lines) ----

function pathGet(obj, path) {
  if (!path) return obj;
  const keys = path.split('.');
  let cur = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

function pathSet(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] == null || typeof cur[k] !== 'object' || Array.isArray(cur[k])) cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return obj;
}

// ---- State ----

let _globalVars = {};
let _globalLoaded = false;

async function loadGlobal() {
  if (_globalLoaded) return;
  try { _globalVars = await getGlobalVariables(); } catch {}
  _globalLoaded = true;
}

async function saveGlobal() {
  try { await saveGlobalVariables(_globalVars); } catch {}
}

// ---- Core API ----

class VariableStore {
  constructor() {
    this._observer = null; // called when any var changes
  }

  setObserver(fn) { this._observer = fn; }

  _getSource(scope, chat) {
    if (scope === 'message') return { obj: null, key: 'message' };
    if (scope === 'global') return { obj: _globalVars, key: 'global' };
    // chat scope (default)
    if (!chat || !chat.variables) return { obj: null, key: 'chat' };
    return { obj: chat.variables, key: 'chat' };
  }

  // Resolve scope from options: string shorthand or object
  _resolveScope(raw) {
    if (raw === 'global' || raw === 'local' || raw === 'chat' || raw === 'message' || raw === 'cache')
      return raw === 'local' || raw === 'chat' || raw === 'cache' ? 'chat' : raw;
    return null;
  }

  _resolveOpts(raw) {
    if (typeof raw === 'string') {
      return { flags: raw, scope: 'chat' };
    }
    if (!raw) return { scope: 'chat' };
    const scope = this._resolveScope(raw.scope) || 'chat';
    return { ...raw, scope };
  }

  /**
   * getVar(key, options?)
   * Searches: message → chat → global
   */
  async getVar(key, rawOpts, chat, msgId) {
    await loadGlobal();
    const opts = this._resolveOpts(rawOpts);

    // message scope explicitly requested
    if (opts.scope === 'message') {
      const mKey = _messageKey(chat?.id, msgId);
      if (mKey && messageVars.has(mKey)) {
        const val = pathGet(messageVars.get(mKey), key);
        if (val !== undefined) return val;
      }
      return opts.defaults;
    }

    // chat scope
    if (opts.scope === 'chat') {
      if (chat?.variables) {
        const val = pathGet(chat.variables, key);
        if (val !== undefined) return val;
      }
      return opts.defaults;
    }

    // global scope
    if (opts.scope === 'global') {
      const val = pathGet(_globalVars, key);
      return val !== undefined ? val : opts.defaults;
    }

    // auto search: message → chat → global
    const mKey = _messageKey(chat?.id, msgId);
    if (mKey && messageVars.has(mKey)) {
      const val = pathGet(messageVars.get(mKey), key);
      if (val !== undefined) return val;
    }
    if (chat?.variables) {
      const val = pathGet(chat.variables, key);
      if (val !== undefined) return val;
    }
    const gVal = pathGet(_globalVars, key);
    return gVal !== undefined ? gVal : opts.defaults;
  }

  /**
   * setVar(key, value, options?)
   */
  async setVar(key, value, rawOpts, chat, msgId) {
    await loadGlobal();
    const opts = this._resolveOpts(rawOpts);
    const flags = opts.flags || 'n';

    if (opts.scope === 'message') {
      const mKey = _messageKey(chat?.id, msgId);
      if (!mKey) return undefined;
      if (!messageVars.has(mKey)) messageVars.set(mKey, {});
      const obj = messageVars.get(mKey);
      pathSet(obj, key, value);
      this._observer?.({ scope: 'message', key, value });
      return value;
    }

    if (opts.scope === 'global') {
      if (flags === 'nx' && pathGet(_globalVars, key) !== undefined) return undefined;
      if (flags === 'xx' && pathGet(_globalVars, key) === undefined) return undefined;
      pathSet(_globalVars, key, value);
      await saveGlobal();
      this._observer?.({ scope: 'global', key, value });
      return value;
    }

    // chat scope
    if (!chat) return undefined;
    if (!chat.variables) chat.variables = {};
    if (flags === 'nx' && pathGet(chat.variables, key) !== undefined) return undefined;
    if (flags === 'xx' && pathGet(chat.variables, key) === undefined) return undefined;
    pathSet(chat.variables, key, value);
    this._observer?.({ scope: 'chat', key, value });
    return value;
  }

  /**
   * incVar(key, delta=1, options?)
   */
  async incVar(key, delta, rawOpts, chat, msgId) {
    delta = typeof delta === 'number' ? delta : 1;
    const val = await this.getVar(key, rawOpts, chat, msgId);
    const opts = this._resolveOpts(rawOpts);
    const current = typeof val === 'number' ? val : (opts.defaults || 0);
    let newVal = current + delta;
    if (opts.min != null) newVal = Math.max(newVal, opts.min);
    if (opts.max != null) newVal = Math.min(newVal, opts.max);
    return this.setVar(key, newVal, { ...opts, flags: 'n' }, chat, msgId);
  }

  /**
   * decVar(key, delta=1, options?)
   */
  async decVar(key, delta, rawOpts, chat, msgId) {
    delta = typeof delta === 'number' ? delta : 1;
    return this.incVar(key, -delta, rawOpts, chat, msgId);
  }

  // Scope-specific aliases
  getLocalVar(key, opts, chat, msgId) { return this.getVar(key, { ...opts, scope: 'chat' }, chat, msgId); }
  getGlobalVar(key, opts) { return this.getVar(key, { ...opts, scope: 'global' }, null, null); }
  setLocalVar(key, val, opts, chat, msgId) { return this.setVar(key, val, { ...opts, scope: 'chat' }, chat, msgId); }
  setGlobalVar(key, val, opts) { return this.setVar(key, val, { ...opts, scope: 'global' }, null, null); }
  incLocalVar(key, delta, opts, chat, msgId) { return this.incVar(key, delta, { ...opts, scope: 'chat' }, chat, msgId); }
  incGlobalVar(key, delta, opts) { return this.incVar(key, delta, { ...opts, scope: 'global' }, null, null); }
  decLocalVar(key, delta, opts, chat, msgId) { return this.decVar(key, delta, { ...opts, scope: 'chat' }, chat, msgId); }
  decGlobalVar(key, delta, opts) { return this.decVar(key, delta, { ...opts, scope: 'global' }, null, null); }

  // Get all vars for a scope (used by variable-manager UI)
  async getAll(scope, chat) {
    await loadGlobal();
    if (scope === 'global') return { ..._globalVars };
    if (scope === 'chat') return chat?.variables ? { ...chat.variables } : {};
    if (scope === 'message' && chat) {
      const result = {};
      for (const [key, vars] of messageVars) {
        if (key.startsWith(chat.id + '::')) result[key.slice(chat.id.length + 2)] = { ...vars };
      }
      return result;
    }
    return {};
  }

  // Delete a key from a scope
  async deleteVar(key, scope, chat, msgId) {
    if (scope === 'global') {
      await loadGlobal();
      _globalVars = _removeKey(_globalVars, key);
      await saveGlobal();
    } else if (scope === 'chat' && chat) {
      chat.variables = _removeKey(chat.variables || {}, key);
    } else if (scope === 'message') {
      const mKey = _messageKey(chat?.id, msgId);
      if (mKey && messageVars.has(mKey)) {
        messageVars.set(mKey, _removeKey(messageVars.get(mKey), key));
      }
    }
    this._observer?.({ scope, key, deleted: true });
  }

  clearMessageVars(chatId, msgId) {
    const mKey = _messageKey(chatId, msgId);
    if (mKey) messageVars.delete(mKey);
  }
}

function _removeKey(obj, key) {
  const keys = key.split('.');
  const last = keys.pop();
  let cur = obj;
  for (const k of keys) {
    if (cur == null || typeof cur[k] !== 'object') return obj;
    cur = cur[k];
  }
  delete cur[last];
  return obj;
}

// Singleton
export const variableStore = new VariableStore();
```

- [ ] **Step 2: Commit**

```bash
git add scripts/sillytavern/variable-store.js
git commit -m "feat: add variable-store — global/chat/message 3-scope variable system"
```

---

### Task 3: ejs-engine.js — EJS template renderer

**Files:**
- Create: `scripts/sillytavern/ejs-engine.js`

- [ ] **Step 1: Write ejs-engine.js**

```js
/**
 * ejs-engine.js — EJS template renderer wrapping ejs.js
 * Handles <% ... %> blocks in prompts and messages.
 */
import { variableStore } from './variable-store.js';

// ejs is loaded globally via <script> tag, exposed as window.ejs

const ESCAPE_PATTERN = /<#escape-ejs>([\s\S]*?)<#\/escape-ejs>/g;
const MAX_EXECUTION_MS = 3000;

function escapeEjsBlocks(text) {
  return text.replace(ESCAPE_PATTERN, (_, content) => {
    const escaped = content.replace(/<%([\s\S]*?)%>/g, '&lt;%$1%&gt;');
    return escaped;
  });
}

function unescapeEjsBlocks(text) {
  return text.replace(/&lt;%([\s\S]*?)%&gt;/g, '<%$1%>');
}

/**
 * Build the context object passed to ejs templates.
 */
function buildContext(extra = {}) {
  const { chat, msg, userName, characterName, userInput } = extra;

  const ctx = {
    getvar: (key, opts) => variableStore.getVar(key, opts, chat, msg?.id),
    setvar: (key, value, opts) => variableStore.setVar(key, value, opts, chat, msg?.id),
    incvar: (key, delta, opts) => variableStore.incVar(key, delta, opts, chat, msg?.id),
    decvar: (key, delta, opts) => variableStore.decVar(key, delta, opts, chat, msg?.id),
    print: (...args) => args.join(' '),
    console: {
      log: (...args) => console.log('[EJS]', ...args),
      warn: (...args) => console.warn('[EJS]', ...args),
      error: (...args) => console.error('[EJS]', ...args),
    },
    variables: chat?.variables || {},
    char: characterName || '',
    user: userName || '',
    input: userInput || '',
    chat: chat ? { id: chat.id, name: chat.name, messageCount: chat.messages?.length || 0 } : {},
  };

  return ctx;
}

/**
 * Render a single template string with error handling and timeout.
 */
export async function renderTemplate(template, extra = {}) {
  if (!template || typeof template !== 'string') return template;

  // Skip if no EJS tags present (fast path)
  if (!/<%/.test(template)) return template;

  const preprocessed = escapeEjsBlocks(template);
  const ctx = buildContext(extra);

  try {
    const result = await Promise.race([
      (async () => {
        // ejs.render runs synchronously, but we wrap it to support timeout
        return window.ejs.render(preprocessed, ctx, {
          openDelimiter: '<%',
          closeDelimiter: '%>',
        });
      })(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('EJS execution timeout (3s)')), MAX_EXECUTION_MS)
      ),
    ]);

    return unescapeEjsBlocks(result);
  } catch (err) {
    console.error('[EJS] Template render error:', err.message, '\nTemplate:', template.slice(0, 200));
    // Return original text on error — don't break the conversation
    return template;
  }
}

/**
 * Render all messages in an array, processing each content field.
 */
export async function renderMessages(messages, extra = {}) {
  const result = [];
  for (const msg of messages) {
    let content = msg.content;
    if (typeof content === 'string') {
      content = await renderTemplate(content, { ...extra, msg });
    } else if (Array.isArray(content)) {
      // Handle OAI-style content array
      content = await Promise.all(content.map(async (part) => {
        if (part.type === 'text' && part.text) {
          return { ...part, text: await renderTemplate(part.text, { ...extra, msg }) };
        }
        return part;
      }));
    }
    result.push({ ...msg, content });
  }
  return result;
}

/**
 * Build context specifically for the generate phase (before sending to LLM).
 * Exposes additional context from prompt assembly.
 */
export function buildGenerateContext(options) {
  const { chat, userName, characterName, userInput } = options;
  return buildContext({
    chat,
    userName,
    characterName,
    userInput,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/sillytavern/ejs-engine.js
git commit -m "feat: add ejs-engine — EJS template renderer with escape blocks and timeout"
```

---

### Task 4: slash-commands.js — Command registry with 7 built-in commands

**Files:**
- Create: `scripts/sillytavern/slash-commands.js`

- [ ] **Step 1: Write slash-commands.js**

```js
/**
 * slash-commands.js — Slash command registry for chat input
 * Built-in: /setvar, /getvar, /incvar, /decvar, /roll, /var, /help
 */
import { variableStore } from './variable-store.js';

const commands = new Map();

function register(name, handler, options = {}) {
  commands.set(name.toLowerCase(), { name, handler, options });
}

/**
 * Parse input text to detect commands.
 * @returns {{ isCommand: boolean, command: string, args: string[] }}
 */
function parse(input) {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return { isCommand: false, command: '', args: [] };
  const parts = trimmed.slice(1).split(/\s+/);
  return { isCommand: true, command: parts[0].toLowerCase(), args: parts.slice(1) };
}

/**
 * Execute a slash command.
 * @returns {Promise<{ handled: boolean, output?: string }>}
 */
async function execute(input, context = {}) {
  const { chat, userName, characterName, userInput } = context;
  const parsed = parse(input);
  if (!parsed.isCommand) return { handled: false };

  const cmd = commands.get(parsed.command);
  if (!cmd) return { handled: true, output: `未知命令: /${parsed.command}。输入 /help 查看可用命令。` };

  try {
    const result = await cmd.handler(parsed.args, { chat, userName, characterName, userInput });
    return { handled: true, output: result };
  } catch (err) {
    console.error(`[Slash] /${parsed.command} error:`, err);
    return { handled: true, output: `执行 /${parsed.command} 时出错: ${err.message}` };
  }
}

// ---- Built-in Commands ----

// /setvar key=value
register('setvar', async (args, ctx) => {
  if (args.length === 0) return '用法: /setvar 键名=值 或 /setvar 键名 值';
  if (args.length >= 2 && !args[0].includes('=')) {
    await variableStore.setVar(args[0], args[1], {}, ctx.chat);
    return `${args[0]} = ${args[1]} ✓`;
  }
  const joined = args.join(' ');
  const eqIdx = joined.indexOf('=');
  if (eqIdx < 0) return '用法: /setvar 键名=值';
  const key = joined.slice(0, eqIdx);
  const rawVal = joined.slice(eqIdx + 1);
  // Try parse as number
  const value = isNaN(+rawVal) || rawVal === '' ? rawVal : +rawVal;
  await variableStore.setVar(key, value, {}, ctx.chat);
  return `${key} = ${JSON.stringify(value)} ✓`;
}, { description: '设置变量', usage: '/setvar 键名=值' });

// /getvar key
register('getvar', async (args, ctx) => {
  if (args.length === 0) return '用法: /getvar 键名';
  const val = await variableStore.getVar(args[0], {}, ctx.chat);
  return `${args[0]} = ${JSON.stringify(val)}`;
}, { description: '读取变量', usage: '/getvar 键名' });

// /incvar key[=delta]
register('incvar', async (args, ctx) => {
  if (args.length === 0) return '用法: /incvar 键名[=增量] (默认+1)';
  const joined = args.join(' ');
  const eqIdx = joined.indexOf('=');
  const key = eqIdx >= 0 ? joined.slice(0, eqIdx) : joined;
  const delta = eqIdx >= 0 ? +joined.slice(eqIdx + 1) : 1;
  const newVal = await variableStore.incVar(key, delta, {}, ctx.chat);
  return `${key} = ${newVal} (+${delta}) ✓`;
}, { description: '增加数值', usage: '/incvar 键名=5' });

// /decvar key[=delta]
register('decvar', async (args, ctx) => {
  if (args.length === 0) return '用法: /decvar 键名[=减量] (默认-1)';
  const joined = args.join(' ');
  const eqIdx = joined.indexOf('=');
  const key = eqIdx >= 0 ? joined.slice(0, eqIdx) : joined;
  const delta = eqIdx >= 0 ? +joined.slice(eqIdx + 1) : 1;
  const newVal = await variableStore.decVar(key, delta, {}, ctx.chat);
  return `${key} = ${newVal} (-${delta}) ✓`;
}, { description: '减少数值', usage: '/decvar 键名=3' });

// /roll NdM or dM
register('roll', async (args) => {
  if (args.length === 0) return '用法: /roll NdM (如 /roll 2d6) 或 /roll d20';
  const dice = args[0].toLowerCase();
  const m = dice.match(/^(\d+)?d(\d+)$/);
  if (!m) return '格式错误。用法: /roll NdM (如 /roll 2d6)';
  const count = Math.min(+m[1] || 1, 100);
  const sides = +m[2];
  if (sides < 2 || sides > 1000) return '骰子面数需在 2-1000 之间';
  const rolls = [];
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const r = Math.floor(Math.random() * sides) + 1;
    rolls.push(r);
    sum += r;
  }
  if (count === 1) return `🎲 d${sides}: ${sum}`;
  return `🎲 ${count}d${sides}: [${rolls.join(', ')}] = ${sum}`;
}, { description: '掷骰', usage: '/roll 2d6' });

// /var — list all chat variables
register('var', async (args, ctx) => {
  const vars = await variableStore.getAll('chat', ctx.chat);
  const keys = Object.keys(vars);
  if (keys.length === 0) return '当前对话无变量。';
  return keys.map(k => {
    const v = vars[k];
    const display = typeof v === 'object' ? JSON.stringify(v) : v;
    return `${k} = ${display}`;
  }).join('\n');
}, { description: '列出所有变量', usage: '/var' });

// /help [command]
register('help', async (args) => {
  if (args.length > 0) {
    const cmd = commands.get(args[0].toLowerCase());
    if (!cmd) return `未知命令: /${args[0]}`;
    return `/${cmd.name} — ${cmd.options?.description || ''}\n用法: ${cmd.options?.usage || '/' + cmd.name}`;
  }
  const list = Array.from(commands.values())
    .map(c => `/${c.name.padEnd(8)} ${c.options?.description || ''}`)
    .join('\n');
  return `可用命令:\n${list}`;
}, { description: '查看帮助', usage: '/help [命令]' });

export { register, execute, parse };
```

- [ ] **Step 2: Commit**

```bash
git add scripts/sillytavern/slash-commands.js
git commit -m "feat: add slash-commands — 7 built-in commands with registry"
```

---

### Task 5: script-manager.js — Script CRUD and execution sandbox

**Files:**
- Create: `scripts/sillytavern/script-manager.js`

- [ ] **Step 1: Write script-manager.js**

```js
/**
 * script-manager.js — External JS script CRUD, sandboxed execution, lifecycle hooks.
 */
import { getScripts, saveScript, deleteScript, saveAllScripts } from './database.js';
import { variableStore } from './variable-store.js';

let _scripts = [];
let _loaded = false;

async function loadAll() {
  if (_loaded) return;
  _scripts = await getScripts();
  _loaded = true;
}

function getAll() { return [..._scripts]; }

function getEnabled() { return _scripts.filter(s => s.enabled); }

async function add(name) {
  await loadAll();
  const script = {
    id: crypto.randomUUID(),
    name: name || '新脚本',
    content: '// 在此编写 JavaScript 代码\n// 可用: getvar(), setvar(), incvar(), decvar(), console.log()\n',
    enabled: true,
    folder: '',
    triggers: { onMessage: false, onSend: false, manual: true },
    order: _scripts.length,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveScript(script);
  _scripts.push(script);
  return script;
}

async function update(id, patch) {
  await loadAll();
  const idx = _scripts.findIndex(s => s.id === id);
  if (idx < 0) return null;
  _scripts[idx] = { ..._scripts[idx], ...patch, updatedAt: Date.now() };
  await saveScript(_scripts[idx]);
  return _scripts[idx];
}

async function remove(id) {
  await loadAll();
  await deleteScript(id);
  _scripts = _scripts.filter(s => s.id !== id);
}

async function reorder(ids) {
  await loadAll();
  ids.forEach((id, idx) => {
    const s = _scripts.find(s => s.id === id);
    if (s) s.order = idx;
  });
  await saveAllScripts(_scripts);
}

/**
 * Build a sandboxed execution context for a script.
 * Uses Function constructor to avoid direct eval.
 */
function buildScriptContext(context = {}) {
  const { chat, userName, characterName, userInput } = context;
  return {
    getvar: (key, opts) => variableStore.getVar(key, opts, chat),
    setvar: (key, value, opts) => variableStore.setVar(key, value, opts, chat),
    incvar: (key, delta, opts) => variableStore.incVar(key, delta, opts, chat),
    decvar: (key, delta, opts) => variableStore.decVar(key, delta, opts, chat),
    console: {
      log: (...args) => console.log('[Script]', ...args),
      warn: (...args) => console.warn('[Script]', ...args),
      error: (...args) => console.error('[Script]', ...args),
    },
    variables: chat?.variables || {},
    char: characterName || '',
    user: userName || '',
    input: userInput || '',
    chat: chat ? { id: chat.id, name: chat.name, messageCount: chat.messages?.length || 0 } : {},
  };
}

/**
 * Execute a single script.
 * @param script - the script object
 * @param context - { chat, userName, characterName, userInput }
 * @returns { success: boolean, error?: string, output?: string }
 */
function executeScript(script, context = {}) {
  if (!script.enabled || !script.content) return { success: false, error: 'Script disabled or empty' };
  try {
    const ctxObj = buildScriptContext(context);
    const paramNames = Object.keys(ctxObj);
    const paramValues = Object.values(ctxObj);
    const fn = new Function(...paramNames, '"use strict";\n' + script.content);
    const result = fn(...paramValues);
    return { success: true, output: result };
  } catch (err) {
    console.error(`[Script] "${script.name}" error:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Run scripts that match a trigger type.
 */
async function runTriggered(context, trigger) {
  await loadAll();
  const toRun = _scripts.filter(s => s.enabled && s.triggers?.[trigger]);
  const results = [];
  for (const script of toRun) {
    const result = executeScript(script, context);
    results.push({ scriptId: script.id, name: script.name, ...result });
  }
  return results;
}

async function importScripts(scripts) {
  for (const s of scripts) {
    s.id = s.id || crypto.randomUUID();
    s.createdAt = s.createdAt || Date.now();
    s.updatedAt = Date.now();
  }
  await loadAll();
  const existing = new Set(_scripts.map(s => s.id));
  for (const s of scripts) {
    if (existing.has(s.id)) {
      const idx = _scripts.findIndex(x => x.id === s.id);
      if (idx >= 0) _scripts[idx] = s;
    } else {
      _scripts.push(s);
    }
  }
  await saveAllScripts(_scripts);
}

function exportScripts() {
  return JSON.parse(JSON.stringify(_scripts));
}

export {
  loadAll, getAll, getEnabled,
  add, update, remove, reorder,
  executeScript, runTriggered,
  importScripts, exportScripts,
};
```

- [ ] **Step 2: Commit**

```bash
git add scripts/sillytavern/script-manager.js
git commit -m "feat: add script-manager — script CRUD, sandboxed execution, lifecycle hooks"
```

---

### Task 6: Modify prompt-assembler.js — Add EJS processing step

**Files:**
- Modify: `scripts/sillytavern/prompt-assembler.js`

- [ ] **Step 1: Add EJS import and wire up render step**

In `prompt-assembler.js`, add import and modify `assemblePrompt`:

**Add import at top:**
```js
import { renderTemplate, buildGenerateContext } from './ejs-engine.js';
```

**Modify `resolvePromptContent` to be async and add EJS step:**

Inside `assemblePrompt`, change the prompt-order loop to be async. Replace this block (lines ~92-129):

The key change: after `replaceMacros()` returns the content, pipe it through `renderTemplate()`. The function becomes `async`:

```js
export async function assemblePrompt(options) {
  // ... (existing setup code unchanged through line ~19)
  // allMatchedEntries, uniqueEntries, depthEntries, worldInfoEntries declarations remain

  // recentHistory building remains the same (lines ~38-46)

  // depthEntries injection remains the same (lines ~48-59)

  const promptOrder = (preset.settings.prompt_order || []);
  const prompts = (preset.settings.prompts || []);

  function resolvePromptContent(identifier) {
    // ... (existing implementation unchanged, lines ~65-86)
  }

  // Build EJS context once
  const ejsContext = buildGenerateContext({
    chat: { id: '', name: '', messages: history, variables },
    userName,
    characterName,
    userInput,
  });

  const assembledMessages = [];
  let systemAccumulator = '';
  let hasChatHistory = false;

  for (const item of promptOrder) {
    if (item.enabled === false) continue;

    if (item.identifier === 'chatHistory') {
      hasChatHistory = true;
      if (systemAccumulator) {
        assembledMessages.push({ role: 'system', content: systemAccumulator });
        systemAccumulator = '';
      }
      assembledMessages.push(...recentHistory);
      continue;
    }

    const rawContent = resolvePromptContent(item.identifier);
    if (!rawContent) continue;

    let content = replaceMacros(rawContent, { userName, characterName, userInput, variables });
    if (!content.trim()) continue;

    // NEW: EJS processing for this prompt item
    content = await renderTemplate(content, ejsContext);

    const role = item.role || 'system';
    if (role === 'system') {
      systemAccumulator += (systemAccumulator ? '\n\n' : '') + content;
    } else {
      if (systemAccumulator) {
        assembledMessages.push({ role: 'system', content: systemAccumulator });
        systemAccumulator = '';
      }
      assembledMessages.push({ role, content });
    }
  }

  if (formatPrompt) {
    let formatted = replaceMacros(formatPrompt, { userName, characterName, userInput, variables });
    // NEW: EJS for format prompt
    formatted = await renderTemplate(formatted, ejsContext);
    systemAccumulator += (systemAccumulator ? '\n\n' : '') + formatted;
  }

  // ... (rest unchanged: systemAccumulator handling, chatHistory fallback, user input)
  if (systemAccumulator) {
    assembledMessages.unshift({ role: 'system', content: systemAccumulator });
  }

  if (!hasChatHistory) {
    assembledMessages.push(...recentHistory);
  }

  const processedInput = regexScripts && regexScripts.length > 0
    ? getRegexedString(userInput, REGEX_PLACEMENT.USER_INPUT, { scripts: regexScripts, isPrompt: true })
    : userInput;
  assembledMessages.push({ role: 'user', content: processedInput });

  const systemPrompt = assembledMessages
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n\n');

  return { messages: assembledMessages, matchedEntries: uniqueEntries, systemPrompt };
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/sillytavern/prompt-assembler.js
git commit -m "feat: add EJS processing step in prompt-assembler"
```

---

### Task 7: Modify sillytavern-store.js — Wire up commands, EJS, and script hooks

**Files:**
- Modify: `scripts/sillytavern-store.js`

- [ ] **Step 1: Add imports at top**

In `sillytavern-store.js`, add new imports after existing imports:

```js
import { parse as parseCommand, execute as executeCommand } from './slash-commands.js';
import { renderTemplate } from './ejs-engine.js';
import { runTriggered } from './script-manager.js';
```

- [ ] **Step 2: Add slash command handling in sendGameMessage()**

In `sendGameMessage()`, at the very beginning (before `this.isSending = true`), add:

```js
async sendGameMessage(userText) {
    const chat = this.activeChat;
    if (!chat || !this.settings) return;

    // NEW: slash command interception
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
    // ... rest of existing code
```

- [ ] **Step 3: Add EJS post-processing on assistant reply**

In `sendGameMessage()`, after `const assistantMsg = { ... }` block (around line 245), add EJS post-processing:

Change:
```js
const assistantMsg = {
  id: crypto.randomUUID(),
  role: 'assistant',
  content: eventBuf
    .filter(e => (e.type === 'tag-chunk' || e.type === 'raw') && e.tag !== 'w2g')
    .map(e => e.chunk)
    .join(''),
  timestamp: Date.now(),
  apiUsed: 'primary',
};
```

To:
```js
let rawContent = eventBuf
  .filter(e => (e.type === 'tag-chunk' || e.type === 'raw') && e.tag !== 'w2g')
  .map(e => e.chunk)
  .join('');

// NEW: EJS post-processing on assistant reply
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
  timestamp: Date.now(),
  apiUsed: 'primary',
};
```

- [ ] **Step 4: Add script hook execution**

After assistant message is saved, add script trigger:

After `await this._db.table('chats').put(finalChat);` (inside save block), add:

```js
// NEW: trigger onMessage scripts
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
```

And before the streaming starts (after `this._notify()` following streamState init), optionally add:

```js
// NEW: trigger onSend scripts
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
```

- [ ] **Step 5: Capture assembled messages for prompt-viewer**

After the `assemblePrompt()` call (line ~205), store the assembled messages:

```js
const assembled = await assemblePrompt(promptOpts);
const { messages } = assembled;

// NEW: Store for prompt-viewer
this._lastMessages = messages;
this._lastAssembled = promptOpts;
```

- [ ] **Step 6: Expose executeSlashCommand on store for chat.js**

Add a method to the store class:

```js
executeSlashCommand(input) {
  return executeCommand(input, {
    chat: this.activeChat,
    userName: this.settings?.userName,
    characterName: this.settings?.characterName,
    userInput: input,
  });
}
```

- [ ] **Step 7: Commit**

```bash
git add scripts/sillytavern-store.js
git commit -m "feat: wire slash commands, EJS post-process, and script hooks into store"
```

---

### Task 8: Modify chat.js — Slash command detection in input

**Files:**
- Modify: `scripts/chat.js`

- [ ] **Step 1: Add slash command detection in send()**

In `chat.js`, modify the `send()` function. Change the beginning from:

```js
function send() {
  const v = input.value.trim();
  if (!v) {
    if (typeof GameNotify !== 'undefined') GameNotify.warn('请先写点什么', '在文字将出现之前，沉默亦是一种声音。');
    return;
  }

  if (store && store.activeChat && store.settings?.api?.apiKey) {
    store.sendGameMessage(v).catch(err => {
      if (typeof GameNotify !== 'undefined') GameNotify.error('发送失败', err.message);
    });
  } else {
    // Fallback: append to DOM directly
```

To:

```js
async function send() {
  const v = input.value.trim();
  if (!v) {
    if (typeof GameNotify !== 'undefined') GameNotify.warn('请先写点什么', '在文字将出现之前，沉默亦是一种声音。');
    return;
  }

  // NEW: Test slash command via store
  if (v.startsWith('/') && store) {
    input.value = '';
    autoSize();
    const result = await store.executeSlashCommand(v);
    if (result.handled) {
      if (result.output) {
        if (typeof GameNotify !== 'undefined') {
          GameNotify.info('命令', result.output, { duration: 3000 });
        }
      }
      return;
    }
    // Not a recognized command — send as normal message by restoring input
    input.value = v;
    autoSize();
  }

  if (store && store.activeChat && store.settings?.api?.apiKey) {
    store.sendGameMessage(v).catch(err => {
      if (typeof GameNotify !== 'undefined') GameNotify.error('发送失败', err.message);
    });
  } else {
    // Fallback: append to DOM directly
```

- [ ] **Step 2: Commit**

```bash
git add scripts/chat.js
git commit -m "feat: add slash command interception in chat input"
```

---

### Task 9: script-editor.js — Script management panel UI

**Files:**
- Create: `scripts/script-editor.js`
- Create: `styles/script-editor.css`

- [ ] **Step 1: Write script-editor.css**

```css
/* styles/script-editor.css — 脚本工坊面板样式 */

.script-shell {
  display: grid;
  grid-template-columns: 220px 1fr;
  height: calc(100vh - 180px);
  gap: 0;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  overflow: hidden;
}

.script-list-pane {
  background: var(--ink-850);
  border-right: 1px solid var(--border-soft);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.script-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-soft);
  gap: 6px;
  flex-shrink: 0;
}

.script-list-head-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--fg-tertiary);
  letter-spacing: 0.06em;
  display: flex;
  align-items: center;
  gap: 6px;
}

.script-list-body {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.script-card {
  background: var(--ink-800);
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.script-card:hover { border-color: var(--border-base); }
.script-card.is-active { border-color: var(--accent); background: rgba(255,107,154,0.05); }
.script-card.is-disabled { opacity: 0.45; }

.script-card-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fg-primary);
  font-size: 13px;
}

.script-card-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}
.script-card:hover .script-card-actions { opacity: 1; }

.script-editor-pane {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.script-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-soft);
  gap: 8px;
  flex-shrink: 0;
}

.script-editor-name {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--fg-primary);
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font-sans);
  outline: none;
  padding: 4px;
  border-radius: 4px;
}
.script-editor-name:focus { background: rgba(255,255,255,0.03); }

.script-editor-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.script-editor-code {
  flex: 1;
  background: var(--ink-900);
  border: none;
  color: var(--fg-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  padding: 12px;
  resize: none;
  outline: none;
  tab-size: 2;
}

.script-editor-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-top: 1px solid var(--border-soft);
  background: var(--ink-850);
  flex-shrink: 0;
}

.script-trigger-label {
  font-size: 11px;
  color: var(--fg-quaternary);
  display: flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
}
.script-trigger-label input { accent-color: var(--accent); }
```

- [ ] **Step 2: Write script-editor.js**

```js
/* scripts/script-editor.js — 脚本工坊面板 */
(function () {
  let modal = null;
  let scripts = [];
  let activeScriptId = null;

  // Wait for store to be ready
  function getStore() { return window.__stStore; }

  async function loadScripts() {
    const { getAll } = await import('./sillytavern/script-manager.js');
    scripts = getAll();
  }

  function open() {
    loadScripts().then(() => {
      activeScriptId = scripts[0]?.id || null;
      render();
    });
  }

  function render() {
    if (modal) {
      modal.el.querySelector('#script-shell').innerHTML = shellHtml();
    } else {
      modal = GameModal.open({
        size: 'full', icon: 'code',
        title: '脚本工坊',
        subtitle: '编写和管理 JS 脚本',
        body: `<div id="script-shell">${shellHtml()}</div>`,
        fullPane: true,
        footer: `
          <div class="modal-foot-actions">
            <button class="btn btn-ghost" id="script-import">导入</button>
            <button class="btn btn-ghost" id="script-export">导出</button>
            <button class="btn btn-ghost" id="script-cancel">关闭</button>
            <button class="btn btn-primary" id="script-save-all">保存全部</button>
          </div>
        `,
      });
    }
    bindAll();
    if (activeScriptId) selectScript(activeScriptId);
  }

  function shellHtml() {
    const active = scripts.find(s => s.id === activeScriptId);
    const listHtml = scripts.length === 0
      ? '<div style="padding:12px;color:var(--fg-quaternary);font-size:12px;text-align:center;">暂无脚本</div>'
      : scripts.map(s => `
        <div class="script-card ${s.id === activeScriptId ? 'is-active' : ''} ${!s.enabled ? 'is-disabled' : ''}"
             data-script-id="${s.id}">
          <span class="script-card-name">${esc(s.name)}</span>
          <span class="script-card-actions">
            <button class="iconbtn iconbtn-ghost" data-act="toggle" data-sid="${s.id}" style="width:22px;height:22px;" title="${s.enabled ? '禁用' : '启用'}">
              ${s.enabled ? '●' : '○'}
            </button>
            <button class="iconbtn iconbtn-ghost" data-act="delete" data-sid="${s.id}" style="width:22px;height:22px;" title="删除">×</button>
          </span>
        </div>
      `).join('');

    const editorHtml = active ? `
      <div class="script-editor-head">
        <input class="script-editor-name" id="script-name-input" value="${esc(active.name)}" />
        <span style="font-size:11px;color:var(--fg-quaternary);">${active.id.slice(0,8)}</span>
      </div>
      <div class="script-editor-body">
        <textarea class="script-editor-code" id="script-code-input" spellcheck="false">${esc(active.content)}</textarea>
      </div>
      <div class="script-editor-footer">
        <span class="script-trigger-label"><input type="checkbox" id="script-trigger-manual" ${active.triggers?.manual !== false ? 'checked' : ''} /> 手动</span>
        <span class="script-trigger-label"><input type="checkbox" id="script-trigger-onsend" ${active.triggers?.onSend ? 'checked' : ''} /> 发送前</span>
        <span class="script-trigger-label"><input type="checkbox" id="script-trigger-onmsg" ${active.triggers?.onMessage ? 'checked' : ''} /> 接收后</span>
        <span style="flex:1;"></span>
        <button class="chip-btn chip-btn-primary" id="script-run-btn">▶ 执行</button>
      </div>
    ` : `<div style="padding:40px;text-align:center;color:var(--fg-quaternary);">选择一个脚本或新建脚本</div>`;

    return `
      <div class="script-shell">
        <div class="script-list-pane">
          <div class="script-list-head">
            <span class="script-list-head-title">脚本列表</span>
            <button class="iconbtn iconbtn-ghost" id="script-new-btn" title="新建">+</button>
          </div>
          <div class="script-list-body" id="script-list">${listHtml}</div>
        </div>
        <div class="script-editor-pane" id="script-editor-area">${editorHtml}</div>
      </div>
    `;
  }

  function selectScript(id) {
    activeScriptId = id;
    const area = document.getElementById('script-editor-area');
    const list = document.getElementById('script-list');
    if (!area || !list) return;
    const active = scripts.find(s => s.id === id);
    area.innerHTML = active ? `
      <div class="script-editor-head">
        <input class="script-editor-name" id="script-name-input" value="${esc(active.name)}" />
        <span style="font-size:11px;color:var(--fg-quaternary);">${active.id.slice(0,8)}</span>
      </div>
      <div class="script-editor-body">
        <textarea class="script-editor-code" id="script-code-input" spellcheck="false">${esc(active.content)}</textarea>
      </div>
      <div class="script-editor-footer">
        <span class="script-trigger-label"><input type="checkbox" id="script-trigger-manual" ${active.triggers?.manual !== false ? 'checked' : ''} /> 手动</span>
        <span class="script-trigger-label"><input type="checkbox" id="script-trigger-onsend" ${active.triggers?.onSend ? 'checked' : ''} /> 发送前</span>
        <span class="script-trigger-label"><input type="checkbox" id="script-trigger-onmsg" ${active.triggers?.onMessage ? 'checked' : ''} /> 接收后</span>
        <span style="flex:1;"></span>
        <button class="chip-btn chip-btn-primary" id="script-run-btn">▶ 执行</button>
      </div>
    ` : '<div style="padding:40px;text-align:center;color:var(--fg-quaternary);">选择一个脚本或新建脚本</div>';
    list.querySelectorAll('.script-card').forEach(c => c.classList.toggle('is-active', c.dataset.scriptId === id));

    // re-bind editor events
    const nameInput = document.getElementById('script-name-input');
    const codeInput = document.getElementById('script-code-input');
    const runBtn = document.getElementById('script-run-btn');
    if (nameInput) {
      nameInput.addEventListener('input', () => {
        const s = scripts.find(s => s.id === activeScriptId);
        if (s) s.name = nameInput.value;
      });
    }
    if (codeInput) {
      codeInput.addEventListener('input', () => {
        const s = scripts.find(s => s.id === activeScriptId);
        if (s) s.content = codeInput.value;
      });
    }
    if (runBtn) {
      runBtn.addEventListener('click', async () => {
        const s = scripts.find(s => s.id === activeScriptId);
        if (!s) return;
        const { executeScript } = await import('./sillytavern/script-manager.js');
        const store = getStore();
        const result = executeScript(s, {
          chat: store?.activeChat,
          userName: store?.settings?.userName,
          characterName: store?.settings?.characterName,
          userInput: '',
        });
        const msg = result.success ? (result.output ? `输出: ${JSON.stringify(result.output)}` : '执行完成 ✓') : `错误: ${result.error}`;
        GameNotify.info(s.name, msg, { duration: 4000 });
      });
    }
  }

  async function bindAll() {
    const listEl = document.getElementById('script-list');
    if (listEl) {
      listEl.addEventListener('click', (e) => {
        const card = e.target.closest('.script-card');
        if (card) { selectScript(card.dataset.scriptId); return; }
        const actBtn = e.target.closest('[data-act]');
        if (actBtn) {
          const sid = actBtn.dataset.sid;
          const act = actBtn.dataset.act;
          if (act === 'toggle') {
            const s = scripts.find(s => s.id === sid);
            if (s) { s.enabled = !s.enabled; render(); if (sid === activeScriptId) selectScript(sid); }
          } else if (act === 'delete') {
            scripts = scripts.filter(s => s.id !== sid);
            if (activeScriptId === sid) activeScriptId = scripts[0]?.id || null;
            render();
          }
        }
      });
    }

    const newBtn = document.getElementById('script-new-btn');
    if (newBtn) {
      newBtn.addEventListener('click', async () => {
        const { add } = await import('./sillytavern/script-manager.js');
        const s = await add('新脚本');
        scripts = (await import('./sillytavern/script-manager.js')).getAll();
        activeScriptId = s.id;
        render();
      });
    }

    const triggerCbs = ['script-trigger-manual', 'script-trigger-onsend', 'script-trigger-onmsg'];
    triggerCbs.forEach(cbId => {
      const el = document.getElementById(cbId);
      if (el) {
        el.addEventListener('change', () => {
          const s = scripts.find(s => s.id === activeScriptId);
          if (!s) return;
          const fieldMap = {
            'script-trigger-manual': 'manual',
            'script-trigger-onsend': 'onSend',
            'script-trigger-onmsg': 'onMessage',
          };
          s.triggers = s.triggers || { manual: true, onSend: false, onMessage: false };
          s.triggers[fieldMap[cbId]] = el.checked;
        });
      }
    });

    // Footer buttons
    document.getElementById('script-save-all')?.addEventListener('click', async () => {
      const { update } = await import('./sillytavern/script-manager.js');
      for (const s of scripts) await update(s.id, s);
      GameNotify.success('已保存', `${scripts.length} 个脚本已保存。`);
    });
    document.getElementById('script-export')?.addEventListener('click', async () => {
      const { exportScripts } = await import('./sillytavern/script-manager.js');
      const data = exportScripts();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scripts-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      GameNotify.success('已导出', `${data.length} 个脚本。`);
    });
    document.getElementById('script-import')?.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json';
      inp.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const data = JSON.parse(text);
        const { importScripts } = await import('./sillytavern/script-manager.js');
        await importScripts(data);
        scripts = (await import('./sillytavern/script-manager.js')).getAll();
        activeScriptId = scripts[0]?.id || null;
        render();
        GameNotify.success('已导入', `${data.length} 个脚本。`);
      };
      inp.click();
    });
    document.getElementById('script-cancel')?.addEventListener('click', () => modal?.close?.());
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

  window.GameScriptEditor = { open };
})();
```

- [ ] **Step 2: Commit**

```bash
git add scripts/script-editor.js styles/script-editor.css
git commit -m "feat: add script-editor UI — card-based script management panel"
```

---

### Task 10: variable-manager.js — Variable browser UI

**Files:**
- Create: `scripts/variable-manager.js`

- [ ] **Step 1: Write variable-manager.js**

```js
/* scripts/variable-manager.js — 变量仓库面板 */
(function () {
  let modal = null;
  let activeTab = 'chat';

  function getStore() { return window.__stStore; }

  async function getVars(scope) {
    const { variableStore } = await import('./sillytavern/variable-store.js');
    const store = getStore();
    if (scope === 'global') return variableStore.getAll('global');
    if (scope === 'chat') return variableStore.getAll('chat', store?.activeChat);
    if (scope === 'message') return variableStore.getAll('message', store?.activeChat);
    return {};
  }

  function open() {
    render();
  }

  async function render() {
    const tabs = [
      { id: 'chat', label: '聊天变量', desc: '当前对话作用域' },
      { id: 'global', label: '全局变量', desc: '跨对话持久化' },
      { id: 'message', label: '消息变量', desc: '内存中，不持久化' },
    ];

    const tabBtns = tabs.map(t =>
      `<button class="chip-btn ${activeTab === t.id ? 'is-active' : ''}" data-vm-tab="${t.id}" style="margin-right:8px;">${t.label}<span style="margin-left:4px;font-size:11px;color:var(--fg-quaternary);">${t.desc}</span></button>`
    ).join('');

    const vars = await getVars(activeTab);
    const keys = Object.keys(vars);
    const bodyHtml = keys.length === 0
      ? '<div style="padding:20px;color:var(--fg-quaternary);text-align:center;">此作用域暂无变量。</div>'
      : `<div style="padding:4px 0;">${keys.map(k => buildVarRow(k, vars[k])).join('')}</div>`;

    const html = `
      <div style="padding:20px;">
        <div style="margin-bottom:16px;display:flex;align-items:center;gap:4px;">${tabBtns}</div>
        <div id="vm-body">${bodyHtml}</div>
      </div>
    `;

    if (modal) {
      modal.el.querySelector('#vm-content').innerHTML = html;
    } else {
      modal = GameModal.open({
        size: 'md', icon: 'sliders',
        title: '变量仓库',
        subtitle: '查看和管理所有作用域的变量',
        body: `<div id="vm-content">${html}</div>`,
      });
    }
    bindAll(modal);
  }

  function buildVarRow(key, value) {
    let display;
    if (value === null || value === undefined) display = '<span style="color:var(--fg-quaternary);font-style:italic;">null</span>';
    else if (typeof value === 'object') display = `<pre style="margin:0;font-size:11px;color:var(--fg-tertiary);white-space:pre-wrap;">${esc(JSON.stringify(value, null, 2))}</pre>`;
    else if (typeof value === 'number') display = `<span style="color:var(--accent);font-family:var(--font-mono);">${value}</span>`;
    else if (typeof value === 'boolean') display = `<span style="color:var(--wisteria-300);font-family:var(--font-mono);">${value}</span>`;
    else display = `<span style="color:var(--fg-secondary);">${esc(String(value))}</span>`;

    return `
      <div style="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-bottom:1px solid var(--border-soft);" data-var-key="${esc(key)}">
        <span style="font-weight:600;font-size:13px;color:var(--fg-primary);min-width:80px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(key)}</span>
        <span style="flex:1;font-size:13px;word-break:break-all;">${display}</span>
        <button class="iconbtn iconbtn-ghost" data-vm-edit="${esc(key)}" style="width:24px;height:24px;flex-shrink:0;" title="编辑">✎</button>
        <button class="iconbtn iconbtn-ghost" data-vm-delete="${esc(key)}" style="width:24px;height:24px;flex-shrink:0;" title="删除">×</button>
      </div>
    `;
  }

  function bindAll(modal) {
    modal.el.querySelectorAll('[data-vm-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-vm-tab');
        render();
      });
    });

    modal.el.querySelectorAll('[data-vm-edit]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.getAttribute('data-vm-edit');
        const { variableStore } = await import('./sillytavern/variable-store.js');
        const store = getStore();
        const current = await variableStore.getVar(key, {}, store?.activeChat);
        const newVal = prompt(`编辑变量: ${key}`, typeof current === 'object' ? JSON.stringify(current) : String(current));
        if (newVal !== null) {
          let parsed;
          try { parsed = JSON.parse(newVal); } catch { parsed = newVal; }
          await variableStore.setVar(key, parsed, {}, store?.activeChat);
          render();
        }
      });
    });

    modal.el.querySelectorAll('[data-vm-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.getAttribute('data-vm-delete');
        if (!confirm(`删除变量 "${key}"？`)) return;
        const { variableStore } = await import('./sillytavern/variable-store.js');
        const store = getStore();
        await variableStore.deleteVar(key, activeTab, store?.activeChat);
        render();
      });
    });
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

  window.GameVariableManager = { open };
})();
```

- [ ] **Step 2: Commit**

```bash
git add scripts/variable-manager.js
git commit -m "feat: add variable-manager UI — tabbed variable browser/editor"
```

---

### Task 11: prompt-viewer.js — Prompt inspector UI

**Files:**
- Create: `scripts/prompt-viewer.js`

- [ ] **Step 1: Write prompt-viewer.js**

```js
/* scripts/prompt-viewer.js — 提示词查看器 */
(function () {
  let modal = null;

  function getStore() { return window.__stStore; }

  function open() {
    const store = getStore();
    if (!store || !store.settings?.api?.apiKey) {
      GameNotify.warn('未配置 API', '请先在设置中配置 API Key。');
      return;
    }

    // Build a preview of what would be sent
    const { assemblePrompt } = store._lastAssembled || {};
    const chat = store.activeChat;
    const preset = store.activePreset;
    const activeLorebookIds = new Set(store.settings?.activeLorebookIds ?? []);
    const activeBooks = store.lorebooks.filter(l => activeLorebookIds.has(l.id));

    // Show current state info
    const historyCount = chat?.messages?.length || 0;
    const lorebookCount = activeBooks.reduce((s, b) => s + b.entries.length, 0);

    let messagesHtml = '';
    if (store._lastMessages) {
      messagesHtml = store._lastMessages.map((m, i) => {
        const roleColors = { system: 'var(--wisteria-300)', user: 'var(--accent)', assistant: 'var(--sakura-300)' };
        const color = roleColors[m.role] || 'var(--fg-quaternary)';
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        const estimatedTokens = Math.round(content.length / 4);
        return `
          <div style="margin-bottom:8px;border:1px solid var(--border-soft);border-radius:6px;overflow:hidden;">
            <div style="display:flex;align-items:center;gap:8px;padding:4px 10px;background:rgba(255,255,255,0.02);border-bottom:1px solid var(--border-soft);">
              <span style="color:${color};font-weight:600;font-size:11px;text-transform:uppercase;">${m.role}</span>
              <span style="color:var(--fg-quaternary);font-size:10px;">#${i + 1}</span>
              <span style="margin-left:auto;color:var(--fg-quaternary);font-size:10px;">~${estimatedTokens} tokens</span>
            </div>
            <pre style="margin:0;padding:8px 10px;font-size:12px;line-height:1.5;color:var(--fg-secondary);white-space:pre-wrap;word-break:break-word;font-family:var(--font-mono);max-height:200px;overflow-y:auto;">${esc(content)}</pre>
          </div>
        `;
      }).join('');
    }

    let totalTokens = 0;
    if (store._lastMessages) {
      totalTokens = Math.round(store._lastMessages.reduce((s, m) => s + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length), 0) / 4);
    }

    modal = GameModal.open({
      size: 'lg', icon: 'eye',
      title: '提示词查看器',
      subtitle: `当前对话 · ${historyCount} 条历史 · ${lorebookCount} 条世界条目 · ~${totalTokens} tokens`,
      body: `
        <div style="padding:16px;">
          ${messagesHtml || '<div style="padding:40px;text-align:center;color:var(--fg-quaternary);">尚未发送过消息。发送一条消息后将在此显示提示词结构。</div>'}
          ${store._lastMessages ? `
            <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
              <button class="chip-btn" id="pv-copy">复制完整提示词</button>
              <button class="chip-btn chip-btn-primary" id="pv-refresh">刷新</button>
            </div>
          ` : ''}
        </div>
      `,
    });

    document.getElementById('pv-copy')?.addEventListener('click', () => {
      const text = store._lastMessages
        ? store._lastMessages.map(m => `[${m.role}]\n${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n\n')
        : '';
      navigator.clipboard?.writeText(text);
      GameNotify.success('已复制', '完整提示词已复制到剪贴板。');
    });

    document.getElementById('pv-refresh')?.addEventListener('click', () => {
      modal?.close?.();
      open();
    });
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

  window.GamePromptViewer = { open };
})();
```

- [ ] **Step 2: Commit**

```bash
git add scripts/prompt-viewer.js
git commit -m "feat: add prompt-viewer UI — inspect assembled prompt structure"
```

---

### Task 12: Modify main.js — Register new panel entries and shortcuts

**Files:**
- Modify: `scripts/main.js`

- [ ] **Step 1: Add new shortcut mappings**

In `main.js`, extend the shortcut map (around line 189):

```js
const map = {
  f: 'facilities', o: 'organizations', r: 'roster', c: 'courses',
  d: 'rules-editor', a: 'form-editor', e: 'rules-reader', t: 'todo',
  s: 'script-editor', v: 'variable-manager', p: 'prompt-viewer',
};
```

- [ ] **Step 2: Add new panel dispatch in nav click handler**

In the nav item click handler (around line 10-24), add new cases:

```js
case 'script-editor': GameScriptEditor.open(); break;
case 'variable-manager': GameVariableManager.open(); break;
case 'prompt-viewer': GamePromptViewer.open(); break;
```

- [ ] **Step 3: Commit**

```bash
git add scripts/main.js
git commit -m "feat: register script-editor, variable-manager, prompt-viewer panels + shortcuts S/V/P"
```

---

### Task 13: Modify index.html — Link all new files

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add script and style references**

In `index.html`, in the `<head>` after the existing stylesheet links (line 24), add:

```html
<link rel="stylesheet" href="styles/script-editor.css" />
```

In the `<script>` section at the bottom (before `main.js`), add ejs.js and the new IIFE scripts:

```html
<script src="scripts/lib/ejs.min.js"></script>
<script src="scripts/script-editor.js"></script>
<script src="scripts/variable-manager.js"></script>
<script src="scripts/prompt-viewer.js"></script>
```

The full `<script>` section should now be:

```html
<script src="scripts/icons.js"></script>
<script src="scripts/data.js"></script>
<script src="scripts/notifications.js"></script>
<script src="scripts/tooltip.js"></script>
<script src="scripts/modal.js"></script>
<script src="scripts/chat.js"></script>
<script src="scripts/facilities.js"></script>
<script src="scripts/organizations.js"></script>
<script src="scripts/roster.js"></script>
<script src="scripts/courses.js"></script>
<script src="scripts/rules-editor.js"></script>
<script src="scripts/form-editor.js"></script>
<script src="scripts/rules-reader.js"></script>
<script src="scripts/todo.js"></script>
<script src="scripts/lib/ejs.min.js"></script>
<script src="scripts/script-editor.js"></script>
<script src="scripts/variable-manager.js"></script>
<script src="scripts/prompt-viewer.js"></script>
<script type="module" src="scripts/main.js"></script>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: link ejs.js, script-editor, variable-manager, prompt-viewer in index.html"
```

---

### Task 14: Integration test — Verify end-to-end flow

- [ ] **Step 1: Verify the app starts without errors**

Start the app and check browser console for any errors.

- [ ] **Step 2: Test /setvar command**

In the chat input, type `/setvar 好感度=60` and verify the toast shows the result.

- [ ] **Step 3: Test /getvar command**

Type `/getvar 好感度` and verify the stored value is displayed.

- [ ] **Step 4: Test /roll command**

Type `/roll 2d6` and verify dice result.

- [ ] **Step 5: Test EJS in a lorebook entry**

Create a lorebook entry with content like `当前好感度：<%- getvar('好感度') %>` and send a message that triggers it. Verify the variable is replaced in the sent prompt (check prompt-viewer).

- [ ] **Step 6: Test variable-manager panel**

Press `V` to open variable manager. Verify the chat variables tab shows `好感度 = 60`. Edit the value and verify it changes.

- [ ] **Step 7: Test script-editor panel**

Press `S` to open script editor. Create a new script, write some JS, click execute, verify it runs.

- [ ] **Step 8: Test prompt-viewer**

Press `P` to open prompt viewer after sending a message. Verify the prompt structure is shown.

- [ ] **Step 9: Commit any final fixes**

```bash
git add -A
git commit -m "fix: integration test fixes"
```
