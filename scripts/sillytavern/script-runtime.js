/**
 * Script runtime — compiles user-authored JS, binds it to lifecycle hooks,
 * and tracks per-script error state for the debug panel.
 *
 * Each script:
 *   { id, name, hooks:[…], code, enabled, runOrder, lastError, lastRunAt }
 *
 * `code` is wrapped as `function(event, payload, st, ctx, console){ … }`.
 * Returning a value from a `prompt:before` handler can mutate the payload
 * by writing fields directly (passed by reference).
 */

import { on, off, emit, EVENTS, offByOwner } from './event-bus.js';
import * as api from './extension-api.js';

const compiled = new Map(); // id -> { fn, hooks, unsubs, def }
const errors = new Map();   // id -> { ts, message, stack }
const consoleLog = [];      // ring buffer for debug panel
const CONSOLE_LIMIT = 120;

export const HOOK_TYPES = [
  EVENTS.APP_INIT,
  EVENTS.PROMPT_BEFORE,
  EVENTS.PROMPT_AFTER,
  EVENTS.STREAM_CHUNK,
  EVENTS.STREAM_DONE,
  EVENTS.MESSAGE_USER,
  EVENTS.MESSAGE_ASSISTANT,
  EVENTS.VARS_CHANGE,
  EVENTS.SLASH_COMMAND,
];

export function loadScripts(defs = []) {
  // Drop everything first
  for (const id of compiled.keys()) unregister(id);
  for (const def of defs) register(def);
}

export function register(def) {
  if (!def || !def.id) return;
  unregister(def.id);
  if (def.enabled === false) {
    compiled.set(def.id, { fn: null, hooks: [], unsubs: [], def });
    return;
  }
  let fn;
  try {
    fn = new Function(
      'event', 'payload', 'st', 'ctx', 'console',
      def.code || '',
    );
  } catch (err) {
    errors.set(def.id, { ts: Date.now(), message: err.message, stack: err.stack });
    compiled.set(def.id, { fn: null, hooks: [], unsubs: [], def });
    return;
  }

  const hooks = Array.isArray(def.hooks) ? def.hooks : [];
  const unsubs = [];
  const sandbox = {
    log: (...a) => pushLog(def.id, 'log', a),
    info: (...a) => pushLog(def.id, 'info', a),
    warn: (...a) => pushLog(def.id, 'warn', a),
    error: (...a) => pushLog(def.id, 'error', a),
  };
  const ctxObj = { script: { id: def.id, name: def.name } };

  for (const hook of hooks) {
    const handler = async (payload, type) => {
      try {
        const res = fn(type, payload, api.Tavern, ctxObj, sandbox);
        if (res && typeof res.then === 'function') await res;
        errors.delete(def.id);
        const rec = compiled.get(def.id);
        if (rec) rec.def.lastRunAt = Date.now();
      } catch (err) {
        errors.set(def.id, { ts: Date.now(), message: err.message, stack: err.stack });
        emit(EVENTS.SCRIPT_ERROR, { id: def.id, name: def.name, error: err });
      }
    };
    const unsub = on(hook, handler, { owner: `script:${def.id}`, order: def.runOrder ?? 0 });
    unsubs.push(unsub);
  }
  compiled.set(def.id, { fn, hooks, unsubs, def });
}

export function unregister(id) {
  const rec = compiled.get(id);
  if (!rec) return;
  for (const u of rec.unsubs) try { u(); } catch {}
  offByOwner(`script:${id}`);
  compiled.delete(id);
  errors.delete(id);
}

export function getError(id) { return errors.get(id) ?? null; }
export function getAllErrors() {
  const out = {};
  for (const [k, v] of errors) out[k] = v;
  return out;
}

export function getCompiled(id) { return compiled.get(id) ?? null; }

export async function runManually(def, payload = {}) {
  const sandbox = {
    log: (...a) => pushLog(def.id, 'log', a),
    info: (...a) => pushLog(def.id, 'info', a),
    warn: (...a) => pushLog(def.id, 'warn', a),
    error: (...a) => pushLog(def.id, 'error', a),
  };
  const ctxObj = { script: { id: def.id, name: def.name }, manual: true };
  let fn;
  try {
    fn = new Function('event', 'payload', 'st', 'ctx', 'console', def.code || '');
  } catch (err) {
    errors.set(def.id, { ts: Date.now(), message: err.message, stack: err.stack });
    return { ok: false, error: err };
  }
  try {
    const res = fn('manual', payload, api.Tavern, ctxObj, sandbox);
    const value = res && typeof res.then === 'function' ? await res : res;
    errors.delete(def.id);
    return { ok: true, value };
  } catch (err) {
    errors.set(def.id, { ts: Date.now(), message: err.message, stack: err.stack });
    return { ok: false, error: err };
  }
}

function pushLog(scriptId, level, args) {
  const text = args.map(a => {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');
  consoleLog.push({ scriptId, level, text, ts: Date.now() });
  if (consoleLog.length > CONSOLE_LIMIT) consoleLog.splice(0, consoleLog.length - CONSOLE_LIMIT);
  // Mirror to real console with prefix
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
    `[script:${scriptId}]`, ...args,
  );
}

export function getConsoleLog() { return [...consoleLog]; }
export function clearConsoleLog() { consoleLog.length = 0; }
