/* scripts/main.js — 入口与全局连线 (SillyTavern v3 integrated) */
(function () {
  // —— 主导航 -> 模态框 —— //
  document.querySelectorAll('.nav-item[data-modal]').forEach(item => {
    item.addEventListener('click', () => {
      const m = item.getAttribute('data-modal');
      document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('is-active'));
      item.classList.add('is-active');
      switch (m) {
        case 'facilities': GameFacilities.open(); break;
        case 'organizations': GameOrganizations.open(); break;
        case 'roster': GameRoster.open(); break;
        case 'courses': GameCourses.open(); break;
        case 'rules-editor': GameRulesEditor.open(); break;
        case 'form-editor': GameFormEditor.open(); break;
      }
      setTimeout(() => item.classList.remove('is-active'), 280);
    });
  });

  // —— 折叠 / 展开侧边栏 —— //
  const shell = document.getElementById('app-shell');
  document.getElementById('sidebar-collapse').addEventListener('click', () => {
    shell.classList.toggle('sidebar-collapsed');
  });
  document.getElementById('open-sidebar').addEventListener('click', () => {
    shell.classList.toggle('sidebar-collapsed');
  });

  // —— 上下文面板 —— //
  const ctxBody = document.getElementById('ctx-pane-body');
  const ctxClose = document.getElementById('ctx-close');
  const ctxToggle = document.getElementById('ctx-toggle');

  function renderCtxPane() {
    const tagTone = { '场景': 'sakura', '人物': 'wisteria', '规章': 'amber', '事件': 'moss', '物件': 'ink', '提示': 'amber' };

    // Try to use store data if available
    if (window.__stStore) {
      const store = window.__stStore;
      const activeLorebookIds = store.settings?.activeLorebookIds || [];
      const activeBooks = store.lorebooks.filter(b => activeLorebookIds.includes(b.id));
      const chat = store.activeChat;

      let entriesHtml = '';
      if (activeBooks.length > 0) {
        let allEntries = [];
        activeBooks.forEach(book => {
          book.entries.forEach(e => allEntries.push({ entry: e, bookName: book.name }));
        });
        // Show up to 12 entries
        allEntries = allEntries.slice(0, 12);
        entriesHtml = allEntries.map(({ entry, bookName }) => `
          <div class="ctx-item" style="margin-bottom: var(--sp-4);">
            <div class="ctx-item-head">
              <span class="ctx-item-name">${escapeHtml(entry.keys.slice(0,2).join(', ') || '(常驻)')}</span>
              <span class="badge badge-${tagTone['场景'] || 'ink'}">${escapeHtml(bookName)}</span>
            </div>
            <div class="ctx-item-body">${escapeHtml(entry.content.slice(0, 150))}${entry.content.length > 150 ? '…' : ''}</div>
            <div class="ctx-item-meta">
              <span>${entry.constant ? '常驻' : '关键词匹配'}</span>
              <span class="ctx-item-meta-dot"></span>
              <span>order ${entry.order}</span>
            </div>
          </div>
        `).join('');
      } else if (!store.initialized) {
        // Still loading
        entriesHtml = `<div class="ctx-item"><div class="ctx-item-body" style="color:var(--fg-quaternary)">正在加载世界书…</div></div>`;
      } else {
        entriesHtml = `<div class="ctx-item"><div class="ctx-item-body" style="color:var(--fg-quaternary)">暂无激活条目。在「世界书」管理中启用。</div></div>`;
      }

      ctxBody.innerHTML = `
        <div>
          <div class="section-title">激活条目<span style="margin-left:auto; font-size: var(--fs-xs); color: var(--fg-quaternary); font-family: var(--font-mono);">${activeBooks.reduce((s,b) => s + b.entries.length, 0)} 条 | ${activeBooks.length} 本书</span></div>
          ${entriesHtml}
        </div>

        <div>
          <div class="section-title">即时状态</div>
          <div class="ctx-item" style="background: linear-gradient(180deg, rgba(255,107,154,0.06), rgba(106,85,214,0.04)); border-color: rgba(255,107,154,0.18);">
            <div class="ctx-item-head">
              <span class="ctx-item-name">${escapeHtml(store.settings?.characterName || 'AI')} 状态</span>
              <span class="badge badge-sakura">活跃</span>
            </div>
            <div class="ctx-item-body">
              ${chat && chat.variables ? Object.entries(chat.variables).slice(0, 5).map(([k,v]) => `<span style="margin-right:16px;font-size:12px">${escapeHtml(k)}: ${escapeHtml(String(v))}</span>`).join('') : '暂无变量'}
            </div>
            <div class="ctx-item-meta" style="margin-top: var(--sp-3);">
              <span>${chat ? chat.messages.length + ' 条消息' : '无活跃对话'}</span>
              <span class="ctx-item-meta-dot"></span>
              <span>预设: ${escapeHtml(store.activePreset?.name || '默认')}</span>
            </div>
          </div>
          <div class="ctx-item" style="margin-top: var(--sp-4);">
            <div class="ctx-item-head">
              <span class="ctx-item-name">API 状态</span>
              <span class="badge badge-${store.settings?.api?.apiKey ? 'sakura' : 'amber'}">${store.settings?.api?.apiKey ? '已配置' : '未配置'}</span>
            </div>
            <div class="ctx-item-body">${store.settings?.api?.apiKey ? `模型: ${escapeHtml(store.settings.api.model)} | ${escapeHtml(store.settings.api.baseUrl)}` : '请在设置中配置 API Key 以启用 AI 对话。'}</div>
          </div>
        </div>
      `;
    } else {
      // Fallback: static context data
      const list = typeof GameData !== 'undefined' ? (GameData.worldEntries || []) : [];
      ctxBody.innerHTML = `
        <div>
          <div class="section-title">激活条目<span style="margin-left:auto; font-size: var(--fs-xs); color: var(--fg-quaternary); font-family: var(--font-mono);">${list.length} / 12</span></div>
          ${list.map(e => `
            <div class="ctx-item" style="margin-bottom: var(--sp-4);">
              <div class="ctx-item-head">
                <span class="ctx-item-name">${e.name}</span>
                <span class="badge badge-${tagTone[e.tag] || 'ink'}">${e.tag}</span>
              </div>
              <div class="ctx-item-body">${e.body}</div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  // Initial render
  renderCtxPane();

  // Store subscribes to update ctx pane
  window.__updateCtxPane = renderCtxPane;

  ctxClose.addEventListener('click', () => shell.classList.toggle('ctx-collapsed'));
  ctxToggle.addEventListener('click', () => shell.classList.toggle('ctx-collapsed'));

  // —— 顶栏其它按钮 —— //
  const quickActionsBtn = document.getElementById('quick-actions');
  quickActionsBtn.addEventListener('click', async () => {
    try {
      const ui = await import('./sillytavern-ui.js');
      ui.openLorebooks();
    } catch {
      GameNotify.info('快捷动作', '可在此插入打招呼、递物品、引用规章等模板。', { duration: 3500 });
    }
  });

  document.getElementById('new-turn').addEventListener('click', async () => {
    if (window.__stStore) {
      const store = window.__stStore;
      const count = store.chats.filter(c => c.characterName === store.settings?.characterName).length;
      await store.createChat(`${store.settings?.characterName || 'AI'} - 新对话 ${count + 1}`);
      GameNotify.success('已开启新一轮', '场景已暂存于编年志中。');
    } else {
      GameNotify.success('已开启新一轮', '场景已暂存于编年志中。');
    }
  });

  document.getElementById('settings-btn').addEventListener('click', async () => {
    try {
      const ui = await import('./sillytavern-ui.js');
      ui.openSettings();
    } catch (err) {
      console.error('[SillyTavern] Failed to open settings:', err);
      GameNotify.info('设置面板', '加载中，请稍后再试。');
    }
  });

  document.getElementById('theme-btn').addEventListener('click', () => {
    document.body.classList.toggle('theme-light');
    GameNotify.info('主题', '尚仅支持暮色与晨光二式。', { duration: 2200 });
  });

  document.getElementById('archive-btn').addEventListener('click', async () => {
    if (window.__stStore) {
      const { exportAllData } = await import('./sillytavern/database.js');
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sakurasu-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      GameNotify.success('已导出存档', '世界书、预设、对话数据已保存。');
    } else {
      GameNotify.success('已写入存档', '编年志 · 第二学期 · 第 3 周 · 周二。');
    }
  });

  document.getElementById('lorebook-btn').addEventListener('click', async () => {
    try {
      const ui = await import('./sillytavern-ui.js');
      ui.openLorebooks();
    } catch (err) {
      console.error('[SillyTavern] Failed to open lorebooks:', err);
      GameNotify.info('世界书', '加载中，请稍后再试。');
    }
  });

  document.getElementById('variables-btn').addEventListener('click', async () => {
    try {
      const ui = await import('./sillytavern-ui.js');
      ui.openVariables();
    } catch (err) {
      console.error('[SillyTavern] Failed to open variables:', err);
      GameNotify.info('变量', '加载中，请稍后再试。');
    }
  });

  document.getElementById('extensions-btn').addEventListener('click', async () => {
    try {
      const ui = await import('./sillytavern-extensions-ui.js');
      ui.openExtensions();
    } catch (err) {
      console.error('[SillyTavern] Failed to open extensions:', err);
      GameNotify.info('扩展中心', '加载中，请稍后再试。');
    }
  });

  // —— 全局快捷键 —— //
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea')) return;
    const k = e.key.toLowerCase();
    const map = { f: 'facilities', o: 'organizations', r: 'roster', c: 'courses', d: 'rules-editor', a: 'form-editor' };
    if (map[k]) {
      const item = document.querySelector(`.nav-item[data-modal="${map[k]}"]`);
      if (item) item.click();
    }
    if (e.ctrlKey && k === 'k') {
      e.preventDefault();
      if (window.__stStore) {
        import('./sillytavern-ui.js').then(ui => ui.openSettings());
      } else {
        GameNotify.info('命令面板', '正在初始化中。');
      }
    }
  });

  // —— Initialize SillyTavern Store —— //
  (async function initStore() {
    try {
      const { store } = await import('./sillytavern-store.js');
      window.__stStore = store;

      // Load from IndexedDB
      await store.loadAll();

      // Wire up ctx-pane refresh
      store.subscribe(() => {
        if (window.__updateCtxPane) window.__updateCtxPane();
      });

      // Initialize chat bridge
      if (window.__initSillyChat) {
        window.__initSillyChat(store);
      }

      // Re-render ctx pane with store data
      renderCtxPane();

      console.log('[SillyTavern] v3 initialized', {
        lorebooks: store.lorebooks.length,
        presets: store.presets.length,
        chats: store.chats.length,
        apiConfigured: !!store.settings?.api?.apiKey,
      });
    } catch (err) {
      console.warn('[SillyTavern] Initialization deferred:', err.message);
      // Retry after a short delay (IndexedDB may need a moment)
      setTimeout(initStore, 1500);
    }
  })();

  // —— 欢迎通知 —— //
  setTimeout(() => {
    const storeReady = window.__stStore?.initialized;
    const apiReady = window.__stStore?.settings?.api?.apiKey;
    GameNotify.show({
      title: '欢迎来到樱栖学园',
      text: storeReady && apiReady
        ? '今日下午 16:42 · 旧馆图书室。AI 引擎已就绪，会长正等待你的回应。'
        : storeReady
        ? `今日下午 16:42 · 旧馆图书室。请「设置 → 主 API」配置 API Key 以启用 AI 对话。`
        : '今日下午 16:42 · 旧馆图书室。会长正等待你的回应。',
      kind: 'info',
      duration: 6000,
      actions: [
        { label: storeReady ? '打开设置' : '查看场景', onClick: () => {
          if (storeReady) {
            import('./sillytavern-ui.js').then(ui => ui.openSettings());
          } else {
            GameFacilities && GameFacilities.open();
          }
        } },
        { label: '我知道了', onClick: () => {} },
      ],
    });
  }, 800);

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }
})();
