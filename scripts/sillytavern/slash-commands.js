/**
 * Slash command dispatcher.
 * Built-in commands cover variable mutation, dice, scripts, and templates.
 * User scripts can register custom commands via Tavern.command(name, fn).
 */

import * as api from './extension-api.js';
import { emit, EVENTS } from './event-bus.js';
import { runManually, getCompiled } from './script-runtime.js';
import { render as renderTemplate } from './template-engine.js';

const builtin = new Map();

function reg(name, meta, fn) {
  builtin.set(name.toLowerCase(), { meta, fn });
}

reg('help', { args: '', desc: '列出全部命令' }, () => {
  const all = listAll();
  const lines = all.map(c => `/${c.name}${c.args ? ' ' + c.args : ''}  —— ${c.desc || ''}`);
  return { ok: true, text: lines.join('\n') };
});

reg('setvar', { args: '<key> <value> [scope]', desc: '设置变量；scope 默认 chat，可填 global' }, (args) => {
  const [key, ...rest] = args;
  if (!key) return { ok: false, text: '用法: /setvar <key> <value>' };
  let scope = 'chat';
  let valTokens = rest;
  if (rest.length > 1 && (rest[rest.length - 1] === 'global' || rest[rest.length - 1] === 'chat')) {
    scope = rest.pop();
    valTokens = rest;
  }
  const raw = valTokens.join(' ');
  const value = coerce(raw);
  api.setvar(key, value, scope);
  return { ok: true, text: `${scope}.${key} = ${JSON.stringify(value)}` };
});

reg('addvar', { args: '<key> <delta> [scope]', desc: '叠加数值变量' }, (args) => {
  const [key, deltaRaw, scope] = args;
  if (!key || deltaRaw === undefined) return { ok: false, text: '用法: /addvar <key> <delta>' };
  const v = api.addvar(key, Number(deltaRaw), scope || 'chat');
  return { ok: true, text: `${scope || 'chat'}.${key} = ${v}` };
});

reg('getvar', { args: '<key> [scope]', desc: '读取变量' }, (args) => {
  const [key, scope] = args;
  if (!key) return { ok: false, text: '用法: /getvar <key>' };
  const v = api.getvar(key, scope || 'merge');
  return { ok: true, text: `${key} = ${JSON.stringify(v)}` };
});

reg('delvar', { args: '<key> [scope]', desc: '删除变量' }, (args) => {
  const [key, scope] = args;
  if (!key) return { ok: false, text: '用法: /delvar <key>' };
  api.delvar(key, scope || 'chat');
  return { ok: true, text: `已删除 ${scope || 'chat'}.${key}` };
});

reg('vars', { args: '[scope]', desc: '列出所有变量' }, (args) => {
  const scope = args[0] || 'merge';
  const all = api.allvars(scope);
  const lines = Object.entries(all).map(([k, v]) => `${k} = ${JSON.stringify(v)}`);
  return { ok: true, text: lines.join('\n') || '(空)' };
});

reg('roll', { args: '<dice>', desc: '掷骰，如 1d20+3' }, (args) => {
  const r = api.roll(args.join(' ') || '1d20');
  return { ok: true, text: `🎲 ${r}` };
});

reg('echo', { args: '<text>', desc: '回显（带模板渲染）' }, (args) => {
  const text = args.join(' ');
  const rendered = renderTemplate(text, api.buildContext());
  return { ok: true, text: rendered };
});

reg('run', { args: '<scriptId|name>', desc: '手动运行一个脚本' }, async (args, store) => {
  const ident = args[0];
  if (!ident) return { ok: false, text: '用法: /run <scriptId|name>' };
  const scripts = store?.scripts || [];
  const def = scripts.find(s => s.id === ident || s.name === ident);
  if (!def) return { ok: false, text: `未找到脚本: ${ident}` };
  const result = await runManually(def, { source: 'slash' });
  return result.ok
    ? { ok: true, text: `已运行 ${def.name}${result.value !== undefined ? ' → ' + JSON.stringify(result.value) : ''}` }
    : { ok: false, text: `运行失败: ${result.error?.message}` };
});

reg('template', { args: 'list | test <name>', desc: '查看或测试模板' }, (args, store) => {
  const sub = args[0];
  const templates = store?.templates || [];
  if (sub === 'list' || !sub) {
    const lines = templates.map(t => `${t.name}${t.enabled === false ? ' (禁用)' : ''}`);
    return { ok: true, text: lines.join('\n') || '(无模板)' };
  }
  if (sub === 'test') {
    const name = args[1];
    const tpl = templates.find(t => t.name === name || t.id === name);
    if (!tpl) return { ok: false, text: `未找到模板: ${name}` };
    const out = renderTemplate(tpl.content || '', api.buildContext());
    return { ok: true, text: out };
  }
  return { ok: false, text: '用法: /template list | /template test <name>' };
});

reg('clear', { args: '', desc: '清空当前对话' }, async (_args, store) => {
  const chat = store?.activeChat;
  if (!chat) return { ok: false, text: '无活跃对话' };
  const next = { ...chat, messages: [], updatedAt: Date.now() };
  await store._db.table('chats').put(next);
  store.chats = store.chats.map(c => c.id === chat.id ? next : c);
  store._notify();
  return { ok: true, text: '已清空对话' };
});

reg('global', { args: 'set|get|del <key> [value]', desc: '操作全局变量（settings 层）' }, (args) => {
  const [op, key, ...rest] = args;
  if (!op || !key) return { ok: false, text: '用法: /global set|get|del <key> [value]' };
  if (op === 'set') {
    const value = coerce(rest.join(' '));
    api.setvar(key, value, 'global');
    return { ok: true, text: `global.${key} = ${JSON.stringify(value)}` };
  }
  if (op === 'get') {
    return { ok: true, text: `global.${key} = ${JSON.stringify(api.getvar(key, 'global'))}` };
  }
  if (op === 'del') {
    api.delvar(key, 'global');
    return { ok: true, text: `已删除 global.${key}` };
  }
  return { ok: false, text: '未知操作' };
});

// ========== dispatcher ==========

export async function dispatch(line, store) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return null;
  const text = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  const tokens = tokenize(text);
  if (tokens.length === 0) return null;
  const name = tokens[0].toLowerCase();
  const args = tokens.slice(1);

  emit(EVENTS.SLASH_COMMAND, { name, args, raw: trimmed });

  const builtinEntry = builtin.get(name);
  if (builtinEntry) {
    try {
      return await builtinEntry.fn(args, store);
    } catch (err) {
      return { ok: false, text: `命令出错: ${err.message}` };
    }
  }
  const custom = api.getCustomCommand(name);
  if (custom) {
    try {
      const ret = await custom.fn(args, store);
      if (ret && typeof ret === 'object' && 'ok' in ret) return ret;
      return { ok: true, text: ret == null ? '' : String(ret) };
    } catch (err) {
      return { ok: false, text: `自定义命令出错: ${err.message}` };
    }
  }
  return { ok: false, text: `未知命令: /${name}（输入 /help 查看全部）` };
}

export function listAll() {
  const out = [];
  for (const [name, { meta }] of builtin) out.push({ name, ...meta, source: 'builtin' });
  for (const c of api.listCustomCommands()) out.push({ ...c, source: 'custom' });
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// ========== utils ==========

function tokenize(text) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out;
}

function coerce(raw) {
  if (raw === '' || raw === undefined) return '';
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if ((raw.startsWith('{') || raw.startsWith('[')) ) {
    try { return JSON.parse(raw); } catch {}
  }
  return raw;
}
