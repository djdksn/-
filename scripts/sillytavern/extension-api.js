/**
 * Public API exposed to user scripts and templates as `Tavern.*`.
 * Names mirror ST-Prompt-Template (getvar/setvar/addvar/random/roll/pick).
 *
 * Variable scopes:
 *   'chat'   — current chat.variables (default)
 *   'global' — settings.globalVariables
 *   'merge'  — read-only merged view (chat overrides global)
 */

import { emit, on, EVENTS } from './event-bus.js';
import { render as renderTemplate } from './template-engine.js';

let _store = null;
const _customCommands = new Map();

export function bindStore(store) { _store = store; }
export function getStore() { return _store; }

// ========== variable getters/setters ==========

export function getvar(key, scope = 'chat') {
  if (!_store) return undefined;
  if (scope === 'global') {
    return _store.settings?.globalVariables?.[key];
  }
  if (scope === 'merge') {
    const g = _store.settings?.globalVariables ?? {};
    const c = _store.activeChat?.variables ?? {};
    return key in c ? c[key] : g[key];
  }
  return _store.activeChat?.variables?.[key];
}

export function setvar(key, value, scope = 'chat') {
  if (!_store) return;
  if (scope === 'global') {
    const next = { ...(_store.settings?.globalVariables ?? {}), [key]: value };
    _store.updateSettings({ globalVariables: next });
  } else {
    const chat = _store.activeChat;
    if (!chat) return;
    const next = { ...(chat.variables ?? {}), [key]: value };
    _store.setChatVariables(next);
  }
  emit(EVENTS.VARS_CHANGE, { key, value, scope });
  return value;
}

export function addvar(key, delta, scope = 'chat') {
  const cur = Number(getvar(key, scope) ?? 0);
  const d = Number(delta);
  if (Number.isNaN(cur) || Number.isNaN(d)) return cur;
  return setvar(key, cur + d, scope);
}

export const incvar = (key, scope) => addvar(key, 1, scope);
export const decvar = (key, scope) => addvar(key, -1, scope);

export function delvar(key, scope = 'chat') {
  if (!_store) return;
  if (scope === 'global') {
    const cur = { ...(_store.settings?.globalVariables ?? {}) };
    delete cur[key];
    _store.updateSettings({ globalVariables: cur });
  } else {
    const chat = _store.activeChat;
    if (!chat) return;
    const next = { ...(chat.variables ?? {}) };
    delete next[key];
    _store.setChatVariables(next);
  }
  emit(EVENTS.VARS_CHANGE, { key, scope, deleted: true });
}

export function hasvar(key, scope = 'merge') {
  return getvar(key, scope) !== undefined;
}

export function allvars(scope = 'merge') {
  const g = _store?.settings?.globalVariables ?? {};
  const c = _store?.activeChat?.variables ?? {};
  if (scope === 'global') return { ...g };
  if (scope === 'chat') return { ...c };
  return { ...g, ...c };
}

// ========== randomness ==========

export function random(min = 0, max = 1) {
  if (max === undefined) { max = min; min = 0; }
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (Number.isInteger(lo) && Number.isInteger(hi)) {
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
  }
  return Math.random() * (hi - lo) + lo;
}

export function roll(spec) {
  if (typeof spec !== 'string') return random(1, Number(spec) || 6);
  const m = spec.trim().match(/^(\d*)d(\d+)([+\-]\d+)?$/i);
  if (!m) return NaN;
  const n = Number(m[1] || 1);
  const sides = Number(m[2]);
  const modifier = m[3] ? Number(m[3]) : 0;
  let total = 0;
  for (let i = 0; i < n; i++) total += 1 + Math.floor(Math.random() * sides);
  return total + modifier;
}

export function pick(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ========== context helpers ==========

export function user() { return _store?.settings?.userName ?? '用户'; }
export function char() { return _store?.settings?.characterName ?? 'AI'; }
export function history(n = 10) {
  const msgs = _store?.activeChat?.messages ?? [];
  return msgs.slice(-n).map(m => ({ role: m.role, content: m.content }));
}
export function now() { return Date.now(); }
export function today() { return new Date().toISOString().slice(0, 10); }

// ========== commands & notifications ==========

export function command(name, fn, meta = {}) {
  if (!name || typeof fn !== 'function') return;
  _customCommands.set(String(name).toLowerCase(), { fn, meta });
}

export function listCustomCommands() {
  return [..._customCommands.entries()].map(([name, { meta }]) => ({ name, ...meta }));
}

export function getCustomCommand(name) {
  return _customCommands.get(String(name).toLowerCase());
}

export function clearCustomCommands(owner) {
  if (!owner) { _customCommands.clear(); return; }
  for (const [k, v] of _customCommands) {
    if (v.meta?.owner === owner) _customCommands.delete(k);
  }
}

export function notify(kind, title, text = '') {
  if (typeof window !== 'undefined' && window.GameNotify && window.GameNotify[kind]) {
    window.GameNotify[kind](title, text);
  } else {
    console.log(`[notify:${kind}] ${title}`, text);
  }
}

// ========== template helper ==========

export function template(source, extra = {}) {
  return renderTemplate(source, buildContext(extra));
}

// ========== context factory ==========

export function buildContext(extra = {}) {
  return {
    // variable accessors
    getvar, setvar, addvar, incvar, decvar, delvar, hasvar,
    // random
    random, roll, pick,
    // context
    user: user(), char: char(),
    chat: _store?.activeChat ?? null,
    vars: allvars('merge'),
    chatVars: allvars('chat'),
    globalVars: allvars('global'),
    history,
    now, today,
    Math, JSON,
    // misc
    notify, command,
    ...extra,
  };
}

// ========== unified Tavern namespace ==========

export const Tavern = {
  getvar, setvar, addvar, incvar, decvar, delvar, hasvar, allvars,
  random, roll, pick,
  user, char, history, now, today,
  command, listCustomCommands, notify,
  template,
  on,
  emit,
  EVENTS,
  get store() { return _store; },
};

if (typeof window !== 'undefined') {
  window.Tavern = Tavern;
}
