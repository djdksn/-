/**
 * mvu-engine.js — Parse <UpdateVariable> blocks from LLM replies
 * and apply JSONPatch operations to the variable store.
 * Supports standard RFC 6902 ops + ST's non-standard "delta" op.
 */
import { coerce as schemaCoerce } from './variable-schema.js';
import { variableStore } from './variable-store.js';

const MAX_OPS = 100;

/**
 * Convert a JSON Pointer path to dot-separated path.
 * "/NPC花名册/藤原雅美/好感度" → "NPC花名册.藤原雅美.好感度"
 */
function pointerToDot(path) {
  if (!path || typeof path !== 'string') return null;
  // Remove leading /, replace remaining / with .
  return path.replace(/^\/+/, '').replace(/\//g, '.');
}

/**
 * Safety check: reject paths that attempt traversal or are empty.
 */
function isSafePath(dotPath) {
  if (!dotPath || dotPath.trim() === '') return false;
  if (dotPath.includes('..')) return false;
  return true;
}

/**
 * Process a single JSONPatch operation object.
 * @param {object} op — { op, path, value?, from? }
 * @param {object} chat
 * @param {string} msgId
 * @returns {{ success: boolean, op: string, path: string, error?: string }}
 */
function applyOp(op, chat, msgId) {
  const dotPath = pointerToDot(op.path);
  if (!isSafePath(dotPath)) {
    return { success: false, op: op.op, path: op.path, error: 'unsafe or empty path' };
  }

  switch (op.op) {
    case 'replace':
    case 'add': {
      let value = op.value;
      // Schema coercion
      const sc = schemaCoerce(dotPath, value);
      if (sc.warning) console.warn(sc.warning);
      if (sc.coerced === undefined) {
        return { success: false, op: op.op, path: dotPath, error: 'value rejected by schema' };
      }
      value = sc.coerced;
      const flags = op.op === 'add' ? 'n' : undefined;
      const result = variableStore.setVarSync(dotPath, value, flags ? { flags } : null, chat, msgId);
      return { success: result !== undefined, op: op.op, path: dotPath };
    }

    case 'remove': {
      // Remove the key from chat scope (sync best-effort)
      if (chat?.variables) {
        const keys = dotPath.split('.');
        const last = keys.pop();
        let cur = chat.variables;
        for (const k of keys) {
          if (cur == null || typeof cur[k] !== 'object') break;
          cur = cur[k];
        }
        if (cur && typeof cur === 'object') delete cur[last];
      }
      return { success: true, op: op.op, path: dotPath };
    }

    case 'move': {
      const fromPath = pointerToDot(op.from);
      if (!isSafePath(fromPath)) {
        return { success: false, op: op.op, path: op.path, error: 'unsafe from path' };
      }
      const val = variableStore.getVarSync(fromPath, null, chat, msgId);
      if (val === undefined) {
        return { success: false, op: op.op, path: dotPath, error: 'source value not found' };
      }
      variableStore.setVarSync(dotPath, val, null, chat, msgId);
      // Clean up source (best-effort sync)
      if (chat?.variables) {
        const keys = fromPath.split('.');
        const last = keys.pop();
        let cur = chat.variables;
        for (const k of keys) {
          if (cur == null || typeof cur[k] !== 'object') break;
          cur = cur[k];
        }
        if (cur && typeof cur === 'object') delete cur[last];
      }
      return { success: true, op: op.op, path: dotPath };
    }

    case 'copy': {
      const fromPath = pointerToDot(op.from);
      if (!isSafePath(fromPath)) {
        return { success: false, op: op.op, path: op.path, error: 'unsafe from path' };
      }
      const val = variableStore.getVarSync(fromPath, null, chat, msgId);
      if (val === undefined) {
        return { success: false, op: op.op, path: op.path, error: 'source value not found' };
      }
      const result = variableStore.setVarSync(dotPath, val, null, chat, msgId);
      return { success: result !== undefined, op: op.op, path: dotPath };
    }

    case 'delta': {
      const delta = Number(op.value);
      if (isNaN(delta)) {
        return { success: false, op: op.op, path: dotPath, error: `delta value "${op.value}" is not numeric` };
      }
      const result = variableStore.incVarSync(dotPath, delta, null, chat, msgId);
      return { success: result !== undefined && result !== null, op: op.op, path: dotPath };
    }

    default:
      return { success: false, op: op.op || 'unknown', path: dotPath, error: `unknown op "${op.op}"` };
  }
}

/**
 * Extract <UpdateVariable> blocks from LLM reply, parse JSONPatch, apply ops.
 * Also strips the processed XML blocks from the text.
 * @param {string} rawContent — the full LLM reply text
 * @param {object} context — { chat, msgId }
 * @returns {{ cleanedContent: string, results: object[] }}
 */
export function processUpdateVariables(rawContent, context = {}) {
  if (!rawContent || typeof rawContent !== 'string') {
    return { cleanedContent: rawContent || '', results: [] };
  }

  const { chat, msgId } = context;
  const results = [];
  let cleanedContent = rawContent;
  let totalOps = 0;

  // Find all <UpdateVariable>...</UpdateVariable> blocks
  const blockRegex = /<UpdateVariable>([\s\S]*?)<\/UpdateVariable>/g;
  let blockMatch;

  while ((blockMatch = blockRegex.exec(rawContent)) !== null) {
    const blockFull = blockMatch[0];
    const blockInner = blockMatch[1];

    // Extract <Analysis> (optional, for logging)
    const analysisMatch = blockInner.match(/<Analysis>([\s\S]*?)<\/Analysis>/);
    const analysis = analysisMatch ? analysisMatch[1].trim() : null;

    // Extract <JSONPatch>
    const patchMatch = blockInner.match(/<JSONPatch>([\s\S]*?)<\/JSONPatch>/);
    if (!patchMatch) {
      results.push({ success: false, patchesApplied: 0, analysis, errors: ['missing <JSONPatch> block'] });
      continue;
    }

    let ops;
    try {
      ops = JSON.parse(patchMatch[1].trim());
    } catch (err) {
      console.warn('[MVU] JSON parse error in JSONPatch block:', err.message);
      results.push({ success: false, patchesApplied: 0, analysis, errors: [`JSON parse error: ${err.message}`] });
      continue;
    }

    if (!Array.isArray(ops)) {
      results.push({ success: false, patchesApplied: 0, analysis, errors: ['JSONPatch is not an array'] });
      continue;
    }

    // Enforce total op limit
    if (totalOps + ops.length > MAX_OPS) {
      console.warn('[MVU] Total op limit (%d) exceeded, truncating', MAX_OPS);
      ops = ops.slice(0, MAX_OPS - totalOps);
    }

    const blockErrors = [];
    let applied = 0;

    for (const op of ops) {
      const result = applyOp(op, chat, msgId);
      if (result.success) {
        applied++;
      } else {
        blockErrors.push(`${result.op} ${result.path}: ${result.error}`);
      }
    }

    totalOps += ops.length;
    results.push({
      success: blockErrors.length === 0,
      patchesApplied: applied,
      analysis,
      errors: blockErrors,
    });

    // Remove the processed block from the cleaned content
    cleanedContent = cleanedContent.replace(blockFull, '');

    if (totalOps >= MAX_OPS) break;
  }

  // Clean up extra whitespace left by removed blocks
  cleanedContent = cleanedContent.replace(/\n{3,}/g, '\n\n').trim();

  return { cleanedContent, results };
}
