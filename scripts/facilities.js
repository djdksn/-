/* scripts/facilities.js — 设施名录模态框 */
(function () {
  function open() {
    const modal = GameModal.open({
      size: 'xl', icon: 'building',
      title: '设施名录',
      subtitle: 'Facilities of Sakura-su',
      headerExtra: `
        <button class="chip-btn" data-tip="按区域筛选">${GameIcons.get('filter')}<span>筛选</span></button>
        <button class="chip-btn" data-tip="切换视图">${GameIcons.get('grid')}<span>网格</span></button>
      `,
      body: bodyHtml(),
    });

    // 搜索过滤
    const search = modal.el.querySelector('#fac-search-input');
    search.addEventListener('input', e => {
      const v = e.target.value.trim();
      modal.el.querySelectorAll('.fac-card').forEach(c => {
        const name = c.getAttribute('data-name') + c.getAttribute('data-type');
        c.style.display = name.includes(v) ? '' : 'none';
      });
    });
    // type filter
    modal.el.querySelectorAll('.fac-filter button').forEach(b => {
      b.addEventListener('click', () => {
        modal.el.querySelectorAll('.fac-filter button').forEach(x => x.classList.remove('is-active'));
        b.classList.add('is-active');
        const f = b.getAttribute('data-type');
        modal.el.querySelectorAll('.fac-card').forEach(c => {
          c.style.display = (f === 'all' || c.getAttribute('data-type') === f) ? '' : 'none';
        });
      });
    });

    // 卡片点击 -> 详情
    modal.el.querySelectorAll('.fac-card').forEach(c => {
      c.addEventListener('click', () => {
        const id = c.getAttribute('data-id');
        const fac = GameData.facilities.find(f => f.id === id);
        openDetail(fac);
      });
    });

    return modal;
  }

  function bodyHtml() {
    const cards = GameData.facilities.map(f => {
      const orgs = f.orgs.slice(0, 3).map(oid => {
        const o = GameData.organizations.find(x => x.id === oid);
        return o ? `<span class="avatar avatar-sm tone-${o.tone}" data-tip="${o.name}">${o.short.slice(0,1)}</span>` : '';
      }).join('');
      const more = f.orgs.length > 3 ? `<span class="avatar avatar-sm tone-ink" data-tip="还有 ${f.orgs.length - 3} 个组织">+${f.orgs.length - 3}</span>` : '';
      return `
        <article class="fac-card fac-card-tone-${f.tone}" data-id="${f.id}" data-name="${f.name}" data-type="${f.type}">
          <div class="fac-card-head">
            <div class="fac-card-icon">${GameIcons.get(f.icon)}</div>
            <span class="fac-card-type">${f.type}</span>
          </div>
          <div class="fac-card-name">${f.name}</div>
          <div class="fac-card-area">${f.area}</div>
          <div class="fac-card-desc">${f.desc}</div>
          <div class="fac-card-foot">
            <div class="fac-card-orgs">${orgs}${more}</div>
            <div class="fac-card-link">查看 ${f.orgs.length} 个组织 ${GameIcons.get('chevronRight')}</div>
          </div>
        </article>
      `;
    }).join('');

    const types = ['all', ...new Set(GameData.facilities.map(f => f.type))];
    const filterBtns = types.map((t, i) => `<button class="${i===0 ? 'is-active' : ''}" data-type="${t}">${t === 'all' ? '全部' : t}</button>`).join('');

    return `
      <div style="width:100%; padding: var(--sp-12);">
        <div class="fac-toolbar">
          <div class="fac-search">
            ${GameIcons.get('search')}
            <input id="fac-search-input" type="text" placeholder="搜索设施名或类型……" />
          </div>
          <div class="fac-filter segmented">${filterBtns}</div>
          <div style="margin-left:auto; font-size: var(--fs-xs); color: var(--fg-quaternary); letter-spacing: 0.08em;">共 ${GameData.facilities.length} 处</div>
        </div>
        <div class="facilities-grid">${cards}</div>
      </div>
    `;
  }

  function openDetail(fac) {
    const orgs = fac.orgs.map(id => GameData.organizations.find(o => o.id === id)).filter(Boolean);
    const orgsHtml = orgs.map(o => `
      <div class="fac-org-item" data-id="${o.id}">
        <div class="avatar tone-${o.tone}">${o.short.slice(0,1)}</div>
        <div class="fac-org-info">
          <div class="fac-org-name">${o.name}</div>
          <div class="fac-org-lead">${o.lead}</div>
        </div>
        <div class="fac-org-arrow">${GameIcons.get('arrowRight')}</div>
      </div>
    `).join('');

    const m = GameModal.open({
      size: 'lg', icon: 'building',
      title: fac.name,
      subtitle: fac.area,
      body: `
        <div style="width:100%;">
          <div class="fac-detail-head">
            <div style="grid-column:1; align-self:center;">
              <div class="modal-icon" style="width:56px; height:56px; color: var(--card-tone, var(--accent));">${GameIcons.get(fac.icon)}</div>
            </div>
            <div>
              <div class="fac-detail-name">${fac.name}</div>
              <div class="fac-detail-area">${fac.type} · ${fac.area}</div>
              <div class="fac-detail-desc">${fac.desc}</div>
              <div class="fac-detail-meta">
                <span class="fac-meta-pill">${GameIcons.get('clock')}<span>${fac.hours}</span></span>
                <span class="fac-meta-pill">${GameIcons.get('sparkle')}<span>${fac.atmosphere}</span></span>
              </div>
            </div>
          </div>
          <div class="fac-detail-section">
            <div class="fac-detail-section-title">
              在此处工作的组织
              <span class="fac-detail-section-meta">${orgs.length} 个组织</span>
            </div>
            <div class="fac-org-list">${orgsHtml || '<div class="empty"><div class="empty-icon">'+GameIcons.get('users')+'</div><div class="empty-title">暂未登记</div></div>'}</div>
          </div>
        </div>
      `,
      footer: `
        <div class="modal-foot-info">${GameIcons.get('info').replace('<svg','<svg style="width:12px;height:12px;display:inline-block;vertical-align:-2px;margin-right:4px;"')} 点击组织条目可跳转至组织名录详情。</div>
        <div class="modal-foot-actions">
          <button class="btn btn-ghost" data-action="close-fac">${GameIcons.get('close')}<span>关闭</span></button>
        </div>
      `,
    });
    m.el.querySelector('[data-action="close-fac"]').addEventListener('click', () => m.close());
    m.el.querySelectorAll('.fac-org-item').forEach(it => {
      it.addEventListener('click', () => {
        const oid = it.getAttribute('data-id');
        m.close();
        setTimeout(() => GameOrganizations.openWithId(oid), 240);
      });
    });
  }

  window.GameFacilities = { open };
})();
