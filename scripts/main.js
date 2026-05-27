/* scripts/main.js — 入口与全局连线 (ES module, SillyTavern v3 integrated) */
import { openSettings, openLorebooks, openPresets } from './sillytavern-ui.js';
import { store } from './sillytavern-store.js';
import { exportAllData } from './sillytavern/database.js';
import { seedLorebooksIfNeeded, injectVariablesIntoChat } from './sillytavern/init-variables.js';
import { syncNpcsToGameData } from './sillytavern-store.js';
import { initBridge } from './bridge.js';

// —— DeepSeek API 默认配置 —— //
const DEEPSEEK_CONFIG = {
  baseUrl: 'https://api.deepseek.com',
  apiKey: 'sk-4c3d3af670aa47bea6f3e40149c12e21',
  model: 'deepseek-chat',
};

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
      case 'rules-reader': GameRulesReader.open(); break;
      case 'todo': GameTodo.open(); break;
      case 'script-editor': GameScriptEditor.open(); break;
      case 'variable-manager': GameVariableManager.open(); break;
      case 'prompt-viewer': GamePromptViewer.open(); break;
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

  if (window.__stStore) {
    const s = window.__stStore;
    const activeLorebookIds = s.settings?.activeLorebookIds || [];
    const activeBooks = s.lorebooks.filter(b => activeLorebookIds.includes(b.id));
    const chat = s.activeChat;

    let entriesHtml = '';
    if (activeBooks.length > 0) {
      let allEntries = [];
      activeBooks.forEach(book => {
        book.entries.forEach(e => allEntries.push({ entry: e, bookName: book.name }));
      });
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
    } else if (!s.initialized) {
      entriesHtml = '<div class="ctx-item"><div class="ctx-item-body" style="color:var(--fg-quaternary)">正在加载世界书…</div></div>';
    } else {
      entriesHtml = '<div class="ctx-item"><div class="ctx-item-body" style="color:var(--fg-quaternary)">暂无激活条目。在「世界书」管理中启用。</div></div>';
    }

    ctxBody.innerHTML = `
      <div>
        <div class="section-title">激活条目<span style="margin-left:auto; font-size: var(--fs-xs); color: var(--fg-quaternary); font-family: var(--font-mono);">${activeBooks.reduce((sum,b) => sum + b.entries.length, 0)} 条 | ${activeBooks.length} 本书</span></div>
        ${entriesHtml}
      </div>

      <div>
        <div class="section-title">即时状态</div>
        <div class="ctx-item" style="background: linear-gradient(180deg, rgba(255,107,154,0.06), rgba(106,85,214,0.04)); border-color: rgba(255,107,154,0.18);">
          <div class="ctx-item-head">
            <span class="ctx-item-name">${escapeHtml(s.settings?.characterName || 'AI')} 状态</span>
            <span class="badge badge-sakura">活跃</span>
          </div>
          <div class="ctx-item-body">当前活跃对话</div>
          <div class="ctx-item-meta" style="margin-top: var(--sp-3);">
            <span>${chat ? chat.messages.length + ' 条消息' : '无活跃对话'}</span>
            <span class="ctx-item-meta-dot"></span>
            <span>预设: </span><button id="ctx-open-presets" style="all:unset;cursor:pointer;color:var(--fg-tertiary);text-decoration:underline;text-underline-offset:2px;" title="管理预设">${escapeHtml(s.activePreset?.name || '默认')}</button>
          </div>
        </div>
        <div class="ctx-item" style="margin-top: var(--sp-4);">
          <div class="ctx-item-head">
            <span class="ctx-item-name">API 状态</span>
            <span class="badge badge-${s.settings?.api?.apiKey ? 'sakura' : 'amber'}">${s.settings?.api?.apiKey ? '已配置' : '未配置'}</span>
          </div>
          <div class="ctx-item-body">${s.settings?.api?.apiKey ? `模型: ${escapeHtml(s.settings.api.model)} | ${escapeHtml(s.settings.api.baseUrl)}` : '请在设置中配置 API Key 以启用 AI 对话。'}</div>
        </div>
      </div>
    `;
  } else {
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
window.__updateCtxPane = renderCtxPane;

ctxClose.addEventListener('click', () => shell.classList.toggle('ctx-collapsed'));
ctxToggle.addEventListener('click', () => shell.classList.toggle('ctx-collapsed'));

// 预设入口 — 用事件委托因为 renderCtxPane 会重建 DOM
ctxBody.addEventListener('click', (e) => {
  if (e.target.id === 'ctx-open-presets') {
    openPresets();
  }
});

// —— 顶栏其它按钮 —— //
document.getElementById('new-turn').addEventListener('click', async () => {
  if (window.__stStore) {
    const s = window.__stStore;
    const count = s.chats.filter(c => c.characterName === s.settings?.characterName).length;
    await s.createChat(`${s.settings?.characterName || 'AI'} - 新对话 ${count + 1}`);
    GameNotify.success('已开启新一轮', '场景已暂存于编年志中。');
  } else {
    GameNotify.success('已开启新一轮', '场景已暂存于编年志中。');
  }
});

document.getElementById('settings-btn').addEventListener('click', () => {
  openSettings();
});

document.getElementById('theme-btn').addEventListener('click', () => {
  document.body.classList.toggle('theme-light');
  GameNotify.info('主题', '尚仅支持暮色与晨光二式。', { duration: 2200 });
});

document.getElementById('archive-btn').addEventListener('click', async () => {
  if (window.__stStore) {
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

document.getElementById('lorebook-btn').addEventListener('click', () => {
  openLorebooks();
});
document.getElementById('lorebook-nav-btn').addEventListener('click', () => {
  openLorebooks();
});

document.getElementById('preset-btn').addEventListener('click', () => {
  openPresets();
});
document.getElementById('preset-nav-btn').addEventListener('click', () => {
  openPresets();
});

// Handle sidebar nav items that don't go through data-modal dispatch
document.getElementById('lorebook-nav-btn')?.addEventListener('click', function () {
  this.classList.add('is-active');
  setTimeout(() => this.classList.remove('is-active'), 280);
});
document.getElementById('preset-nav-btn')?.addEventListener('click', function () {
  this.classList.add('is-active');
  setTimeout(() => this.classList.remove('is-active'), 280);
});

// —— 全局快捷键 —— //
document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea')) return;
  const k = e.key.toLowerCase();
  const map = { f: 'facilities', o: 'organizations', r: 'roster', c: 'courses', d: 'rules-editor', a: 'form-editor', e: 'rules-reader', t: 'todo', s: 'script-editor', v: 'variable-manager', p: 'prompt-viewer' };
  if (map[k]) {
    const item = document.querySelector(`.nav-item[data-modal="${map[k]}"]`);
    if (item) item.click();
  }
  if (e.ctrlKey && k === 'k') {
    e.preventDefault();
    openSettings();
  }
});

// —— Initialize SillyTavern Store —— //
(async function initStore() {
  try {
    window.__stStore = store;

    // Load from IndexedDB
    await store.loadAll();

    // Apply DeepSeek API config if not already configured
    if (!store.settings?.api?.apiKey || store.settings?.api?.baseUrl === 'https://api.openai.com/v1') {
      await store.updateSettings({ api: { ...store.settings?.api, ...DEEPSEEK_CONFIG } });
      console.log('[SillyTavern] API configured for DeepSeek');
    }

    // Always keep format prompt template up to date
    const { DEFAULT_FORMAT_PROMPT } = await import('./sillytavern/types.js');
    if (store.settings?.formatPromptTemplate !== DEFAULT_FORMAT_PROMPT) {
      await store.updateSettings({ formatPromptTemplate: DEFAULT_FORMAT_PROMPT });
      console.log('[SillyTavern] Format prompt template updated');
    }

    // Seed lorebook entries (变量更新规则, 变量列表, 系统规则, 初始变量)
    await seedLorebooksIfNeeded(store);

    // Create first chat with initial variables if none exist
    if (!store.activeChatId) {
      const chatId = await store.createChat('序章 · 樱丘大学');
      injectVariablesIntoChat(store, chatId);
    } else {
      const chat = store.activeChat;
      if (chat && (!chat.variables || Object.keys(chat.variables).length === 0)) {
        injectVariablesIntoChat(store, chat.id);
      }
    }

    // One-time: reset test messages and re-inject fresh variables
    const RESET_KEY = 'sakurasu.chat.reset.v3';
    if (!localStorage.getItem(RESET_KEY)) {
      const chat = store.activeChat;
      if (chat && chat.messages?.length > 0) {
        await store._db.table('chats').put({ ...chat, messages: [], variables: {}, updatedAt: Date.now() });
        store.chats = store.chats.map(c => c.id === chat.id ? { ...c, messages: [], variables: {} } : c);
        injectVariablesIntoChat(store, chat.id);
        console.log('[SillyTavern] Chat messages reset, variables re-injected');
      }
      localStorage.setItem(RESET_KEY, '1');
    }

    // Init bridge for live variable display
    initBridge(store);
    console.log('[bridge] Live variable bridge initialized');

    // Sync NPCs already in variable store to GameData (for sidebar roster)
    if (store.activeChat?.variables) {
      syncNpcsToGameData(store.activeChat.variables);
    }

    // Wire up ctx-pane refresh — skip during streaming to avoid jitter
    let _ctxUpdatePending = false;
    store.subscribe(() => {
      if (!window.__updateCtxPane) return;
      // Skip during active streaming; update once when streaming ends
      if (store.streamState?.isStreaming) {
        if (!_ctxUpdatePending) {
          _ctxUpdatePending = true;
        }
        return;
      }
      if (_ctxUpdatePending || !store._lastCtxRender) {
        _ctxUpdatePending = false;
        window.__updateCtxPane();
        store._lastCtxRender = true;
      }
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
      ? '今日下午 16:42 · 旧馆图书室。请「设置 → 主 API」配置 API Key 以启用 AI 对话。'
      : '今日下午 16:42 · 旧馆图书室。会长正等待你的回应。',
    kind: 'info',
    duration: 6000,
    actions: [
      { label: storeReady ? '打开设置' : '查看场景', onClick: () => {
        if (storeReady) { openSettings(); }
        else { GameFacilities && GameFacilities.open(); }
      } },
      { label: '我知道了', onClick: () => {} },
    ],
  });
}, 800);

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }
