/* scripts/variable-manager.js — 变量仓库面板 */
(function () {
  let modal = null;
  let activeTab = 'chat';

  function getStore() { return window.__stStore; }

  async function getVars(scope) {
    const { variableStore } = await import('./sillytavern/variable-store.js');
    const store = getStore();
    if (scope === 'global') return variableStore.getAll('global');
    if (scope === 'chat') return variableStore.getAll('chat', store?.activeChat);
    if (scope === 'message') return variableStore.getAll('message', store?.activeChat);
    return {};
  }

  function open() {
    render();
  }

  async function render() {
    const tabs = [
      { id: 'chat', label: '聊天变量', desc: '当前对话作用域' },
      { id: 'global', label: '全局变量', desc: '跨对话持久化' },
      { id: 'message', label: '消息变量', desc: '内存中，不持久化' },
    ];

    const tabBtns = tabs.map(t =>
      `<button class="chip-btn ${activeTab === t.id ? 'is-active' : ''}" data-vm-tab="${t.id}" style="margin-right:8px;">${t.label}<span style="margin-left:4px;font-size:11px;color:var(--fg-quaternary);">${t.desc}</span></button>`
    ).join('');

    const vars = await getVars(activeTab);
    const keys = Object.keys(vars);
    const bodyHtml = keys.length === 0
      ? '<div style="padding:20px;color:var(--fg-quaternary);text-align:center;">此作用域暂无变量。</div>'
      : `<div style="padding:4px 0;">${keys.map(k => buildVarRow(k, vars[k])).join('')}</div>`;

    const html = `
      <div style="padding:20px;">
        <div style="margin-bottom:16px;display:flex;align-items:center;gap:4px;">${tabBtns}</div>
        <div id="vm-body">${bodyHtml}</div>
      </div>
    `;

    if (modal) {
      modal.el.querySelector('#vm-content').innerHTML = html;
    } else {
      modal = GameModal.open({
        size: 'md', icon: 'sliders',
        title: '变量仓库',
        subtitle: '查看和管理所有作用域的变量',
        body: `<div id="vm-content">${html}</div>`,
      });
    }
    bindAll(modal);
  }

  function buildVarRow(key, value) {
    let display;
    if (value === null || value === undefined) display = '<span style="color:var(--fg-quaternary);font-style:italic;">null</span>';
    else if (typeof value === 'object') display = `<pre style="margin:0;font-size:11px;color:var(--fg-tertiary);white-space:pre-wrap;">${esc(JSON.stringify(value, null, 2))}</pre>`;
    else if (typeof value === 'number') display = `<span style="color:var(--accent);font-family:var(--font-mono);">${value}</span>`;
    else if (typeof value === 'boolean') display = `<span style="color:var(--wisteria-300);font-family:var(--font-mono);">${value}</span>`;
    else display = `<span style="color:var(--fg-secondary);">${esc(String(value))}</span>`;

    return `
      <div style="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-bottom:1px solid var(--border-soft);" data-var-key="${esc(key)}">
        <span style="font-weight:600;font-size:13px;color:var(--fg-primary);min-width:80px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(key)}</span>
        <span style="flex:1;font-size:13px;word-break:break-all;">${display}</span>
        <button class="iconbtn iconbtn-ghost" data-vm-edit="${esc(key)}" style="width:24px;height:24px;flex-shrink:0;" title="编辑">✎</button>
        <button class="iconbtn iconbtn-ghost" data-vm-delete="${esc(key)}" style="width:24px;height:24px;flex-shrink:0;" title="删除">×</button>
      </div>
    `;
  }

  function bindAll(modal) {
    modal.el.querySelectorAll('[data-vm-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-vm-tab');
        render();
      });
    });

    modal.el.querySelectorAll('[data-vm-edit]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.getAttribute('data-vm-edit');
        const { variableStore } = await import('./sillytavern/variable-store.js');
        const store = getStore();
        const current = await variableStore.getVar(key, {}, store?.activeChat);
        const newVal = prompt(`编辑变量: ${key}`, typeof current === 'object' ? JSON.stringify(current) : String(current));
        if (newVal !== null) {
          let parsed;
          try { parsed = JSON.parse(newVal); } catch { parsed = newVal; }
          await variableStore.setVar(key, parsed, {}, store?.activeChat);
          render();
        }
      });
    });

    modal.el.querySelectorAll('[data-vm-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.getAttribute('data-vm-delete');
        if (!confirm(`删除变量 "${key}"？`)) return;
        const { variableStore } = await import('./sillytavern/variable-store.js');
        const store = getStore();
        await variableStore.deleteVar(key, activeTab, store?.activeChat);
        render();
      });
    });
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

  window.GameVariableManager = { open };
})();
