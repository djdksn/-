/* scripts/rules-editor.js — 规章文档制作器 */
(function () {
  let modal = null;
  let docs = JSON.parse(JSON.stringify(GameData.ruleDocs));
  let activeDocId = docs[0]?.id;
  let selectedNodeId = null;
  let collapsedNodes = new Set();

  function open() {
    activeDocId = docs[0]?.id;
    selectedNodeId = null;
    modal = GameModal.open({
      size: 'full', icon: 'document',
      title: '规章文档制作器',
      subtitle: 'Tree-based Rule Editor',
      headerExtra: `
        <button class="chip-btn" id="rules-preview-btn" data-tip="预览注入文本">${GameIcons.get('eye')}<span>预览</span></button>
        <button class="chip-btn" data-tip="导出 .rules.json">${GameIcons.get('download')}<span>导出</span></button>
        <button class="chip-btn" data-tip="导入文档">${GameIcons.get('upload')}<span>导入</span></button>
      `,
      body: shellHtml(),
      fullPane: true,
      footer: `
        <div class="modal-foot-info">${GameIcons.get('info').replace('<svg','<svg style="width:12px;height:12px;display:inline-block;vertical-align:-2px;margin-right:4px;"')}
        节点支持拖拽、缩进调整与编号自动更新，编号锁定后将不再随排序变化。</div>
        <div class="modal-foot-actions">
          <button class="btn btn-ghost" id="rules-cancel">${GameIcons.get('close')}<span>取消</span></button>
          <button class="btn btn-primary" id="rules-save">${GameIcons.get('save')}<span>保存文档</span></button>
        </div>
      `,
    });
    bindAll();
    selectDoc(activeDocId);
  }

  function shellHtml() {
    return `
      <div class="rules-shell">
        <aside class="rules-list-pane">
          <div class="rules-pane-head">
            <span class="rules-pane-title">${GameIcons.get('folder')}<span>文档列表</span></span>
            <button class="iconbtn iconbtn-ghost" id="rules-new-doc" data-tip="新建规章">${GameIcons.get('plus')}</button>
          </div>
          <div class="rules-doc-list" id="rules-doc-list"></div>
        </aside>

        <section class="rules-tree-pane">
          <div class="rules-tree-toolbar" id="rules-tree-toolbar">
            <button class="toolbar-btn" data-act="add-section">${GameIcons.get('plus')}<span>添加章节</span></button>
            <button class="toolbar-btn" data-act="add-rule">${GameIcons.get('feather')}<span>添加规则</span></button>
            <span class="toolbar-divider"></span>
            <button class="toolbar-btn" data-act="indent">${GameIcons.get('arrowRight')}<span>缩进</span></button>
            <button class="toolbar-btn" data-act="outdent">${GameIcons.get('arrowLeft')}<span>提升</span></button>
            <button class="toolbar-btn" data-act="up">${GameIcons.get('chevronUp')}<span>上移</span></button>
            <button class="toolbar-btn" data-act="down">${GameIcons.get('chevronDown')}<span>下移</span></button>
            <span class="toolbar-divider"></span>
            <button class="toolbar-btn" data-act="duplicate">${GameIcons.get('copy')}<span>复制</span></button>
            <button class="toolbar-btn" data-act="delete">${GameIcons.get('trash')}<span>删除</span></button>
            <span class="toolbar-spacer"></span>
            <button class="toolbar-btn" data-act="collapse-all">${GameIcons.get('minus')}<span>折叠全部</span></button>
            <button class="toolbar-btn" data-act="expand-all">${GameIcons.get('plus')}<span>展开全部</span></button>
          </div>
          <div class="rules-tree-body" id="rules-tree-body"></div>
        </section>

        <aside class="rules-prop-pane">
          <div class="rules-pane-head">
            <span class="rules-pane-title" id="rules-prop-title">${GameIcons.get('sliders')}<span>文档属性</span></span>
          </div>
          <div class="rules-prop-body" id="rules-prop-body"></div>
        </aside>
      </div>
    `;
  }

  function bindAll() {
    renderDocList();
    renderTree();
    renderProp();

    modal.el.querySelector('#rules-new-doc').addEventListener('click', () => {
      const id = 'doc-' + Date.now();
      docs.push({
        id, name: '未命名文档', version: 'v0.1', desc: '',
        trigger: 'always', keywords: [],
        injection: 'after', format: 'indent', maxDepth: 3,
        sections: [],
      });
      activeDocId = id;
      selectedNodeId = null;
      renderDocList();
      renderTree();
      renderProp();
      GameNotify.success('已创建新文档', '请于右侧设置文档元数据。');
    });

    modal.el.querySelector('#rules-doc-list').addEventListener('click', e => {
      const it = e.target.closest('.rules-doc-item');
      if (it) selectDoc(it.getAttribute('data-id'));
    });

    modal.el.querySelector('#rules-tree-toolbar').addEventListener('click', e => {
      const b = e.target.closest('.toolbar-btn');
      if (!b) return;
      handleToolAction(b.getAttribute('data-act'));
    });

    modal.el.querySelector('#rules-cancel').addEventListener('click', () => modal.close());
    modal.el.querySelector('#rules-save').addEventListener('click', () => {
      GameNotify.success('文档已保存', '校规等条目将于下次发言中生效。');
    });
    modal.el.querySelector('#rules-preview-btn').addEventListener('click', openPreview);
  }

  function renderDocList() {
    const tagText = { always: '常驻', keyword: '关键词', book: '世界书', macro: '宏命令' };
    const html = docs.map(d => {
      const sectionCount = countNodes(d.sections);
      return `
        <div class="rules-doc-item ${d.id === activeDocId ? 'is-active' : ''}" data-id="${d.id}">
          <div class="rules-doc-item-name">${GameIcons.get('document')}<span>${d.name}</span></div>
          <div class="rules-doc-item-meta">${d.version} · ${sectionCount} 节</div>
          <span class="rules-doc-item-tag ${d.trigger}">${tagText[d.trigger] || '未配置'}</span>
        </div>
      `;
    }).join('');
    modal.el.querySelector('#rules-doc-list').innerHTML = html;
  }

  function countNodes(arr) {
    let n = 0;
    (arr || []).forEach(x => {
      n++;
      if (x.children) n += countNodes(x.children);
    });
    return n;
  }

  function selectDoc(id) {
    activeDocId = id;
    selectedNodeId = null;
    renderDocList();
    renderTree();
    renderProp();
  }

  function activeDoc() { return docs.find(d => d.id === activeDocId); }

  function renderTree() {
    const doc = activeDoc();
    if (!doc) {
      modal.el.querySelector('#rules-tree-body').innerHTML = '';
      return;
    }
    // 自动编号
    numberize(doc.sections, []);
    const html = renderNodes(doc.sections, 0);
    modal.el.querySelector('#rules-tree-body').innerHTML = html || `
      <div class="empty">
        <div class="empty-icon">${GameIcons.get('feather')}</div>
        <div class="empty-title">空白文档</div>
        <div class="empty-text">点击工具栏「添加章节」开始创作</div>
      </div>
    `;

    modal.el.querySelectorAll('.tree-row').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('.tree-actions')) return;
        if (e.target.closest('.tree-toggle')) {
          const id = row.getAttribute('data-id');
          if (collapsedNodes.has(id)) collapsedNodes.delete(id);
          else collapsedNodes.add(id);
          renderTree();
          return;
        }
        selectedNodeId = row.getAttribute('data-id');
        renderTree();
        renderProp();
      });
    });
    modal.el.querySelectorAll('.tree-actions button').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation();
        const id = b.closest('.tree-row').getAttribute('data-id');
        const act = b.getAttribute('data-act');
        selectedNodeId = id;
        handleToolAction(act);
      });
    });

    if (selectedNodeId) {
      const r = modal.el.querySelector(`.tree-row[data-id="${selectedNodeId}"]`);
      if (r) r.classList.add('is-selected');
    }
  }

  function numberize(arr, path) {
    (arr || []).forEach((n, i) => {
      const cur = [...path, i + 1];
      n.__num = cur.join('.');
      if (n.children) numberize(n.children, cur);
    });
  }

  function renderNodes(arr, depth) {
    return (arr || []).map(n => renderNode(n, depth)).join('');
  }

  function renderNode(n, depth) {
    const isSection = n.kind !== 'rule';
    const hasChildren = isSection && n.children && n.children.length > 0;
    const collapsed = collapsedNodes.has(n.id);
    const labelText = isSection
      ? (n.title || '（未命名章节）')
      : (n.text ? (n.text.length > 60 ? n.text.slice(0, 60) + '…' : n.text) : '（空规则）');

    return `
      <div class="tree-node" style="--indent:${depth};">
        <div class="tree-row kind-${isSection ? 'section' : 'rule'} ${selectedNodeId === n.id ? 'is-selected' : ''}" data-id="${n.id}">
          <span class="tree-handle" data-tip="拖拽">${GameIcons.get('drag')}</span>
          <button class="tree-toggle ${hasChildren ? '' : 'is-empty'} ${collapsed ? 'is-collapsed' : ''}">${GameIcons.get('chevronDown')}</button>
          <span class="tree-num">${n.__num}</span>
          <span class="tree-label">
            <span class="tree-label-icon">${GameIcons.get(isSection ? 'folder' : 'feather')}</span>
            <span class="tree-label-text">${escape(labelText)}</span>
            ${n.locked ? `<span class="badge badge-amber" style="margin-left:auto;">${GameIcons.get('lock')} 锁定</span>` : ''}
          </span>
          <span class="tree-actions">
            ${isSection ? `<button data-act="add-rule" data-tip="加规则">${GameIcons.get('feather')}</button>` : ''}
            <button data-act="add-section" data-tip="加同级章节">${GameIcons.get('plus')}</button>
            <button data-act="duplicate" data-tip="复制">${GameIcons.get('copy')}</button>
            <button data-act="delete" data-tip="删除">${GameIcons.get('trash')}</button>
          </span>
        </div>
        ${isSection ? `
          <div class="tree-children ${collapsed ? 'is-collapsed' : ''}" style="--indent:${depth};">
            ${hasChildren ? renderNodes(n.children, depth + 1) : `<div class="tree-empty-children" style="--indent:${depth};">空 · 可在此添加子节点</div>`}
          </div>
        ` : ''}
      </div>
    `;
  }

  function escape(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

  // —— 在树中找节点（含父） —— //
  function findNode(arr, id, parent = null, index = -1) {
    for (let i = 0; i < (arr || []).length; i++) {
      const n = arr[i];
      if (n.id === id) return { node: n, parent, list: arr, index: i };
      if (n.children) {
        const r = findNode(n.children, id, n, i);
        if (r) return r;
      }
    }
    return null;
  }

  function handleToolAction(act) {
    const doc = activeDoc();
    if (!doc) return;
    const found = selectedNodeId ? findNode(doc.sections, selectedNodeId) : null;

    switch (act) {
      case 'add-section': {
        const newNode = { id: 'n-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), kind: 'section', title: '新章节', children: [] };
        if (found && found.node.kind === 'section') {
          if (!found.node.children) found.node.children = [];
          found.node.children.push(newNode);
        } else if (found) {
          found.list.splice(found.index + 1, 0, newNode);
        } else {
          doc.sections.push(newNode);
        }
        selectedNodeId = newNode.id;
        break;
      }
      case 'add-rule': {
        const newNode = { id: 'n-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), kind: 'rule', text: '' };
        if (found && found.node.kind === 'section') {
          if (!found.node.children) found.node.children = [];
          found.node.children.push(newNode);
        } else if (found) {
          found.list.splice(found.index + 1, 0, newNode);
        } else {
          // 没选中 -> 加入根（包成一节）
          doc.sections.push(newNode);
        }
        selectedNodeId = newNode.id;
        break;
      }
      case 'duplicate': {
        if (!found) return GameNotify.warn('请先选中节点');
        const cp = JSON.parse(JSON.stringify(found.node));
        rekey(cp);
        found.list.splice(found.index + 1, 0, cp);
        selectedNodeId = cp.id;
        break;
      }
      case 'delete': {
        if (!found) return GameNotify.warn('请先选中节点');
        found.list.splice(found.index, 1);
        selectedNodeId = null;
        GameNotify.info('已删除节点', '编号已自动更新。', { duration: 2400 });
        break;
      }
      case 'up': {
        if (!found || found.index === 0) return;
        const tmp = found.list[found.index - 1];
        found.list[found.index - 1] = found.node;
        found.list[found.index] = tmp;
        break;
      }
      case 'down': {
        if (!found || found.index === found.list.length - 1) return;
        const tmp = found.list[found.index + 1];
        found.list[found.index + 1] = found.node;
        found.list[found.index] = tmp;
        break;
      }
      case 'indent': {
        if (!found || found.index === 0) return;
        const prev = found.list[found.index - 1];
        if (prev.kind === 'section') {
          if (!prev.children) prev.children = [];
          prev.children.push(found.node);
          found.list.splice(found.index, 1);
        }
        break;
      }
      case 'outdent': {
        if (!found || !found.parent) return GameNotify.warn('已在最外层');
        const grand = findParent(doc.sections, found.parent.id);
        const list = grand ? grand.list : doc.sections;
        const parentIndex = list.indexOf(found.parent);
        list.splice(parentIndex + 1, 0, found.node);
        found.list.splice(found.index, 1);
        break;
      }
      case 'collapse-all': collapseAll(doc.sections, true); break;
      case 'expand-all': collapseAll(doc.sections, false); break;
    }
    renderTree();
    renderProp();
    renderDocList();
  }

  function rekey(n) {
    n.id = 'n-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    if (n.children) n.children.forEach(rekey);
  }
  function collapseAll(arr, on) {
    (arr || []).forEach(n => {
      if (n.kind === 'section') {
        if (on) collapsedNodes.add(n.id);
        else collapsedNodes.delete(n.id);
        if (n.children) collapseAll(n.children, on);
      }
    });
    renderTree();
  }
  function findParent(arr, id) {
    for (let i = 0; i < arr.length; i++) {
      const n = arr[i];
      if (n.id === id) return null;
      if (n.children) {
        const idx = n.children.findIndex(c => c.id === id);
        if (idx >= 0) return { parent: n, list: n.children, index: idx };
        const r = findParent(n.children, id);
        if (r) return r;
      }
    }
    return null;
  }

  // —— 属性面板 —— //
  function renderProp() {
    const doc = activeDoc();
    if (!doc) {
      modal.el.querySelector('#rules-prop-body').innerHTML = '';
      return;
    }
    if (!selectedNodeId) {
      modal.el.querySelector('#rules-prop-title').innerHTML = `${GameIcons.get('sliders')}<span>文档属性</span>`;
      modal.el.querySelector('#rules-prop-body').innerHTML = docPropHtml(doc);
      bindDocProp(doc);
    } else {
      const found = findNode(doc.sections, selectedNodeId);
      if (!found) return renderProp();
      modal.el.querySelector('#rules-prop-title').innerHTML = `${GameIcons.get(found.node.kind === 'rule' ? 'feather' : 'folder')}<span>${found.node.kind === 'rule' ? '规则节点' : '章节节点'} · ${found.node.__num}</span>`;
      modal.el.querySelector('#rules-prop-body').innerHTML = nodePropHtml(found.node);
      bindNodeProp(found.node);
    }
  }

  function docPropHtml(doc) {
    const trig = doc.trigger || 'always';
    return `
      <div class="prop-card">
        <div class="prop-card-title">基础信息</div>
        <div class="prop-row">
          <span class="prop-row-label">标题</span>
          <input class="input" id="dp-name" value="${escape(doc.name)}"/>
        </div>
        <div class="prop-row">
          <span class="prop-row-label">版本</span>
          <input class="input" id="dp-ver" value="${escape(doc.version || 'v1.0')}"/>
        </div>
        <div class="prop-row">
          <span class="prop-row-label">描述</span>
          <textarea class="textarea" id="dp-desc" rows="3" placeholder="该文档的用途说明……">${escape(doc.desc || '')}</textarea>
        </div>
      </div>

      <div class="prop-card">
        <div class="prop-card-title">触发方式</div>
        <div class="trigger-segs" id="dp-trigger">
          <button data-v="always" class="${trig==='always'?'is-active':''}">${GameIcons.get('flame')}<span>始终激活</span></button>
          <button data-v="keyword" class="${trig==='keyword'?'is-active':''}">${GameIcons.get('hash')}<span>关键词</span></button>
          <button data-v="book" class="${trig==='book'?'is-active':''}">${GameIcons.get('book')}<span>世界书联动</span></button>
          <button data-v="macro" class="${trig==='macro'?'is-active':''}">${GameIcons.get('zap')}<span>宏命令</span></button>
        </div>

        <div class="prop-row">
          <span class="prop-row-label">关键词（回车追加）</span>
          <div class="kw-tag-input" id="dp-keywords">
            ${(doc.keywords || []).map(k => `<span class="kw-tag">${escape(k)}<span class="kw-tag-x" data-k="${escape(k)}">${GameIcons.get('close')}</span></span>`).join('')}
            <input id="dp-kw-input" placeholder="输入并按回车" />
          </div>
          <span class="prop-row-help">逗号或回车均可分隔多个关键词。</span>
        </div>
      </div>

      <div class="prop-card">
        <div class="prop-card-title">注入设置</div>
        <div class="prop-row">
          <span class="prop-row-label">注入位置</span>
          <select class="select" id="dp-injection">
            <option value="before" ${doc.injection==='before'?'selected':''}>角色描述之前</option>
            <option value="after" ${doc.injection==='after'?'selected':''}>角色描述之后</option>
            <option value="system" ${doc.injection==='system'?'selected':''}>系统提示（强制）</option>
          </select>
        </div>
        <div class="prop-row">
          <span class="prop-row-label">渲染格式</span>
          <select class="select" id="dp-format">
            <option value="indent" ${doc.format==='indent'?'selected':''}>缩进列表</option>
            <option value="numeric" ${doc.format==='numeric'?'selected':''}>纯编号</option>
            <option value="quote" ${doc.format==='quote'?'selected':''}>引用块</option>
          </select>
        </div>
        <div class="prop-row">
          <span class="prop-row-label">最大注入深度：${doc.maxDepth || 3}</span>
          <input type="range" class="depth-slider" id="dp-depth" min="1" max="6" value="${doc.maxDepth || 3}" />
          <span class="prop-row-help">超过该深度的子节点将不被注入，避免上下文冗长。</span>
        </div>
      </div>

      <div class="alert alert-info">
        <span class="alert-icon">${GameIcons.get('info')}</span>
        <div class="alert-body">
          <div class="alert-title">提示</div>
          当文档「常驻激活」时，每轮都会注入。仅有具体规则会被渲染，章节标题视格式而定。
        </div>
      </div>
    `;
  }

  function bindDocProp(doc) {
    const root = modal.el.querySelector('#rules-prop-body');
    root.querySelector('#dp-name').addEventListener('input', e => { doc.name = e.target.value; renderDocList(); });
    root.querySelector('#dp-ver').addEventListener('input', e => { doc.version = e.target.value; renderDocList(); });
    root.querySelector('#dp-desc').addEventListener('input', e => { doc.desc = e.target.value; });
    root.querySelectorAll('#dp-trigger button').forEach(b => {
      b.addEventListener('click', () => {
        root.querySelectorAll('#dp-trigger button').forEach(x => x.classList.remove('is-active'));
        b.classList.add('is-active');
        doc.trigger = b.getAttribute('data-v');
        renderDocList();
      });
    });
    const kwInput = root.querySelector('#dp-kw-input');
    const kwBox = root.querySelector('#dp-keywords');
    kwInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const v = kwInput.value.trim().replace(/,/g, '');
        if (v && !(doc.keywords || []).includes(v)) {
          doc.keywords = doc.keywords || [];
          doc.keywords.push(v);
          renderProp();
          setTimeout(() => modal.el.querySelector('#dp-kw-input')?.focus(), 0);
        }
        kwInput.value = '';
      }
    });
    kwBox.querySelectorAll('.kw-tag-x').forEach(x => {
      x.addEventListener('click', () => {
        const k = x.getAttribute('data-k');
        doc.keywords = (doc.keywords || []).filter(z => z !== k);
        renderProp();
      });
    });
    root.querySelector('#dp-injection').addEventListener('change', e => doc.injection = e.target.value);
    root.querySelector('#dp-format').addEventListener('change', e => doc.format = e.target.value);
    root.querySelector('#dp-depth').addEventListener('input', e => {
      doc.maxDepth = +e.target.value;
      e.target.previousElementSibling.textContent = `最大注入深度：${doc.maxDepth}`;
    });
  }

  function nodePropHtml(node) {
    if (node.kind === 'rule') {
      return `
        <div class="prop-card">
          <div class="prop-card-title">规则文本</div>
          <textarea class="rule-text-editor" id="np-text" placeholder="写下一条规则……可使用 {{user}} / {{char}} 变量。">${escape(node.text || '')}</textarea>
          <div class="prop-row">
            <span class="prop-row-label">变量插入</span>
            <div class="var-insert">
              <button data-v="{{user}}">{{user}}</button>
              <button data-v="{{char}}">{{char}}</button>
              <button data-v="{{location}}">{{location}}</button>
              <button data-v="{{date}}">{{date}}</button>
              <button data-v="{{rand:1-20}}">{{rand:1-20}}</button>
            </div>
          </div>
        </div>
        <div class="prop-card">
          <div class="prop-card-title">编号</div>
          <div class="prop-row row-inline">
            <span class="prop-row-label">自动编号</span>
            <span style="font-family: var(--font-mono); color: var(--accent);">${node.__num}</span>
          </div>
          <div class="prop-row row-inline">
            <span class="prop-row-label">手动覆写</span>
            <label class="switch"><input type="checkbox" id="np-locked" ${node.locked ? 'checked' : ''}><span class="switch-track"></span></label>
          </div>
          <div class="prop-row">
            <input class="input" id="np-num-override" placeholder="例如：1.2.附" value="${escape(node.numOverride || '')}" ${node.locked ? '' : 'disabled'} />
          </div>
        </div>
      `;
    }
    return `
      <div class="prop-card">
        <div class="prop-card-title">章节标题</div>
        <input class="input" id="np-title" value="${escape(node.title || '')}" placeholder="例如：第三章 部活与社团"/>
        <span class="prop-row-help">标题为空时将不显示，仅作分组之用。</span>
      </div>
      <div class="prop-card">
        <div class="prop-card-title">编号</div>
        <div class="prop-row row-inline">
          <span class="prop-row-label">自动编号</span>
          <span style="font-family: var(--font-mono); color: var(--accent);">${node.__num}</span>
        </div>
        <div class="prop-row row-inline">
          <span class="prop-row-label">手动覆写</span>
          <label class="switch"><input type="checkbox" id="np-locked" ${node.locked ? 'checked' : ''}><span class="switch-track"></span></label>
        </div>
      </div>
      <div class="prop-card">
        <div class="prop-card-title">子节点</div>
        <div style="display:flex; gap: var(--sp-3);">
          <button class="btn btn-ghost btn-sm" id="np-add-section">${GameIcons.get('plus')}<span>添加子章节</span></button>
          <button class="btn btn-ghost btn-sm" id="np-add-rule">${GameIcons.get('feather')}<span>添加规则</span></button>
        </div>
      </div>
    `;
  }

  function bindNodeProp(node) {
    const root = modal.el.querySelector('#rules-prop-body');
    if (node.kind === 'rule') {
      root.querySelector('#np-text').addEventListener('input', e => { node.text = e.target.value; renderTree(); });
      root.querySelector('#np-locked').addEventListener('change', e => { node.locked = e.target.checked; renderTree(); renderProp(); });
      root.querySelector('#np-num-override')?.addEventListener('input', e => node.numOverride = e.target.value);
      root.querySelectorAll('.var-insert button').forEach(b => b.addEventListener('click', () => {
        const t = root.querySelector('#np-text');
        const v = b.getAttribute('data-v');
        const start = t.selectionStart, end = t.selectionEnd;
        t.value = t.value.slice(0, start) + v + t.value.slice(end);
        t.selectionStart = t.selectionEnd = start + v.length;
        node.text = t.value;
        t.focus();
        renderTree();
      }));
    } else {
      root.querySelector('#np-title').addEventListener('input', e => { node.title = e.target.value; renderTree(); });
      root.querySelector('#np-locked').addEventListener('change', e => { node.locked = e.target.checked; renderTree(); });
      root.querySelector('#np-add-section').addEventListener('click', () => handleToolAction('add-section'));
      root.querySelector('#np-add-rule').addEventListener('click', () => handleToolAction('add-rule'));
    }
  }

  // —— 预览 —— //
  function openPreview() {
    const doc = activeDoc();
    if (!doc) return;
    const previewHtml = renderDocPreview(doc, doc.maxDepth || 3);
    GameModal.open({
      size: 'lg', icon: 'eye',
      title: `${doc.name} · 预览`,
      subtitle: `Format: ${doc.format} · Depth: ${doc.maxDepth}`,
      body: `
        <div style="padding: var(--sp-10) var(--sp-12); width: 100%;">
          <div class="alert alert-info" style="margin-bottom: var(--sp-8);">
            <span class="alert-icon">${GameIcons.get('info')}</span>
            <div class="alert-body">
              <div class="alert-title">下方为最终注入对话上下文的渲染示例。</div>
              触发方式：${ ({always:'常驻激活', keyword:'关键词触发', book:'世界书联动', macro:'宏命令'})[doc.trigger] }
              ${doc.trigger === 'keyword' ? ` · 关键词：${(doc.keywords||[]).map(k=>`「${k}」`).join('、')}` : ''}
            </div>
          </div>
          <div class="rules-preview-modal-body">${previewHtml}</div>
        </div>
      `,
      footer: `
        <div class="modal-foot-info">提示：在格式、深度、关键词改动后，可重复点击「预览」查看效果。</div>
      `,
    });
  }

  function renderDocPreview(doc, maxDepth) {
    if (doc.format === 'indent') {
      return renderIndent(doc.sections, 1, maxDepth);
    } else if (doc.format === 'numeric') {
      return renderNumeric(doc.sections, maxDepth, []);
    } else {
      return renderQuote(doc.sections, 1, maxDepth);
    }
  }
  function renderIndent(arr, depth, max) {
    if (depth > max) return '';
    return (arr || []).map(n => {
      if (n.kind === 'rule') return `<li>${escape(n.text || '')}</li>`;
      const childHtml = renderIndent(n.children, depth + 1, max);
      return `<h3>${n.__num} ${escape(n.title || '')}</h3>${childHtml ? `<ol>${childHtml}</ol>` : ''}`;
    }).join('');
  }
  function renderNumeric(arr, max, path) {
    return (arr || []).map((n, i) => {
      const cur = [...path, i + 1];
      if (cur.length > max) return '';
      if (n.kind === 'rule') return `<div>${cur.join('.')} ${escape(n.text || '')}</div>`;
      return `<div><strong>${cur.join('.')} ${escape(n.title || '')}</strong></div>${renderNumeric(n.children, max, cur)}`;
    }).join('');
  }
  function renderQuote(arr, depth, max) {
    if (depth > max) return '';
    return (arr || []).map(n => {
      if (n.kind === 'rule') return `<blockquote style="margin: var(--sp-3) 0; padding: 4px var(--sp-7); border-left: 3px solid var(--wisteria-300); color: var(--fg-tertiary);">${escape(n.text || '')}</blockquote>`;
      return `<h3>${n.__num} ${escape(n.title || '')}</h3>${renderQuote(n.children, depth + 1, max)}`;
    }).join('');
  }

  window.GameRulesEditor = { open };
})();
