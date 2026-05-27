/* scripts/chat.js — 小说式对话流与输入处理 (SillyTavern v3 integrated) */
(function () {
  const stream = document.getElementById('chat-stream');
  const input = document.getElementById('composer-input');
  const sendBtn = document.getElementById('composer-send');
  const counter = document.getElementById('char-counter');
  const suggest = document.getElementById('chat-suggest');
  const suggestPills = document.getElementById('suggest-pills');

  let store = null;

  // —— 初始 seed 对话 —— //
  const seedTurns = [
    { type: 'divider', text: '序章 · 樱丘大学校门口' },
    { type: 'narration', html: '<em>四月早晨的风还带着凉意。你站在樱丘大学的正门前，樱花色地砖在脚下铺展，中央石碑刻着「求真、自律、开放」。</em><br>校门内侧站着一个人——黑发低马尾，左臂戴着学生会臂章。' },
    { type: 'msg', who: '绫濑 雪乃', role: '学生会会长 · 大二', tone: 'wisteria', from: 'npc',
      content: `
        <p>「你就是<strong>程励行</strong>同学吧。我是绫濑雪乃，学生会会长。」</p>
        <p>她翻动手中的文件夹，语气平稳得像在读一份实验说明。<span class="action">（那双眼睛在评估你——冷静，但并非冷漠。）</span></p>
        <p>「樱丘大学过去只招收女性。你是文部科学省特批的第一例男性学生。这意味着全校的课程体系、社团活动、甚至保健室的体检流程，都将因为你而产生新的变量。」</p>
        <p>她合上文件夹，朝你微微颔首。<span class="action">（校门口的樱花落在她的肩章上。）</span></p>
        <p>「欢迎来到樱丘大学。接下来的四年，请多关照。」</p>
      `,
    },
  ];

  function icon(name) {
    return (typeof GameIcons !== 'undefined' && GameIcons.get) ? GameIcons.get(name) : '';
  }

  // —— Parse w2g options from text —— //
  function parseW2g(text) {
    const match = text.match(/<w2g>([\s\S]*?)<\/w2g>/i);
    if (!match) return { cleanText: text, options: [] };
    const options = parseW2gOptions(match[1]);
    const cleanText = text.replace(/<w2g>[\s\S]*?<\/w2g>/gi, '').trim();
    return { cleanText, options };
  }

  // Parse raw w2g content (text between <w2g> and </w2g>)
  function parseW2gOptions(raw) {
    const lines = raw.trim().split(/\r?\n/).filter(l => l.trim());
    const options = [];
    for (const line of lines) {
      const m = line.trim().match(/^([A-Z])[：:]\s*(.+)$/);
      if (m) {
        const label = m[1];
        const rest = m[2];
        const colonIdx = rest.indexOf('：');
        if (colonIdx === -1) {
          options.push({ label, title: '', content: rest });
        } else {
          options.push({
            label,
            title: rest.slice(0, colonIdx),
            content: rest.slice(colonIdx + 1),
          });
        }
      }
    }
    return options;
  }

  // —— Populate suggestion bar —— //
  function updateSuggestions(options) {
    if (!suggest || !suggestPills) return;
    suggestPills.innerHTML = '';
    if (!options || options.length === 0) {
      suggest.style.display = 'none';
      return;
    }
    suggest.style.display = 'flex';
    for (const opt of options) {
      const pill = document.createElement('button');
      pill.className = 'suggest-pill';
      const text = opt.title ? `${opt.title}：${opt.content}` : opt.content;
      pill.setAttribute('data-send', text);
      pill.setAttribute('data-label', opt.label);
      pill.textContent = `${opt.label} · ${text}`;
      suggestPills.appendChild(pill);
    }
  }

  // —— Render all messages —— //
  let _lastMsgCount = -1;
  let _lastStreaming = false;

  function renderAll() {
    const isStreaming = !!(store && store.streamState && store.streamState.isStreaming);
    const msgCount = store?.activeChat?.messages?.length || 0;

    // During streaming, skip full DOM rebuild — only update the live bubble
    if (isStreaming && _lastStreaming && msgCount === _lastMsgCount && msgCount > 0) {
      updateLiveStreamingBubble();
      requestAnimationFrame(() => { scrollDown(); });
      return;
    }
    _lastMsgCount = msgCount;
    _lastStreaming = isStreaming;

    stream.innerHTML = '';
    let messages = [];
    let lastW2gOptions = null;

    if (store && store.activeChat && store.activeChat.messages && store.activeChat.messages.length > 0) {
      messages = store.activeChat.messages;
    } else {
      seedTurns.forEach(t => stream.appendChild(buildTurn(t)));
      updateSuggestions(null);
      return;
    }

    // Render divider
    const chatName = store.activeChat?.name || '';
    const d = document.createElement('div');
    d.className = 'chat-divider';
    d.innerHTML = `<span class="chat-divider-line"></span><span class="chat-divider-text">${escapeHtml(chatName)}</span><span class="chat-divider-line"></span>`;
    stream.appendChild(d);

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const turn = buildTurnFromMsg(msg, i);
      if (turn) {
        stream.appendChild(turn);
        // Extract w2g from last assistant message for suggestions
        if (msg.role === 'assistant') {
          if (msg.parsed?.w2g) {
            const w2gOpts = parseW2gOptions(msg.parsed.w2g);
            if (w2gOpts.length > 0) lastW2gOptions = w2gOpts;
          } else {
            const parsed = parseW2g(msg.content || '');
            if (parsed.options.length > 0) lastW2gOptions = parsed.options;
          }
        }
      }

      // Live streaming bubble
      if (store.streamState && store.streamState.isStreaming && i === messages.length - 1 && msg.role === 'assistant') {
        const liveBubble = buildStreamingBubble();
        if (liveBubble) stream.appendChild(liveBubble);
      }
    }

    // First assistant reply streaming
    if (store.streamState && store.streamState.isStreaming && (!messages.length || messages[messages.length-1].role !== 'assistant')) {
      const liveBubble = buildStreamingBubble();
      if (liveBubble) stream.appendChild(liveBubble);
    }

    // Update suggestion bar from last assistant
    updateSuggestions(lastW2gOptions);

    requestAnimationFrame(() => { scrollDown(); });
  }

  // Lightweight in-place update of the live streaming bubble (no full DOM rebuild)
  function updateLiveStreamingBubble() {
    const existing = stream.querySelector('.bubble.live-streaming');
    const newBubble = buildStreamingBubble();
    if (existing && newBubble) {
      existing.replaceWith(newBubble);
    } else if (existing && !newBubble) {
      existing.remove();
    } else if (!existing && newBubble) {
      stream.appendChild(newBubble);
    }
  }

  function buildStreamingBubble() {
    const ss = store.streamState;
    if (!ss || !ss.isStreaming) return null;
    const b = document.createElement('div');
    b.className = 'bubble from-npc live-streaming';
    let contentHtml = '';

    if (ss.thinking && store.settings?.thinkingDisplay !== 'hide') {
      const foldOpen = store.settings?.thinkingDisplay === 'inline';
      contentHtml += `<details class="st-thinking-fold" ${foldOpen ? 'open' : ''}><summary class="st-thinking-summary"><em>思考过程…</em></summary><div class="st-thinking-body">${escapeHtml(ss.thinking).replace(/\n/g, '<br>')}</div></details>`;
    }
    if (ss.maintext) {
      contentHtml += `<div class="st-maintext">${escapeHtml(ss.maintext).replace(/\n/g, '<br>')}</div>`;
    }
    // Parse live w2g suggestions from stream state
    if (ss.w2gRaw) {
      const w2gOpts = parseW2gOptions(ss.w2gRaw);
      if (w2gOpts.length > 0) updateSuggestions(w2gOpts);
    }
    if (!contentHtml) {
      contentHtml = '<div class="bubble-typing"><span></span><span></span><span></span></div>';
    }

    b.innerHTML = `
      <div class="bubble-content">${contentHtml}</div>
    `;
    return b;
  }

  function buildTurnFromMsg(msg, idx) {
    if (msg.role === 'system') return null;

    const fromCls = msg.role === 'user' ? 'from-user' : 'from-npc';

    const b = document.createElement('div');
    b.className = `bubble ${fromCls}`;

    let bodyHtml = '';
    const parsed = msg.parsed || {};

    // Thinking fold
    if (parsed.thinking && store?.settings?.thinkingDisplay !== 'hide') {
      const foldOpen = store?.settings?.thinkingDisplay === 'inline';
      bodyHtml += `<details class="st-thinking-fold" ${foldOpen ? 'open' : ''}><summary class="st-thinking-summary"><em>思考过程</em></summary><div class="st-thinking-body">${escapeHtml(parsed.thinking).replace(/\n/g, '<br>')}</div></details>`;
    }

    // Main text with w2g stripped
    const rawText = parsed.maintext || msg.content || '';
    const { cleanText } = parseW2g(rawText);
    if (cleanText) {
      bodyHtml += `<div class="st-maintext">${escapeHtml(cleanText).replace(/\n/g, '<br>')}</div>`;
    }

    // Sum
    if (parsed.sum) {
      bodyHtml += `<details class="st-sum-fold"><summary>总结</summary><p>${escapeHtml(parsed.sum)}</p></details>`;
    }

    b.innerHTML = `
      <div class="bubble-content">
        ${bodyHtml}
        <div class="bubble-actions">
          <button class="bubble-action" data-tip="复制" data-action="copy" data-msg-id="${msg.id}">${icon('copy')}</button>
          <button class="bubble-action" data-tip="重新生成" data-action="regenerate" data-msg-id="${msg.id}">${icon('refresh')}</button>
          <button class="bubble-action" data-tip="跳转至此" data-action="jump" data-msg-id="${msg.id}">${icon('edit')}</button>
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
      b.innerHTML = `
        <div class="bubble-content">
          ${turn.content}
        </div>
      `;
      return b;
    }
    return document.createDocumentFragment();
  }

  // —— 输入框 —— //
  function autoSize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
    if (counter) counter.textContent = String(input.value.length);
  }
  input.addEventListener('input', autoSize);

  async function send() {
    const v = input.value.trim();
    if (!v) {
      if (typeof GameNotify !== 'undefined') GameNotify.warn('请先写点什么', '在文字将出现之前，沉默亦是一种声音。');
      return;
    }

    // Slash command detection
    if (v.startsWith('/') && store) {
      input.value = '';
      autoSize();
      const result = await store.executeSlashCommand(v);
      if (result.handled) {
        if (result.output) {
          if (typeof GameNotify !== 'undefined') {
            GameNotify.info('命令', result.output, { duration: 3000 });
          }
        }
        return;
      }
      // Not a recognized command — restore input and send normally
      input.value = v;
      autoSize();
    }

    if (store && store.activeChat && store.settings?.api?.apiKey) {
      store.sendGameMessage(v).catch(err => {
        if (typeof GameNotify !== 'undefined') GameNotify.error('发送失败', err.message);
      });
    } else {
      // Fallback: append to DOM directly
      const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      const msg = buildTurn({
        type: 'msg', from: 'me', tone: 'ink',
        content: `<p>${escapeHtml(v)}</p>`,
      });
      stream.appendChild(msg);
      if (typeof GameNotify !== 'undefined') GameNotify.info('已发出', '请在设置中配置 API Key 以启用 AI 回复。');
    }

    input.value = '';
    autoSize();
    scrollDown();
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  // —— 建议 pill 点击 —— //
  if (suggestPills) {
    suggestPills.addEventListener('click', e => {
      const pill = e.target.closest('.suggest-pill');
      if (!pill) return;
      const sendVal = pill.getAttribute('data-send');
      if (sendVal) {
        if (store && store.activeChat) {
          store.sendGameMessage(sendVal);
        } else {
          input.value = sendVal;
          autoSize();
          input.focus();
        }
      }
    });
  }

  // —— 气泡内操作按钮 —— //
  stream.addEventListener('click', e => {
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
      return;
    }
  });

  function scrollDown() {
    requestAnimationFrame(() => {
      stream.parentElement.scrollTop = stream.parentElement.scrollHeight;
    });
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

  // —— Store initialization —— //
  window.__initSillyChat = function (_store) {
    store = _store;
    renderAll();
    store.subscribe(() => {
      renderAll();
    });
    updateCtxTags();
  };

  function updateCtxTags() {
    const locEl = document.getElementById('topbar-location');
    const timeEl = document.getElementById('topbar-time');
    const termEl = document.getElementById('topbar-term');

    if (!store) return;

    const vars = store.activeChat?.variables || window.__liveVariables;

    // Location
    if (locEl) {
      const loc = vars?.['当前地点'] || '旧馆图书室';
      locEl.textContent = loc;
    }

    // Time: 日期 + 时间
    if (timeEl) {
      const date = vars?.['当前时间']?.['日期'] || '4月7日-周一';
      const time = vars?.['当前时间']?.['时间'] || '上午07:30';
      timeEl.textContent = `${date} ${time}`;
    }

    // Term (use 当前时间.日期 to derive term if possible, else fallback)
    if (termEl) {
      termEl.textContent = '第二学期 · 第3周';
    }
  }

  // Initial render (seed)
  renderAll();
})();
