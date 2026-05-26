/* scripts/form-editor.js — 申请表制作器 */
(function () {
  let modal = null;
  let templates = JSON.parse(JSON.stringify(GameData.formTemplates));
  let activeId = templates[0]?.id;
  let selectedFieldId = null;

  const FIELD_TYPES = [
    { v: 'text', label: '单行文本', icon: 'type' },
    { v: 'textarea', label: '多行文本', icon: 'align' },
    { v: 'number', label: '数字', icon: 'hash' },
    { v: 'date', label: '日期', icon: 'calendar' },
    { v: 'datetime', label: '日期时间', icon: 'clock' },
    { v: 'radio', label: '单选', icon: 'target' },
    { v: 'select', label: '下拉', icon: 'chevronDown' },
    { v: 'checkbox', label: '多选', icon: 'check' },
    { v: 'readonly', label: '只读说明', icon: 'info' },
    { v: 'table', label: '表格', icon: 'grid' },
  ];

  function open() {
    activeId = templates[0]?.id;
    selectedFieldId = null;
    modal = GameModal.open({
      size: 'full', icon: 'edit',
      title: '申请表制作器',
      subtitle: 'Visual Form Designer · Approval Flow',
      headerExtra: `
        <button class="chip-btn" id="form-preview-btn" data-tip="预览表单">${GameIcons.get('eye')}<span>预览</span></button>
        <button class="chip-btn" id="form-records-btn" data-tip="查看申请记录">${GameIcons.get('archive')}<span>记录</span></button>
        <button class="chip-btn" data-tip="导出 .form.json">${GameIcons.get('download')}<span>导出</span></button>
      `,
      body: shellHtml(),
      fullPane: true,
      footer: `
        <div class="modal-foot-info">${GameIcons.get('info').replace('<svg','<svg style="width:12px;height:12px;display:inline-block;vertical-align:-2px;margin-right:4px;"')} 表单字段拖拽排序 · 选项可来自动态数据源 · 流程支持驳回。</div>
        <div class="modal-foot-actions">
          <button class="btn btn-ghost" id="form-cancel">取消</button>
          <button class="btn btn-primary" id="form-save">${GameIcons.get('save')}<span>保存模板</span></button>
        </div>
      `,
    });
    bindAll();
    selectTpl(activeId);
  }

  function shellHtml() {
    return `
      <div class="form-shell">
        <aside class="form-left">
          <div class="form-pane-head">
            <span class="rules-pane-title">${GameIcons.get('folder')}<span>模板列表</span></span>
            <button class="iconbtn iconbtn-ghost" id="form-new" data-tip="新建模板">${GameIcons.get('plus')}</button>
          </div>
          <div class="form-tpl-list" id="form-tpl-list"></div>
        </aside>
        <section class="form-mid">
          <div class="form-pane-head">
            <span class="rules-pane-title">${GameIcons.get('sliders')}<span>模板信息 / 流程</span></span>
          </div>
          <div class="form-mid-body" id="form-mid-body"></div>
        </section>
        <section class="form-right">
          <div class="form-pane-head">
            <span class="rules-pane-title">${GameIcons.get('layers')}<span>表单设计 · 分组与字段</span></span>
            <div style="display: flex; gap: var(--sp-3);">
              <button class="chip-btn" id="form-add-group">${GameIcons.get('plus')}<span>新增分组</span></button>
            </div>
          </div>
          <div class="form-right-body" id="form-right-body"></div>
        </section>
      </div>
    `;
  }

  function activeTpl() { return templates.find(t => t.id === activeId); }

  function bindAll() {
    renderList();
    renderMid();
    renderRight();

    modal.el.querySelector('#form-tpl-list').addEventListener('click', e => {
      const it = e.target.closest('.form-tpl-item');
      if (it) selectTpl(it.getAttribute('data-id'));
    });
    modal.el.querySelector('#form-new').addEventListener('click', () => {
      const id = 'form-' + Date.now();
      templates.push({
        id, name: '新申请表', code: 'NEW_FORM', version: 'v0.1', desc: '', validityDays: 7,
        groups: [{ id: 'g-' + Date.now(), name: '基本信息', fields: [] }],
        flow: [],
      });
      activeId = id; selectedFieldId = null;
      renderList(); renderMid(); renderRight();
      GameNotify.success('已创建模板', '请补全模板名称与字段。');
    });
    modal.el.querySelector('#form-add-group').addEventListener('click', addGroup);
    modal.el.querySelector('#form-cancel').addEventListener('click', () => modal.close());
    modal.el.querySelector('#form-save').addEventListener('click', () => {
      GameNotify.success('模板已保存', '可在对话中通过 /form apply 调出该表单。');
    });
    modal.el.querySelector('#form-preview-btn').addEventListener('click', openPreview);
    modal.el.querySelector('#form-records-btn').addEventListener('click', openRecords);

    // —— ESC 优先关闭字段属性面板，再次按 ESC 才关闭模态 —— //
    // 用捕获阶段抢在 modal.js 的 ESC 监听器之前
    document.addEventListener('keydown', escHandler, true);
  }

  function escHandler(e) {
    if (e.key !== 'Escape') return;
    if (!modal || !modal.el.isConnected) {
      document.removeEventListener('keydown', escHandler, true);
      return;
    }
    if (selectedFieldId) {
      e.preventDefault();
      e.stopImmediatePropagation();
      selectedFieldId = null;
      renderRight();
    }
  }

  function renderList() {
    const html = templates.map(t => `
      <div class="form-tpl-item ${t.id === activeId ? 'is-active' : ''}" data-id="${t.id}">
        <div class="form-tpl-item-name">${GameIcons.get('document')}<span>${escape(t.name)}</span></div>
        <div class="form-tpl-item-meta">
          <span class="form-tpl-item-code">${escape(t.code)}</span>
          <span>${t.version}</span>
          <span>· ${t.flow.length} 步审批</span>
        </div>
      </div>
    `).join('');
    modal.el.querySelector('#form-tpl-list').innerHTML = html;
  }

  function selectTpl(id) {
    activeId = id;
    selectedFieldId = null;
    renderList();
    renderMid();
    renderRight();
  }

  function renderMid() {
    const t = activeTpl();
    if (!t) { modal.el.querySelector('#form-mid-body').innerHTML = ''; return; }

    const flowHtml = t.flow.map((f, i) => `
      <div class="flow-step" data-id="${f.id}">
        <div class="flow-step-no">${i + 1}</div>
        <div class="flow-step-info">
          <input class="flow-step-name flow-input" data-k="name" value="${escape(f.name)}" />
          <input class="flow-step-who flow-input" data-k="who" value="${escape(f.who)}" />
        </div>
        <label class="switch" data-tip="允许驳回">
          <input type="checkbox" ${f.allowReject ? 'checked' : ''} data-k="allowReject" class="flow-input" />
          <span class="switch-track"></span>
        </label>
        <button class="flow-step-x" data-act="del-flow">${GameIcons.get('trash')}</button>
      </div>
    `).join('');

    modal.el.querySelector('#form-mid-body').innerHTML = `
      <div class="form-info-card">
        <div class="form-info-title">基础信息</div>
        <div class="form-info-row">
          <span class="form-info-label">模板标题</span>
          <input class="input" id="t-name" value="${escape(t.name)}"/>
        </div>
        <div class="form-info-row-2">
          <div class="form-info-row">
            <span class="form-info-label">内部代号</span>
            <input class="input" id="t-code" value="${escape(t.code)}"/>
          </div>
          <div class="form-info-row">
            <span class="form-info-label">版本</span>
            <input class="input" id="t-ver" value="${escape(t.version)}"/>
          </div>
        </div>
        <div class="form-info-row">
          <span class="form-info-label">用途说明</span>
          <textarea class="textarea" rows="2" id="t-desc">${escape(t.desc || '')}</textarea>
        </div>
        <div class="form-info-row">
          <span class="form-info-label">有效期（日）</span>
          <input class="input" type="number" min="1" max="365" id="t-validity" value="${t.validityDays || 7}"/>
        </div>
      </div>

      <div class="form-info-card">
        <div class="form-info-title">审批流程</div>
        <div class="alert alert-info" style="font-size: var(--fs-2xs);">
          <span class="alert-icon">${GameIcons.get('info')}</span>
          <div class="alert-body">
            处理人可使用 {{user}}、{{char}}、角色描述等变量；开关「允许驳回」决定该步是否可拒绝申请。
          </div>
        </div>
        <div class="flow-list" id="flow-list">${flowHtml}</div>
        <button class="btn btn-soft btn-block" id="flow-add">${GameIcons.get('plus')}<span>添加流程步骤</span></button>
      </div>
    `;
    bindMid(t);
  }

  function bindMid(t) {
    const root = modal.el.querySelector('#form-mid-body');
    root.querySelector('#t-name').addEventListener('input', e => { t.name = e.target.value; renderList(); });
    root.querySelector('#t-code').addEventListener('input', e => { t.code = e.target.value; renderList(); });
    root.querySelector('#t-ver').addEventListener('input', e => { t.version = e.target.value; renderList(); });
    root.querySelector('#t-desc').addEventListener('input', e => t.desc = e.target.value);
    root.querySelector('#t-validity').addEventListener('input', e => t.validityDays = +e.target.value);

    root.querySelectorAll('.flow-step').forEach(step => {
      const id = step.getAttribute('data-id');
      const f = t.flow.find(x => x.id === id);
      step.querySelectorAll('.flow-input').forEach(inp => {
        inp.addEventListener('input', e => {
          const k = inp.getAttribute('data-k');
          if (k === 'allowReject') f.allowReject = e.target.checked;
          else f[k] = e.target.value;
          renderList();
        });
      });
      step.querySelector('[data-act="del-flow"]').addEventListener('click', () => {
        t.flow = t.flow.filter(x => x.id !== id);
        renderMid();
        renderList();
      });
    });

    root.querySelector('#flow-add').addEventListener('click', () => {
      t.flow.push({ id: 's-' + Date.now(), name: '新步骤', who: '负责人', allowReject: true });
      renderMid();
      renderList();
    });
  }

  // —— 表单设计 —— //
  function renderRight() {
    const t = activeTpl();
    const right = modal.el.querySelector('.form-right');
    if (!t) {
      modal.el.querySelector('#form-right-body').innerHTML = '';
      removePropBar();
      return;
    }

    // —— 顶部返回栏：直接挂在 pane-head 之后，独立于滚动容器 —— //
    if (selectedFieldId) {
      const fnd = findField(t, selectedFieldId);
      if (!fnd) {
        selectedFieldId = null;
        removePropBar();
      } else {
        ensurePropBar(fnd);
      }
    } else {
      removePropBar();
    }

    if (!selectedFieldId) {
      // —— 分组列表 —— //
      const groups = t.groups.map(g => `
        <div class="form-group-card" data-id="${g.id}">
          <div class="form-group-head">
            <span class="form-group-name">${GameIcons.get('layers')}<input value="${escape(g.name)}" data-act="rename-group"/></span>
            <div class="form-group-actions">
              <button data-tip="添加字段" data-act="add-field">${GameIcons.get('plus')}</button>
              <button data-tip="上移" data-act="up-group">${GameIcons.get('chevronUp')}</button>
              <button data-tip="下移" data-act="down-group">${GameIcons.get('chevronDown')}</button>
              <button data-tip="删除分组" data-act="del-group">${GameIcons.get('trash')}</button>
            </div>
          </div>
          <div class="form-group-fields">
            ${g.fields.length === 0 ? `<div class="form-group-fields-empty">暂无字段 · 点击右上角加号添加</div>` : g.fields.map(f => fieldCardHtml(f)).join('')}
          </div>
        </div>
      `).join('');

      modal.el.querySelector('#form-right-body').innerHTML =
        groups || '<div class="empty"><div class="empty-icon">'+GameIcons.get('layers')+'</div><div class="empty-title">暂无分组</div><div class="empty-text">点击「新增分组」开始</div></div>';
    } else {
      // —— 字段属性视图 —— //
      const fnd = findField(t, selectedFieldId);
      modal.el.querySelector('#form-right-body').innerHTML = `<div class="form-info-card">${fieldPropHtml(fnd.field)}</div>`;
      // 滚到顶部
      const body = modal.el.querySelector('#form-right-body');
      if (body) body.scrollTop = 0;
    }
    bindRight();
  }

  function ensurePropBar(fnd) {
    let bar = modal.el.querySelector('#form-prop-bar');
    const html = `
      <button class="form-prop-back" id="form-prop-back" data-tip="返回字段列表 · Esc">
        ${GameIcons.get('chevronLeft')}<span>返回</span>
      </button>
      <div class="form-prop-bar-title">
        <span class="form-prop-bar-name">${escape(fnd.field.label || '（未命名字段）')}</span>
        <span class="form-prop-bar-id">${escape(fnd.group.name)} · ${escape(fnd.field.id)}</span>
      </div>
      <button class="iconbtn iconbtn-ghost" id="form-prop-del" data-tip="删除字段">${GameIcons.get('trash')}</button>
    `;
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'form-prop-bar';
      bar.className = 'form-prop-bar';
      bar.innerHTML = html;
      const right = modal.el.querySelector('.form-right');
      const body = modal.el.querySelector('#form-right-body');
      right.insertBefore(bar, body);
    } else {
      bar.innerHTML = html;
    }
  }

  function removePropBar() {
    const bar = modal.el.querySelector('#form-prop-bar');
    if (bar) bar.remove();
  }

  function fieldCardHtml(f) {
    const typeMeta = FIELD_TYPES.find(x => x.v === f.type) || FIELD_TYPES[0];
    return `
      <div class="field-card ${selectedFieldId === f.id ? 'is-selected' : ''}" data-id="${f.id}">
        <span class="field-handle">${GameIcons.get('drag')}</span>
        <span class="field-icon">${GameIcons.get(typeMeta.icon)}</span>
        <div class="field-info">
          <div class="field-name">${escape(f.label || '（未命名字段）')}</div>
          <div class="field-meta">${typeMeta.label} · ${escape(f.id)}</div>
        </div>
        <span class="field-pill ${f.required ? 'is-required' : ''}">${f.required ? '必填' : '选填'}</span>
        <div class="field-actions">
          <button data-act="up">${GameIcons.get('chevronUp')}</button>
          <button data-act="down">${GameIcons.get('chevronDown')}</button>
          <button data-act="copy">${GameIcons.get('copy')}</button>
          <button data-act="del">${GameIcons.get('trash')}</button>
        </div>
      </div>
    `;
  }

  function findField(t, fieldId) {
    for (const g of t.groups) {
      const idx = g.fields.findIndex(f => f.id === fieldId);
      if (idx >= 0) return { group: g, field: g.fields[idx], index: idx };
    }
    return null;
  }

  function bindRight() {
    const t = activeTpl();
    const root = modal.el.querySelector('.form-right');

    // —— 字段属性面板：返回按钮 & 删除（位于 .form-right 上的 prop-bar） —— //
    const back = root.querySelector('#form-prop-back');
    if (back) {
      back.addEventListener('click', () => {
        selectedFieldId = null;
        renderRight();
      });
    }
    const propDel = root.querySelector('#form-prop-del');
    if (propDel) {
      propDel.addEventListener('click', () => {
        for (const g of t.groups) {
          const idx = g.fields.findIndex(x => x.id === selectedFieldId);
          if (idx >= 0) {
            g.fields.splice(idx, 1);
            break;
          }
        }
        selectedFieldId = null;
        renderRight();
        GameNotify.info('字段已删除');
      });
    }

    root.querySelectorAll('.form-group-card').forEach(card => {
      const gid = card.getAttribute('data-id');
      const g = t.groups.find(x => x.id === gid);
      card.querySelector('[data-act="rename-group"]').addEventListener('input', e => g.name = e.target.value);
      card.querySelector('[data-act="add-field"]').addEventListener('click', () => addField(g));
      card.querySelector('[data-act="up-group"]').addEventListener('click', () => moveGroup(t, gid, -1));
      card.querySelector('[data-act="down-group"]').addEventListener('click', () => moveGroup(t, gid, 1));
      card.querySelector('[data-act="del-group"]').addEventListener('click', () => {
        if (g.fields.length) {
          GameNotify.warn('该分组仍含字段', `${g.fields.length} 个字段将一并删除。`, {
            actions: [{ label: '确认删除', onClick: () => doDelGroup(t, gid) }]
          });
        } else doDelGroup(t, gid);
      });

      card.querySelectorAll('.field-card').forEach(fc => {
        const fid = fc.getAttribute('data-id');
        fc.addEventListener('click', e => {
          if (e.target.closest('.field-actions')) return;
          selectedFieldId = fid;
          renderRight();
        });
        fc.querySelectorAll('.field-actions button').forEach(b => {
          b.addEventListener('click', e => {
            e.stopPropagation();
            const act = b.getAttribute('data-act');
            handleFieldAction(t, g, fid, act);
          });
        });
      });
    });

    // —— 字段属性面板交互 —— //
    if (selectedFieldId) {
      const fnd = findField(t, selectedFieldId);
      if (fnd) bindFieldProp(fnd.field);
    }
  }

  function addGroup() {
    const t = activeTpl();
    t.groups.push({ id: 'g-' + Date.now(), name: '新分组', fields: [] });
    renderRight();
  }
  function doDelGroup(t, gid) {
    t.groups = t.groups.filter(x => x.id !== gid);
    renderRight();
    GameNotify.info('分组已删除');
  }
  function moveGroup(t, gid, dir) {
    const idx = t.groups.findIndex(x => x.id === gid);
    const next = idx + dir;
    if (next < 0 || next >= t.groups.length) return;
    const tmp = t.groups[next]; t.groups[next] = t.groups[idx]; t.groups[idx] = tmp;
    renderRight();
  }
  function addField(g) {
    const id = 'f-' + Date.now();
    g.fields.push({ id, label: '新字段', type: 'text', required: false, placeholder: '' });
    selectedFieldId = id;
    renderRight();
  }
  function handleFieldAction(t, g, fid, act) {
    const idx = g.fields.findIndex(x => x.id === fid);
    if (idx < 0) return;
    if (act === 'up' && idx > 0) { const x = g.fields[idx-1]; g.fields[idx-1] = g.fields[idx]; g.fields[idx] = x; }
    if (act === 'down' && idx < g.fields.length - 1) { const x = g.fields[idx+1]; g.fields[idx+1] = g.fields[idx]; g.fields[idx] = x; }
    if (act === 'copy') {
      const cp = JSON.parse(JSON.stringify(g.fields[idx]));
      cp.id = 'f-' + Date.now();
      cp.label += '（副本）';
      g.fields.splice(idx + 1, 0, cp);
      selectedFieldId = cp.id;
    }
    if (act === 'del') {
      g.fields.splice(idx, 1);
      if (selectedFieldId === fid) selectedFieldId = null;
    }
    renderRight();
  }

  function fieldPropHtml(f) {
    const typeTiles = FIELD_TYPES.map(t => `
      <button class="type-tile ${f.type === t.v ? 'is-active' : ''}" data-v="${t.v}">
        ${GameIcons.get(t.icon)}<span>${t.label}</span>
      </button>
    `).join('');

    let extra = '';
    if (f.type === 'text' || f.type === 'textarea') {
      extra = `
        <div class="form-info-row-2">
          <div class="form-info-row">
            <span class="form-info-label">最少字符</span>
            <input class="input" type="number" id="fp-min" value="${f.min || ''}" placeholder="可空"/>
          </div>
          <div class="form-info-row">
            <span class="form-info-label">最多字符</span>
            <input class="input" type="number" id="fp-max" value="${f.max || ''}" placeholder="可空"/>
          </div>
        </div>
      `;
    } else if (f.type === 'number') {
      extra = `
        <div class="form-info-row-2">
          <div class="form-info-row">
            <span class="form-info-label">最小值</span>
            <input class="input" type="number" id="fp-min" value="${f.min ?? ''}"/>
          </div>
          <div class="form-info-row">
            <span class="form-info-label">最大值</span>
            <input class="input" type="number" id="fp-max" value="${f.max ?? ''}"/>
          </div>
        </div>
      `;
    } else if (['radio', 'select', 'checkbox'].includes(f.type)) {
      const opts = (f.options || []);
      extra = `
        <div class="form-info-row">
          <span class="form-info-label">选项列表</span>
          <div class="opt-list" id="fp-opt-list">
            ${opts.map((o, i) => `
              <div class="opt-row" data-i="${i}">
                <span class="opt-row-handle">${GameIcons.get('drag')}</span>
                <input value="${escape(o)}" />
                <span class="opt-row-x">${GameIcons.get('close')}</span>
              </div>
            `).join('')}
          </div>
          <button class="btn btn-soft btn-sm" id="fp-opt-add" style="margin-top: var(--sp-3);">${GameIcons.get('plus')}<span>添加选项</span></button>
        </div>
        ${(f.type === 'radio' || f.type === 'select') ? `
        <div class="opt-source">
          <div class="opt-source-head">${GameIcons.get('zap')}<span>动态数据源（可选）</span></div>
          <div class="form-info-row-2">
            <div class="form-info-row">
              <span class="form-info-label">来源类型</span>
              <select class="select" id="fp-src-kind">
                <option value="" ${!f.source ? 'selected' : ''}>不使用</option>
                <option value="roster" ${f.source?.kind === 'roster' ? 'selected' : ''}>花名册</option>
                <option value="organizations" ${f.source?.kind === 'organizations' ? 'selected' : ''}>组织名录</option>
                <option value="facilities" ${f.source?.kind === 'facilities' ? 'selected' : ''}>设施名录</option>
                <option value="custom" ${f.source?.kind === 'custom' ? 'selected' : ''}>自定义路径</option>
              </select>
            </div>
            <div class="form-info-row">
              <span class="form-info-label">显示字段</span>
              <input class="input" id="fp-src-display" value="${escape(f.source?.display || 'name')}" />
            </div>
          </div>
          <div class="form-info-row">
            <span class="form-info-label">数据路径</span>
            <input class="input" id="fp-src-path" value="${escape(f.source?.path || '花名册')}"/>
          </div>
        </div>` : ''}
      `;
    } else if (f.type === 'readonly') {
      extra = `
        <div class="form-info-row">
          <span class="form-info-label">说明文字</span>
          <textarea class="textarea" id="fp-content" rows="3">${escape(f.content || '')}</textarea>
        </div>
      `;
    } else if (f.type === 'table') {
      extra = `
        <div class="alert alert-info">
          <span class="alert-icon">${GameIcons.get('info')}</span>
          <div class="alert-body">
            <div class="alert-title">表格字段</div>
            后续版本将支持自定义列头与列类型。当前以「家庭成员」式的多行数据形式输出。
          </div>
        </div>
      `;
    }

    return `
      <div class="form-info-title" style="margin-bottom: var(--sp-3);">字段属性 · ${escape(f.id)}</div>
      <div class="form-info-row">
        <span class="form-info-label">字段标签</span>
        <input class="input" id="fp-label" value="${escape(f.label)}"/>
      </div>
      <div class="form-info-row">
        <span class="form-info-label">输入样式</span>
        <div class="type-grid" id="fp-types">${typeTiles}</div>
      </div>
      ${(['readonly','table'].includes(f.type)) ? '' : `
      <div class="form-info-row">
        <span class="form-info-label">占位提示</span>
        <input class="input" id="fp-ph" value="${escape(f.placeholder || '')}" placeholder="如：请输入您的姓名"/>
      </div>
      <div class="form-info-row row-inline" style="flex-direction:row; align-items:center; justify-content:space-between;">
        <span class="form-info-label">必填字段</span>
        <label class="switch"><input type="checkbox" id="fp-required" ${f.required ? 'checked' : ''}><span class="switch-track"></span></label>
      </div>`}
      ${extra}
    `;
  }

  function bindFieldProp(f) {
    const root = modal.el.querySelector('#form-right-body');
    root.querySelector('#fp-label')?.addEventListener('input', e => { f.label = e.target.value; refreshFieldCard(f); });
    root.querySelector('#fp-ph')?.addEventListener('input', e => f.placeholder = e.target.value);
    root.querySelector('#fp-required')?.addEventListener('change', e => { f.required = e.target.checked; refreshFieldCard(f); });
    root.querySelector('#fp-min')?.addEventListener('input', e => f.min = +e.target.value || undefined);
    root.querySelector('#fp-max')?.addEventListener('input', e => f.max = +e.target.value || undefined);
    root.querySelector('#fp-content')?.addEventListener('input', e => f.content = e.target.value);
    root.querySelectorAll('#fp-types .type-tile').forEach(b => {
      b.addEventListener('click', () => {
        f.type = b.getAttribute('data-v');
        if (['radio', 'select', 'checkbox'].includes(f.type) && !f.options) f.options = ['选项一', '选项二'];
        renderRight();
      });
    });
    root.querySelector('#fp-opt-add')?.addEventListener('click', () => {
      f.options = f.options || [];
      f.options.push('新选项');
      renderRight();
    });
    root.querySelectorAll('#fp-opt-list .opt-row').forEach(row => {
      const i = +row.getAttribute('data-i');
      row.querySelector('input').addEventListener('input', e => f.options[i] = e.target.value);
      row.querySelector('.opt-row-x').addEventListener('click', () => {
        f.options.splice(i, 1);
        renderRight();
      });
    });
    root.querySelector('#fp-src-kind')?.addEventListener('change', e => {
      const v = e.target.value;
      f.source = v ? { kind: v, path: f.source?.path || (v === 'roster' ? '花名册' : v === 'organizations' ? '组织名录' : v === 'facilities' ? '设施名录' : ''), display: f.source?.display || 'name' } : null;
      renderRight();
    });
    root.querySelector('#fp-src-display')?.addEventListener('input', e => { f.source = f.source || {}; f.source.display = e.target.value; });
    root.querySelector('#fp-src-path')?.addEventListener('input', e => { f.source = f.source || {}; f.source.path = e.target.value; });
  }

  function refreshFieldCard(f) {
    const card = modal.el.querySelector(`.field-card[data-id="${f.id}"]`);
    if (!card) return;
    card.querySelector('.field-name').textContent = f.label || '（未命名字段）';
    const pill = card.querySelector('.field-pill');
    pill.classList.toggle('is-required', !!f.required);
    pill.textContent = f.required ? '必填' : '选填';
  }

  function escape(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

  // —— 预览（模拟填写） —— //
  function openPreview() {
    const t = activeTpl();
    const groupsHtml = t.groups.map(g => `
      <div>
        <div class="preview-group-h">${escape(g.name)}</div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--sp-7) var(--sp-8);">
          ${g.fields.map(f => previewFieldHtml(f)).join('') || '<div style="grid-column: 1/-1; color: var(--fg-quaternary); font-style: italic; font-size: var(--fs-xs);">该分组暂无字段</div>'}
        </div>
      </div>
    `).join('');

    GameModal.open({
      size: 'lg', icon: 'eye',
      title: `${t.name} · 预览`,
      subtitle: `${t.code} · ${t.version}`,
      body: `
        <div class="form-preview-modal">
          <div class="alert alert-info">
            <span class="alert-icon">${GameIcons.get('info')}</span>
            <div class="alert-body">
              <div class="alert-title">${t.name}</div>
              ${t.desc || '该模板暂无描述。'}
            </div>
          </div>
          <div class="preview-form">${groupsHtml}</div>
          <div>
            <div class="preview-group-h">审批流程</div>
            <div class="event-progress" style="display: flex; gap: var(--sp-4); align-items: center;">
              ${t.flow.map((s, i, arr) => `
                <div class="event-step ${i === 0 ? 'is-current' : 'is-pending'}" style="flex:1;">
                  <div class="event-step-name">第 ${i+1} 步 · ${escape(s.name)}</div>
                  <div class="event-step-state">${escape(s.who)} ${s.allowReject ? '· 可驳回' : ''}</div>
                </div>
                ${i < arr.length - 1 ? `<div class="event-arrow">${GameIcons.get('chevronRight')}</div>` : ''}
              `).join('')}
            </div>
          </div>
        </div>
      `,
      footer: `
        <div class="modal-foot-info">${GameIcons.get('info').replace('<svg','<svg style="width:12px;height:12px;display:inline-block;vertical-align:-2px;margin-right:4px;"')} 此为预览，模拟填写不会创建真实记录。</div>
        <div class="modal-foot-actions">
          <button class="btn btn-ghost" data-tip="模拟填写">${GameIcons.get('feather')}<span>模拟填写</span></button>
          <button class="btn btn-primary">${GameIcons.get('send')}<span>提交（演示）</span></button>
        </div>
      `,
    });
  }

  function previewFieldHtml(f) {
    const required = f.required ? '<span class="preview-field-required">*</span>' : '';
    let ctrl = '';
    if (f.type === 'text') ctrl = `<input class="input" placeholder="${escape(f.placeholder || '')}"/>`;
    else if (f.type === 'textarea') ctrl = `<textarea class="textarea" rows="3" placeholder="${escape(f.placeholder || '')}"></textarea>`;
    else if (f.type === 'number') ctrl = `<input class="input" type="number" placeholder="${escape(f.placeholder || '')}" min="${f.min ?? ''}" max="${f.max ?? ''}"/>`;
    else if (f.type === 'date') ctrl = `<input class="input" type="date"/>`;
    else if (f.type === 'datetime') ctrl = `<input class="input" type="datetime-local"/>`;
    else if (f.type === 'radio') {
      const opts = realizeOptions(f);
      ctrl = `<div style="display:flex; flex-wrap:wrap; gap: var(--sp-5);">${opts.map(o => `<label style="display:inline-flex; align-items:center; gap:6px; font-size:var(--fs-sm); color:var(--fg-secondary);"><input type="radio" name="${f.id}"/>${escape(o)}</label>`).join('')}</div>`;
    } else if (f.type === 'select') {
      const opts = realizeOptions(f);
      ctrl = `<select class="select"><option>请选择…</option>${opts.map(o => `<option>${escape(o)}</option>`).join('')}</select>`;
    } else if (f.type === 'checkbox') {
      const opts = realizeOptions(f);
      ctrl = `<div style="display:flex; flex-wrap:wrap; gap: var(--sp-5);">${opts.map(o => `<label style="display:inline-flex; align-items:center; gap:6px; font-size:var(--fs-sm); color:var(--fg-secondary);"><input type="checkbox"/>${escape(o)}</label>`).join('')}</div>`;
    } else if (f.type === 'readonly') {
      ctrl = `<div style="padding: var(--sp-5) var(--sp-6); background: rgba(166,145,255,0.05); border: 1px dashed var(--border-base); border-radius: var(--r-sm); font-size: var(--fs-sm); color: var(--fg-tertiary); font-style: italic;">${escape(f.content || '说明性文本')}</div>`;
    } else if (f.type === 'table') {
      ctrl = `<div style="padding: var(--sp-5); background: rgba(255,255,255,0.03); border: 1px dashed var(--border-base); border-radius: var(--r-sm); color: var(--fg-tertiary); font-size: var(--fs-xs);">表格输入（演示占位）— 行可增删</div>`;
    } else {
      ctrl = `<input class="input" placeholder="${escape(f.placeholder || '')}"/>`;
    }
    return `
      <div class="preview-field" ${f.type === 'textarea' || f.type === 'readonly' || f.type === 'table' ? 'style="grid-column: 1 / -1;"' : ''}>
        <span class="preview-field-label">${escape(f.label)} ${required}</span>
        ${ctrl}
      </div>
    `;
  }

  function realizeOptions(f) {
    if (f.source?.kind) {
      if (f.source.kind === 'roster') return GameData.characters.map(c => c.name);
      if (f.source.kind === 'organizations') return GameData.organizations.map(o => o.name);
      if (f.source.kind === 'facilities') return GameData.facilities.map(c => c.name);
    }
    return f.options || [];
  }

  // —— 申请记录 —— //
  function openRecords() {
    const recs = GameData.formRecords;
    const items = recs.map(r => {
      const tpl = templates.find(t => t.id === r.tplId) || GameData.formTemplates.find(t => t.id === r.tplId);
      const who = GameData.characters.find(c => c.id === r.who);
      const flowItems = (tpl?.flow || []).map((s, i) => {
        const state = i < r.currentStep ? 'done' : i === r.currentStep ? (r.status === 'approved' ? 'done' : r.status === 'rejected' ? 'rejected' : 'current') : 'pending';
        return { name: s.name, state };
      });
      const stateMap = { pending: '审批中', approved: '已通过', rejected: '已驳回' };
      const tone = r.status === 'pending' ? 'amber' : r.status === 'approved' ? 'moss' : 'vermil';
      return `
        <div class="record-card">
          <div class="record-head">
            <div class="record-title">
              <span class="avatar avatar-sm tone-${who?.tone || 'ink'}">${who?.avatar || '?'}</span>
              <div>
                <div class="record-name">${escape(tpl?.name || '?')}</div>
                <div class="record-meta">${escape(who?.name || '?')} · ${escape(r.applied)}</div>
              </div>
            </div>
            <span class="badge badge-${tone}">${stateMap[r.status]}</span>
          </div>
          <div class="record-brief">${escape(r.brief)}</div>
          <div class="record-flow">
            ${flowItems.map((s, i, arr) => `
              <div class="record-step record-step-${s.state}">
                <div class="record-step-name">${i+1}. ${escape(s.name)}</div>
                <div class="record-step-state">${({done:'已完成', current:'处理中', pending:'待处理', rejected:'已驳回'})[s.state]}</div>
              </div>
              ${i < arr.length - 1 ? `<div class="record-arrow">${GameIcons.get('chevronRight')}</div>` : ''}
            `).join('')}
          </div>
          <div class="record-actions">
            ${r.status === 'pending' ? `
              <button class="btn btn-ghost btn-sm">${GameIcons.get('eye')}<span>查看</span></button>
              <button class="btn btn-soft btn-sm">${GameIcons.get('arrowRight')}<span>推进流程</span></button>
              <button class="btn btn-danger btn-sm">${GameIcons.get('close')}<span>驳回</span></button>
            ` : `
              <button class="btn btn-ghost btn-sm">${GameIcons.get('eye')}<span>查看</span></button>
            `}
          </div>
        </div>
      `;
    }).join('');

    GameModal.open({
      size: 'lg', icon: 'archive',
      title: '申请记录',
      subtitle: 'Active & Archived Records',
      body: `
        <div style="padding: var(--sp-10) var(--sp-12); display: flex; flex-direction: column; gap: var(--sp-7); width: 100%;">
          <style>
            .record-card { padding: var(--sp-8); background: linear-gradient(180deg, var(--ink-800), var(--ink-850)); border: 1px solid var(--border-soft); border-radius: var(--r-lg); display: flex; flex-direction: column; gap: var(--sp-5); }
            .record-head { display: flex; justify-content: space-between; align-items: flex-start; }
            .record-title { display: flex; align-items: center; gap: var(--sp-5); }
            .record-name { font-family: var(--font-serif); font-weight: 600; font-size: var(--fs-md); color: var(--fg-primary); }
            .record-meta { font-size: var(--fs-2xs); color: var(--fg-quaternary); margin-top: 2px; font-family: var(--font-mono); letter-spacing: 0.06em; }
            .record-brief { font-family: var(--font-serif); font-size: var(--fs-sm); color: var(--fg-tertiary); font-style: italic; line-height: var(--lh-relaxed); padding-left: var(--sp-7); border-left: 2px solid var(--border-base); }
            .record-flow { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
            .record-step { flex: 1; min-width: 120px; padding: var(--sp-4) var(--sp-5); border-radius: var(--r-sm); background: rgba(255,255,255,0.03); border: 1px solid var(--border-soft); }
            .record-step-done { background: rgba(95,201,154,0.10); border-color: rgba(95,201,154,0.25); }
            .record-step-current { background: rgba(255,174,66,0.10); border-color: rgba(255,174,66,0.30); }
            .record-step-rejected { background: rgba(238,90,90,0.10); border-color: rgba(238,90,90,0.30); }
            .record-step-name { font-size: var(--fs-2xs); color: var(--fg-tertiary); letter-spacing: 0.04em; margin-bottom: 2px; }
            .record-step-state { font-size: var(--fs-xs); color: var(--fg-secondary); font-weight: 500; }
            .record-step-done .record-step-state { color: var(--moss-200); }
            .record-step-current .record-step-state { color: var(--amber-200); }
            .record-step-rejected .record-step-state { color: var(--vermil-200); }
            .record-arrow { color: var(--fg-quaternary); }
            .record-arrow svg { width: 14px; height: 14px; }
            .record-actions { display: flex; gap: var(--sp-4); margin-top: var(--sp-3); padding-top: var(--sp-5); border-top: 1px dashed var(--border-faint); }
          </style>
          ${items || '<div class="empty"><div class="empty-icon">'+GameIcons.get('archive')+'</div><div class="empty-title">暂无申请记录</div></div>'}
        </div>
      `,
    });
  }

  window.GameFormEditor = { open };
})();
