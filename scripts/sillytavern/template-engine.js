/**
 * Mini EJS-style template engine for prompt content.
 * Compatible subset of ST-Prompt-Template syntax:
 *   <% stmt %>     statement
 *   <%= expr %>    HTML-escape-free interpolation (we don't HTML-escape — output goes to LLM)
 *   <%- raw %>     same as <%= %> here (kept for upstream compatibility)
 *   <%# comment %> stripped
 *
 * The compiled function is cached by source string. Context (helpers + vars)
 * is injected via a `with(__ctx)` block so users can write `getvar('hp')`
 * directly without the `__ctx.` prefix.
 */

const cache = new Map();
const TAG_HINT = /<%[-=#]?[\s\S]*?%>/;

export function hasTemplateMarkers(source) {
  return typeof source === 'string' && TAG_HINT.test(source);
}

export function compile(source) {
  if (cache.has(source)) return cache.get(source);

  let body = `var __out=[]; with(__ctx){\n`;
  let cursor = 0;
  const re = /<%([-=#]?)([\s\S]*?)%>/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const literal = source.slice(cursor, match.index);
    if (literal) body += `__out.push(${JSON.stringify(literal)});\n`;
    const flag = match[1];
    const code = match[2];
    if (flag === '#') {
      // comment, skip
    } else if (flag === '=' || flag === '-') {
      body += `__out.push(__safeStr(${code}));\n`;
    } else {
      body += `${code}\n`;
    }
    cursor = match.index + match[0].length;
  }
  const tail = source.slice(cursor);
  if (tail) body += `__out.push(${JSON.stringify(tail)});\n`;
  body += `} return __out.join('');`;

  let fn;
  try {
    fn = new Function('__ctx', '__safeStr', body);
  } catch (err) {
    const wrapped = (ctx) => {
      console.error('[template-engine] compile failed:', err.message);
      return source;
    };
    cache.set(source, wrapped);
    return wrapped;
  }

  const wrapped = (ctx) => {
    try {
      return fn(ctx, safeStr);
    } catch (err) {
      console.error('[template-engine] runtime error:', err);
      return `<!-- template error: ${err.message} -->\n` + source;
    }
  };
  cache.set(source, wrapped);
  return wrapped;
}

export function render(source, ctx) {
  if (!source) return source;
  if (!hasTemplateMarkers(source)) return source;
  return compile(source)(ctx);
}

function safeStr(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

export function clearCache() { cache.clear(); }
export function cacheSize() { return cache.size; }
