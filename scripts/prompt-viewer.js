/* scripts/prompt-viewer.js — 提示词查看器 */
(function () {
  let modal = null;

  function getStore() { return window.__stStore; }

  function open() {
    const store = getStore();
    if (!store || !store.settings?.api?.apiKey) {
      GameNotify.warn('未配置 API', '请先在设置中配置 API Key。');
      return;
    }

    const chat = store.activeChat;
    const activeLorebookIds = new Set(store.settings?.activeLorebookIds ?? []);
    const activeBooks = store.lorebooks.filter(l => activeLorebookIds.has(l.id));

    const historyCount = chat?.messages?.length || 0;
    const lorebookCount = activeBooks.reduce((s, b) => s + b.entries.length, 0);

    let messagesHtml = '';
    if (store._lastMessages) {
      messagesHtml = store._lastMessages.map((m, i) => {
        const roleColors = { system: 'var(--wisteria-300)', user: 'var(--accent)', assistant: 'var(--sakura-300)' };
        const color = roleColors[m.role] || 'var(--fg-quaternary)';
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        const estimatedTokens = Math.round(content.length / 4);
        return `
          <div style="margin-bottom:8px;border:1px solid var(--border-soft);border-radius:6px;overflow:hidden;">
            <div style="display:flex;align-items:center;gap:8px;padding:4px 10px;background:rgba(255,255,255,0.02);border-bottom:1px solid var(--border-soft);">
              <span style="color:${color};font-weight:600;font-size:11px;text-transform:uppercase;">${m.role}</span>
              <span style="color:var(--fg-quaternary);font-size:10px;">#${i + 1}</span>
              <span style="margin-left:auto;color:var(--fg-quaternary);font-size:10px;">~${estimatedTokens} tokens</span>
            </div>
            <pre style="margin:0;padding:8px 10px;font-size:12px;line-height:1.5;color:var(--fg-secondary);white-space:pre-wrap;word-break:break-word;font-family:var(--font-mono);max-height:200px;overflow-y:auto;">${esc(content)}</pre>
          </div>
        `;
      }).join('');
    }

    let totalTokens = 0;
    if (store._lastMessages) {
      totalTokens = Math.round(store._lastMessages.reduce((s, m) => s + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length), 0) / 4);
    }

    modal = GameModal.open({
      size: 'lg', icon: 'eye',
      title: '提示词查看器',
      subtitle: `当前对话 · ${historyCount} 条历史 · ${lorebookCount} 条世界条目 · ~${totalTokens} tokens`,
      body: `
        <div style="padding:16px;">
          ${messagesHtml || '<div style="padding:40px;text-align:center;color:var(--fg-quaternary);">尚未发送过消息。发送一条消息后将在此显示提示词结构。</div>'}
          ${store._lastMessages ? `
            <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
              <button class="chip-btn" id="pv-copy">复制完整提示词</button>
              <button class="chip-btn chip-btn-primary" id="pv-refresh">刷新</button>
            </div>
          ` : ''}
        </div>
      `,
    });

    document.getElementById('pv-copy')?.addEventListener('click', () => {
      const text = store._lastMessages
        ? store._lastMessages.map(m => `[${m.role}]\n${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n\n')
        : '';
      navigator.clipboard?.writeText(text);
      GameNotify.success('已复制', '完整提示词已复制到剪贴板。');
    });

    document.getElementById('pv-refresh')?.addEventListener('click', () => {
      modal?.close?.();
      open();
    });
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

  window.GamePromptViewer = { open };
})();
