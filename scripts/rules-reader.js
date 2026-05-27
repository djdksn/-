/* scripts/rules-reader.js — 规章与表单阅读器 */
(function () {
  const CURRENT_USER_ID = 'ch-mc';
  const CURRENT_USER_NAME = '主人公（你）';

  function open() {
    let activeTab = 'rules';

    function tabsHtml() {
      const tabs = [
        { id: 'rules', label: '规章文档', desc: '已发布的校规与社团守则' },
        { id: 'forms', label: '申请表', desc: '可填写的各类申请表格' },
      ];
      return tabs.map(t =>
        `<button class="chip-btn ${activeTab === t.id ? 'is-active' : ''}" data-reader-tab="${t.id}" style="margin-right:8px;">${t.label}<span style="margin-left:4px;font-size:11px;color:var(--fg-quaternary);">${t.desc}</span></button>`
      ).join('');
    }

    function rulesBody() {
      const docs = GameData.ruleDocs || [];
      if (!docs.length) return '<div style="padding:20px;color:var(--fg-quaternary);text-align:center;">暂无已发布的规章文档。</div>';
      return docs.map(doc => buildRuleDoc(doc)).join('');
    }

    function buildRuleDoc(doc) {
      function renderSections(sections, depth) {
        return sections.map(s => `
          <div style="margin-left:${depth * 20}px;margin-bottom:6px;">
            <div style="font-weight:600;color:var(--fg-primary);margin-bottom:4px;">${esc(s.title || '')}</div>
            ${s.children ? renderChildren(s.children, depth + 1) : ''}
          </div>
        `).join('');
      }

      function renderChildren(children, depth) {
        return children.map(c => {
          if (c.kind === 'rule') {
            return `<div style="margin-left:${depth * 20}px;padding:4px 0;color:var(--fg-secondary);font-size:14px;line-height:1.7;">${esc(c.text || '')}</div>`;
          }
          return renderSections([c], depth);
        }).join('');
      }

      return `
        <div style="background:var(--ink-800);border-radius:8px;padding:16px;margin-bottom:12px;border:1px solid var(--border-soft);">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="font-size:16px;font-weight:600;">${esc(doc.name)}</span>
            <span class="badge badge-ink">${esc(doc.version)}</span>
            ${doc.trigger === 'always' ? '<span class="badge badge-sakura">常驻注入</span>' : '<span class="badge badge-wisteria">关键词触发</span>'}
          </div>
          <div style="font-size:13px;color:var(--fg-tertiary);margin-bottom:12px;">${esc(doc.desc || '')}</div>
          ${doc.keywords ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">${doc.keywords.map(k => `<span style="background:rgba(106,85,214,0.12);padding:2px 8px;border-radius:99px;font-size:11px;color:var(--wisteria-300);">${esc(k)}</span>`).join('')}</div>` : ''}
          <div style="border-top:1px solid var(--border-soft);padding-top:12px;">
            ${doc.sections ? renderSections(doc.sections, 0) : '<div style="color:var(--fg-quaternary);">暂无内容</div>'}
          </div>
        </div>
      `;
    }

    function formsBody() {
      const templates = GameData.formTemplates || [];
      if (!templates.length) return '<div style="padding:20px;color:var(--fg-quaternary);text-align:center;">暂无可用申请表。</div>';
      return templates.map(tpl => buildFormCard(tpl)).join('');
    }

    function buildFormCard(tpl) {
      const fieldCount = tpl.groups ? tpl.groups.reduce((s, g) => s + (g.fields ? g.fields.length : 0), 0) : 0;
      const stepCount = tpl.flow ? tpl.flow.length : 0;
      return `
        <div style="background:var(--ink-800);border-radius:8px;padding:16px;margin-bottom:12px;border:1px solid var(--border-soft);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:16px;font-weight:600;">${esc(tpl.name)}</span>
              <span class="badge badge-ink">${esc(tpl.code)}</span>
              <span class="badge badge-wisteria">${esc(tpl.version)}</span>
            </div>
            <button class="chip-btn chip-btn-primary" data-fill-form="${tpl.id}" style="font-weight:500;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:14px;height:14px;"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span>填写此表</span>
            </button>
          </div>
          <div style="font-size:13px;color:var(--fg-tertiary);margin-bottom:10px;">${esc(tpl.desc)} · 有效期 ${tpl.validityDays || '—'} 天 · ${fieldCount} 字段 · ${stepCount} 审批步骤</div>
          ${tpl.flow ? `
            <div style="border-top:1px solid var(--border-soft);padding-top:10px;margin-bottom:10px;">
              <div style="font-size:12px;color:var(--fg-quaternary);margin-bottom:6px;letter-spacing:0.08em;">审批流程</div>
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                ${tpl.flow.map((s, i) => `
                  <span style="display:flex;align-items:center;gap:4px;">
                    ${i > 0 ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="width:12px;height:12px;color:var(--fg-quaternary);"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
                    <span style="background:rgba(255,255,255,0.03);border:1px solid var(--border-soft);border-radius:6px;padding:4px 8px;font-size:12px;color:var(--fg-secondary);">
                      <span style="color:var(--fg-quaternary);font-size:10px;">${i + 1}.</span> ${esc(s.name)}<br>
                      <span style="font-size:10px;color:var(--fg-quaternary);">审批人: ${esc(s.who)}</span>
                    </span>
                  </span>
                `).join('')}
              </div>
            </div>
          ` : ''}
          ${tpl.groups ? `
            <div style="border-top:1px solid var(--border-soft);padding-top:10px;">
              <div style="font-size:12px;color:var(--fg-quaternary);margin-bottom:6px;letter-spacing:0.08em;">表格字段</div>
              ${tpl.groups.map(g => `
                <div style="margin-bottom:8px;">
                  <div style="font-size:13px;font-weight:500;color:var(--fg-secondary);margin-bottom:4px;">${esc(g.name)}</div>
                  ${g.fields ? g.fields.map(f => `
                    <div style="display:flex;align-items:center;gap:6px;padding:2px 0 2px 12px;font-size:12px;color:var(--fg-tertiary);">
                      <span style="color:${f.required ? 'var(--accent)' : 'var(--fg-quaternary)'};">${f.required ? '*' : ' '}</span>
                      <span>${esc(f.label)}</span>
                      <span style="color:var(--fg-quaternary);">· ${esc(f.type)}${f.min ? ' ≥' + f.min + '字' : ''}${f.options ? ' [' + f.options.join('/') + ']' : ''}</span>
                    </div>
                  `).join('') : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }

    function bodyHtml() {
      return `
        <div style="padding:20px;">
          <div style="margin-bottom:20px;display:flex;align-items:center;gap:4px;">${tabsHtml()}</div>
          <div id="reader-content">${activeTab === 'rules' ? rulesBody() : formsBody()}</div>
        </div>
      `;
    }

    const modal = GameModal.open({
      size: 'lg', icon: 'book',
      title: '规章阅读器',
      subtitle: '浏览已发布的规章制度与申请表格',
      body: bodyHtml(),
    });

    // Tab switching
    modal.el.querySelectorAll('[data-reader-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-reader-tab');
        modal.el.querySelectorAll('[data-reader-tab]').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const content = modal.el.querySelector('#reader-content');
        content.innerHTML = activeTab === 'rules' ? rulesBody() : formsBody();
        bindFormFillButtons(modal);
      });
    });

    bindFormFillButtons(modal);

    return modal;
  }

  function bindFormFillButtons(modal) {
    modal.el.querySelectorAll('[data-fill-form]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tplId = btn.getAttribute('data-fill-form');
        const tpl = (GameData.formTemplates || []).find(f => f.id === tplId);
        if (tpl) openFillForm(tpl, modal);
      });
    });
  }

  function openFillForm(tpl, parentModal) {
    const groups = tpl.groups || [];

    function fieldsHtml() {
      return groups.map(g => `
        <div style="margin-bottom:16px;">
          <div style="font-size:14px;font-weight:600;color:var(--fg-primary);margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border-soft);">${esc(g.name)}</div>
          ${(g.fields || []).map(f => fieldHtml(f)).join('')}
        </div>
      `).join('');
    }

    function fieldHtml(f) {
      const fid = 'fill-' + f.id;
      let input;
      switch (f.type) {
        case 'select':
          input = `<select id="${fid}" style="width:100%;padding:8px 10px;border-radius:6px;background:var(--ink-850);border:1px solid var(--border-base);color:var(--fg-primary);font-size:13px;">${(f.options || []).map(o => `<option>${esc(o)}</option>`).join('')}</select>`;
          break;
        case 'date':
        case 'datetime':
          input = `<input id="${fid}" type="date" style="width:100%;padding:8px 10px;border-radius:6px;background:var(--ink-850);border:1px solid var(--border-base);color:var(--fg-primary);font-size:13px;" />`;
          break;
        case 'radio':
          input = `<div style="display:flex;gap:12px;flex-wrap:wrap;">${(f.options || []).map(o => `<label style="display:flex;align-items:center;gap:4px;font-size:13px;color:var(--fg-secondary);cursor:pointer;"><input type="radio" name="${fid}" value="${esc(o)}" style="accent-color:var(--accent);" /> ${esc(o)}</label>`).join('')}</div>`;
          break;
        case 'textarea':
          input = `<textarea id="${fid}" rows="4" placeholder="${esc(f.placeholder || '')}" style="width:100%;padding:8px 10px;border-radius:6px;background:var(--ink-850);border:1px solid var(--border-base);color:var(--fg-primary);font-size:13px;resize:vertical;font-family:var(--font-sans);"></textarea>`;
          break;
        default:
          input = `<input id="${fid}" type="text" placeholder="${esc(f.placeholder || '')}" style="width:100%;padding:8px 10px;border-radius:6px;background:var(--ink-850);border:1px solid var(--border-base);color:var(--fg-primary);font-size:13px;" />`;
      }
      return `
        <div style="margin-bottom:10px;">
          <label style="display:block;font-size:12px;color:var(--fg-tertiary);margin-bottom:3px;">${esc(f.label)}${f.required ? ' <span style="color:var(--accent);">*</span>' : ''}</label>
          ${input}
        </div>
      `;
    }

    function collectData() {
      const data = {};
      groups.forEach(g => {
        (g.fields || []).forEach(f => {
          const fid = 'fill-' + f.id;
          const el = document.getElementById(fid);
          if (!el) return;
          if (f.type === 'radio') {
            const checked = document.querySelector(`input[name="${fid}"]:checked`);
            if (checked) data[f.label] = checked.value;
          } else {
            data[f.label] = el.value || '';
          }
        });
      });
      return data;
    }

    if (typeof GameModal === 'undefined') return;

    const fillModal = GameModal.open({
      size: 'md', icon: 'edit',
      title: `填写：${tpl.name}`,
      subtitle: `${tpl.code} · 有效期 ${tpl.validityDays || '—'} 天`,
      body: `
        <div style="padding:20px;">
          ${fieldsHtml()}
          <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
            <button class="chip-btn" id="fill-cancel">取消</button>
            <button class="chip-btn chip-btn-primary" id="fill-submit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:14px;height:14px;"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span>提交申请</span>
            </button>
          </div>
        </div>
      `,
    });

    fillModal.el.querySelector('#fill-cancel').addEventListener('click', () => {
      fillModal.close?.();
    });

    fillModal.el.querySelector('#fill-submit').addEventListener('click', () => {
      const formData = collectData();
      const brief = Object.values(formData).filter(Boolean).slice(0, 2).join('；');
      const newRecord = {
        id: 'rec-' + crypto.randomUUID().slice(0, 8),
        tplId: tpl.id,
        who: CURRENT_USER_ID,
        applied: new Date().toISOString().replace('T', ' ').slice(0, 16),
        status: 'pending',
        currentStep: 0,
        brief: brief || '已提交申请',
        formData: formData,
      };
      if (!GameData.formRecords) GameData.formRecords = [];
      GameData.formRecords.push(newRecord);

      fillModal.close?.();
      if (typeof GameNotify !== 'undefined') {
        GameNotify.success('申请已提交', `「${tpl.name}」进入审批流程，共 ${tpl.flow ? tpl.flow.length : 0} 步。`, { duration: 4000 });
      }
    });
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

  window.GameRulesReader = { open };
})();
