/**
 * 扩展中心 — 五标签：脚本 / 模板 / 全局变量 / 斜杠 / 调试
 */
import { store } from './sillytavern-store.js';
import { HOOK_TYPES, runManually, getError, getConsoleLog, clearConsoleLog } from './sillytavern/script-runtime.js';
import { listAll as listAllCommands, dispatch as dispatchSlash } from './sillytavern/slash-commands.js';
import { getRecentLog as getEventLog, clearLog as clearEventLog, listSubscriptions } from './sillytavern/event-bus.js';
import { render as renderTemplate } from './sillytavern/template-engine.js';
import { buildContext } from './sillytavern/extension-api.js';

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

const HOOK_LABELS = {
  'app:init': '启动',
  'prompt:before': '发送前',
  'prompt:after': '发送后',
  'stream:chunk': '流·分片',
  'stream:done': '流·完成',
  'message:user': '用户消息',
  'message:assistant': 'AI 消息',
  'vars:change': '变量变更',
  'slash:command': '斜杠命令',
};

let activeTab = 'scripts';
let activeScriptId = null;
let activeTemplateId = null;

export function openExtensions() {
  activeTab = 'scripts';
  const tabs = [
    { k: 'scripts',   l: '脚本' },
    { k: 'templates', l: '模板' },
    { k: 'global',    l: '全局变量' },
    { k: 'slash',     l: '斜杠命令' },
    { k: 'debug',     l: '调试' },
  ];
  const tabbar = `<div id="ext-tabbar" class="ext-tabbar">${tabs.map(t =>
    `<button class="btn-tab ext-tab-btn" data-ext-tab="${t.k}">${t.l}</button>`
  ).join('')}</div>`;

  const modal = GameModal.open({
    size: 'lg',
    title: '扩展中心',
    subtitle: '模板 · 脚本 · 全局变量 · 斜杠命令',
    body: `${tabbar}<div id="ext-content"></div>`,
    className: 'ext-modal',
  });

  requestAnimationFrame(() => {
    const el = modal.el;
    if (!el) return;
    wireTabs(el, modal);
    setActiveTab(el, modal, 'scripts');
  });
}

function wireTabs(el, modal) {
  el.querySelectorAll('.ext-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-ext-tab');
      setActiveTab(el, modal, tab);
    });
  });
}

function setActiveTab(el, modal, tab) {
  activeTab = tab;
  el.querySelectorAll('.ext-tab-btn').forEach(b => {
    b.classList.toggle('is-active', b.getAttribute('data-ext-tab') === tab);
  });
  const content = el.querySelector('#ext-content');
  if (!content) return;
  switch (tab) {
    case 'scripts':   renderScriptsTab(content, modal); break;
    case 'templates': renderTemplatesTab(content, modal); break;
    case 'global':    renderGlobalTab(content, modal); break;
    case 'slash':     renderSlashTab(content, modal); break;
    case 'debug':     renderDebugTab(content, modal); break;
  }
}

// ========== SCRIPTS TAB ==========

function renderScriptsTab(content, modal) {
  const list = store.scripts || [];
  if (activeScriptId && !list.find(s => s.id === activeScriptId)) activeScriptId = null;
  if (!activeScriptId && list.length) activeScriptId = list[0].id;
  const sel = list.find(s => s.id === activeScriptId);

  content.innerHTML = `
    <div class="ext-split">
      <aside class="ext-side">
        <div class="ext-side-head">
          <span>脚本 · ${list.length}</span>
          <button class="btn-sm" id="ext-script-new">+ 新建</button>
        </div>
        <ul class="ext-side-list">
          ${list.length === 0 ? '<li class="ext-side-empty">暂无脚本</li>' :
            list.map(s => {
              const err = getError(s.id);
              return `<li class="ext-side-item ${s.id === activeScriptId ? 'is-active' : ''}" data-id="${s.id}">
                <span class="ext-side-name">${esc(s.name || '(未命名)')}</span>
                <span class="ext-side-meta">
                  ${s.enabled === false ? '<span class="ext-pill ext-pill-mute">禁用</span>' : ''}
                  ${err ? '<span class="ext-pill ext-pill-error">错</span>' : ''}
                  ${(s.hooks||[]).slice(0,2).map(h => `<span class="ext-pill">${esc(HOOK_LABELS[h] || h)}</span>`).join('')}
                </span>
              </li>`;
            }).join('')}
        </ul>
      </aside>
      <section class="ext-main">${sel ? renderScriptEditor(sel) : `<p class="ext-empty">从左侧选择脚本，或点 + 新建。</p>`}</section>
    </div>
  `;
  // wire side
  content.querySelectorAll('.ext-side-item').forEach(li => {
    li.addEventListener('click', () => {
      activeScriptId = li.getAttribute('data-id');
      renderScriptsTab(content, modal);
    });
  });
  content.querySelector('#ext-script-new')?.addEventListener('click', async () => {
    const def = {
      id: crypto.randomUUID(),
      name: '新脚本',
      hooks: ['prompt:before'],
      code: '// st = Tavern API\n// payload = 当前事件载荷（可改写）\nconsole.log("[新脚本]", event, payload);\n',
      enabled: true,
      runOrder: 0,
    };
    await store.saveScript(def);
    activeScriptId = def.id;
    renderScriptsTab(content, modal);
  });
  if (sel) wireScriptEditor(content, modal, sel);
}

function renderScriptEditor(s) {
  const hooksHtml = HOOK_TYPES.map(h =>
    `<label class="ext-hook-chip"><input type="checkbox" data-hook="${h}" ${(s.hooks || []).includes(h) ? 'checked' : ''}> ${esc(HOOK_LABELS[h] || h)}</label>`
  ).join('');
  const err = getError(s.id);
  return `
    <div class="ext-edit">
      <div class="ext-edit-row">
        <label class="st-field" style="flex:1;">
          <span class="st-field-label">名称</span>
          <input id="ext-script-name" type="text" value="${esc(s.name)}">
        </label>
        <label class="st-field" style="width:90px;">
          <span class="st-field-label">顺序</span>
          <input id="ext-script-order" type="number" value="${s.runOrder ?? 0}">
        </label>
        <label class="ext-toggle">
          <input id="ext-script-enabled" type="checkbox" ${s.enabled !== false ? 'checked' : ''}>
          启用
        </label>
      </div>
      <div class="ext-edit-row">
        <span class="st-field-label">触发钩子</span>
        <div class="ext-hooks">${hooksHtml}</div>
      </div>
      ${err ? `<div class="ext-error">最近一次错误：${esc(err.message)} · ${new Date(err.ts).toLocaleTimeString()}</div>` : ''}
      <textarea id="ext-script-code" class="ext-code" spellcheck="false">${esc(s.code)}</textarea>
      <div class="ext-foot">
        <button class="btn-sm" id="ext-script-test">▶ 测试运行</button>
        <button class="btn-sm" id="ext-script-save">保存</button>
        <button class="btn-sm" id="ext-script-delete" style="color:var(--amber-400)">删除</button>
        <span id="ext-script-status" class="ext-status"></span>
      </div>
      <div id="ext-script-output" class="ext-output" style="display:none"></div>
    </div>
  `;
}

function wireScriptEditor(content, modal, s) {
  const $ = sel => content.querySelector(sel);
  function gather() {
    const hooks = [...content.querySelectorAll('.ext-hook-chip input:checked')].map(i => i.getAttribute('data-hook'));
    return {
      ...s,
      name: $('#ext-script-name')?.value || s.name,
      runOrder: Number($('#ext-script-order')?.value || 0),
      enabled: $('#ext-script-enabled')?.checked ?? true,
      hooks,
      code: $('#ext-script-code')?.value || '',
    };
  }
  $('#ext-script-save')?.addEventListener('click', async () => {
    const next = gather();
    await store.saveScript(next);
    flash(content, '已保存');
  });
  $('#ext-script-delete')?.addEventListener('click', async () => {
    if (!confirm(`删除脚本 "${s.name}" ?`)) return;
    await store.deleteScript(s.id);
    activeScriptId = null;
    renderScriptsTab(content, modal);
  });
  $('#ext-script-test')?.addEventListener('click', async () => {
    const next = gather();
    await store.saveScript(next);
    const out = $('#ext-script-output');
    out.style.display = 'block';
    out.textContent = '运行中…';
    const result = await runManually(next, { source: 'manual', userInput: '（测试输入）' });
    if (result.ok) {
      const tail = getConsoleLog().filter(l => l.scriptId === next.id).slice(-20)
        .map(l => `[${l.level}] ${l.text}`).join('\n');
      out.textContent = `✅ 成功${result.value !== undefined ? ' · 返回 ' + JSON.stringify(result.value) : ''}\n\n${tail || '(无 console 输出)'}`;
    } else {
      out.textContent = `❌ ${result.error?.message}\n${result.error?.stack || ''}`;
    }
  });
}

// ========== TEMPLATES TAB ==========

function renderTemplatesTab(content, modal) {
  const list = store.templates || [];
  if (activeTemplateId && !list.find(t => t.id === activeTemplateId)) activeTemplateId = null;
  if (!activeTemplateId && list.length) activeTemplateId = list[0].id;
  const sel = list.find(t => t.id === activeTemplateId);

  content.innerHTML = `
    <div class="ext-split">
      <aside class="ext-side">
        <div class="ext-side-head">
          <span>模板 · ${list.length}</span>
          <button class="btn-sm" id="ext-tpl-new">+ 新建</button>
        </div>
        <ul class="ext-side-list">
          ${list.length === 0 ? '<li class="ext-side-empty">暂无模板</li>' :
            list.map(t => `<li class="ext-side-item ${t.id === activeTemplateId ? 'is-active' : ''}" data-id="${t.id}">
              <span class="ext-side-name">${esc(t.name || '(未命名)')}</span>
              ${t.enabled === false ? '<span class="ext-pill ext-pill-mute">禁用</span>' : ''}
            </li>`).join('')}
        </ul>
      </aside>
      <section class="ext-main">${sel ? renderTemplateEditor(sel) : `
        <p class="ext-empty">命名模板可在 lorebook / preset 内通过 <code>&lt;%- include('名称') %&gt;</code> 复用，也可用 <code>/template test 名称</code> 测试。</p>
      `}</section>
    </div>
  `;
  content.querySelectorAll('.ext-side-item').forEach(li => {
    li.addEventListener('click', () => {
      activeTemplateId = li.getAttribute('data-id');
      renderTemplatesTab(content, modal);
    });
  });
  content.querySelector('#ext-tpl-new')?.addEventListener('click', async () => {
    const def = {
      id: crypto.randomUUID(),
      name: '新模板',
      content: '<% if (getvar("HP", "merge") < 30) { %>\n  <%= char %> 看起来很虚弱。\n<% } %>\n',
      enabled: true,
    };
    await store.saveTemplate(def);
    activeTemplateId = def.id;
    renderTemplatesTab(content, modal);
  });
  if (sel) wireTemplateEditor(content, modal, sel);
}

function renderTemplateEditor(t) {
  return `
    <div class="ext-edit">
      <div class="ext-edit-row">
        <label class="st-field" style="flex:1;">
          <span class="st-field-label">名称</span>
          <input id="ext-tpl-name" type="text" value="${esc(t.name)}">
        </label>
        <label class="ext-toggle">
          <input id="ext-tpl-enabled" type="checkbox" ${t.enabled !== false ? 'checked' : ''}>
          启用
        </label>
      </div>
      <textarea id="ext-tpl-code" class="ext-code" spellcheck="false">${esc(t.content)}</textarea>
      <div class="ext-foot">
        <button class="btn-sm" id="ext-tpl-test">▶ 渲染预览</button>
        <button class="btn-sm" id="ext-tpl-save">保存</button>
        <button class="btn-sm" id="ext-tpl-delete" style="color:var(--amber-400)">删除</button>
        <span class="ext-status">EJS 语法：&lt;% %&gt; · &lt;%= %&gt; · &lt;%# %&gt;</span>
      </div>
      <pre id="ext-tpl-output" class="ext-output" style="display:none"></pre>
    </div>
  `;
}

function wireTemplateEditor(content, modal, t) {
  const $ = sel => content.querySelector(sel);
  function gather() {
    return {
      ...t,
      name: $('#ext-tpl-name')?.value || t.name,
      enabled: $('#ext-tpl-enabled')?.checked ?? true,
      content: $('#ext-tpl-code')?.value || '',
    };
  }
  $('#ext-tpl-save')?.addEventListener('click', async () => {
    await store.saveTemplate(gather());
    flash(content, '已保存');
  });
  $('#ext-tpl-delete')?.addEventListener('click', async () => {
    if (!confirm(`删除模板 "${t.name}" ?`)) return;
    await store.deleteTemplate(t.id);
    activeTemplateId = null;
    renderTemplatesTab(content, modal);
  });
  $('#ext-tpl-test')?.addEventListener('click', () => {
    const out = $('#ext-tpl-output');
    out.style.display = 'block';
    try {
      const rendered = renderTemplate(gather().content, buildContext({ userInput: '（测试输入）' }));
      out.textContent = rendered;
    } catch (err) {
      out.textContent = '渲染失败: ' + err.message;
    }
  });
}

// ========== GLOBAL VARS TAB ==========

function renderGlobalTab(content, modal) {
  const s = store.settings || {};
  const schema = s.globalVariableSchema || [];
  const values = s.globalVariables || {};
  content.innerHTML = `
    <p class="ext-help">全局变量与每对话变量并存；prompt 注入时 chat 变量优先（同名覆盖）。可用 <code>getvar('key', 'global')</code> 读取。</p>
    <div class="ext-edit-row">
      <strong>变量定义</strong>
      <button class="btn-sm" id="ext-gvar-add">+ 添加</button>
    </div>
    <div id="ext-gvar-rows">${schema.length === 0 ? '<p class="ext-empty">尚无定义。</p>' : schema.map((d, i) => renderGVarRow(d, i, values)).join('')}</div>
    <hr style="margin:16px 0;border:none;border-top:1px solid var(--ink-700)">
    <div class="ext-edit-row">
      <strong>当前值</strong>
      <button class="btn-sm" id="ext-gvar-clear">清空</button>
    </div>
    <div id="ext-gvar-vals">${Object.entries(values).length === 0 ? '<p class="ext-empty">尚无变量值。</p>' :
      Object.entries(values).map(([k, v]) =>
        `<div class="ext-row"><strong style="width:140px">${esc(k)}</strong>
          <input class="ext-gvar-val" data-key="${esc(k)}" type="text" value="${esc(typeof v === 'object' ? JSON.stringify(v) : String(v))}">
          <button class="btn-sm ext-gvar-del" data-key="${esc(k)}" style="color:var(--amber-400)">×</button>
        </div>`).join('')}</div>
  `;

  content.querySelector('#ext-gvar-add')?.addEventListener('click', async () => {
    const schema2 = [...(s.globalVariableSchema || [])];
    schema2.push({ key: 'new_var', type: 'number', label: '', default: 0, updateMode: 'set', enabled: true });
    await store.updateSettings({ globalVariableSchema: schema2 });
    renderGlobalTab(content, modal);
  });
  content.querySelector('#ext-gvar-clear')?.addEventListener('click', async () => {
    if (!confirm('清空全局变量值？')) return;
    await store.updateSettings({ globalVariables: {} });
    renderGlobalTab(content, modal);
  });
  content.querySelectorAll('.ext-gvar-val').forEach(inp => {
    inp.addEventListener('change', async () => {
      const key = inp.getAttribute('data-key');
      const raw = inp.value;
      const num = Number(raw);
      const val = (raw === 'true') ? true : (raw === 'false') ? false : (Number.isNaN(num) ? raw : num);
      const next = { ...(store.settings?.globalVariables || {}), [key]: val };
      await store.updateSettings({ globalVariables: next });
    });
  });
  content.querySelectorAll('.ext-gvar-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.getAttribute('data-key');
      const next = { ...(store.settings?.globalVariables || {}) };
      delete next[key];
      await store.updateSettings({ globalVariables: next });
      renderGlobalTab(content, modal);
    });
  });
  wireGVarRows(content, modal, schema);
}

function renderGVarRow(d, i, values) {
  const isNum = d.type === 'number';
  return `
    <div class="ext-row" data-idx="${i}">
      <input class="ext-gvar-key" type="text" value="${esc(d.key)}" placeholder="键" style="width:120px">
      <select class="ext-gvar-type" style="width:90px">
        <option value="number" ${d.type === 'number' ? 'selected' : ''}>数字</option>
        <option value="string" ${d.type === 'string' ? 'selected' : ''}>文本</option>
        <option value="boolean" ${d.type === 'boolean' ? 'selected' : ''}>布尔</option>
      </select>
      <input class="ext-gvar-label" type="text" value="${esc(d.label || '')}" placeholder="标签" style="width:120px">
      <input class="ext-gvar-default" type="${isNum ? 'number' : 'text'}" value="${esc(String(d.default ?? (isNum ? 0 : '')))}" placeholder="默认" style="width:100px">
      <label class="ext-toggle"><input class="ext-gvar-enabled" type="checkbox" ${d.enabled !== false ? 'checked' : ''}> 启用</label>
      <button class="btn-sm ext-gvar-row-del" style="color:var(--amber-400);margin-left:auto">删除</button>
    </div>`;
}

function wireGVarRows(content, modal, schema) {
  content.querySelectorAll('#ext-gvar-rows .ext-row').forEach(row => {
    const i = Number(row.getAttribute('data-idx'));
    const save = async () => {
      const def = {
        key: row.querySelector('.ext-gvar-key').value.trim(),
        type: row.querySelector('.ext-gvar-type').value,
        label: row.querySelector('.ext-gvar-label').value,
        default: coerceFromInput(row.querySelector('.ext-gvar-default').value, row.querySelector('.ext-gvar-type').value),
        enabled: row.querySelector('.ext-gvar-enabled').checked,
        updateMode: 'set',
      };
      const next = [...(store.settings?.globalVariableSchema || [])];
      next[i] = def;
      await store.updateSettings({ globalVariableSchema: next });
    };
    row.querySelectorAll('input, select').forEach(el => el.addEventListener('change', save));
    row.querySelector('.ext-gvar-row-del')?.addEventListener('click', async () => {
      const next = [...(store.settings?.globalVariableSchema || [])];
      next.splice(i, 1);
      await store.updateSettings({ globalVariableSchema: next });
      renderGlobalTab(content, modal);
    });
  });
}

function coerceFromInput(raw, type) {
  if (type === 'number') return Number(raw) || 0;
  if (type === 'boolean') return raw === 'true' || raw === '1';
  return raw;
}

// ========== SLASH TAB ==========

function renderSlashTab(content, modal) {
  const all = listAllCommands();
  const grouped = { builtin: [], custom: [] };
  for (const c of all) (grouped[c.source] || grouped.custom).push(c);
  content.innerHTML = `
    <p class="ext-help">在聊天框输入 <code>/help</code> 列出全部命令；用户脚本可调用 <code>Tavern.command(name, fn)</code> 注册自定义命令。</p>
    <div class="ext-edit-row" style="margin-top:12px">
      <input id="ext-slash-input" type="text" placeholder="试一条命令: /roll 1d20" style="flex:1;padding:6px 10px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-family:var(--font-mono);font-size:13px">
      <button class="btn-sm" id="ext-slash-run">运行</button>
    </div>
    <pre id="ext-slash-out" class="ext-output" style="display:none"></pre>
    <h4 class="ext-h4">内置命令 · ${grouped.builtin.length}</h4>
    <table class="ext-table">
      <thead><tr><th>命令</th><th>参数</th><th>说明</th></tr></thead>
      <tbody>${grouped.builtin.map(c =>
        `<tr><td><code>/${esc(c.name)}</code></td><td><code>${esc(c.args || '')}</code></td><td>${esc(c.desc || '')}</td></tr>`).join('')}
      </tbody>
    </table>
    <h4 class="ext-h4">自定义命令 · ${grouped.custom.length}</h4>
    ${grouped.custom.length === 0 ? '<p class="ext-empty">脚本里调用 <code>Tavern.command("name", (args) =&gt; "结果")</code> 来注册。</p>' :
      `<table class="ext-table"><thead><tr><th>命令</th><th>说明</th></tr></thead>
        <tbody>${grouped.custom.map(c =>
          `<tr><td><code>/${esc(c.name)}</code></td><td>${esc(c.desc || '')}</td></tr>`).join('')}
        </tbody></table>`}
  `;
  content.querySelector('#ext-slash-run')?.addEventListener('click', async () => {
    const input = content.querySelector('#ext-slash-input');
    const out = content.querySelector('#ext-slash-out');
    out.style.display = 'block';
    const r = await dispatchSlash(input.value, store);
    out.textContent = r ? `${r.ok ? '✅' : '❌'} ${r.text || ''}` : '(无返回)';
  });
}

// ========== DEBUG TAB ==========

function renderDebugTab(content, modal) {
  const events = getEventLog();
  const subs = listSubscriptions();
  const consoleLog = getConsoleLog();
  content.innerHTML = `
    <div class="ext-edit-row">
      <strong>订阅状态</strong>
      <button class="btn-sm" id="ext-debug-clear-events">清事件</button>
      <button class="btn-sm" id="ext-debug-clear-console">清 console</button>
      <button class="btn-sm" id="ext-debug-refresh">刷新</button>
    </div>
    <div class="ext-pillrow">
      ${Object.keys(subs).length === 0 ? '<span class="ext-empty">无订阅</span>' :
        Object.entries(subs).map(([t, n]) => `<span class="ext-pill">${esc(t)} · ${n}</span>`).join('')}
    </div>
    <h4 class="ext-h4">最近事件 · ${events.length}</h4>
    <pre class="ext-output" style="max-height:200px;overflow:auto;display:block">${events.length === 0 ? '(无)' : events.slice(-30).reverse().map(e =>
      `${new Date(e.ts).toLocaleTimeString()}  ${e.type}  ${typeof e.payload === 'object' ? JSON.stringify(e.payload) : (e.payload ?? '')}`).join('\n')}</pre>
    <h4 class="ext-h4">脚本 console · ${consoleLog.length}</h4>
    <pre class="ext-output" style="max-height:200px;overflow:auto;display:block">${consoleLog.length === 0 ? '(无)' : consoleLog.slice(-30).reverse().map(l =>
      `[${new Date(l.ts).toLocaleTimeString()}] [${l.level}] [${l.scriptId.slice(0, 6)}] ${esc(l.text)}`).join('\n')}</pre>
  `;
  content.querySelector('#ext-debug-clear-events')?.addEventListener('click', () => { clearEventLog(); renderDebugTab(content, modal); });
  content.querySelector('#ext-debug-clear-console')?.addEventListener('click', () => { clearConsoleLog(); renderDebugTab(content, modal); });
  content.querySelector('#ext-debug-refresh')?.addEventListener('click', () => renderDebugTab(content, modal));
}

// ========== UTIL ==========

function flash(content, text) {
  const el = content.querySelector('#ext-script-status') || content.querySelector('.ext-status');
  if (!el) return;
  const prev = el.textContent;
  el.textContent = text;
  el.style.color = 'var(--sakura-300)';
  setTimeout(() => { el.textContent = prev; el.style.color = ''; }, 1500);
}
