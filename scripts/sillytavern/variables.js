/**
 * Variable System Utilities + Parsed Tags Aggregation
 */

import { parseVarsBlock, applyVarsPatch } from './vars-merger.js';

export const USER_ROLE = 'user';

export function extractVariables(text) {
  const updates = {};
  const regex = /<var\s+name="([^"]+)"\s+value="([^"]+)"\s*\/?>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const [, name, rawValue] = match;
    const num = Number(rawValue);
    updates[name] = Number.isNaN(num) ? rawValue : num;
  }
  const cleanedText = text.replace(regex, '').replace(/\n{2,}/g, '\n').trim();
  return { cleanedText, updates };
}

export function mergeVariables(base = {}, updates = {}) {
  return { ...base, ...updates };
}

export function formatVariablesForPrompt(variables) {
  const entries = Object.entries(variables);
  if (entries.length === 0) return '';
  const lines = entries.map(([k, v]) => `${k}: ${v}`);
  return `[当前状态]\n${lines.join('\n')}`;
}

export function truncateChatAt(chat, index, variables) {
  const truncated = chat.messages.slice(0, index);
  const restoredVars = variables ?? truncated[truncated.length - 1]?.variables ?? {};
  return { ...chat, messages: truncated, variables: restoredVars, updatedAt: Date.now() };
}

export function branchChat(source, index, options) {
  return {
    id: crypto.randomUUID(),
    name: options.name,
    messages: source.messages.slice(0, index + 1).map(m => ({ ...m })),
    characterName: source.characterName,
    userName: source.userName,
    presetId: options.presetId,
    lorebookIds: [...options.lorebookIds],
    variables: options.variables ?? source.messages[index].variables ?? {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ========== v3: stream parser event aggregation ==========

export function aggregateEvents(events) {
  const parsed = {
    thinking: '',
    maintext: '',
    options: [],
    sum: '',
    varsRaw: '',
    varsCommands: { merge: {} },
    unknown: {},
  };
  for (const ev of events) {
    if (ev.type === 'tag-close') {
      if (ev.tag === 'thinking' || ev.tag === 'think') parsed.thinking = ev.full;
      else if (ev.tag === 'maintext') parsed.maintext = ev.full;
      else if (ev.tag === 'sum') parsed.sum = ev.full;
      else if (ev.tag === 'vars') {
        parsed.varsRaw = ev.full;
        parsed.varsCommands = parseVarsBlock(ev.full);
      } else if (ev.tag === 'option') {
        // option-line events accumulated below
      } else {
        parsed.unknown[ev.tag] = ev.full;
      }
    } else if (ev.type === 'option-line') {
      parsed.options.push(ev.line);
    }
  }
  return parsed;
}

export function applyParsedToChat(current, parsed) {
  const next = applyVarsPatch(current, parsed.varsCommands);
  const snapshot = JSON.parse(JSON.stringify(next));
  return { nextVariables: next, snapshot };
}
