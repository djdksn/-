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

function getEnabled() { return _scripts.filter(s => s.enabled).map(s => ({ ...s })); }

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
    getvar: (key, opts) => variableStore.getVarSync(key, opts, chat),
    setvar: (key, value, opts) => variableStore.setVarSync(key, value, opts, chat),
    incvar: (key, delta, opts) => variableStore.incVarSync(key, delta, opts, chat),
    decvar: (key, delta, opts) => variableStore.decVarSync(key, delta, opts, chat),
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
async function executeScript(script, context = {}) {
  if (!script.enabled || !script.content) return { success: false, error: 'Script disabled or empty' };
  try {
    await variableStore.ensureLoaded();
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
    const result = await executeScript(script, context);
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
