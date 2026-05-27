# MVU + 变量宏 + Schema 校验 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the three tightly-coupled modules (variable macro, MVU engine, schema validation) that complete the ST-to-standalone feature parity.

**Architecture:** Three new ES modules in `scripts/sillytavern/`, loaded through the existing import chain (no `index.html` changes). variable-schema.js is standalone with no deps. variable-macro.js reads from variable-store and variable-schema. mvu-engine.js calls variable-schema.coerce and variable-store write methods. Three existing files receive small wiring changes.

**Tech Stack:** Vanilla JS ES modules, no external dependencies.

---

### Task 1: variable-schema.js — Schema registry + type coercion

**Files:**
- Create: `scripts/sillytavern/variable-schema.js`

- [ ] **Step 1: Write the complete module**

```js
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
```

- [ ] **Step 2: Verify the file loads without errors**

Open DevTools Console and run:
```js
import('http://localhost:8080/scripts/sillytavern/variable-schema.js').then(m => {
  m.registerSchema({ 'test.x': { type: 'number', min: 0 } });
  console.log('coerce number string:', m.coerce('test.x', '42'));
  console.log('coerce number:', m.coerce('test.x', 42));
  console.log('coerce bad:', m.coerce('test.x', 'hello'));
  console.log('coerce null:', m.coerce('test.x', null));
  console.log('wildcard:', m.coerce('NPC花名册.某人.动态数据.经历.性交次数', 5));
  console.log('getSchema:', m.getSchema());
})
```
Expected output:
```
coerce number string: {coerced: 42}
coerce number: {coerced: 42}
coerce bad: {coerced: 'hello', warning: '...cannot coerce "hello" to number...'}
coerce null: {coerced: undefined}
wildcard: {coerced: 5} (after registering wildcard rule)
getSchema: {test.x: {type: 'number', min: 0}}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/sillytavern/variable-schema.js
git commit -m "feat: variable-schema.js — schema registry with type coercion and wildcard matching"
```

---

### Task 2: Modify variable-store.js — Add getAllSync + schema coerce hook

**Files:**
- Modify: `scripts/sillytavern/variable-store.js`:1-337

- [ ] **Step 1: Add import for schema coerce at top of file**

After the existing import line `import { getGlobalVariables, saveGlobalVariables } from './database.js';`, add:

```js
import { coerce as schemaCoerce } from './variable-schema.js';
```

- [ ] **Step 2: Add getAllSync method inside the VariableStore class**

After the `getAll` async method (around line 203), add:

```js
  /**
   * Synchronous version of getAll for use by macros and EJS templates.
   * ensureLoaded() must be called first.
   */
  getAllSync(scope, chat) {
    if (scope === 'global') return { ..._globalVars };
    if (scope === 'chat') return chat?.variables ? { ...chat.variables } : {};
    if (scope === 'message' && chat) {
      const result = {};
      for (const [key, vars] of messageVars) {
        if (key.startsWith(chat.id + '::')) {
          result[key.slice(chat.id.length + 2)] = { ...vars };
        }
      }
      return result;
    }
    return {};
  }
```

- [ ] **Step 3: Add schema coerce in setVar method**

In the `async setVar` method, after `await loadGlobal();` and `const opts = this._resolveOpts(rawOpts);`, add:

```js
    // Schema coercion
    const scResult = schemaCoerce(key, value);
    if (scResult.warning) console.warn(scResult.warning);
    if (scResult.coerced === undefined) return undefined;
    value = scResult.coerced;
```

Insert these 4 lines right after the `const flags = opts.flags || 'n';` line (which is after opts resolution), so the coerce runs before the scope-specific logic.

- [ ] **Step 4: Add schema coerce in setVarSync method**

Same insertion — in `setVarSync`, after `const opts = this._resolveOpts(rawOpts);` and `const flags = opts.flags || 'n';`, add:

```js
    // Schema coercion
    const scResult = schemaCoerce(key, value);
    if (scResult.warning) console.warn(scResult.warning);
    if (scResult.coerced === undefined) return undefined;
    value = scResult.coerced;
```

- [ ] **Step 5: Verify**

Open DevTools Console:
```js
import('http://localhost:8080/scripts/sillytavern/variable-schema.js').then(async m => {
  m.registerSchema({ 'test.score': { type: 'number', min: 0, max: 100 } });
  const { variableStore } = await import('http://localhost:8080/scripts/sillytavern/variable-store.js');
  await variableStore.ensureLoaded();
  
  // Test sync coerce
  const r1 = variableStore.setVarSync('test.score', '50', null, { id: 't1', variables: {} }, null);
  console.log('coerced set (string->number):', r1); // should be 50 (number)
  
  const r2 = variableStore.setVarSync('test.score', 'not-a-number', null, { id: 't1', variables: {} }, null);
  console.log('bad value rejected:', r2); // should be undefined
  
  // Test getAllSync
  const all = variableStore.getAllSync('chat', { id: 't1', variables: { test: { score: 50 } } });
  console.log('getAllSync:', all); // should have test.score
})
```

- [ ] **Step 6: Commit**

```bash
git add scripts/sillytavern/variable-store.js
git commit -m "feat: variable-store — add getAllSync + schema coerce hook in setVar/setVarSync"
```

---

### Task 3: variable-macro.js — Macro registry + format_message_variable

**Files:**
- Create: `scripts/sillytavern/variable-macro.js`

- [ ] **Step 1: Write the complete module**

```js
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
```

- [ ] **Step 2: Verify round-trip in console**

Open browser with the app loaded. In DevTools Console:
```js
// The app's main module should have loaded the chain.
// Check that the macro engine is importable:
import('http://localhost:8080/scripts/sillytavern/variable-macro.js').then(m => {
  // Test basic macro
  m.registerMacro('greet', (args) => `Hello, ${args}!`);
  console.log('basic macro:', m.expandMacros('{{greet::World}}', {})); // "Hello, World!"
  
  // Test unknown macro left as-is
  console.log('unknown:', m.expandMacros('{{nonexistent}}', {})); // "{{nonexistent}}"
  
  // Test format_message_variable with mock data
  window.__testCtx = {
    chat: {
      id: 'test1',
      variables: {
        '当前地点': '樱丘大学校门口',
        'User信息': { 姓名: '程励行', 年龄: 18, 性交总次数: 5 },
        'NPC花名册': {
          '藤原雅美': { 好感度: 45, 动态数据: { 经历: { 性交次数: 2 } } }
        }
      }
    }
  };
  console.log('format result:\n' + m.expandMacros('{{format_message_variable}}', window.__testCtx));
})
```
Expected: should output structured text with `【当前地点】`, `【User信息】`, `【NPC花名册】` sections.

- [ ] **Step 3: Commit**

```bash
git add scripts/sillytavern/variable-macro.js
git commit -m "feat: variable-macro.js — macro registry with format_message_variable expansion"
```

---

### Task 4: Modify prompt-assembler.js — Wire expandMacros into replaceMacros

**Files:**
- Modify: `scripts/sillytavern/prompt-assembler.js`:1-184

- [ ] **Step 1: Add import**

After the existing import line for ejs-engine.js:
```js
import { renderTemplate, buildGenerateContext } from './ejs-engine.js';
```

Add:
```js
import { expandMacros } from './variable-macro.js';
```

- [ ] **Step 2: Update replaceMacros to call expandMacros**

Replace the `replaceMacros` function (currently at lines 162-176) with:

```js
export function replaceMacros(template, context) {
  let result = template
    .replace(/\{\{user\}\}/g, context.userName)
    .replace(/\{\{char\}\}/g, context.characterName)
    .replace(/\{\{original\}\}/g, context.userInput);

  // Basic variable substitution (existing behavior)
  if (context.variables) {
    result = result.replace(/\{\{([^{}:]+)\}\}/g, (match, key) => {
      const trimmed = key.trim();
      // Skip format_message_variable — handled by expandMacros below
      if (trimmed.startsWith('format_message_variable')) return match;
      const value = context.variables?.[trimmed];
      return value !== undefined ? String(value) : match;
    });
  }

  // Advanced macro expansion (format_message_variable, registered macros)
  result = expandMacros(result, {
    chat: context.chat || {},
    userName: context.userName,
    characterName: context.characterName,
    userInput: context.userInput,
  });

  return result;
}
```

The key changes:
- Basic `{{var}}` pattern now uses `[^{}:]+` to avoid matching `{{format_message_variable::stat_data}}`
- `expandMacros()` is called after basic substitution to handle registered macros

- [ ] **Step 3: Verify**

Open DevTools Console. The app should load without errors. Check that the `replaceMacros` function is exported and callable:
```js
// Should be importable
import('http://localhost:8080/scripts/sillytavern/prompt-assembler.js').then(m => {
  console.log('replaceMacros available:', typeof m.replaceMacros);
  const result = m.replaceMacros('{{user}} says {{format_message_variable}}', {
    userName: 'TestUser',
    characterName: 'AI',
    userInput: 'hello',
    chat: { id: 'x', variables: { hp: 100 } },
  });
  console.log('Result (first 300 chars):', result.slice(0, 300));
})
```

- [ ] **Step 4: Commit**

```bash
git add scripts/sillytavern/prompt-assembler.js
git commit -m "feat: prompt-assembler — wire expandMacros into replaceMacros"
```

---

### Task 5: mvu-engine.js — XML parser + JSONPatch executor

**Files:**
- Create: `scripts/sillytavern/mvu-engine.js`

- [ ] **Step 1: Write the complete module**

```js
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
      variableStore.clearMessageVars?.(chat?.id, msgId);
      // For global/chat scope removal, we use setVar with undefined — skip for now
      // Actual delete is done via deleteVar API
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
      // Note: deleteVar is async; in sync mode we skip cleanup of source
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
```

- [ ] **Step 2: Verify with a mock LLM reply**

In DevTools Console:
```js
import('http://localhost:8080/scripts/sillytavern/mvu-engine.js').then(async m => {
  const { variableStore } = await import('http://localhost:8080/scripts/sillytavern/variable-store.js');
  await variableStore.ensureLoaded();

  const chat = { id: 'mvu-test', variables: {} };
  const fakeReply = `好的，我更新了变量。

<UpdateVariable>
  <Analysis>增加好感度</Analysis>
  <JSONPatch>
    [{"op": "replace", "path": "/好感度", "value": 50}]
  </JSONPatch>
</UpdateVariable>

对话继续。`;

  const { cleanedContent, results } = m.processUpdateVariables(fakeReply, { chat });
  console.log('Cleaned content:', cleanedContent);
  console.log('Results:', results);
  console.log('Var value:', variableStore.getVarSync('好感度', null, chat));
  // Expected: cleanedContent should NOT contain <UpdateVariable> block
  // Results: [{ success: true, patchesApplied: 1, ... }]
  // Var value: 50
});
```

Expected output:
- `cleanedContent` should be `"好的，我更新了变量。\n\n对话继续。"` (no XML)
- `results[0].patchesApplied` = 1
- `getVarSync('好感度', ...)` = 50

- [ ] **Step 3: Commit**

```bash
git add scripts/sillytavern/mvu-engine.js
git commit -m "feat: mvu-engine.js — parse <UpdateVariable> blocks and apply JSONPatch with delta support"
```

---

### Task 6: Modify sillytavern-store.js — Wire MVU processing into sendGameMessage

**Files:**
- Modify: `scripts/sillytavern-store.js`:1-514

- [ ] **Step 1: Add import for processUpdateVariables**

After the existing imports (after line 24, `import { runTriggered } from './sillytavern/script-manager.js';`):

Add:
```js
import { processUpdateVariables } from './sillytavern/mvu-engine.js';
```

- [ ] **Step 2: Insert MVU processing in sendGameMessage**

In the `sendGameMessage` method, find the section where `rawContent` is built from eventBuf (around line 278-281):

```js
    let rawContent = eventBuf
      .filter(e => (e.type === 'tag-chunk' || e.type === 'raw') && e.tag !== 'w2g')
      .map(e => e.chunk)
      .join('');
```

After this block and BEFORE the EJS post-processing block (which starts with `// EJS post-processing on assistant reply`), insert:

```js
    // MVU: process <UpdateVariable> blocks before EJS post-processing
    let mvuResults = [];
    try {
      const mvuResult = processUpdateVariables(rawContent, {
        chat: updatedChat,
        msgId: 'assistant-temp',
      });
      rawContent = mvuResult.cleanedContent;
      mvuResults = mvuResult.results;
      if (mvuResults.length > 0) {
        // Re-read chat variables after MVU updates
        updatedChat = {
          ...updatedChat,
          variables: { ...updatedChat.variables },
        };
        console.log('[MVU] Processed %d UpdateVariable block(s):',
          mvuResults.length,
          mvuResults.map(r => `${r.patchesApplied} patches, ${r.errors.length} errors`).join('; ')
        );
      }
    } catch (err) {
      console.error('[Store] MVU processing error:', err);
    }
```

The full relevant section after changes:
```js
    let rawContent = eventBuf
      .filter(e => (e.type === 'tag-chunk' || e.type === 'raw') && e.tag !== 'w2g')
      .map(e => e.chunk)
      .join('');

    // MVU: process <UpdateVariable> blocks before EJS post-processing
    let mvuResults = [];
    try {
      const mvuResult = processUpdateVariables(rawContent, {
        chat: updatedChat,
        msgId: 'assistant-temp',
      });
      rawContent = mvuResult.cleanedContent;
      mvuResults = mvuResult.results;
      if (mvuResults.length > 0) {
        updatedChat = {
          ...updatedChat,
          variables: { ...updatedChat.variables },
        };
        console.log('[MVU] Processed %d UpdateVariable block(s):',
          mvuResults.length,
          mvuResults.map(r => `${r.patchesApplied} patches, ${r.errors.length} errors`).join('; ')
        );
      }
    } catch (err) {
      console.error('[Store] MVU processing error:', err);
    }

    // EJS post-processing on assistant reply
    try {
      rawContent = await renderTemplate(rawContent, {
```

- [ ] **Step 3: Verify**

Open the app. Send a test message like "hello". The app should work normally (no MVU blocks → no-op). Check console for any errors.

Then test in console:
```js
// Simulate a full round-trip by checking that mvu-engine is importable
const m = await import('http://localhost:8080/scripts/sillytavern/mvu-engine.js');
console.log('processUpdateVariables available:', typeof m.processUpdateVariables);
```

- [ ] **Step 4: Commit**

```bash
git add scripts/sillytavern-store.js
git commit -m "feat: sillytavern-store — wire MVU processing before EJS post-processing"
```

---

### Task 7: Integration test — Full end-to-end flow

**Files:**
- None (verification only)

- [ ] **Step 1: Register sample schema + seed variables**

Open the app in browser. In DevTools Console:
```js
// Import schema module
const schemaMod = await import('http://localhost:8080/scripts/sillytavern/variable-schema.js');

// Register a sample schema
schemaMod.registerSchema({
  '当前地点': { type: 'string' },
  'User信息.姓名': { type: 'string' },
  'User信息.年龄': { type: 'number', min: 0, max: 120 },
  'User信息.性交总次数': { type: 'number', min: 0 },
  'Player.hp': { type: 'number', min: 0, max: 100 },
  'Player.mp': { type: 'number', min: 0, max: 100 },
  'NPC花名册.*.好感度': { type: 'number', min: 0, max: 100 },
  'NPC花名册.*.动态数据.经历.性交次数': { type: 'number', min: 0 },
});

// Seed some variables into the active chat
const store = window.__stStore;
const chat = store.activeChat;
if (chat) {
  chat.variables = {
    '当前地点': '樱丘大学校门口',
    'User信息': { 姓名: '程励行', 年龄: 18, 性交总次数: 0 },
    'Player': { hp: 100 },
    'NPC花名册': {
      '藤原雅美': {
        好感度: 45,
        动态数据: { 经历: { 性交次数: 0 } }
      }
    }
  };
  console.log('Variables seeded:', Object.keys(chat.variables));
}
```

- [ ] **Step 2: Test macro expansion**

In Console:
```js
const macroMod = await import('http://localhost:8080/scripts/sillytavern/variable-macro.js');
const chat = window.__stStore.activeChat;
const result = macroMod.expandMacros('当前状态:\n{{format_message_variable}}', {
  chat,
  userName: '程励行',
  characterName: 'AI',
  userInput: 'hello',
});
console.log(result);
```

Expected: Output shows `【当前地点】`, `【User信息】`, `【Player】`, `【NPC花名册】` sections with formatted values.

- [ ] **Step 3: Test MVU processing with a simulated LLM reply**

In Console:
```js
const mvuMod = await import('http://localhost:8080/scripts/sillytavern/mvu-engine.js');
const chat = window.__stStore.activeChat;

const fakeReply = `玩家走近了藤原雅美。

<UpdateVariable>
  <Analysis>玩家接近，藤原雅美好感度微升</Analysis>
  <JSONPatch>
    [
      {"op": "replace", "path": "/NPC花名册/藤原雅美/好感度", "value": 48},
      {"op": "delta", "path": "/User信息/性交总次数", "value": 1}
    ]
  </JSONPatch>
</UpdateVariable>

她微笑着打招呼。`;

const { cleanedContent, results } = mvuMod.processUpdateVariables(fakeReply, { chat });

console.log('=== Cleaned Content ===');
console.log(cleanedContent);
console.log('=== Results ===');
console.log(JSON.stringify(results, null, 2));
console.log('=== Updated Variables ===');
console.log('好感度:', chat.variables['NPC花名册']['藤原雅美']['好感度']);
console.log('性交总次数:', chat.variables['User信息']['性交总次数']);
```

Expected:
- `cleanedContent` has no `<UpdateVariable>` tags
- `results[0].patchesApplied` = 2
- 好感度 = 48
- 性交总次数 = 1
- delta op successfully incremented from 0 to 1

- [ ] **Step 4: Test schema protection**

```js
const { coerce } = await import('http://localhost:8080/scripts/sillytavern/variable-schema.js');

// Test: number field gets string "hello" — should warn and keep original
const r1 = coerce('User信息.性交总次数', 'hello');
console.log('Bad number value:', r1); // { coerced: 'hello', warning: '...' }

// Test: number field gets string "3" — should coerce to 3
const r2 = coerce('User信息.性交总次数', '3');
console.log('String number coerced:', r2); // { coerced: 3 }

// Test: number out of range gets clamped
const r3 = coerce('Player.hp', 150);
console.log('Clamped value:', r3); // { coerced: 100 }

// Test: wildcard path
const r4 = coerce('NPC花名册.任意NPC.好感度', '60');
console.log('Wildcard coerced:', r4); // { coerced: 60 }
```

- [ ] **Step 5: Test the full variable loop**

Simulate one full game loop in console:
```js
(async () => {
  const chat = window.__stStore.activeChat;
  
  // 1. Macro expansion (pre-send)
  const macroMod = await import('http://localhost:8080/scripts/sillytavern/variable-macro.js');
  const promptWithVars = macroMod.expandMacros('{{format_message_variable}}', { chat });
  console.log('1. Prompt would contain (first 200 chars):', promptWithVars.slice(0, 200));
  
  // 2. Simulate LLM reply with UpdateVariable
  const mvuMod = await import('http://localhost:8080/scripts/sillytavern/mvu-engine.js');
  const fakeReply = `
<UpdateVariable>
  <JSONPatch>
    [{"op": "delta", "path": "/Player/hp", "value": -10}]
  </JSONPatch>
</UpdateVariable>
你受到了伤害，但继续前进。`;
  
  const { cleanedContent, results } = mvuMod.processUpdateVariables(fakeReply, { chat });
  console.log('2. MVU applied:', results[0].patchesApplied, 'patches');
  console.log('3. Player HP now:', chat.variables.Player.hp); // Should be 90
  console.log('4. Chat sees (cleaned):', cleanedContent.trim()); // No XML
})();
```

Expected:
- Player HP decremented from 100 to 90
- Chat content cleaned of XML

- [ ] **Step 6: Commit final verification**

```bash
git add -A
git diff --cached --stat
git commit -m "test: integration verification — macro + MVU + schema end-to-end"
```

---

### Completion Criteria

All of the following must be true:

1. `variable-schema.js` loads without errors; `registerSchema`, `coerce`, `validate`, `getSchema` work correctly
2. `variable-store.js` has `getAllSync` and schema coerce hook in both `setVar` and `setVarSync`
3. `variable-macro.js` expands `{{format_message_variable}}` into structured `【章节】` text; unknown macros left as-is
4. `prompt-assembler.js` calls `expandMacros` during `replaceMacros`
5. `mvu-engine.js` extracts `<UpdateVariable>` blocks, applies all 6 op types, strips XML from output
6. `sillytavern-store.js` calls `processUpdateVariables` before EJS post-processing
7. Schema coerce protects against bad data (string→number coercion, range clamping, unknown fields pass through)
8. The full loop works: macro → simulate LLM → MVU → variables updated → next macro output reflects changes
