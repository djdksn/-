/* scripts/organizations.js — 组织名录模态框 */
(function () {
  let modal = null;
  let currentId = null;

  function open() {
    const firstId = GameData.organizations[0]?.id;
    currentId = firstId;
    modal = GameModal.open({
      size: 'xl', icon: 'users',
      title: '组织名录',
      subtitle: 'Organizations of the Academy',
      headerExtra: `
        <button class="chip-btn" data-tip="新建组织">${GameIcons.get('plus')}<span>新建</span></button>
      `,
      body: shellHtml(),
      fullPane: true,
    });
    bindList();
    selectOrg(firstId);
    return modal;
  }

  function openWithId(id) {
    open();
    selectOrg(id);
  }

  function shellHtml() {
    const items = GameData.organizations.map(o => `
      <div class="org-list-item" data-id="${o.id}">
        <div class="avatar tone-${o.tone}">${o.short.slice(0,1)}</div>
        <div class="org-list-info">
          <div class="org-list-name">${o.name}</div>
          <div class="org-list-meta">
            <span>${o.type}</span>
            <span class="org-list-meta-dot"></span>
            <span>${o.members.length} 名成员</span>
          </div>
        </div>
      </div>
    `).join('');

    return `
      <div class="org-shell">
        <aside class="org-list-pane">
          <div class="org-list-toolbar">
            <div class="org-search">
              ${GameIcons.get('search')}
              <input id="org-search" type="text" placeholder="搜索组织……" />
            </div>
            <div class="segmented" style="font-size: var(--fs-2xs);">
              <button class="is-active" data-type="all">全部</button>
              <button data-type="校级机构">校级</button>
              <button data-type="部活">部活</button>
            </div>
          </div>
          <div class="org-list" id="org-list">${items}</div>
        </aside>
        <section class="org-detail" id="org-detail"></section>
      </div>
    `;
  }

  function bindList() {
    const list = modal.el.querySelector('#org-list');
    const search = modal.el.querySelector('#org-search');
    list.addEventListener('click', e => {
      const it = e.target.closest('.org-list-item');
      if (!it) return;
      selectOrg(it.getAttribute('data-id'));
    });
    search.addEventListener('input', e => {
      const v = e.target.value.trim();
      list.querySelectorAll('.org-list-item').forEach(it => {
        const o = GameData.organizations.find(x => x.id === it.getAttribute('data-id'));
        it.style.display = o.name.includes(v) || (o.tags || []).join('').includes(v) ? '' : 'none';
      });
    });
    modal.el.querySelectorAll('.segmented button').forEach(b => {
      b.addEventListener('click', () => {
        modal.el.querySelectorAll('.segmented button').forEach(x => x.classList.remove('is-active'));
        b.classList.add('is-active');
        const t = b.getAttribute('data-type');
        list.querySelectorAll('.org-list-item').forEach(it => {
          const o = GameData.organizations.find(x => x.id === it.getAttribute('data-id'));
          it.style.display = (t === 'all' || o.type === t) ? '' : 'none';
        });
      });
    });
  }

  function selectOrg(id) {
    currentId = id;
    modal.el.querySelectorAll('.org-list-item').forEach(it => {
      it.classList.toggle('is-active', it.getAttribute('data-id') === id);
    });
    const o = GameData.organizations.find(x => x.id === id);
    if (!o) return;
    const fac = GameData.facilities.find(f => f.id === o.facility);

    const tags = (o.tags || []).map(t => `<span class="badge badge-${o.tone === 'sakura' ? 'sakura' : o.tone === 'wisteria' ? 'wisteria' : o.tone === 'moss' ? 'moss' : o.tone === 'amber' ? 'amber' : 'ink'}">${t}</span>`).join('');

    const members = o.members.map(mid => {
      const c = GameData.characters.find(x => x.id === mid);
      if (!c) return '';
      const role = (c.orgs.find(r => r.org === o.id) || {}).role || '部员';
      return `
        <div class="org-member" data-id="${c.id}">
          <div class="avatar tone-${c.tone}">${c.avatar}</div>
          <div class="org-member-info">
            <div class="org-member-name">${c.name}</div>
            <div class="org-member-role">
              <span class="org-member-role-tag">${role}</span>
              <span>${c.year}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const detail = modal.el.querySelector('#org-detail');
    detail.innerHTML = `
      <div class="org-detail-head" data-tone="${o.tone}">
        <div class="org-detail-top">
          <div class="avatar avatar-xl tone-${o.tone}">${o.short.slice(0,1)}</div>
          <div class="org-detail-main">
            <div class="org-detail-tags">${tags}</div>
            <div class="org-detail-name">${o.name}</div>
            <div class="org-detail-tagline">「${o.tagline}」</div>
            <div class="org-detail-stats">
              <div class="org-stat"><span class="org-stat-key">类型</span><span class="org-stat-val">${o.type}</span></div>
              <div class="org-stat"><span class="org-stat-key">主理</span><span class="org-stat-val">${o.lead}</span></div>
              <div class="org-stat"><span class="org-stat-key">驻地</span><span class="org-stat-val">${fac ? fac.name : '未指定'}</span></div>
              <div class="org-stat"><span class="org-stat-key">成员</span><span class="org-stat-val">${o.members.length} 人</span></div>
            </div>
          </div>
        </div>
      </div>
      <div class="org-detail-section">
        <div class="org-section-h">组织简介</div>
        <p class="org-desc">${o.desc}</p>
        <div class="org-story">${o.story}</div>
      </div>
      <div class="org-detail-section">
        <div class="org-section-h">成员名录 <span class="org-section-h-meta">${o.members.length} 名</span></div>
        <div class="org-members">${members}</div>
      </div>
      <div class="org-detail-section">
        <div class="org-section-h">运营节奏 <span class="org-section-h-meta">本周</span></div>
        <div class="org-schedule">
          ${scheduleHtml(o)}
        </div>
      </div>
    `;

    detail.querySelectorAll('.org-member').forEach(it => {
      it.addEventListener('click', () => {
        const cid = it.getAttribute('data-id');
        modal.close();
        setTimeout(() => GameRoster.openWithCharacter(cid), 240);
      });
    });
  }

  function scheduleHtml(o) {
    const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const weekly = days.map(d => {
      const has = Math.random() > 0.45;
      return `
        <div class="schedule-cell ${has ? 'has' : ''}">
          <div class="schedule-day">${d}</div>
          <div class="schedule-state">${has ? '常规活动' : '休'}</div>
        </div>
      `;
    }).join('');
    return `
      <style>
        .org-schedule { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
        .schedule-cell {
          padding: var(--sp-5) var(--sp-6);
          border-radius: var(--r-sm);
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--border-soft);
          text-align: center;
        }
        .schedule-cell.has { background: rgba(255,107,154,0.06); border-color: rgba(255,107,154,0.18); }
        .schedule-day { font-size: var(--fs-xs); color: var(--fg-tertiary); letter-spacing: 0.06em; margin-bottom: 2px; }
        .schedule-state { font-size: var(--fs-2xs); color: var(--fg-secondary); font-family: var(--font-mono); }
        .schedule-cell.has .schedule-state { color: var(--sakura-300); }
      </style>
      ${weekly}
    `;
  }

  window.GameOrganizations = { open, openWithId };
})();
