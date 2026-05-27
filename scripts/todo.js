/* scripts/todo.js — 待办审批面板（修复 game4 逻辑缺陷） */
(function () {
  const CURRENT_USER_ID = 'ch-mc';

  // Match a character's org roles against a flow step's "who" description.
  function doesUserMatchProcessor(charId, whoField) {
    const ch = (GameData.characters || []).find(c => c.id === charId);
    if (!ch || !ch.orgs) return false;
    const roles = ch.orgs.map(o => o.role).filter(Boolean);
    return roles.some(role => whoField.includes(role));
  }

  function getFlowSteps(tplId) {
    const tpl = (GameData.formTemplates || []).find(t => t.id === tplId);
    return tpl ? tpl.flow || [] : [];
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

  function open() {
    let activeTab = 'my-applications';

    function tabsHtml() {
      return `
        <button class="chip-btn ${activeTab === 'my-applications' ? 'is-active' : ''}" data-todo-tab="my-applications" style="margin-right:8px;">
          我申请的但尚未批复的
        </button>
        <button class="chip-btn ${activeTab === 'pending-approval' ? 'is-active' : ''}" data-todo-tab="pending-approval">
          需要我批复的
        </button>
      `;
    }

    function buildProgressBar(flow, currentStepIdx) {
      if (!flow || !flow.length) return '';
      return `
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
          ${flow.map((s, i) => `
            <span style="flex:1;min-width:80px;padding:4px 8px;border-radius:6px;text-align:center;font-size:11px;
              ${i < currentStepIdx ? 'background:rgba(95,201,154,0.08);border:1px solid rgba(95,201,154,0.3);color:var(--moss-200);' : ''}
              ${i === currentStepIdx ? 'background:rgba(255,174,66,0.10);border:1px solid rgba(255,174,66,0.45);color:var(--amber-200);font-weight:500;' : ''}
              ${i > currentStepIdx ? 'background:rgba(255,255,255,0.02);border:1px solid var(--border-soft);color:var(--fg-quaternary);' : ''}
            ">
              <span style="font-size:9px;color:var(--fg-quaternary);">${i + 1}.</span> ${esc(s.name.slice(0, 8))}${s.name.length > 8 ? '…' : ''}
            </span>
          `).join('')}
        </div>
      `;
    }

    function myApplicationsBody() {
      const records = (GameData.formRecords || []).filter(r =>
        r.who === CURRENT_USER_ID && r.status === 'pending'
      );
      if (!records.length) return '<div style="padding:20px;color:var(--fg-quaternary);text-align:center;">暂无待批复的申请。</div>';

      return records.map(rec => {
        const tpl = (GameData.formTemplates || []).find(t => t.id === rec.tplId);
        const flow = getFlowSteps(rec.tplId);
        const stepIdx = rec.currentStep || 0;
        return `
          <div style="background:var(--ink-800);border-radius:8px;padding:16px;margin-bottom:12px;border:1px solid var(--border-soft);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:15px;font-weight:600;">${esc(tpl ? tpl.name : rec.tplId)}</span>
                <span class="badge badge-amber">审批中</span>
              </div>
              <span style="font-size:12px;color:var(--fg-quaternary);">${esc(rec.applied)}</span>
            </div>
            <div style="font-size:13px;color:var(--fg-tertiary);margin-bottom:8px;">${esc(rec.brief || '—')}</div>
            ${rec.formData ? `
              <div style="margin-bottom:8px;padding:8px 12px;background:rgba(255,255,255,0.02);border-radius:6px;">
                ${Object.entries(rec.formData).map(([k, v]) => `<div style="font-size:12px;color:var(--fg-secondary);margin:2px 0;"><span style="color:var(--fg-quaternary);">${esc(k)}:</span> ${esc(String(v))}</div>`).join('')}
              </div>
            ` : ''}
            ${buildProgressBar(flow, stepIdx)}
            <div style="font-size:11px;color:var(--fg-quaternary);margin-top:6px;">
              当前步骤: ${stepIdx < flow.length ? esc(flow[stepIdx]?.name || '—') : '已完成'}
              · 审批人: ${stepIdx < flow.length ? esc(flow[stepIdx]?.who || '—') : '—'}
            </div>
          </div>
        `;
      }).join('');
    }

    function pendingApprovalBody() {
      const records = (GameData.formRecords || []).filter(r => r.status === 'pending');
      const mine = records.filter(rec => {
        const flow = getFlowSteps(rec.tplId);
        const stepIdx = rec.currentStep || 0;
        if (stepIdx >= flow.length) return false;
        return doesUserMatchProcessor(CURRENT_USER_ID, flow[stepIdx].who || '');
      });

      if (!mine.length) return '<div style="padding:20px;color:var(--fg-quaternary);text-align:center;">暂无需要你批复的申请。</div>';

      return mine.map(rec => {
        const tpl = (GameData.formTemplates || []).find(t => t.id === rec.tplId);
        const flow = getFlowSteps(rec.tplId);
        const stepIdx = rec.currentStep || 0;
        const step = flow[stepIdx];
        const applicant = (GameData.characters || []).find(c => c.id === rec.who);

        return `
          <div style="background:var(--ink-800);border-radius:8px;padding:16px;margin-bottom:12px;border:1px solid rgba(255,107,154,0.2);" data-record-id="${rec.id}">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:15px;font-weight:600;">${esc(tpl ? tpl.name : rec.tplId)}</span>
                <span class="badge badge-sakura">待我批复</span>
              </div>
              <span style="font-size:12px;color:var(--fg-quaternary);">${esc(rec.applied)}</span>
            </div>
            <div style="font-size:13px;color:var(--fg-secondary);margin-bottom:4px;">
              申请人: ${esc(applicant ? applicant.name : rec.who)}
            </div>
            <div style="font-size:13px;color:var(--fg-tertiary);margin-bottom:8px;">${esc(rec.brief || '—')}</div>
            ${rec.formData ? `
              <div style="margin-bottom:8px;padding:8px 12px;background:rgba(255,255,255,0.02);border-radius:6px;">
                ${Object.entries(rec.formData).map(([k, v]) => `<div style="font-size:12px;color:var(--fg-secondary);margin:2px 0;"><span style="color:var(--fg-quaternary);">${esc(k)}:</span> ${esc(String(v))}</div>`).join('')}
              </div>
            ` : ''}
            ${buildProgressBar(flow, stepIdx)}
            <div style="font-size:11px;color:var(--fg-quaternary);margin-top:6px;">
              当前步骤: ${step ? esc(step.name) : '—'} · 审批人: ${step ? esc(step.who) : '—'}
            </div>
            <div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end;">
              <button class="chip-btn" data-approve="${rec.id}" style="color:var(--moss-200);border-color:rgba(95,201,154,0.3);">
                批准通过
              </button>
              ${step && step.allowReject ? `
                <button class="chip-btn" data-reject="${rec.id}" style="color:var(--sakura-200);border-color:rgba(255,107,154,0.3);">
                  打回重填
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    function refreshContent() {
      const content = document.getElementById('todo-content');
      if (content) {
        content.innerHTML = activeTab === 'my-applications' ? myApplicationsBody() : pendingApprovalBody();
        bindButtons();
      }
    }

    function handleApproval(recId, action) {
      const records = GameData.formRecords || [];
      const rec = records.find(r => r.id === recId);
      if (!rec) return;

      const flow = getFlowSteps(rec.tplId);
      const stepIdx = rec.currentStep || 0;

      if (action === 'rejected') {
        rec.status = 'rejected';
        if (typeof GameNotify !== 'undefined') {
          GameNotify.info('已打回', '申请已退回给申请人修改。', { duration: 3000 });
        }
      } else {
        const nextStep = stepIdx + 1;
        if (nextStep >= flow.length) {
          rec.status = 'approved';
          rec.currentStep = flow.length;
          if (typeof GameNotify !== 'undefined') {
            GameNotify.success('全部审批通过', '该申请已完成所有审批步骤。', { duration: 3000 });
          }
        } else {
          rec.currentStep = nextStep;
          if (typeof GameNotify !== 'undefined') {
            GameNotify.success('已批准', `流转至: ${flow[nextStep].name}`, { duration: 3000 });
          }
        }
      }

      refreshContent();
    }

    function bindButtons() {
      document.querySelectorAll('#todo-content [data-approve]').forEach(btn => {
        btn.addEventListener('click', () => handleApproval(btn.getAttribute('data-approve'), 'approved'));
      });
      document.querySelectorAll('#todo-content [data-reject]').forEach(btn => {
        btn.addEventListener('click', () => handleApproval(btn.getAttribute('data-reject'), 'rejected'));
      });
    }

    const modal = GameModal.open({
      size: 'lg', icon: 'edit',
      title: '待办审批',
      subtitle: '跟踪申请进度 · 处理待批复事项',
      body: `
        <div style="padding:20px;">
          <div style="margin-bottom:20px;display:flex;align-items:center;gap:4px;">${tabsHtml()}</div>
          <div id="todo-content">${myApplicationsBody()}</div>
        </div>
      `,
    });

    // Tab switching
    modal.el.querySelectorAll('[data-todo-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-todo-tab');
        modal.el.querySelectorAll('[data-todo-tab]').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        refreshContent();
      });
    });

    bindButtons();

    return modal;
  }

  window.GameTodo = { open };
})();
