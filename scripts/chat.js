/* scripts/chat.js — 对话流注入与输入处理 (SillyTavern v3 integrated) */
(function () {
  const stream = document.getElementById('chat-stream');
  const input = document.getElementById('composer-input');
  const sendBtn = document.getElementById('composer-send');
  const counter = document.getElementById('char-counter');
  const prefix = document.getElementById('composer-prefix');
  const dice = document.getElementById('dice-btn');

  let store = null; // assigned when store is ready

  // —— 初始 seed 对话（数据库为空时展示） —— //
  const seedTurns = [
    { type: 'divider', text: '序章 · 旧馆图书室' },
    { type: 'narration', html: '<em>放学后的旧馆图书室，木质百叶斜切下午的光。</em><br>你与会长之间隔着一张矮书桌，她正翻阅一份社团申请。' },
    { type: 'msg', who: '一之濑 千夏', role: '学生会会长 · 高三 一组', tone: 'sakura', avatar: '千', from: 'npc', time: '16:42',
      content: `
        <p>「<span class="kw">钟楼天台通行</span>这一栏，你写得有些含糊呢。」</p>
        <p>她抬眼看你，指尖点在你递交的申请书上。<span class="action">（窗外有一只黄莺在啼。）</span></p>
        <div class="rule-cite">
          <div class="rule-cite-tag">规章 · 校规 §3.7</div>
          <div>夜间登台需注明同行者及具体事由。三人以上同行须由风纪委另出具陪同记录。</div>
        </div>
      `,
      options: [
        { id: 'opt-1', text: '解释一下事由', icon: 'pen' },
        { id: 'opt-2', text: '修改申请', icon: 'edit' },
        { id: 'opt-3', text: '保持沉默', icon: 'feather' },
      ],
    },
  ];

  // Cache for the GameIcons reference (set by icons.js)
  function icon(name) {
    return (typeof GameIcons !== 'undefined' && GameIcons.get) ? GameIcons.get(name) : '';
  }

  function renderAll() {
    stream.innerHTML = '';
    let messages = [];

    if (store && store.activeChat && store.activeChat.messages && store.activeChat.messages.length > 0) {
      messages = store.activeChat.messages;
    } else {
      // Seed
      seedTurns.forEach(t => stream.appendChild(buildTurn(t)));
      return;
    }

    // Render divider
    const chatName = store.activeChat?.name || '';
    const d = document.createElement('div');
    d.className = 'chat-divider';
    d.innerHTML = `<span class="chat-divider-line"></span><span class="chat-divider-text">${escapeHtml(chatName)}</span><span class="chat-divider-line"></span>`;
    stream.appendChild(d);

    // Group consecutive messages to show story flow
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const turn = buildTurnFromMsg(msg, i);
      if (turn) stream.appendChild(turn);

      // Show streaming content if in progress (only for last assistant message being built)
      if (store.streamState && store.streamState.isStreaming && i === messages.length - 1 && msg.role === 'assistant') {
        const liveBubble = buildStreamingBubble();
        if (liveBubble) stream.appendChild(liveBubble);
      }
    }

    // If streaming but no assistant message appended yet (first reply)
    if (store.streamState && store.streamState.isStreaming && (!messages.length || messages[messages.length-1].role !== 'assistant')) {
      const liveBubble = buildStreamingBubble();
      if (liveBubble) stream.appendChild(liveBubble);
    }

    requestAnimationFrame(() => { scrollDown(); });
  }

  function buildStreamingBubble() {
    const ss = store.streamState;
    if (!ss || !ss.isStreaming) return null;
    const b = document.createElement('div');
    b.className = 'bubble from-npc';
    let contentHtml = '';

    if (ss.thinking && store.settings?.thinkingDisplay !== 'hide') {
      const foldOpen = store.settings?.thinkingDisplay === 'inline';
      contentHtml += `<details class="st-thinking-fold" ${foldOpen ? 'open' : ''}><summary class="st-thinking-summary"><em>思考过程…</em></summary><div class="st-thinking-body">${escapeHtml(ss.thinking).replace(/\n/g, '<br>')}</div></details>`;
    }
    if (ss.maintext) {
      contentHtml += `<div class="st-maintext">${escapeHtml(ss.maintext).replace(/\n/g, '<br>')}</div>`;
    }
    if (ss.options && ss.options.length > 0) {
      contentHtml += `<div class="bubble-options st-option-list">${ss.options.map(o => `<button class="option-chip st-option-chip"><span>${escapeHtml(o)}</span></button>`).join('')}</div>`;
    }
    if (!contentHtml) {
      contentHtml = '<div class="bubble-typing"><span></span><span></span><span></span></div>';
    }

    b.innerHTML = `
      <div class="bubble-avatar tone-sakura">AI</div>
      <div class="bubble-body">
        <div class="bubble-meta"><span class="bubble-name">${escapeHtml(store.settings?.characterName || 'AI')}</span><span class="bubble-role">· 生成中</span></div>
        <div class="bubble-content">${contentHtml}</div>
      </div>
    `;
    return b;
  }

  function buildTurnFromMsg(msg, idx) {
    if (msg.role === 'system') return null;

    const avatarChar = msg.role === 'user' ? (store?.settings?.userName || '你').charAt(0) : (store?.settings?.characterName || 'AI').charAt(0);
    const whoName = msg.role === 'user' ? (store?.settings?.userName || '你') : (store?.settings?.characterName || 'AI');
    const tone = msg.role === 'user' ? 'ink' : 'sakura';
    const from = msg.role === 'user' ? 'me' : 'npc';
    const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    const b = document.createElement('div');
    b.className = `bubble ${from === 'me' ? 'from-user' : 'from-npc'}`;

    let bodyHtml = '';

    // Check for parsed tags (v3 game mode)
    const parsed = msg.parsed || {};

    // Thinking fold
    if (parsed.thinking && store?.settings?.thinkingDisplay !== 'hide') {
      const foldOpen = store?.settings?.thinkingDisplay === 'inline';
      bodyHtml += `<details class="st-thinking-fold" ${foldOpen ? 'open' : ''}><summary class="st-thinking-summary"><em>思考过程</em></summary><div class="st-thinking-body">${escapeHtml(parsed.thinking).replace(/\n/g, '<br>')}</div></details>`;
    }

    // Main text
    const mainText = parsed.maintext || msg.content || '';
    if (mainText) {
      bodyHtml += `<div class="st-maintext">${escapeHtml(mainText).replace(/\n/g, '<br>')}</div>`;
    }

    // Options (parsed from <option> tag)
    const options = parsed.options || [];
    if (options.length > 0) {
      bodyHtml += `<div class="bubble-options st-option-list">${options.map(o => {
        const trimmed = String(o).trim();
        if (!trimmed) return '';
        return `<button class="option-chip st-option-chip" data-send="${escapeHtml(trimmed)}"><span>${escapeHtml(trimmed)}</span></button>`;
      }).join('')}</div>`;
    }

    // Sum
    if (parsed.sum) {
      bodyHtml += `<details class="st-sum-fold"><summary>总结</summary><p>${escapeHtml(parsed.sum)}</p></details>`;
    }

    // Variables display
    const vars = msg.variables || msg.variablesAfter;
    if (vars && Object.keys(vars).length > 0) {
      const varEntries = Object.entries(vars).slice(0, 5);
      bodyHtml += `<div class="st-vars-inline" style="margin-top:8px;font-size:11px;color:var(--fg-quaternary);">${varEntries.map(([k,v]) => `<span style="margin-right:12px">${escapeHtml(k)}: ${escapeHtml(String(v))}</span>`).join('')}</div>`;
    }

    b.innerHTML = `
      <div class="bubble-avatar tone-${tone}">${escapeHtml(avatarChar)}</div>
      <div class="bubble-body">
        <div class="bubble-meta">
          <span class="bubble-name">${escapeHtml(whoName)}</span>
          ${msg.role !== 'user' ? `<span class="bubble-role">· ${escapeHtml(store?.settings?.characterName || '')}</span>` : ''}
          <span class="bubble-time">${time}</span>
        </div>
        <div class="bubble-content">
          ${bodyHtml}
          <div class="bubble-actions">
            <button class="bubble-action" data-tip="复制" data-action="copy" data-msg-id="${msg.id}">${icon('copy')}</button>
            <button class="bubble-action" data-tip="重新生成" data-action="regenerate" data-msg-id="${msg.id}">${icon('refresh')}</button>
            <button class="bubble-action" data-tip="跳转至此" data-action="jump" data-msg-id="${msg.id}">${icon('edit')}</button>
          </div>
        </div>
      </div>
    `;

    return b;
  }

  function buildTurn(turn) {
    if (turn.type === 'divider') {
      const d = document.createElement('div');
      d.className = 'chat-divider';
      d.innerHTML = `<span class="chat-divider-line"></span><span class="chat-divider-text">${turn.text}</span><span class="chat-divider-line"></span>`;
      return d;
    }
    if (turn.type === 'narration') {
      const n = document.createElement('div');
      n.className = 'bubble narration';
      n.innerHTML = turn.html;
      return n;
    }
    if (turn.type === 'msg') {
      const b = document.createElement('div');
      b.className = `bubble ${turn.from === 'me' ? 'from-user' : 'from-npc'}`;
      const optHtml = turn.options ? `
        <div class="bubble-options">
          ${turn.options.map(o => `<button class="option-chip" data-send="${escapeHtml(o.text)}">${icon(o.icon || 'sparkle')}<span>${o.text}</span></button>`).join('')}
        </div>` : '';
      b.innerHTML = `
        <div class="bubble-avatar tone-${turn.tone}">${turn.avatar}</div>
        <div class="bubble-body">
          <div class="bubble-meta">
            <span class="bubble-name">${turn.who}</span>
            <span class="bubble-role">· ${turn.role}</span>
            <span class="bubble-time">${turn.time}</span>
          </div>
          <div class="bubble-content">
            ${turn.content}
            ${optHtml}
          </div>
        </div>
      `;
      return b;
    }
    return document.createDocumentFragment();
  }

  // —— 模式切换 —— //
  document.querySelectorAll('.mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-tab').forEach(b => {
        b.classList.remove('is-active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-selected', 'true');
      const mode = btn.getAttribute('data-mode');
      const map = { say: '说', act: '做', think: '思', cmd: '令' };
      const ph = {
        say: '向旧馆图书室的人或物说点什么……',
        act: '描述你的动作，例如「轻轻把诗集放在桌上」……',
        think: '记下你的内心独白……（仅你与系统可见）',
        cmd: '/form apply 钟楼天台通行  ·  /rule show 校规  ·  /flow next',
      };
      prefix.textContent = map[mode] || '说';
      input.placeholder = ph[mode];
    });
  });

  // —— 输入框 —— //
  function autoSize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
    counter.textContent = String(input.value.length);
  }
  input.addEventListener('input', autoSize);

  function send() {
    const v = input.value.trim();
    if (!v) {
      if (typeof GameNotify !== 'undefined') GameNotify.warn('请先写点什么', '在文字将出现之前，沉默亦是一种声音。');
      return;
    }
    const mode = document.querySelector('.mode-tab.is-active').getAttribute('data-mode');

    // If store is ready, use real LLM
    if (store && store.activeChat && store.settings?.api?.apiKey) {
      const tag = ({ say: '对话', act: '动作', think: '内心', cmd: '命令' })[mode];
      let content = v;
      if (mode === 'act') content = `（${v}）`;
      else if (mode === 'think') content = `【内心】${v}`;
      else if (mode === 'cmd') content = `/${v}`;

      store.sendGameMessage(content).catch(err => {
        if (typeof GameNotify !== 'undefined') GameNotify.error('发送失败', err.message);
      });
    } else {
      // Fallback: append to DOM directly (legacy behavior, no API configured)
      const tag = ({ say: '对话', act: '动作', think: '内心', cmd: '命令' })[mode];
      const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      const html = mode === 'cmd'
        ? `<p style="font-family:var(--font-mono); color:var(--wisteria-200);">${escapeHtml(v)}</p>`
        : mode === 'think'
        ? `<p class="inner">${escapeHtml(v)}</p>`
        : mode === 'act'
        ? `<p><span class="action">（${escapeHtml(v)}）</span></p>`
        : `<p>${escapeHtml(v)}</p>`;
      const msg = buildTurn({
        type: 'msg', from: 'me', tone: 'ink', avatar: '汝',
        who: '主人公', role: '高二 三组 · 文部',
        time, content: html,
      });
      stream.appendChild(msg);

      if (typeof GameNotify !== 'undefined') GameNotify.info(`${tag}已发出`, '请在设置中配置 API Key 以启用 AI 回复。');
    }

    input.value = '';
    autoSize();
    scrollDown();
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  dice.addEventListener('click', () => {
    const n = 1 + Math.floor(Math.random() * 20);
    if (typeof GameNotify !== 'undefined') GameNotify.info(`掷出 d20 · ${n}`, n >= 17 ? '风顺。' : n >= 10 ? '尚可。' : n >= 6 ? '稍困。' : '逆风。', { duration: 3200 });
  });

  // —— 建议 pill —— //
  document.querySelectorAll('.suggest-pill').forEach(p => {
    p.addEventListener('click', () => {
      input.value = p.getAttribute('data-fill') || p.textContent.trim();
      autoSize();
      input.focus();
    });
  });

  // —— 选项点击 —— //
  stream.addEventListener('click', e => {
    const opt = e.target.closest('.option-chip');
    if (opt) {
      const sendVal = opt.getAttribute('data-send');
      if (sendVal) {
        store?.sendGameMessage(sendVal);
        return;
      }
      const span = opt.querySelector('span');
      const text = span ? span.textContent : '';
      if (text) {
        if (store && store.activeChat) {
          store.sendGameMessage(text);
        } else {
          input.value = text;
          autoSize();
          input.focus();
        }
      }
      return;
    }

    // Bubble action buttons
    const actionBtn = e.target.closest('.bubble-action');
    if (actionBtn) {
      const msgId = actionBtn.getAttribute('data-msg-id');
      const action = actionBtn.getAttribute('data-action');
      if (action === 'regenerate' && msgId && store) {
        store.jumpToFloor(msgId).then(() => store.regenerateLast());
      } else if (action === 'jump' && msgId && store) {
        store.jumpToFloor(msgId);
        if (typeof GameNotify !== 'undefined') GameNotify.info('已跳转', '后续消息已隐藏，可继续对话。');
      } else if (action === 'copy' && msgId && store) {
        const target = store.activeChat?.messages?.find(m => m.id === msgId);
        if (target) {
          const text = target.parsed?.maintext || target.content || '';
          navigator.clipboard?.writeText(text);
          if (typeof GameNotify !== 'undefined') GameNotify.success('已复制', '');
        }
      }
    }
  });

  function scrollDown() {
    requestAnimationFrame(() => {
      stream.parentElement.scrollTop = stream.parentElement.scrollHeight;
    });
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

  // —— Initialize from store —— //
  window.__initSillyChat = function (_store) {
    store = _store;
    renderAll();
    // Subscribe to store changes
    store.subscribe(() => {
      renderAll();
    });
    // Update ctx tags
    updateCtxTags();
  };

  function updateCtxTags() {
    const lorebookTag = document.querySelector('.ctx-tag:nth-child(1) span');
    if (lorebookTag && store) {
      const count = store.settings?.activeLorebookIds?.length ?? 0;
      lorebookTag.textContent = `世界书 · ${count}`;
    }
  }

  // Initial render (seed)
  renderAll();
})();
