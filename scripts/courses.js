/* scripts/courses.js — 课程列表与详情 */
(function () {
  const KIND_META = {
    public:  { label: '公共课', icon: 'school', desc: '面向全校的核心课程' },
    club:    { label: '社团课', icon: 'feather', desc: '由部活组织开设的研习' },
    special: { label: '特殊课', icon: 'flame', desc: '小班导修与受邀课程' },
  };

  function open() {
    const modal = GameModal.open({
      size: 'xl', icon: 'school',
      title: '课程列表',
      subtitle: 'Curriculum of the Academy',
      headerExtra: `
        <button class="chip-btn" data-tip="导出 PDF">${GameIcons.get('download')}<span>导出</span></button>
        <button class="chip-btn" data-tip="按周排课">${GameIcons.get('calendar')}<span>课表</span></button>
      `,
      body: shellHtml(),
      fullPane: true,
    });

    bind(modal);
    return modal;
  }

  function shellHtml() {
    const total = GameData.courses.length;
    const credits = GameData.courses.reduce((s, c) => s + (c.credits || 0), 0);

    const filterBtns = `
      <button class="is-active" data-kind="all">全部</button>
      <button data-kind="public">公共课</button>
      <button data-kind="club">社团课</button>
      <button data-kind="special">特殊课</button>
    `;

    const grouped = ['public', 'club', 'special'].map(kind => {
      const list = GameData.courses.filter(c => c.kind === kind);
      if (list.length === 0) return '';
      return `
        <section class="courses-category" data-kind="${kind}">
          <div class="courses-category-head" data-cat="${kind}">
            <span>${KIND_META[kind].label}</span>
            <span class="courses-category-tag">${GameIcons.get(KIND_META[kind].icon)}<span>${KIND_META[kind].desc}</span></span>
            <span class="courses-category-line"></span>
            <span class="courses-category-count">${list.length} 门</span>
          </div>
          <div class="courses-grid">
            ${list.map(courseCardHtml).join('')}
          </div>
        </section>
      `;
    }).join('');

    return `
      <div class="courses-shell">
        <div class="courses-toolbar">
          <div class="courses-search">
            ${GameIcons.get('search')}
            <input id="courses-search-input" type="text" placeholder="搜索课程名、编号或老师……"/>
          </div>
          <div class="courses-filter segmented">${filterBtns}</div>
          <div class="courses-meta">
            <span>本学期 · 共 <span class="courses-meta-key">${total}</span> 门</span>
            <span>·</span>
            <span>合计 <span class="courses-meta-key">${credits}</span> 学分</span>
          </div>
        </div>
        <div class="courses-body" id="courses-body">${grouped}</div>
      </div>
    `;
  }

  function courseCardHtml(c) {
    const teacher = resolveName(c.teacher, c.teacherId);
    return `
      <article class="course-card" data-id="${c.id}" data-tone="${c.tone}">
        <div class="course-card-link">${GameIcons.get('arrowRight')}</div>
        <div class="course-card-head">
          <span class="course-card-code">${escape(c.code)}</span>
          <span class="course-card-credits">
            <span class="course-card-credits-num">${c.credits}</span>
            <span class="course-card-credits-unit">学分</span>
          </span>
        </div>
        <div>
          <div class="course-card-name">${escape(c.name)}</div>
          <div class="course-card-brief">${escape(c.brief)}</div>
        </div>
        <div class="course-card-foot">
          <div class="course-card-row">
            ${GameIcons.get('user')}<span class="course-card-row-key">主讲</span><span>${escape(teacher)}</span>
          </div>
          <div class="course-card-row">
            ${GameIcons.get('clock')}<span class="course-card-row-key">时间</span><span>${escape(c.schedule)}</span>
          </div>
          <div class="course-card-row">
            ${GameIcons.get('building')}<span class="course-card-row-key">场所</span><span>${escape(c.classroom)}</span>
          </div>
        </div>
      </article>
    `;
  }

  function resolveName(name, id) {
    if (id) {
      const ch = GameData.characters.find(c => c.id === id);
      if (ch) return ch.name;
    }
    return name || '——';
  }

  function bind(modal) {
    const root = modal.el;
    const body = root.querySelector('#courses-body');
    const search = root.querySelector('#courses-search-input');

    // —— 搜索 —— //
    search.addEventListener('input', () => applyFilter(root));
    // —— 类别 —— //
    root.querySelectorAll('.courses-filter button').forEach(b => {
      b.addEventListener('click', () => {
        root.querySelectorAll('.courses-filter button').forEach(x => x.classList.remove('is-active'));
        b.classList.add('is-active');
        applyFilter(root);
      });
    });

    // —— 卡片点击 —— //
    body.addEventListener('click', e => {
      const card = e.target.closest('.course-card');
      if (!card) return;
      const id = card.getAttribute('data-id');
      const c = GameData.courses.find(x => x.id === id);
      if (c) openDetail(c);
    });
  }

  function applyFilter(root) {
    const kind = root.querySelector('.courses-filter button.is-active').getAttribute('data-kind');
    const q = root.querySelector('#courses-search-input').value.trim().toLowerCase();

    root.querySelectorAll('.courses-category').forEach(cat => {
      const k = cat.getAttribute('data-kind');
      let any = false;
      cat.querySelectorAll('.course-card').forEach(card => {
        const id = card.getAttribute('data-id');
        const c = GameData.courses.find(x => x.id === id);
        const teacher = resolveName(c.teacher, c.teacherId);
        const hay = (c.name + ' ' + c.code + ' ' + teacher + ' ' + c.brief).toLowerCase();
        const matchKind = (kind === 'all' || k === kind);
        const matchQ = !q || hay.includes(q);
        const show = matchKind && matchQ;
        card.style.display = show ? '' : 'none';
        if (show) any = true;
      });
      cat.style.display = any ? '' : 'none';
    });
  }

  // —— 详情 —— //
  function openDetail(c) {
    const teacherName = resolveName(c.teacher, c.teacherId);
    const assistantName = c.assistant === '——' ? '' : resolveName(c.assistant, c.assistantId);

    const teacherCard = staffCard('主讲老师', c.teacher, c.teacherId);
    const assistantCard = c.assistant === '——'
      ? `<div class="course-staff-card"><div class="avatar avatar-sm tone-ink">无</div><div class="course-staff-info"><div class="course-staff-role">课程助教</div><div class="course-staff-empty">本课程无助教</div></div></div>`
      : staffCard('课程助教', c.assistant, c.assistantId);

    const contentHtml = (c.content || []).map(x => `<li>${escape(x)}</li>`).join('');
    const kindLabel = KIND_META[c.kind].label;

    const m = GameModal.open({
      size: 'xl', icon: 'school',
      title: c.name,
      subtitle: `${c.code} · ${kindLabel}`,
      body: `
        <div style="width:100%;">
          <header class="course-detail-head" data-tone="${c.tone}" style="--card-tone: var(--${({sakura:'sakura-400',wisteria:'wisteria-300',moss:'moss-300',amber:'amber-300',vermil:'vermil-300',ink:'ink-200'})[c.tone] || 'sakura-400'});">
            <div class="course-seal">${GameIcons.get(KIND_META[c.kind].icon)}</div>
            <div class="course-detail-title-block">
              <div class="course-detail-tags">
                <span class="badge badge-${({public:'wisteria',club:'moss',special:'amber'})[c.kind]}">${kindLabel}</span>
                <span class="badge badge-ink">${escape(c.term)}</span>
              </div>
              <div class="course-detail-name">${escape(c.name)}</div>
              <div class="course-detail-en">${escape(c.code)}</div>
            </div>
            <div class="course-detail-credits-block">
              <span class="course-detail-credits-num">${c.credits}</span>
              <span class="course-detail-credits-label">学分</span>
            </div>

            <div class="course-detail-meta-bar">
              <div class="course-meta-cell">
                <span class="course-meta-key">${GameIcons.get('hash')}<span>课程编号</span></span>
                <span class="course-meta-val" style="font-family: var(--font-mono); letter-spacing: 0.06em;">${escape(c.code)}</span>
              </div>
              <div class="course-meta-cell">
                <span class="course-meta-key">${GameIcons.get('tag')}<span>课程性质</span></span>
                <span class="course-meta-val">${kindLabel}</span>
              </div>
              <div class="course-meta-cell">
                <span class="course-meta-key">${GameIcons.get('clock')}<span>课程时间</span></span>
                <span class="course-meta-val" style="font-size: var(--fs-sm);">${escape(c.schedule)}</span>
              </div>
              <div class="course-meta-cell">
                <span class="course-meta-key">${GameIcons.get('building')}<span>授课场所</span></span>
                <span class="course-meta-val" style="font-size: var(--fs-sm);">${escape(c.classroom)}</span>
              </div>
            </div>
          </header>

          <div class="course-detail-body">
            <div class="course-section col-span-2">
              <div class="course-section-h">${GameIcons.get('users')}<span>师资</span></div>
              <div class="course-staff">
                ${teacherCard}
                ${assistantCard}
              </div>
            </div>

            <div class="course-section col-span-2">
              <div class="course-section-h">${GameIcons.get('book')}<span>课程内容概览</span></div>
              <ul class="course-content-list">${contentHtml}</ul>
            </div>

            <div class="course-section">
              <div class="course-section-h">${GameIcons.get('flag')}<span>期中考试</span></div>
              <div class="course-exam-card">
                <div class="course-exam-row">
                  <span class="course-exam-key">考核方式</span>
                  <div class="course-exam-val"><strong>${escape(c.midterm.method)}</strong></div>
                </div>
                <div class="course-exam-row">
                  <span class="course-exam-key">考核内容</span>
                  <div class="course-exam-val">${escape(c.midterm.content)}</div>
                </div>
              </div>
            </div>

            <div class="course-section">
              <div class="course-section-h">${GameIcons.get('star')}<span>期末考试</span></div>
              <div class="course-exam-card">
                <div class="course-exam-row">
                  <span class="course-exam-key">考核方式</span>
                  <div class="course-exam-val"><strong>${escape(c.finalExam.method)}</strong></div>
                </div>
                <div class="course-exam-row">
                  <span class="course-exam-key">考核内容</span>
                  <div class="course-exam-val">${escape(c.finalExam.content)}</div>
                </div>
              </div>
            </div>

            ${c.remark ? `
              <div class="course-section col-span-2">
                <div class="course-section-h">${GameIcons.get('info')}<span>课程备注</span></div>
                <div class="course-remark">${escape(c.remark)}</div>
              </div>
            ` : ''}
          </div>
        </div>
      `,
      footer: `
        <div class="modal-foot-info">${GameIcons.get('info').replace('<svg', '<svg style="width:12px;height:12px;display:inline-block;vertical-align:-2px;margin-right:4px;"')} 课程信息可注入对话上下文，授课时段会自动影响 NPC 出席。</div>
        <div class="modal-foot-actions">
          <button class="btn btn-ghost" data-act="bookmark">${GameIcons.get('bookmark')}<span>加入收藏</span></button>
          <button class="btn btn-ghost" data-act="back">返回列表</button>
        </div>
      `,
    });

    // —— 师资卡片跳转 —— //
    m.el.querySelectorAll('.course-staff-card.is-link').forEach(card => {
      card.addEventListener('click', () => {
        const cid = card.getAttribute('data-id');
        m.close();
        setTimeout(() => GameRoster.openWithCharacter(cid), 240);
      });
    });

    m.el.querySelector('[data-act="back"]').addEventListener('click', () => m.close());
    m.el.querySelector('[data-act="bookmark"]').addEventListener('click', () => {
      GameNotify.success('已加入收藏', `${c.name} 将在课程提醒中优先出现。`);
    });
  }

  function staffCard(role, name, id) {
    const ch = id ? GameData.characters.find(x => x.id === id) : null;
    if (ch) {
      return `
        <div class="course-staff-card is-link" data-id="${ch.id}" data-tip="点击查看人物档案">
          <div class="avatar avatar-sm tone-${ch.tone}">${ch.avatar}</div>
          <div class="course-staff-info">
            <div class="course-staff-role">${role}</div>
            <div class="course-staff-name">${escape(ch.name)}</div>
          </div>
        </div>
      `;
    }
    return `
      <div class="course-staff-card">
        <div class="avatar avatar-sm tone-ink">${escape((name || '?').slice(0, 1))}</div>
        <div class="course-staff-info">
          <div class="course-staff-role">${role}</div>
          <div class="course-staff-name">${escape(name || '——')}</div>
        </div>
      </div>
    `;
  }

  function escape(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
  }

  window.GameCourses = { open };
})();
