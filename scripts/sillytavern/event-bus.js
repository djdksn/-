/**
 * Lightweight pub-sub bus for the SillyTavern extension layer.
 * Used by template engine, script runtime, slash commands and the store
 * to coordinate side-effects without coupling.
 */

const handlers = new Map();
let recentLog = [];
const LOG_LIMIT = 60;

export const EVENTS = {
  APP_INIT: 'app:init',
  PROMPT_BEFORE: 'prompt:before',
  PROMPT_AFTER: 'prompt:after',
  STREAM_CHUNK: 'stream:chunk',
  STREAM_DONE: 'stream:done',
  MESSAGE_USER: 'message:user',
  MESSAGE_ASSISTANT: 'message:assistant',
  VARS_CHANGE: 'vars:change',
  SLASH_COMMAND: 'slash:command',
  SCRIPT_ERROR: 'script:error',
};

export function on(type, fn, opts = {}) {
  const list = handlers.get(type) || [];
  list.push({ fn, owner: opts.owner ?? null, order: opts.order ?? 0 });
  list.sort((a, b) => a.order - b.order);
  handlers.set(type, list);
  return () => off(type, fn);
}

export function once(type, fn, opts = {}) {
  const wrap = (payload) => {
    off(type, wrap);
    return fn(payload);
  };
  return on(type, wrap, opts);
}

export function off(type, fn) {
  const list = handlers.get(type);
  if (!list) return;
  const next = list.filter(h => h.fn !== fn);
  if (next.length === 0) handlers.delete(type);
  else handlers.set(type, next);
}

export function offByOwner(owner) {
  for (const [type, list] of handlers.entries()) {
    const next = list.filter(h => h.owner !== owner);
    if (next.length === 0) handlers.delete(type);
    else handlers.set(type, next);
  }
}

export async function emit(type, payload) {
  recentLog.push({ type, ts: Date.now(), payload: summarize(payload) });
  if (recentLog.length > LOG_LIMIT) recentLog = recentLog.slice(-LOG_LIMIT);

  const list = handlers.get(type);
  if (!list || list.length === 0) return payload;
  for (const h of [...list]) {
    try {
      const result = h.fn(payload, type);
      if (result && typeof result.then === 'function') await result;
    } catch (err) {
      console.error(`[event-bus] handler for ${type} threw:`, err);
      // Re-emit as script-error so debug panel can capture it.
      const errList = handlers.get(EVENTS.SCRIPT_ERROR);
      if (errList && type !== EVENTS.SCRIPT_ERROR) {
        for (const eh of errList) {
          try { eh.fn({ type, error: err, owner: h.owner }, EVENTS.SCRIPT_ERROR); } catch {}
        }
      }
    }
  }
  return payload;
}

export function getRecentLog() { return [...recentLog]; }
export function clearLog() { recentLog = []; }
export function listSubscriptions() {
  const out = {};
  for (const [type, list] of handlers.entries()) out[type] = list.length;
  return out;
}

function summarize(p) {
  if (p == null) return null;
  if (typeof p === 'string') return p.length > 80 ? p.slice(0, 77) + '…' : p;
  if (typeof p !== 'object') return p;
  try {
    const keys = Object.keys(p).slice(0, 6);
    return Object.fromEntries(keys.map(k => {
      const v = p[k];
      if (typeof v === 'string') return [k, v.length > 40 ? v.slice(0, 37) + '…' : v];
      if (Array.isArray(v)) return [k, `Array(${v.length})`];
      if (v && typeof v === 'object') return [k, '[object]'];
      return [k, v];
    }));
  } catch { return '[unserializable]'; }
}
