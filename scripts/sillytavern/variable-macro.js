/**
 * variable-macro.js — Macro registry and expansion engine.
 * Expands {{macro_name::arg}} patterns in prompt templates,
 * including the built-in format_message_variable macro.
 */
import { variableStore } from './variable-store.js';
import { getSchema } from './variable-schema.js';

/** @type {Record<string, (args:string, context:object) => string>} */
const _macros = {};

/**
 * Register a macro handler.
 * @param {string} name
 * @param {(args: string, context: object) => string} handler
 */
export function registerMacro(name, handler) {
  _macros[name] = handler;
}

/**
 * Expand all {{macro}} patterns in a template string.
 * Unknown macros are left as-is.
 * @param {string} template
 * @param {object} context — { chat, userName, characterName, userInput }
 * @returns {string}
 */
export function expandMacros(template, context = {}) {
  if (!template || typeof template !== 'string') return template;

  return template.replace(/\{\{([^}]+)\}\}/g, (match, macroCall) => {
    // Parse: "format_message_variable" or "format_message_variable::stat_data"
    const colonIdx = macroCall.indexOf('::');
    const name = colonIdx >= 0 ? macroCall.slice(0, colonIdx).trim() : macroCall.trim();
    const args = colonIdx >= 0 ? macroCall.slice(colonIdx + 2).trim() : '';

    const handler = _macros[name];
    if (!handler) return match; // Unknown macro — leave as-is

    try {
      return handler(args, context);
    } catch (err) {
      console.error(`[Macro] "${name}" error:`, err);
      return match;
    }
  });
}

// ── Format helpers ────────────────────────────────────────────────

/**
 * Format any value for display, recursing into objects up to maxDepth.
 * Returns null if the value is empty and should be skipped.
 */
function _format(val, depth, maxDepth) {
  if (depth > maxDepth) return '…';
  if (val === null || val === undefined) return null;
  const indent = '  '.repeat(depth);

  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }

  if (Array.isArray(val)) {
    if (val.length === 0) return null;
    return val.map((item, i) => `${indent}${i + 1}. ${_format(item, depth, maxDepth)}`).join('\n');
  }

  if (typeof val === 'object') {
    const entries = Object.entries(val).filter(([, v]) =>
      v != null && v !== '' && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
    );
    if (entries.length === 0) return null;

    return entries.map(([k, v]) => {
      const label = indent + k;
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        const inner = _format(v, depth + 1, maxDepth);
        return inner ? `${label}:\n${inner}` : null;
      }
      const fv = _format(v, depth, maxDepth);
      return fv !== null ? `${label}: ${fv}` : null;
    }).filter(Boolean).join('\n');
  }

  return String(val);
}

/**
 * Check if an object looks like a Record (all first-level values are objects).
 */
function _isRecord(obj) {
  const vals = Object.values(obj);
  return vals.length > 0 && vals.every(v => typeof v === 'object' && v !== null && !Array.isArray(v));
}

/**
 * Expand the format_message_variable macro.
 * Reads current global + chat scope variables and formats as structured text.
 */
function _expandFormatVariable(_args, context) {
  const chat = context.chat;
  const globalVars = variableStore.getAllSync('global');
  const chatVars = chat?.variables || {};
  const merged = { ...globalVars, ...chatVars };

  const sections = [];
  const topKeys = Object.keys(merged);

  for (const key of topKeys) {
    const val = merged[key];
    if (val === null || val === undefined) continue;
    if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) continue;

    sections.push(`【${key}】`);

    if (typeof val === 'object' && !Array.isArray(val)) {
      if (_isRecord(val)) {
        // Record type (e.g. NPC花名册, 校内组织, 课程)
        for (const [entryName, entryData] of Object.entries(val)) {
          sections.push(`  ■ ${entryName}`);
          const formatted = _format(entryData, 2, 4);
          if (formatted) sections.push(formatted);
        }
      } else {
        // Plain nested object — try flat display for basic fields first
        const flatParts = [];
        const nestedParts = [];
        for (const [k, v] of Object.entries(val)) {
          if (v === null || v === undefined) continue;
          if (typeof v === 'object' && !Array.isArray(v)) {
            nestedParts.push([k, v]);
          } else {
            flatParts.push(`${k}: ${_format(v, 0, 1)}`);
          }
        }
        if (flatParts.length > 0) sections.push(`  ${flatParts.join(' | ')}`);
        for (const [k, v] of nestedParts) {
          sections.push(`  [${k}]`);
          const formatted = _format(v, 2, 3);
          if (formatted) sections.push(formatted);
        }
      }
    } else if (typeof val === 'string') {
      sections.push(`  ${val}`);
    } else {
      const formatted = _format(val, 1, 4);
      if (formatted) sections.push(formatted);
    }

    sections.push(''); // blank line between sections
  }

  return sections.join('\n');
}

// ── Register built-in macros ──────────────────────────────────────

registerMacro('format_message_variable', _expandFormatVariable);
