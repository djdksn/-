/**
 * Regex Engine — ported from SillyTavern regex extension.
 * Pure computation layer; no DB or store access.
 */

import { replaceMacros } from './prompt-assembler.js';

// ========== Enums ==========

export const REGEX_PLACEMENT = Object.freeze({
  MD_DISPLAY: 0,
  USER_INPUT: 1,
  AI_OUTPUT: 2,
  SLASH_COMMAND: 3,
  WORLD_INFO: 5,
  REASONING: 6,
});

export const SUBSTITUTE_FIND_REGEX = Object.freeze({
  NONE: 0,
  RAW: 1,
  ESCAPED: 2,
});

export const SCRIPT_TYPES = Object.freeze({
  GLOBAL: 0,
});

export const PLACEMENT_LABELS = {
  [REGEX_PLACEMENT.USER_INPUT]: '用户输入',
  [REGEX_PLACEMENT.AI_OUTPUT]: 'AI 输出',
  [REGEX_PLACEMENT.SLASH_COMMAND]: '斜杠命令',
  [REGEX_PLACEMENT.WORLD_INFO]: '世界信息',
  [REGEX_PLACEMENT.REASONING]: '推理',
};

export const SUBSTITUTE_LABELS = {
  [SUBSTITUTE_FIND_REGEX.NONE]: '不替换',
  [SUBSTITUTE_FIND_REGEX.RAW]: '原始替换',
  [SUBSTITUTE_FIND_REGEX.ESCAPED]: '转义替换',
};

// ========== Defaults ==========

export function createDefaultRegexScript() {
  return {
    id: crypto.randomUUID(),
    scriptName: 'New Script',
    findRegex: '',
    replaceString: '',
    trimStrings: [],
    placement: [REGEX_PLACEMENT.AI_OUTPUT],
    disabled: false,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: true,
    substituteRegex: SUBSTITUTE_FIND_REGEX.NONE,
    minDepth: null,
    maxDepth: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ========== Regex Provider (LRU Cache) ==========

export class RegexProvider {
  #cache = new Map();
  #maxSize = 1000;

  static instance = new RegexProvider();

  get(regexString) {
    if (!regexString) return null;

    const isCached = this.#cache.has(regexString);
    if (isCached) {
      const cached = this.#cache.get(regexString);
      this.#cache.delete(regexString);
      this.#cache.set(regexString, cached);
      if (cached.global || cached.sticky) cached.lastIndex = 0;
      return cached;
    }

    const regex = regexFromString(regexString);
    if (!regex) return null;

    if (this.#cache.size >= this.#maxSize) {
      const firstKey = this.#cache.keys().next().value;
      this.#cache.delete(firstKey);
    }
    this.#cache.set(regexString, regex);
    return regex;
  }

  clear() {
    this.#cache.clear();
  }
}

// ========== Regex Parsing ==========

export function regexFromString(input) {
  if (typeof input !== 'string' || input.length < 3) return undefined;

  const match = input.match(/^\/(.+?)\/([gimsuy]*)$/);
  if (!match) return undefined;

  try {
    return new RegExp(match[1], match[2]);
  } catch {
    return undefined;
  }
}

// ========== Sanitize (for ESCAPED mode) ==========

function sanitizeRegexMacro(x) {
  if (!x || typeof x !== 'string') return x;
  const special = /[\n\r\t\v\f\0.^$*+?{}[\]\\/|()]/g;
  return x.replace(special, (s) => {
    switch (s) {
      case '\n': return '\\n';
      case '\r': return '\\r';
      case '\t': return '\\t';
      case '\v': return '\\v';
      case '\f': return '\\f';
      case '\0': return '\\0';
      default: return '\\' + s;
    }
  });
}

// ========== Filter Trim Strings ==========

function filterString(rawString, trimStrings, params = {}) {
  let result = rawString;
  for (const trimStr of trimStrings) {
    if (!trimStr) continue;
    result = result.replaceAll(trimStr, '');
  }
  return result;
}

// ========== Core Execution ==========

/**
 * Apply all matching regex scripts to a string.
 * @param {string} rawString
 * @param {number} placement - REGEX_PLACEMENT value
 * @param {object} params - { scripts, isMarkdown, isPrompt, isEdit, depth, characterOverride, macros }
 */
export function getRegexedString(rawString, placement, params = {}) {
  if (typeof rawString !== 'string' || !rawString) return rawString;

  const { scripts, isMarkdown, isPrompt, isEdit, depth, characterOverride, macros } = params;
  if (!Array.isArray(scripts) || scripts.length === 0) return rawString;

  let result = rawString;

  for (const script of scripts) {
    if (script.disabled) continue;
    if (!script.findRegex) continue;

    // Check placement
    if (!script.placement || !script.placement.includes(placement)) continue;

    // Check ephemerality
    const appliesToAll = !script.markdownOnly && !script.promptOnly;
    const appliesToMarkdown = script.markdownOnly && isMarkdown;
    const appliesToPrompt = script.promptOnly && isPrompt;
    if (!appliesToAll && !appliesToMarkdown && !appliesToPrompt) continue;

    // Check runOnEdit
    if (isEdit && !script.runOnEdit) continue;

    // Check depth
    if (typeof depth === 'number') {
      if (typeof script.minDepth === 'number' && script.minDepth >= 0 && depth < script.minDepth) continue;
      if (typeof script.maxDepth === 'number' && script.maxDepth >= 0 && depth > script.maxDepth) continue;
    }

    result = runRegexScript(script, result, { characterOverride, macros });
  }

  return result;
}

/**
 * Execute a single regex script on a string.
 */
export function runRegexScript(script, rawString, params = {}) {
  if (!script || script.disabled || !script.findRegex || !rawString) return rawString;

  const { characterOverride, macros } = params;

  let regexString;
  switch (script.substituteRegex) {
    case SUBSTITUTE_FIND_REGEX.RAW:
      regexString = replaceMacros(script.findRegex, macros || {});
      break;
    case SUBSTITUTE_FIND_REGEX.ESCAPED: {
      const raw = replaceMacros(script.findRegex, macros || {});
      regexString = sanitizeRegexMacro(raw);
      break;
    }
    default:
      regexString = script.findRegex;
  }

  const findRegex = RegexProvider.instance.get(regexString);
  if (!findRegex) return rawString;

  try {
    return rawString.replace(findRegex, function (match, ...args) {
      let replaceString = (script.replaceString || '').replace(/{{match}}/gi, '$0');

      replaceString = replaceString.replaceAll(/\$(\d+)|\$<([^>]+)>/g, (_, num, groupName) => {
        let groupValue;
        if (num) {
          groupValue = args[Number(num) - 1];
        } else if (groupName) {
          const groups = args[args.length - 2];
          groupValue = groups && typeof groups === 'object' ? groups[groupName] : undefined;
        }
        if (groupValue === undefined || groupValue === null) return '';
        return filterString(String(groupValue), script.trimStrings || [], { characterOverride });
      });

      return replaceString;
    });
  } catch {
    return rawString;
  }
}

// ========== Script Management Helpers ==========

/**
 * Run scripts by placement — convenience.
 */
export function runPlacementScripts(text, placement, scripts, params = {}) {
  return getRegexedString(text, placement, { ...params, scripts });
}
