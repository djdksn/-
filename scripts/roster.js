/* scripts/roster.js — 花名册 */
(function () {
  let modal = null;

  function open() {
    modal = GameModal.open({
      size: 'xl', icon: 'user',
      title: '花名册',
      subtitle: 'Personae of the Academy',
      headerExtra: `
        <button class="chip-btn" data-tip="按组织归类">${GameIcons.get('layers')}<span>按组织归类</span></button>
        <button class="chip-btn" data-tip="新增角色">${GameIcons.get('plus')}<span>新增</span></button>
      `,
      body: shellHtml(),
      fullPane: true,
    });
    bindList();
    selectChar(GameData.characters[0].id);
  }

  function openWithCharacter(id) {
    open();
    selectChar(id);
  }

  function shellHtml() {
    const CAT_LABELS = { student: '学生', staff: '教职工', external: '校外人员' };
    const CAT_ORDER = ['student', 'staff', 'external'];

    // Group characters by category
    const catMap = { student: [], staff: [], external: [] };
    GameData.characters.forEach(c => {
      const cat = c.category || 'student';
      if (catMap[cat]) catMap[cat].push(c);
    });

    // For each category, group by organization
    const orgIdMap = {};
    GameData.organizations.forEach(o => { orgIdMap[o.id] = o; });

    function renderCategory(cat) {
      const chars = catMap[cat];
      if (!chars || chars.length === 0) return '';

      // Org sub-groups within this category
      const orgGroupMap = new Map();
      const looseChars = [];
      const seen = new Set();

      chars.forEach(c => {
        if (!c.orgs || c.orgs.length === 0) {
          if (!seen.has(c.id)) { looseChars.push({ char: c, role: null }); seen.add(c.id); }
          return;
        }
        c.orgs.forEach(r => {
          if (!orgGroupMap.has(r.org)) orgGroupMap.set(r.org, []);
          orgGroupMap.get(r.org).push({ char: c, role: r.role });
          seen.add(c.id + '|' + r.org);
        });
      });

      // Render org sub-groups
      let orgsHtml = '';
      for (const [orgId, members] of orgGroupMap) {
        const o = orgIdMap[orgId];
        if (!o) continue;
        const items = members.map(({ char: c, role }) => `
          <div class="roster-item" data-id="${c.id}">
            <div class="avatar avatar-sm tone-${c.tone}">${c.avatar}</div>
            <div>
              <div class="roster-item-name">${c.name}</div>
              <div class="roster-item-role">${role || ''}</div>
            </div>
          </div>
        `).join('');
        orgsHtml += `
          <div class="roster-group">
            <div class="roster-group-head">${o.short}<span class="roster-group-count">${members.length}</span></div>
            ${items}
          </div>`;
      }

      // Loose chars (no org in this category)
      let looseHtml = '';
      if (looseChars.length > 0) {
        const items = looseChars.map(({ char: c }) => `
          <div class="roster-item" data-id="${c.id}">
            <div class="avatar avatar-sm tone-${c.tone}">${c.avatar}</div>
            <div>
              <div class="roster-item-name">${c.name}</div>
              <div class="roster-item-role">${c.year || ''}</div>
            </div>
          </div>
        `).join('');
        looseHtml = `
          <div class="roster-group">
            <div class="roster-group-head">无固定组织<span class="roster-group-count">${looseChars.length}</span></div>
            ${items}
          </div>`;
      }

      return `
        <div class="roster-category">
          <div class="roster-category-head">
            <span class="roster-category-label">${CAT_LABELS[cat]}</span>
            <span class="roster-category-count">${chars.length}</span>
          </div>
          ${orgsHtml}${looseHtml}
        </div>`;
    }

    const bodyHtml = CAT_ORDER.map(renderCategory).join('');

    return `
      <div class="roster-shell">
        <aside class="roster-list-pane">
          <div class="roster-toolbar">
            <div class="org-search">
              ${GameIcons.get('search')}
              <input id="roster-search" type="text" placeholder="搜索人物……" />
            </div>
          </div>
          <div class="roster-list" id="roster-list">${bodyHtml}</div>
        </aside>
        <section class="dossier" id="dossier"></section>
      </div>
    `;
  }

  function bindList() {
    const list = modal.el.querySelector('#roster-list');
    list.addEventListener('click', e => {
      const it = e.target.closest('.roster-item');
      if (it) selectChar(it.getAttribute('data-id'));
    });
    modal.el.querySelector('#roster-search').addEventListener('input', e => {
      const v = e.target.value.trim();
      list.querySelectorAll('.roster-item').forEach(it => {
        const c = GameData.characters.find(x => x.id === it.getAttribute('data-id'));
        it.style.display = (c.name + c.kana).includes(v) ? '' : 'none';
      });
    });
  }

  function selectChar(id) {
    modal.el.querySelectorAll('.roster-item').forEach(it => {
      it.classList.toggle('is-active', it.getAttribute('data-id') === id);
    });
    const c = GameData.characters.find(x => x.id === id);
    if (!c) return;

    const orgsHtml = c.orgs.map(r => {
      const o = GameData.organizations.find(x => x.id === r.org);
      if (!o) return '';
      return `
        <div class="dossier-org-row" data-id="${o.id}">
          <div class="avatar tone-${o.tone}">${o.short.slice(0,1)}</div>
          <div class="dossier-org-info">
            <div class="dossier-org-name">${o.name}</div>
            <div class="dossier-org-meta">${o.type} · ${o.lead}</div>
          </div>
          <span class="dossier-org-role">${r.role}</span>
        </div>
      `;
    }).join('') || '<div class="empty"><div class="empty-text">暂无所属组织</div></div>';

    const relsHtml = (c.relations || []).map(r => {
      const other = GameData.characters.find(x => x.id === r.who);
      if (!other) return '';
      return `
        <div class="relation-card" data-id="${other.id}">
          <div class="avatar avatar-sm tone-${other.tone}">${other.avatar}</div>
          <div class="relation-card-info">
            <div class="relation-card-head">
              <span class="relation-card-name">${other.name}</span>
              <span class="relation-label">${r.label}</span>
            </div>
            <div class="relation-card-text">"${r.text}"</div>
          </div>
          <button class="iconbtn iconbtn-ghost" data-tip="跳转档案">${GameIcons.get('arrowRight')}</button>
        </div>
      `;
    }).join('') || '<div class="empty"><div class="empty-text">尚未建立特殊关系</div></div>';

    const dossier = modal.el.querySelector('#dossier');
    dossier.innerHTML = `
      <header class="dossier-head">
        <div class="dossier-portrait" data-tone="${c.tone}">${c.avatar}</div>
        <div>
          <div class="dossier-id">DOSSIER · ${c.id.toUpperCase()}</div>
          <div class="dossier-name">${c.name}</div>
          <div class="dossier-kana">${c.kana}</div>
          <div class="dossier-tagline">「${c.tagline}」</div>
          <div class="dossier-stats">
            <div class="dossier-stat"><span class="dossier-stat-k">年龄</span><span class="dossier-stat-v">${c.age}</span></div>
            <div class="dossier-stat"><span class="dossier-stat-k">在读</span><span class="dossier-stat-v">${c.year}</span></div>
            <div class="dossier-stat"><span class="dossier-stat-k">身高</span><span class="dossier-stat-v">${c.height}</span></div>
            <div class="dossier-stat"><span class="dossier-stat-k">所属</span><span class="dossier-stat-v">${c.orgs.length} 个组织</span></div>
          </div>
        </div>
      </header>

      <nav class="dossier-tabs" id="dossier-tabs">
        <button class="tab-btn is-active" data-tab="profile">资料</button>
        <button class="tab-btn" data-tab="orgs">任职</button>
        <button class="tab-btn" data-tab="relations">关系</button>
        <button class="tab-btn" data-tab="live">动态</button>
        <button class="tab-btn" data-tab="lore">秘事</button>
      </nav>

      <div class="dossier-body" id="dossier-body" data-tab="profile">
        <div class="dossier-section">
          <div class="dossier-section-label">${GameIcons.get('eye')}<span>外貌</span></div>
          <div class="dossier-section-content">${c.look}</div>
        </div>
        <div class="dossier-section">
          <div class="dossier-section-label">${GameIcons.get('user')}<span>体态</span></div>
          <div class="dossier-section-content">${c.build}</div>
        </div>
        <div class="dossier-section">
          <div class="dossier-section-label">${GameIcons.get('palette')}<span>穿着</span></div>
          <div class="dossier-section-content">${c.wear}</div>
        </div>
        <div class="dossier-section">
          <div class="dossier-section-label">${GameIcons.get('sparkle')}<span>内心</span></div>
          <div class="dossier-section-content" style="font-style: italic; color: var(--wisteria-200);">「${c.thoughts}」</div>
        </div>
      </div>
    `;

    bindTabs(c, orgsHtml, relsHtml);
    dossier.querySelectorAll('.dossier-org-row').forEach(it => {
      it.addEventListener('click', () => {
        const oid = it.getAttribute('data-id');
        modal.close();
        setTimeout(() => GameOrganizations.openWithId(oid), 240);
      });
    });
  }

  function bindTabs(c, orgsHtml, relsHtml) {
    const tabs = modal.el.querySelector('#dossier-tabs');
    const body = modal.el.querySelector('#dossier-body');
    const profileHtml = body.innerHTML;
    tabs.addEventListener('click', e => {
      const b = e.target.closest('.tab-btn');
      if (!b) return;
      tabs.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('is-active'));
      b.classList.add('is-active');
      const tab = b.getAttribute('data-tab');
      body.setAttribute('data-tab', tab);
      if (tab === 'profile') {
        body.innerHTML = profileHtml;
      } else if (tab === 'orgs') {
        body.innerHTML = `
          <div class="dossier-section" style="grid-template-columns: 1fr;">
            <div class="dossier-orgs">${orgsHtml}</div>
          </div>
        `;
        body.querySelectorAll('.dossier-org-row').forEach(it => {
          it.addEventListener('click', () => {
            const oid = it.getAttribute('data-id');
            modal.close();
            setTimeout(() => GameOrganizations.openWithId(oid), 240);
          });
        });
      } else if (tab === 'relations') {
        body.innerHTML = `
          <div class="dossier-section" style="grid-template-columns: 1fr;">
            <div class="relations-list">${relsHtml}</div>
          </div>
        `;
        body.querySelectorAll('.relation-card').forEach(it => {
          it.addEventListener('click', () => {
            selectChar(it.getAttribute('data-id'));
            modal.el.querySelector('.dossier').scrollTop = 0;
          });
        });
      } else if (tab === 'live') {
        body.innerHTML = renderLiveTab(c);
      } else if (tab === 'lore') {
        body.innerHTML = `
          <div class="dossier-section">
            <div class="dossier-section-label">${GameIcons.get('flame')}<span>特殊设定</span></div>
            <div class="dossier-section-content">${c.special || '——'}</div>
          </div>
          <div class="dossier-section">
            <div class="dossier-section-label">${GameIcons.get('book')}<span>佚事</span></div>
            <div class="dossier-section-content" style="font-style: italic; color: var(--fg-tertiary);">
              ${c.tagline}<br><br>
              收藏夹中存有 3 段未公开的对白。点击下方按钮以解锁阅读。
              <div style="margin-top: var(--sp-6); display: flex; gap: var(--sp-5);">
                <button class="btn btn-ghost btn-sm">${GameIcons.get('lock')}<span>第一夜：钟声</span></button>
                <button class="btn btn-ghost btn-sm">${GameIcons.get('lock')}<span>雨季笔记</span></button>
                <button class="btn btn-ghost btn-sm">${GameIcons.get('lock')}<span>未发出的信</span></button>
              </div>
            </div>
          </div>
        `;
      }
    });
  }

  // —— 动态变量渲染 —— //
  function renderLiveTab(c) {
    const vars = window.__liveVariables;
    if (!vars) return '<div class="dossier-section"><div class="dossier-section-label">动态数据</div><div class="dossier-section-content" style="color:var(--fg-quaternary)">变量系统尚未就绪，请先发送一条消息激活。</div></div>';

    // ── Protagonist: show User信息 ──
    if (c.id === 'ch-cheng-lixing') {
      return renderProtagonistLiveTab(vars);
    }

    const npc = vars['NPC花名册']?.[c.name];
    if (!npc?.动态数据) return '<div class="dossier-section"><div class="dossier-section-label">动态数据</div><div class="dossier-section-content" style="color:var(--fg-quaternary)">该角色暂无动态数据。变量将在 AI 对话过程中自动更新。</div></div>';

    const d = npc.动态数据;
    const fav = d.人物好感度 || '未知';
    const favColor = { '厌恶': 'var(--vermil-400)', '一般': 'var(--fg-tertiary)', '友善': 'var(--moss-300)', '爱慕': 'var(--sakura-400)' }[fav] || 'var(--fg-tertiary)';

    const body = d.身体状态 || {};
    const traces = body.即时痕迹 || {};
    const traceHtml = Object.entries(traces).filter(([,v]) => v && v !== '暂无').map(([k, v]) => `<div class="dossier-stat"><span class="dossier-stat-k">${k}</span><span class="dossier-stat-v">${escapeHtml(String(v))}</span></div>`).join('');

    const clothes = d.人物穿着 || {};
    const clothesHtml = Object.entries(clothes).filter(([,v]) => v).map(([k, v]) => `<div>${escapeHtml(k)}: ${escapeHtml(String(v))}</div>`).join('');

    const exp = d.经历 || {};
    const expNums = ['性行为次数', '性交次数', '口交次数', '肛交次数', '足交次数'];
    const expHtml = expNums.filter(k => exp[k] !== undefined).map(k => `<div class="dossier-stat"><span class="dossier-stat-k">${k}</span><span class="dossier-stat-v">${exp[k]}</span></div>`).join('');

    const favIcon = fav === '爱慕' ? 'heart' : fav === '友善' ? 'smile' : fav === '厌恶' ? 'shield' : 'user';

    return `
      <div class="dossier-section">
        <div class="dossier-section-label">${GameIcons.get(favIcon)}<span>好感度</span></div>
        <div class="dossier-section-content"><span style="font-size:var(--fs-lg);font-weight:600;color:${favColor};">${escapeHtml(fav)}</span></div>
      </div>
      ${traceHtml ? `
      <div class="dossier-section">
        <div class="dossier-section-label">${GameIcons.get('eye')}<span>身体即时痕迹</span></div>
        <div class="dossier-stats" style="flex-wrap:wrap;">${traceHtml}</div>
      </div>` : ''}
      ${body.整体反馈 ? `
      <div class="dossier-section">
        <div class="dossier-section-label">${GameIcons.get('activity')}<span>身体整体反馈</span></div>
        <div class="dossier-section-content">${escapeHtml(body.整体反馈)}</div>
      </div>` : ''}
      ${clothesHtml ? `
      <div class="dossier-section">
        <div class="dossier-section-label">${GameIcons.get('palette')}<span>当前穿着</span></div>
        <div class="dossier-section-content">${clothesHtml}</div>
      </div>` : ''}
      ${d.内心想法 ? `
      <div class="dossier-section">
        <div class="dossier-section-label">${GameIcons.get('sparkle')}<span>当前内心想法</span></div>
        <div class="dossier-section-content" style="font-style:italic;color:var(--wisteria-200);">「${escapeHtml(d.内心想法)}」</div>
      </div>` : ''}
      ${expHtml ? `
      <div class="dossier-section">
        <div class="dossier-section-label">${GameIcons.get('hash')}<span>经历统计</span></div>
        <div class="dossier-stats" style="flex-wrap:wrap;">${expHtml}</div>
      </div>` : ''}
      <div class="dossier-section">
        <div class="dossier-section-label">${GameIcons.get('info')}<span>数据来源</span></div>
        <div class="dossier-section-content" style="font-size:var(--fs-xs);color:var(--fg-quaternary);">以上数据来源于 AI 对话中的实时变量更新。每次 AI 回复后自动刷新。</div>
      </div>
    `;
  }

  function renderProtagonistLiveTab(vars) {
    const u = vars['User信息'];
    if (!u) return '<div class="dossier-section"><div class="dossier-section-label">动态数据</div><div class="dossier-section-content" style="color:var(--fg-quaternary)">主角数据尚未初始化，请先发送一条消息激活变量系统。</div></div>';

    const statsHtml = [
      ['年龄', u.年龄, ''],
      ['职务', u.职务, ''],
      ['所属部门', u.所属部门, ''],
      ['性交总次数', u.性交总次数, ''],
      ['接受性交次数', u.接受性交次数, ''],
      ['接受口交次数', u.接受口交次数, ''],
      ['接受肛交次数', u.接受肛交次数, ''],
      ['接受色情按摩次数', u.接受色情按摩次数, ''],
      ['发生性关系总人数', u.发生性关系总人数, ''],
    ].filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `<div class="dossier-stat"><span class="dossier-stat-k">${k}</span><span class="dossier-stat-v">${escapeHtml(String(v))}</span></div>`).join('');

    const recent = u['最近一次性行为'];
    const recentHtml = recent && recent.对象 !== '暂无' ? `
      <div class="dossier-section">
        <div class="dossier-section-label">${GameIcons.get('clock')}<span>最近一次性行为</span></div>
        <div class="dossier-stats" style="flex-wrap:wrap;">
          <div class="dossier-stat"><span class="dossier-stat-k">时间</span><span class="dossier-stat-v">${escapeHtml(String(recent.时间 || '暂无'))}</span></div>
          <div class="dossier-stat"><span class="dossier-stat-k">地点</span><span class="dossier-stat-v">${escapeHtml(String(recent.地点 || '暂无'))}</span></div>
          <div class="dossier-stat"><span class="dossier-stat-k">对象</span><span class="dossier-stat-v">${escapeHtml(String(recent.对象 || '暂无'))}</span></div>
        </div>
        <div class="dossier-section-content" style="margin-top:var(--sp-4);">${escapeHtml(String(recent['方式与情况描写'] || '暂无'))}</div>
      </div>` : '';

    const partners = u['与其发生性交个人性交方式与次数'];
    const partnersHtml = partners && Object.keys(partners).length > 0 ? `
      <div class="dossier-section">
        <div class="dossier-section-label">${GameIcons.get('users')}<span>性交记录</span></div>
        <div class="dossier-section-content">
          ${Object.entries(partners).map(([name, data]) => `<div style="margin-bottom:var(--sp-3);"><strong>${escapeHtml(name)}</strong>: ${escapeHtml(String(data.方式 || ''))} · ${data.次数 || 0}次</div>`).join('')}
        </div>
      </div>` : '';

    return `
      <div class="dossier-section">
        <div class="dossier-section-label">${GameIcons.get('user')}<span>主角信息</span></div>
        <div class="dossier-stats" style="flex-wrap:wrap;">${statsHtml}</div>
      </div>
      ${recentHtml}
      ${partnersHtml}
      <div class="dossier-section">
        <div class="dossier-section-label">${GameIcons.get('info')}<span>数据来源</span></div>
        <div class="dossier-section-content" style="font-size:var(--fs-xs);color:var(--fg-quaternary);">以上数据来源于 AI 对话中的实时变量更新。每次 AI 回复后自动刷新。</div>
      </div>
    `;
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"\']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

  window.GameRoster = { open, openWithCharacter };
})();
