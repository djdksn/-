/* scripts/modal.js — 模态框宿主 */
window.GameModal = (function () {
  const host = document.getElementById('modal-host');
  let openCount = 0;

  function open({ size = 'md', title = '', subtitle = '', icon = '', headerExtra = '', body = '', footer = '', className = '', onClose, fullPane = false }) {
    const el = document.createElement('div');
    el.className = 'modal-frame';
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    el.appendChild(backdrop);

    const modal = document.createElement('div');
    modal.className = `modal modal-${size} ${className}`;
    modal.innerHTML = `
      <header class="modal-head">
        ${icon ? `<div class="modal-icon">${GameIcons.get(icon)}</div>` : ''}
        <div class="modal-title-block">
          <div class="modal-title">${title}</div>
          ${subtitle ? `<div class="modal-subtitle">${subtitle}</div>` : ''}
        </div>
        <div class="modal-actions">${headerExtra}</div>
        <button class="modal-close" aria-label="关闭" data-tip="关闭 Esc">${GameIcons.get('close')}</button>
      </header>
      <div class="modal-body ${fullPane ? '' : 'modal-body-pad'}">${body}</div>
      ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
    `;
    el.appendChild(modal);
    host.appendChild(el);

    function close() {
      modal.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      setTimeout(() => {
        el.remove();
        openCount = Math.max(0, openCount - 1);
        if (openCount === 0) host.setAttribute('aria-hidden', 'true');
        try { onClose?.(); } catch {}
      }, 220);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    }
    backdrop.addEventListener('click', close);
    modal.querySelector('.modal-close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);

    requestAnimationFrame(() => {
      backdrop.classList.add('is-open');
      modal.classList.add('is-open');
    });
    openCount++;
    host.setAttribute('aria-hidden', 'false');

    return {
      el: modal,
      close,
      setBody(html) { modal.querySelector('.modal-body').innerHTML = html; },
      setTitle(t, s) {
        modal.querySelector('.modal-title').innerHTML = t;
        const sub = modal.querySelector('.modal-subtitle');
        if (sub) sub.textContent = s || '';
      },
    };
  }

  return { open };
})();
