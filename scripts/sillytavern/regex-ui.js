/**
 * Regex UI — Management modals for regex scripts.
 * Uses GameModal for consistent look and feel.
 */
import { store } from '../sillytavern-store.js';
import { PLACEMENT_LABELS, SUBSTITUTE_LABELS, REGEX_PLACEMENT, SUBSTITUTE_FIND_REGEX, getRegexedString } from './regex-engine.js';
import { exportToJson, importJsonFile } from './importer.js';

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

// ========== REGEX MANAGER ==========

export function openRegexManager() {
  function build() {
    const scripts = store.regexScripts;
    const listItems = scripts.length === 0
      ? `<div style="color:var(--fg-tertiary);text-align:center;padding:20px;">暂无正则脚本。点击 "新建脚本" 创建第一个。</div>`
      : scripts.map(scr => {
          const placements = (scr.placement || []).map(p => PLACEMENT_LABELS[p] || '?').join(', ') || '未设置';
          const statusBadge = scr.disabled
            ? `<span style="background:var(--red-700);color:var(--red-100);padding:1px 6px;border-radius:3px;font-size:10px;">禁用</span>`
            : `<span style="background:var(--green-700);color:var(--green-100);padding:1px 6px;border-radius:3px;font-size:10px;">启用</span>`;
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--ink-700);gap:12px;">
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;color:var(--fg-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(scr.scriptName)} ${statusBadge}</div>
                <div style="font-size:11px;color:var(--fg-tertiary);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">查找: ${esc(scr.findRegex || '(空)')} → 替换: ${esc(scr.replaceString || '(空)')}</div>
                <div style="font-size:10px;color:var(--fg-tertiary);margin-top:1px;">位置: ${placements}</div>
              </div>
              <div style="display:flex;gap:4px;flex-shrink:0;">
                <button data-regex-edit="${scr.id}" style="padding:4px 8px;font-size:11px;border:1px solid var(--ink-600);border-radius:4px;background:var(--ink-700);color:var(--fg-secondary);cursor:pointer;">编辑</button>
                <button data-regex-clone="${scr.id}" style="padding:4px 8px;font-size:11px;border:1px solid var(--ink-600);border-radius:4px;background:var(--ink-700);color:var(--fg-secondary);cursor:pointer;">克隆</button>
                <button data-regex-delete="${scr.id}" style="padding:4px 8px;font-size:11px;border:1px solid var(--ink-600);border-radius:4px;background:var(--ink-700);color:var(--red-400);cursor:pointer;">删除</button>
              </div>
            </div>`;
        }).join('');

    return `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;gap:8px;align-items:center;">
          <button id="rx-new-script" style="padding:6px 14px;font-size:13px;border-radius:6px;border:1px solid var(--amber-700);background:var(--amber-800);color:var(--amber-100);cursor:pointer;">+ 新建脚本</button>
          <button id="rx-import" style="padding:6px 14px;font-size:13px;border-radius:6px;border:1px solid var(--ink-600);background:var(--ink-700);color:var(--fg-secondary);cursor:pointer;">导入</button>
          <button id="rx-export-all" style="padding:6px 14px;font-size:13px;border-radius:6px;border:1px solid var(--ink-600);background:var(--ink-700);color:var(--fg-secondary);cursor:pointer;">导出全部</button>
          <span style="font-size:12px;color:var(--fg-tertiary);margin-left:auto;">共 ${scripts.length} 个</span>
        </div>
        <div id="rx-list-container" style="max-height:50vh;overflow-y:auto;border:1px solid var(--ink-700);border-radius:8px;background:var(--ink-900);">
          ${listItems}
        </div>
      </div>`;
  }

  function refreshBody() {
    const container = document.querySelector('#rx-list-container');
    if (!container) return;
    const scripts = store.regexScripts;
    const listItems = scripts.length === 0
      ? `<div style="color:var(--fg-tertiary);text-align:center;padding:20px;">暂无正则脚本。点击 "新建脚本" 创建第一个。</div>`
      : scripts.map(scr => {
          const placements = (scr.placement || []).map(p => PLACEMENT_LABELS[p] || '?').join(', ') || '未设置';
          const statusBadge = scr.disabled
            ? `<span style="background:var(--red-700);color:var(--red-100);padding:1px 6px;border-radius:3px;font-size:10px;">禁用</span>`
            : `<span style="background:var(--green-700);color:var(--green-100);padding:1px 6px;border-radius:3px;font-size:10px;">启用</span>`;
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--ink-700);gap:12px;">
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;color:var(--fg-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(scr.scriptName)} ${statusBadge}</div>
                <div style="font-size:11px;color:var(--fg-tertiary);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">查找: ${esc(scr.findRegex || '(空)')} → 替换: ${esc(scr.replaceString || '(空)')}</div>
                <div style="font-size:10px;color:var(--fg-tertiary);margin-top:1px;">位置: ${placements}</div>
              </div>
              <div style="display:flex;gap:4px;flex-shrink:0;">
                <button data-regex-edit="${scr.id}" style="padding:4px 8px;font-size:11px;border:1px solid var(--ink-600);border-radius:4px;background:var(--ink-700);color:var(--fg-secondary);cursor:pointer;">编辑</button>
                <button data-regex-clone="${scr.id}" style="padding:4px 8px;font-size:11px;border:1px solid var(--ink-600);border-radius:4px;background:var(--ink-700);color:var(--fg-secondary);cursor:pointer;">克隆</button>
                <button data-regex-delete="${scr.id}" style="padding:4px 8px;font-size:11px;border:1px solid var(--ink-600);border-radius:4px;background:var(--ink-700);color:var(--red-400);cursor:pointer;">删除</button>
              </div>
            </div>`;
        }).join('');
    container.innerHTML = listItems;
  }

  const body = build();
  const modal = window.GameModal.open({ size: 'lg', title: '正则脚本管理', subtitle: '创建和编辑文本替换规则', body });

  requestAnimationFrame(() => {
    const el = modal.el;
    if (!el) return;

    el.querySelector('#rx-new-script')?.addEventListener('click', async () => {
      const script = await store.addRegexScript();
      refreshBody();
      setTimeout(() => openRegexEditor(script, { onSaved: refreshBody }), 100);
    });

    el.querySelector('#rx-import')?.addEventListener('click', async () => {
      const data = await importJsonFile();
      if (!data) return;
      const scripts = Array.isArray(data) ? data : (data.regexScripts || [data]);
      await store.importRegexScripts(scripts);
      refreshBody();
      store.showToast(`已导入 ${scripts.length} 个脚本`);
    });

    el.querySelector('#rx-export-all')?.addEventListener('click', () => {
      exportToJson(store.regexScripts, `regex-scripts-${Date.now()}.json`);
      store.showToast('已导出全部脚本');
    });

    // Event delegation on the list container — survives refreshBody() replacements
    const listContainer = el.querySelector('#rx-list-container');
    if (listContainer) {
      listContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const editId = btn.dataset.regexEdit;
        if (editId) {
          const script = store.regexScripts.find(s => s.id === editId);
          if (script) openRegexEditor(script, { onSaved: refreshBody });
          return;
        }

        const cloneId = btn.dataset.regexClone;
        if (cloneId) {
          const src = store.regexScripts.find(s => s.id === cloneId);
          if (!src) return;
          const clone = { ...src, id: crypto.randomUUID(), scriptName: src.scriptName + ' (副本)', createdAt: Date.now(), updatedAt: Date.now() };
          store.updateRegexScript(clone).then(() => {
            refreshBody();
            store.showToast('已克隆');
          });
          return;
        }

        const deleteId = btn.dataset.regexDelete;
        if (deleteId) {
          if (!confirm('确定要删除此正则脚本？')) return;
          store.deleteRegexScript(deleteId).then(() => {
            refreshBody();
            store.showToast('已删除');
          });
        }
      });
    }
  });
}

// ========== REGEX EDITOR ==========

export function openRegexEditor(script, { onSaved } = {}) {
  if (!script) return;
  let current = { ...script };

  function build() {
    function placementCheckboxes() {
      return Object.entries(PLACEMENT_LABELS).map(([val, label]) => {
        const checked = (current.placement || []).includes(Number(val)) ? 'checked' : '';
        return `<label style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:12px;color:var(--fg-secondary);cursor:pointer;">
          <input type="checkbox" data-rx-ed-placement value="${val}" ${checked}> ${label}
        </label>`;
      }).join('');
    }

    const subOptions = Object.entries(SUBSTITUTE_LABELS).map(([val, label]) =>
      `<option value="${val}" ${current.substituteRegex === Number(val) ? 'selected' : ''}>${label}</option>`
    ).join('');

    return `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <label class="st-field"><span class="st-field-label">脚本名称</span>
          <input id="rx-ed-name" type="text" value="${esc(current.scriptName)}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;font-family:var(--font-sans);">
        </label>

        <label class="st-field"><span class="st-field-label">查找正则</span>
          <textarea id="rx-ed-find" rows="3" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;font-family:var(--font-mono);resize:vertical;">${esc(current.findRegex)}</textarea>
        </label>

        <label class="st-field"><span class="st-field-label">替换字符串</span>
          <textarea id="rx-ed-replace" rows="3" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;font-family:var(--font-mono);resize:vertical;">${esc(current.replaceString)}</textarea>
        </label>

        <details style="margin-top:4px;">
          <summary style="font-size:13px;color:var(--fg-secondary);cursor:pointer;padding:4px 0;">高级选项</summary>
          <div style="display:flex;flex-direction:column;gap:12px;margin-top:8px;padding-left:8px;border-left:2px solid var(--ink-700);">

            <div class="st-field">
              <span class="st-field-label">修剪字符串（每行一个，从捕获组中移除）</span>
              <textarea id="rx-ed-trim" rows="2" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:12px;font-family:var(--font-mono);resize:vertical;">${esc((current.trimStrings || []).join('\n'))}</textarea>
            </div>

            <div class="st-field">
              <span class="st-field-label">宏替换模式</span>
              <select id="rx-ed-submode" style="width:100%;padding:6px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;">${subOptions}</select>
            </div>

            <div style="display:flex;gap:12px;">
              <label class="st-field" style="flex:1;"><span class="st-field-label">最小深度</span>
                <input id="rx-ed-mindepth" type="number" value="${current.minDepth ?? ''}" placeholder="无限制" min="0" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;font-family:var(--font-sans);">
              </label>
              <label class="st-field" style="flex:1;"><span class="st-field-label">最大深度</span>
                <input id="rx-ed-maxdepth" type="number" value="${current.maxDepth ?? ''}" placeholder="无限制" min="0" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;font-family:var(--font-sans);">
              </label>
            </div>

            <div>
              <span class="st-field-label" style="display:block;margin-bottom:4px;">生效位置</span>
              <div id="rx-ed-placements" style="display:flex;flex-wrap:wrap;gap:4px;">${placementCheckboxes()}</div>
            </div>

            <div style="display:flex;flex-wrap:wrap;gap:12px;">
              <label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--fg-secondary);cursor:pointer;">
                <input type="checkbox" id="rx-ed-disabled" ${current.disabled ? 'checked' : ''}> 禁用
              </label>
              <label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--fg-secondary);cursor:pointer;">
                <input type="checkbox" id="rx-ed-markdown-only" ${current.markdownOnly ? 'checked' : ''}> 仅 Markdown
              </label>
              <label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--fg-secondary);cursor:pointer;">
                <input type="checkbox" id="rx-ed-prompt-only" ${current.promptOnly ? 'checked' : ''}> 仅 Prompt
              </label>
              <label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--fg-secondary);cursor:pointer;">
                <input type="checkbox" id="rx-ed-run-on-edit" ${current.runOnEdit ? 'checked' : ''}> 编辑时运行
              </label>
            </div>
          </div>
        </details>

        <hr style="border:none;border-top:1px solid var(--ink-700);margin:8px 0;">

        <details>
          <summary style="font-size:13px;color:var(--fg-secondary);cursor:pointer;padding:4px 0;">测试</summary>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
            <textarea id="rx-ed-test-input" rows="3" placeholder="输入测试文本..." style="width:100%;padding:6px 8px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:12px;font-family:var(--font-mono);resize:vertical;"></textarea>
            <select id="rx-ed-test-placement" style="width:100%;padding:6px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:12px;">
              ${Object.entries(PLACEMENT_LABELS).map(([val, label]) => `<option value="${val}">${label}</option>`).join('')}
            </select>
            <button id="rx-ed-run-test" style="padding:6px 14px;font-size:12px;border-radius:6px;border:1px solid var(--ink-600);background:var(--ink-700);color:var(--fg-secondary);cursor:pointer;align-self:flex-start;">运行测试</button>
            <div id="rx-ed-test-output" style="padding:8px;background:var(--ink-900);border:1px solid var(--ink-700);border-radius:6px;font-size:12px;color:var(--fg-tertiary);min-height:30px;white-space:pre-wrap;word-break:break-all;"></div>
          </div>
        </details>

        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
          <button id="rx-ed-cancel" style="padding:6px 14px;font-size:13px;border-radius:6px;border:1px solid var(--ink-600);background:var(--ink-700);color:var(--fg-secondary);cursor:pointer;">取消</button>
          <button id="rx-ed-save" style="padding:6px 14px;font-size:13px;border-radius:6px;border:1px solid var(--amber-700);background:var(--amber-800);color:var(--amber-100);cursor:pointer;">保存</button>
        </div>
      </div>`;
  }

  const body = build();
  const modal = window.GameModal.open({ size: 'lg', title: '编辑正则脚本', subtitle: `ID: ${current.id.slice(0, 8)}...`, body });

  function collect() {
    const findRegex = modal.el.querySelector('#rx-ed-find')?.value || '';
    const replaceString = modal.el.querySelector('#rx-ed-replace')?.value || '';
    const name = modal.el.querySelector('#rx-ed-name')?.value || 'Unnamed';
    const trimRaw = modal.el.querySelector('#rx-ed-trim')?.value || '';
    const placement = Array.from(modal.el.querySelectorAll('[data-rx-ed-placement]:checked')).map(cb => Number(cb.value));
    const disabled = modal.el.querySelector('#rx-ed-disabled')?.checked || false;
    const markdownOnly = modal.el.querySelector('#rx-ed-markdown-only')?.checked || false;
    const promptOnly = modal.el.querySelector('#rx-ed-prompt-only')?.checked || false;
    const runOnEdit = modal.el.querySelector('#rx-ed-run-on-edit')?.checked || false;
    const substituteRegex = Number(modal.el.querySelector('#rx-ed-submode')?.value) || 0;
    const minDepthRaw = modal.el.querySelector('#rx-ed-mindepth')?.value;
    const maxDepthRaw = modal.el.querySelector('#rx-ed-maxdepth')?.value;

    current = {
      ...current,
      scriptName: name,
      findRegex,
      replaceString,
      trimStrings: trimRaw.split('\n').map(s => s.trim()).filter(Boolean),
      placement,
      disabled,
      markdownOnly,
      promptOnly,
      runOnEdit,
      substituteRegex,
      minDepth: minDepthRaw !== '' ? Number(minDepthRaw) : null,
      maxDepth: maxDepthRaw !== '' ? Number(maxDepthRaw) : null,
    };
  }

  requestAnimationFrame(() => {
    if (!modal.el) return;

    modal.el.querySelector('#rx-ed-save')?.addEventListener('click', async () => {
      collect();
      await store.updateRegexScript(current);
      if (onSaved) onSaved(current);
      modal.close();
      store.showToast('正则脚本已保存');
    });

    modal.el.querySelector('#rx-ed-cancel')?.addEventListener('click', () => modal.close());

    modal.el.querySelector('#rx-ed-run-test')?.addEventListener('click', () => {
      collect();
      const input = modal.el.querySelector('#rx-ed-test-input')?.value || '';
      const placement = Number(modal.el.querySelector('#rx-ed-test-placement')?.value) || REGEX_PLACEMENT.AI_OUTPUT;
      const outputEl = modal.el.querySelector('#rx-ed-test-output');
      if (!outputEl) return;

      const result = getRegexedString(input, placement, { scripts: [current] });
      if (result === input) {
        outputEl.innerHTML = `<span style="color:var(--fg-tertiary);">(无匹配)</span>`;
      } else {
        outputEl.innerHTML = `<span style="color:var(--green-300);">${esc(result)}</span>`;
      }
    });
  });
}

