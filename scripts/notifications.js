/* scripts/notifications.js — 内置通知与对话框 */
(function () {
  const host = document.getElementById('toast-host');

  function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }

  function notify(opts) {
    const {
      title = '提示',
      text = '',
      kind = 'info',
      duration = 5000,
      actions = [],
    } = opts;

    const t = el('div', `toast toast-${kind}`);
    t.style.setProperty('--toast-dur', duration + 'ms');
    const iconKey = ({ info: 'info', success: 'success', warn: 'warn', error: 'error' })[kind] || 'info';

    t.innerHTML = `
      <div class="toast-icon">${GameIcons.get(iconKey)}</div>
      <div class="toast-body">
        <div class="toast-title"></div>
        <div class="toast-text"></div>
      </div>
      <button class="toast-close" aria-label="关闭">${GameIcons.get('close')}</button>
      <div class="toast-progress"><span></span></div>
    `;
    t.querySelector('.toast-title').textContent = title;
    t.querySelector('.toast-text').textContent = text;

    if (actions.length) {
      const row = el('div', 'toast-actions');
      actions.forEach(a => {
        const b = el('button', 'toast-action-btn');
        b.textContent = a.label;
        b.addEventListener('click', () => { try { a.onClick?.(); } finally { remove(); } });
        row.appendChild(b);
      });
      t.querySelector('.toast-body').appendChild(row);
    }

    host.appendChild(t);

    let timer = null;
    function remove() {
      if (!t.isConnected) return;
      t.classList.add('is-leaving');
      clearTimeout(timer);
      setTimeout(() => t.remove(), 220);
    }
    t.querySelector('.toast-close').addEventListener('click', remove);
    if (duration > 0) timer = setTimeout(remove, duration);

    return { close: remove };
  }

  // 简化操作
  const api = {
    show: notify,
    info: (title, text, opts={}) => notify({ ...opts, title, text, kind: 'info' }),
    success: (title, text, opts={}) => notify({ ...opts, title, text, kind: 'success' }),
    warn: (title, text, opts={}) => notify({ ...opts, title, text, kind: 'warn' }),
    error: (title, text, opts={}) => notify({ ...opts, title, text, kind: 'error' }),
  };
  window.GameNotify = api;
})();
