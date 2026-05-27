/**
 * variable-schema.js — Schema registry, type coercion, wildcard matching.
 * Protects variable tree from dirty LLM data.
 * Modeled after ST's Zod-based registerMvuSchema pattern.
 * Zero external dependencies.
 */

/** @type {Record<string, {type:string, min?:number, max?:number}>} */
const _rules = {};

/**
 * Register schema rules. Can be called multiple times (merge behavior).
 * @param {Record<string, {type:'string'|'number'|'boolean'|'any', min?:number, max?:number}>} schema
 */
export function registerSchema(schema) {
  Object.assign(_rules, schema);
}

/**
 * Find the matching rule for a path.
 * Exact match first, then wildcard pattern with '*' matching any single path segment.
 */
function _findRule(path) {
  if (_rules[path]) return _rules[path];
  for (const [pattern, rule] of Object.entries(_rules)) {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '[^.]+') + '$');
      if (regex.test(path)) return rule;
    }
  }
  return { type: 'any' };
}

/**
 * Coerce a value to match the schema rule for a given path.
 * Returns { coerced, warning? }. If coerced is undefined, the write should be skipped.
 * @param {string} path — dot-separated path like "User信息.年龄"
 * @param {*} value — the value to coerce
 * @returns {{ coerced: any, warning?: string }}
 */
export function coerce(path, value) {
  if (value === null || value === undefined) return { coerced: undefined };

  const rule = _findRule(path);

  if (rule.type === 'number') {
    const num = typeof value === 'string' ? Number(value) : value;
    if (typeof num !== 'number' || isNaN(num)) {
      return { coerced: value, warning: `[Schema] ${path}: cannot coerce "${value}" to number, keeping original` };
    }
    let clamped = num;
    if (rule.min != null && clamped < rule.min) clamped = rule.min;
    if (rule.max != null && clamped > rule.max) clamped = rule.max;
    return { coerced: clamped };
  }

  if (rule.type === 'string') {
    return { coerced: String(value) };
  }

  if (rule.type === 'boolean') {
    if (typeof value === 'string') return { coerced: value.toLowerCase() === 'true' };
    return { coerced: !!value };
  }

  // 'any' or unknown type — pass through unchanged
  return { coerced: value };
}

/**
 * Validate an entire variable tree against registered rules.
 * Returns array of warnings (non-blocking).
 * @param {Object} tree
 * @param {string} prefix — internal recursion parameter
 * @returns {{ path: string, warning: string }[]}
 */
export function validate(tree, prefix = '') {
  const warnings = [];
  if (!tree || typeof tree !== 'object') return warnings;
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const rule = _findRule(path);
    if (rule.type === 'number' && value != null && typeof value !== 'number') {
      warnings.push({ path, warning: `expected number, got ${typeof value}` });
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      warnings.push(...validate(value, path));
    }
  }
  return warnings;
}

/**
 * @returns {Record<string, {type:string, min?:number, max?:number}>}
 */
export function getSchema() {
  return { ..._rules };
}
