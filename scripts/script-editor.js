/* scripts/script-editor.js — 脚本工坊面板 */
(function () {
  let modal = null;
  let scripts = [];
  let activeScriptId = null;

  function getStore() { return window.__stStore; }

  async function loadScripts() {
    const { getAll } = await import('./sillytavern/script-manager.js');
    scripts = getAll();
  }

  function open() {
    loadScripts().then(() => {
      activeScriptId = scripts[0]?.id || null;
      render();
    });
  }

  function render() {
    if (modal) {
      modal.el.querySelector('#script-shell').innerHTML = shellHtml();
    } else {
      modal = GameModal.open({
        size: 'full', icon: 'code',
        title: '脚本工坊',
        subtitle: '编写和管理 JS 脚本',
        body: `<div id="script-shell">${shellHtml()}</div>`,
        fullPane: true,
        footer: `
          <div class="modal-foot-actions">
            <button class="btn btn-ghost" id="script-import">导入</button>
            <button class="btn btn-ghost" id="script-export">导出</button>
            <button class="btn btn-ghost" id="script-cancel">关闭</button>
            <button class="btn btn-primary" id="script-save-all">保存全部</button>
          </div>
        `,
      });
    }
    bindAll();
    if (activeScriptId) selectScript(activeScriptId);
  }

  function shellHtml() {
    const active = scripts.find(s => s.id === activeScriptId);
    const listHtml = scripts.length === 0
      ? '<div style="padding:12px;color:var(--fg-quaternary);font-size:12px;text-align:center;">暂无脚本</div>'
      : scripts.map(s => `
        <div class="script-card ${s.id === activeScriptId ? 'is-active' : ''} ${!s.enabled ? 'is-disabled' : ''}"
             data-script-id="${s.id}">
          <span class="script-card-name">${esc(s.name)}</span>
          <span class="script-card-actions">
            <button class="iconbtn iconbtn-ghost" data-act="toggle" data-sid="${s.id}" style="width:22px;height:22px;" title="${s.enabled ? '禁用' : '启用'}">
              ${s.enabled ? '●' : '○'}
            </button>
            <button class="iconbtn iconbtn-ghost" data-act="delete" data-sid="${s.id}" style="width:22px;height:22px;" title="删除">×</button>
          </span>
        </div>
      `).join('');

    const editorHtml = active ? `
      <div class="script-editor-head">
        <input class="script-editor-name" id="script-name-input" value="${esc(active.name)}" />
        <span style="font-size:11px;color:var(--fg-quaternary);">${active.id.slice(0,8)}</span>
      </div>
      <div class="script-editor-body">
        <textarea class="script-editor-code" id="script-code-input" spellcheck="false">${esc(active.content)}</textarea>
      </div>
      <div class="script-editor-footer">
        <span class="script-trigger-label"><input type="checkbox" id="script-trigger-manual" ${active.triggers?.manual !== false ? 'checked' : ''} /> 手动</span>
        <span class="script-trigger-label"><input type="checkbox" id="script-trigger-onsend" ${active.triggers?.onSend ? 'checked' : ''} /> 发送前</span>
        <span class="script-trigger-label"><input type="checkbox" id="script-trigger-onmsg" ${active.triggers?.onMessage ? 'checked' : ''} /> 接收后</span>
        <span style="flex:1;"></span>
        <button class="chip-btn chip-btn-primary" id="script-run-btn">▶ 执行</button>
      </div>
    ` : `<div style="padding:40px;text-align:center;color:var(--fg-quaternary);">选择一个脚本或新建脚本</div>`;

    return `
      <div class="script-shell">
        <div class="script-list-pane">
          <div class="script-list-head">
            <span class="script-list-head-title">脚本列表</span>
            <button class="iconbtn iconbtn-ghost" id="script-new-btn" title="新建">+</button>
          </div>
          <div class="script-list-body" id="script-list">${listHtml}</div>
        </div>
        <div class="script-editor-pane" id="script-editor-area">${editorHtml}</div>
      </div>
    `;
  }

  function selectScript(id) {
    activeScriptId = id;
    const area = document.getElementById('script-editor-area');
    const list = document.getElementById('script-list');
    if (!area || !list) return;
    const active = scripts.find(s => s.id === id);
    area.innerHTML = active ? `
      <div class="script-editor-head">
        <input class="script-editor-name" id="script-name-input" value="${esc(active.name)}" />
        <span style="font-size:11px;color:var(--fg-quaternary);">${active.id.slice(0,8)}</span>
      </div>
      <div class="script-editor-body">
        <textarea class="script-editor-code" id="script-code-input" spellcheck="false">${esc(active.content)}</textarea>
      </div>
      <div class="script-editor-footer">
        <span class="script-trigger-label"><input type="checkbox" id="script-trigger-manual" ${active.triggers?.manual !== false ? 'checked' : ''} /> 手动</span>
        <span class="script-trigger-label"><input type="checkbox" id="script-trigger-onsend" ${active.triggers?.onSend ? 'checked' : ''} /> 发送前</span>
        <span class="script-trigger-label"><input type="checkbox" id="script-trigger-onmsg" ${active.triggers?.onMessage ? 'checked' : ''} /> 接收后</span>
        <span style="flex:1;"></span>
        <button class="chip-btn chip-btn-primary" id="script-run-btn">▶ 执行</button>
      </div>
    ` : '<div style="padding:40px;text-align:center;color:var(--fg-quaternary);">选择一个脚本或新建脚本</div>';
    list.querySelectorAll('.script-card').forEach(c => c.classList.toggle('is-active', c.dataset.scriptId === id));

    // re-bind editor events
    const nameInput = document.getElementById('script-name-input');
    const codeInput = document.getElementById('script-code-input');
    const runBtn = document.getElementById('script-run-btn');
    if (nameInput) {
      nameInput.addEventListener('input', () => {
        const s = scripts.find(s => s.id === activeScriptId);
        if (s) s.name = nameInput.value;
      });
    }
    if (codeInput) {
      codeInput.addEventListener('input', () => {
        const s = scripts.find(s => s.id === activeScriptId);
        if (s) s.content = codeInput.value;
      });
    }
    if (runBtn) {
      runBtn.addEventListener('click', async () => {
        const s = scripts.find(s => s.id === activeScriptId);
        if (!s) return;
        const { executeScript } = await import('./sillytavern/script-manager.js');
        const store = getStore();
        const result = await executeScript(s, {
          chat: store?.activeChat,
          userName: store?.settings?.userName,
          characterName: store?.settings?.characterName,
          userInput: '',
        });
        const msg = result.success ? (result.output ? `输出: ${JSON.stringify(result.output)}` : '执行完成 ✓') : `错误: ${result.error}`;
        GameNotify.info(s.name, msg, { duration: 4000 });
      });
    }
  }

  async function bindAll() {
    const listEl = document.getElementById('script-list');
    if (listEl) {
      listEl.addEventListener('click', (e) => {
        const card = e.target.closest('.script-card');
        if (card) { selectScript(card.dataset.scriptId); return; }
        const actBtn = e.target.closest('[data-act]');
        if (actBtn) {
          const sid = actBtn.dataset.sid;
          const act = actBtn.dataset.act;
          if (act === 'toggle') {
            const s = scripts.find(s => s.id === sid);
            if (s) { s.enabled = !s.enabled; render(); if (sid === activeScriptId) selectScript(sid); }
          } else if (act === 'delete') {
            scripts = scripts.filter(s => s.id !== sid);
            if (activeScriptId === sid) activeScriptId = scripts[0]?.id || null;
            render();
          }
        }
      });
    }

    const newBtn = document.getElementById('script-new-btn');
    if (newBtn) {
      newBtn.addEventListener('click', async () => {
        const { add } = await import('./sillytavern/script-manager.js');
        const s = await add('新脚本');
        scripts = (await import('./sillytavern/script-manager.js')).getAll();
        activeScriptId = s.id;
        render();
      });
    }

    const triggerCbs = ['script-trigger-manual', 'script-trigger-onsend', 'script-trigger-onmsg'];
    triggerCbs.forEach(cbId => {
      const el = document.getElementById(cbId);
      if (el) {
        el.addEventListener('change', () => {
          const s = scripts.find(s => s.id === activeScriptId);
          if (!s) return;
          const fieldMap = {
            'script-trigger-manual': 'manual',
            'script-trigger-onsend': 'onSend',
            'script-trigger-onmsg': 'onMessage',
          };
          s.triggers = s.triggers || { manual: true, onSend: false, onMessage: false };
          s.triggers[fieldMap[cbId]] = el.checked;
        });
      }
    });

    // Footer buttons
    document.getElementById('script-save-all')?.addEventListener('click', async () => {
      const { update } = await import('./sillytavern/script-manager.js');
      for (const s of scripts) await update(s.id, s);
      GameNotify.success('已保存', `${scripts.length} 个脚本已保存。`);
    });
    document.getElementById('script-export')?.addEventListener('click', async () => {
      const { exportScripts } = await import('./sillytavern/script-manager.js');
      const data = exportScripts();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scripts-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      GameNotify.success('已导出', `${data.length} 个脚本。`);
    });
    document.getElementById('script-import')?.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json';
      inp.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const data = JSON.parse(text);
        const { importScripts } = await import('./sillytavern/script-manager.js');
        await importScripts(data);
        scripts = (await import('./sillytavern/script-manager.js')).getAll();
        activeScriptId = scripts[0]?.id || null;
        render();
        GameNotify.success('已导入', `${data.length} 个脚本。`);
      };
      inp.click();
    });
    document.getElementById('script-cancel')?.addEventListener('click', () => modal?.close?.());
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

  window.GameScriptEditor = { open };
})();
