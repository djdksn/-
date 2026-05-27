/**
 * variable-store.js — Three-scope variable system (global / chat / message)
 * API aligned with ST-Prompt-Template: getvar, setvar, incvar, decvar
 */
import { getGlobalVariables, saveGlobalVariables } from './database.js';
import { coerce as schemaCoerce } from './variable-schema.js';

// In-memory message variables: chatId -> messageId -> vars
const messageVars = new Map();

function _messageKey(chatId, msgId) {
  if (!chatId) return null;
  return `${chatId}::${msgId}`;
}

// ---- Path helpers (lodash.get/set equivalents) ----

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
    this._observer = null;
  }

  setObserver(fn) { this._observer = fn; }

  _getSource(scope, chat) {
    if (scope === 'message') return { obj: null, key: 'message' };
    if (scope === 'global') return { obj: _globalVars, key: 'global' };
    if (!chat || !chat.variables) return { obj: null, key: 'chat' };
    return { obj: chat.variables, key: 'chat' };
  }

  _resolveScope(raw) {
    if (raw === 'global' || raw === 'local' || raw === 'chat' || raw === 'message' || raw === 'cache')
      return raw === 'local' || raw === 'chat' || raw === 'cache' ? 'chat' : raw;
    return null;
  }

  _resolveOpts(raw) {
    if (typeof raw === 'string') {
      return { flags: raw, scope: 'chat' };
    }
    if (!raw) return { scope: null }; // null = auto-search
    const scope = this._resolveScope(raw.scope) || null;
    return { ...raw, scope };
  }

  async getVar(key, rawOpts, chat, msgId) {
    await loadGlobal();
    const opts = this._resolveOpts(rawOpts);

    if (opts.scope === 'message') {
      const mKey = _messageKey(chat?.id, msgId);
      if (mKey && messageVars.has(mKey)) {
        const val = pathGet(messageVars.get(mKey), key);
        if (val !== undefined) return val;
      }
      return opts.defaults;
    }

    if (opts.scope === 'chat') {
      if (chat?.variables) {
        const val = pathGet(chat.variables, key);
        if (val !== undefined) return val;
      }
      return opts.defaults;
    }

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

  async setVar(key, value, rawOpts, chat, msgId) {
    await loadGlobal();
    const opts = this._resolveOpts(rawOpts);
    const flags = opts.flags || 'n';

    // Schema coercion
    const scResult = schemaCoerce(key, value);
    if (scResult.warning) console.warn(scResult.warning);
    if (scResult.coerced === undefined) return undefined;
    value = scResult.coerced;

    if (opts.scope === 'message') {
      const mKey = _messageKey(chat?.id, msgId);
      if (!mKey) return undefined;
      const existing = messageVars.get(mKey) || {};
      if (flags === 'nx' && pathGet(existing, key) !== undefined) return undefined;
      if (flags === 'xx' && pathGet(existing, key) === undefined) return undefined;
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

  /**
   * Synchronous version of getAll for use by macros and EJS templates.
   * ensureLoaded() must be called first.
   */
  getAllSync(scope, chat) {
    if (scope === 'global') return { ..._globalVars };
    if (scope === 'chat') return chat?.variables ? { ...chat.variables } : {};
    if (scope === 'message' && chat) {
      const result = {};
      for (const [key, vars] of messageVars) {
        if (key.startsWith(chat.id + '::')) {
          result[key.slice(chat.id.length + 2)] = { ...vars };
        }
      }
      return result;
    }
    return {};
  }

  // ---- Synchronous variants (for EJS templates; ensureLoaded must be called first) ----

  async ensureLoaded() {
    await loadGlobal();
  }

  getVarSync(key, rawOpts, chat, msgId) {
    const opts = this._resolveOpts(rawOpts);

    if (opts.scope === 'message') {
      const mKey = _messageKey(chat?.id, msgId);
      if (mKey && messageVars.has(mKey)) {
        const val = pathGet(messageVars.get(mKey), key);
        if (val !== undefined) return val;
      }
      return opts.defaults;
    }

    if (opts.scope === 'chat') {
      if (chat?.variables) {
        const val = pathGet(chat.variables, key);
        if (val !== undefined) return val;
      }
      return opts.defaults;
    }

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

  setVarSync(key, value, rawOpts, chat, msgId) {
    const opts = this._resolveOpts(rawOpts);
    const flags = opts.flags || 'n';

    // Schema coercion
    const scResult = schemaCoerce(key, value);
    if (scResult.warning) console.warn(scResult.warning);
    if (scResult.coerced === undefined) return undefined;
    value = scResult.coerced;

    if (opts.scope === 'message') {
      const mKey = _messageKey(chat?.id, msgId);
      if (!mKey) return undefined;
      const existing = messageVars.get(mKey) || {};
      if (flags === 'nx' && pathGet(existing, key) !== undefined) return undefined;
      if (flags === 'xx' && pathGet(existing, key) === undefined) return undefined;
      if (!messageVars.has(mKey)) messageVars.set(mKey, {});
      pathSet(messageVars.get(mKey), key, value);
      this._observer?.({ scope: 'message', key, value });
      return value;
    }

    if (opts.scope === 'global') {
      if (flags === 'nx' && pathGet(_globalVars, key) !== undefined) return undefined;
      if (flags === 'xx' && pathGet(_globalVars, key) === undefined) return undefined;
      pathSet(_globalVars, key, value);
      saveGlobal(); // fire-and-forget
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

  incVarSync(key, delta, rawOpts, chat, msgId) {
    delta = typeof delta === 'number' ? delta : 1;
    const opts = this._resolveOpts(rawOpts);
    const val = this.getVarSync(key, rawOpts, chat, msgId);
    const current = typeof val === 'number' ? val : (opts.defaults || 0);
    let newVal = current + delta;
    if (opts.min != null) newVal = Math.max(newVal, opts.min);
    if (opts.max != null) newVal = Math.min(newVal, opts.max);
    return this.setVarSync(key, newVal, { ...opts, flags: 'n' }, chat, msgId);
  }

  decVarSync(key, delta, rawOpts, chat, msgId) {
    delta = typeof delta === 'number' ? delta : 1;
    return this.incVarSync(key, -delta, rawOpts, chat, msgId);
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
