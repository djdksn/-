/* scripts/tooltip.js — 全局 data-tip 工具提示 */
(function () {
  const host = document.getElementById('tooltip-host');
  let current = null;
  let hoverTimer = null;

  function show(target) {
    const text = target.getAttribute('data-tip');
    if (!text) return;
    if (current) { current.remove(); current = null; }
    const tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.textContent = text;
    host.appendChild(tip);

    const r = target.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    let top = r.bottom + 8;
    let left = r.left + (r.width - tr.width) / 2;
    let pos = 'top';
    if (top + tr.height + 12 > window.innerHeight) {
      top = r.top - tr.height - 8; pos = 'bottom';
    }
    if (left < 8) left = 8;
    if (left + tr.width > window.innerWidth - 8) left = window.innerWidth - tr.width - 8;
    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
    tip.setAttribute('data-pos', pos);
    requestAnimationFrame(() => tip.classList.add('is-visible'));
    current = tip;
  }
  function hide() {
    clearTimeout(hoverTimer);
    if (!current) return;
    const c = current; current = null;
    c.classList.remove('is-visible');
    setTimeout(() => c.remove(), 150);
  }

  document.addEventListener('mouseover', e => {
    const t = e.target.closest('[data-tip]');
    if (!t) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => show(t), 220);
  });
  document.addEventListener('mouseout', e => {
    const t = e.target.closest('[data-tip]');
    if (!t) return;
    hide();
  });
  document.addEventListener('click', hide);
})();

/* —— 涟漪点击效果 —— */
(function () {
  const host = document.getElementById('ripple-host');
  document.addEventListener('click', e => {
    const t = e.target.closest('button, .nav-item, .list-item, .option-chip, .suggest-pill, .tab-btn');
    if (!t) return;
    if (t.disabled) return;
    const dot = document.createElement('span');
    dot.className = 'ripple-dot';
    dot.style.left = e.clientX + 'px';
    dot.style.top = e.clientY + 'px';
    host.appendChild(dot);
    setTimeout(() => dot.remove(), 700);
  });
})();
