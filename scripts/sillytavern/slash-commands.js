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
