/**
 * SillyTavern UI Components — Uses project's GameModal for consistency.
 */
import { store } from './sillytavern-store.js';
import {
  DEFAULT_FORMAT_PROMPT, DEFAULT_SETTINGS, POSITION_LABELS, SELECTIVE_LOGIC_LABELS, DEFAULT_PROMPT_ORDER,
} from './sillytavern/types.js';
import { importLorebook, importPreset, exportLorebook, exportPreset, exportToJson, importJsonFile } from './sillytavern/importer.js';
import { createDefaultEntry, updateEntry, removeEntry } from './sillytavern/editor-utils.js';
import { fetchModels, testConnection } from './sillytavern/api-tools.js';
import { exportAllData, importAllData, clearAllData, saveLorebook, savePreset } from './sillytavern/database.js';

// ========== HELPERS ==========

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

// ========== SETTINGS MODAL ==========

export function openSettings() {
  const s = store.settings || DEFAULT_SETTINGS;
  let activeTab = 'primary';

  const tabs = ['primary', 'secondary', 'tags', 'prompt', 'display', 'backup'];
  const tabLabels = { primary:'主 API', secondary:'次 API', tags:'标签', prompt:'格式提示词', display:'显示', backup:'备份' };

  function buildTabBar() {
    return tabs.map(t =>
      `<button class="btn-tab st-tab-btn" data-st-tab="${t}" style="padding:4px 10px;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-family:var(--font-sans);${t === activeTab ? 'background:var(--ink-600);color:var(--fg-primary);' : 'background:transparent;color:var(--fg-tertiary);'}">${tabLabels[t]}</button>`
    ).join('');
  }

  function buildPrimaryTab() {
    return `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <label class="st-field"><span class="st-field-label">API 模式</span>
          <select id="st-apimode" style="width:100%;padding:6px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;">
            <option value="single" ${s.apiMode === 'single' ? 'selected' : ''}>单 API (一个 LLM 处理所有任务)</option>
            <option value="dual" ${s.apiMode === 'dual' ? 'selected' : ''}>双 API (主 API 剧情 + 次 API 变量)</option>
          </select>
        </label>
        <label class="st-field"><span class="st-field-label">Base URL</span>
          <input id="st-baseurl" type="text" value="${esc(s.api.baseUrl)}" placeholder="https://api.openai.com/v1" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;font-family:var(--font-sans);">
        </label>
        <label class="st-field"><span class="st-field-label">API Key</span>
          <input id="st-apikey" type="password" value="${esc(s.api.apiKey)}" placeholder="sk-..." style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;font-family:var(--font-sans);">
        </label>
        <label class="st-field"><span class="st-field-label">Model</span>
          <input id="st-model" type="text" value="${esc(s.api.model)}" placeholder="gpt-3.5-turbo" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;font-family:var(--font-sans);">
        </label>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button id="st-fetch-models" class="btn-sm" style="padding:6px 12px;font-size:12px;border-radius:6px;border:1px solid var(--ink-600);background:var(--ink-700);color:var(--fg-secondary);cursor:pointer;">获取模型列表</button>
          <button id="st-test-conn" class="btn-sm" style="padding:6px 12px;font-size:12px;border-radius:6px;border:1px solid var(--ink-600);background:var(--ink-700);color:var(--fg-secondary);cursor:pointer;">测试连通性</button>
        </div>
        <hr style="border:none;border-top:1px solid var(--ink-700);margin:12px 0;">
        <label class="st-field"><span class="st-field-label">用户名</span>
          <input id="st-username" type="text" value="${esc(s.userName)}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;font-family:var(--font-sans);">
        </label>
        <label class="st-field"><span class="st-field-label">角色名</span>
          <input id="st-charactername" type="text" value="${esc(s.characterName)}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;font-family:var(--font-sans);">
        </label>
      </div>`;
  }

  function buildSecondaryTab() {
    const sec = s.api.secondary || { enabled: false, baseUrl: '', apiKey: '', model: '', temperature: 0.7, maxTokens: 8000 };
    if (s.apiMode !== 'dual') {
      return `<div style="padding:10px;background:rgba(255,213,79,0.1);border:1px solid rgba(255,213,79,0.3);border-radius:4px;font-size:12px;color:var(--amber-300);">当前为单 API 模式。在「主 API」面板切换到双 API 模式以启用此页面的配置。</div>`;
    }
    return `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <label class="st-field"><span class="st-field-label">Base URL</span>
          <input id="st-sec-baseurl" type="text" value="${esc(sec.baseUrl)}" placeholder="https://api.deepseek.com/v1" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;font-family:var(--font-sans);">
        </label>
        <label class="st-field"><span class="st-field-label">API Key</span>
          <input id="st-sec-apikey" type="password" value="${esc(sec.apiKey)}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;font-family:var(--font-sans);">
        </label>
        <label class="st-field"><span class="st-field-label">Model</span>
          <input id="st-sec-model" type="text" value="${esc(sec.model)}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;font-family:var(--font-sans);">
        </label>
        <div style="display:flex;gap:12px;">
          <label class="st-field" style="flex:1;"><span class="st-field-label">温度</span>
            <input id="st-sec-temp" type="number" min="0" max="2" step="0.1" value="${sec.temperature ?? 0.7}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;">
          </label>
          <label class="st-field" style="flex:1;"><span class="st-field-label">Max Tokens</span>
            <input id="st-sec-maxtokens" type="number" min="1" max="32768" value="${sec.maxTokens ?? 8000}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;">
          </label>
        </div>
      </div>`;
  }

  function buildTagsTab() {
    const tags = s.customTags || [];
    return `
      <div>
        <p style="font-size:12px;color:var(--fg-tertiary);margin-bottom:12px;">注册标签由解析器识别。删除 maintext / option / sum / vars / thinking 会破坏默认 UI。</p>
        <div style="margin-bottom:12px;" id="st-tags-list">
          ${tags.map((t, i) => `<span style="display:inline-block;padding:4px 8px;background:var(--ink-700);border-radius:4px;margin:4px;font-size:13px;">${esc(t)} <button data-st-del-tag="${i}" style="border:none;background:transparent;cursor:pointer;color:var(--fg-quaternary);">×</button></span>`).join('')}
        </div>
        <button id="st-add-tag" class="btn-sm" style="padding:6px 12px;border-radius:4px;border:1px solid var(--ink-600);background:var(--ink-700);color:var(--fg-secondary);cursor:pointer;">+ 新增</button>
      </div>`;
  }

  function buildPromptTab() {
    return `
      <div>
        <textarea id="st-format-prompt" style="width:100%;height:240px;padding:8px;font-family:var(--font-mono);font-size:13px;background:var(--ink-800);color:var(--fg-primary);border:1px solid var(--ink-600);border-radius:4px;">${esc(s.formatPromptTemplate || '')}</textarea>
        <button id="st-reset-prompt" class="btn-sm" style="margin-top:8px;padding:6px 12px;border-radius:4px;border:1px solid var(--ink-600);background:var(--ink-700);color:var(--fg-secondary);cursor:pointer;">恢复默认</button>
      </div>`;
  }

  function buildDisplayTab() {
    const modes = [
      { v: 'fold', l: '折叠 (默认)' },
      { v: 'hide', l: '隐藏' },
      { v: 'inline', l: '同区显示' },
    ];
    const uiModes = [
      { v: 'game', l: '游戏模式 (正文+选项)' },
      { v: 'chat', l: '纯聊天模式' },
    ];
    return `
      <div style="display:flex;flex-direction:column;gap:16px;">
        <fieldset style="border:1px solid var(--ink-600);border-radius:4px;padding:12px;">
          <legend style="font-size:14px;font-weight:bold;">思考过程显示</legend>
          ${modes.map(m => `
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:4px;">
              <input type="radio" name="st-thinking" value="${m.v}" ${s.thinkingDisplay === m.v ? 'checked' : ''}>
              ${m.l}
            </label>`).join('')}
        </fieldset>
        <fieldset style="border:1px solid var(--ink-600);border-radius:4px;padding:12px;">
          <legend style="font-size:14px;font-weight:bold;">UI 模式</legend>
          ${uiModes.map(m => `
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:4px;">
              <input type="radio" name="st-uimode" value="${m.v}" ${s.uiMode === m.v ? 'checked' : ''}>
              ${m.l}
            </label>`).join('')}
        </fieldset>
      </div>`;
  }

  function buildBackupTab() {
    return `
      <div style="display:flex;flex-direction:column;gap:16px;">
        <fieldset style="border:1px solid var(--sakura-500);border-radius:4px;padding:12px;">
          <legend style="color:var(--sakura-400);font-weight:bold;">导出</legend>
          <p style="font-size:12px;color:var(--fg-tertiary);margin-bottom:8px;">将所有世界书、预设、设置、对话导出为单个 JSON 文件。</p>
          <button id="st-export-all" class="btn-sm" style="background:var(--sakura-500);color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;">导出全部数据</button>
        </fieldset>
        <fieldset style="border:1px solid var(--wisteria-400);border-radius:4px;padding:12px;">
          <legend style="color:var(--wisteria-300);font-weight:bold;">导入</legend>
          <p style="font-size:12px;color:var(--fg-tertiary);margin-bottom:8px;"><strong style="color:var(--wisteria-300);">会覆盖现有数据</strong></p>
          <button id="st-import-all" class="btn-sm" style="background:var(--wisteria-500);color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;">导入备份文件</button>
        </fieldset>
        <fieldset style="border:1px solid var(--amber-400);border-radius:4px;padding:12px;">
          <legend style="color:var(--amber-400);font-weight:bold;">清除</legend>
          <p style="font-size:12px;color:var(--fg-tertiary);margin-bottom:8px;"><strong style="color:var(--amber-400);">不可恢复</strong></p>
          <button id="st-clear-all" class="btn-sm" style="background:var(--amber-500);color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;">清除所有数据</button>
        </fieldset>
      </div>`;
  }

  function buildBody() {
    switch (activeTab) {
      case 'primary': return buildPrimaryTab();
      case 'secondary': return buildSecondaryTab();
      case 'tags': return buildTagsTab();
      case 'prompt': return buildPromptTab();
      case 'display': return buildDisplayTab();
      case 'backup': return buildBackupTab();
      default: return '';
    }
  }

  const bannerHtml = store.settings ? '' :
    `<div style="padding:8px 12px;background:rgba(255,171,64,0.1);border:1px solid rgba(255,171,64,0.3);border-radius:6px;margin-bottom:12px;font-size:12px;color:var(--amber-300);">数据库正在初始化中……</div>`;

  const initialHtml = `
    <div style="display:flex;flex-direction:column;gap:0;">
      <div id="st-tabbar" style="display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid var(--ink-600);padding-bottom:8px;flex-wrap:wrap;">
        ${buildTabBar()}
      </div>
      ${bannerHtml}
      <div id="st-tab-content">${buildBody()}</div>
    </div>`;

  const modal = GameModal.open({
    size: 'md',
    title: 'SillyTavern 设置',
    subtitle: 'API · 标签 · 提示词 · 备份',
    body: initialHtml,
    className: 'st-settings-modal',
  });

  // Wire up events after DOM is ready
  requestAnimationFrame(() => wireSettingsEvents(modal));
}

function wireSettingsEvents(modal) {
  const el = modal.el;
  if (!el) return;

  function getS() { return store.settings || DEFAULT_SETTINGS; }

  function save(patch) {
    store.updateSettings(patch);
    // Refresh the form values that might have been affected
  }

  // Tab switching
  el.querySelectorAll('.st-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-st-tab');
      const content = el.querySelector('#st-tab-content');
      const tabbar = el.querySelector('#st-tabbar');
      if (!content) return;

      // Update tab styles
      tabbar.querySelectorAll('.st-tab-btn').forEach(b => {
        b.style.background = 'transparent';
        b.style.color = 'var(--fg-tertiary)';
      });
      btn.style.background = 'var(--ink-600)';
      btn.style.color = 'var(--fg-primary)';

      // Build the right tab content based on the tab name
      const s = getS();
      switch (tab) {
        case 'primary': {
          content.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:12px;">
              <label class="st-field"><span class="st-field-label">API 模式</span>
                <select id="st-apimode" style="width:100%;padding:6px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;">
                  <option value="single" ${s.apiMode === 'single' ? 'selected' : ''}>单 API</option>
                  <option value="dual" ${s.apiMode === 'dual' ? 'selected' : ''}>双 API</option>
                </select>
              </label>
              <label class="st-field"><span class="st-field-label">Base URL</span>
                <input id="st-baseurl" type="text" value="${esc(s.api.baseUrl)}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;font-family:var(--font-sans);">
              </label>
              <label class="st-field"><span class="st-field-label">API Key</span>
                <input id="st-apikey" type="password" value="${esc(s.api.apiKey)}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;font-family:var(--font-sans);">
              </label>
              <label class="st-field"><span class="st-field-label">Model</span>
                <input id="st-model" type="text" value="${esc(s.api.model)}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;font-family:var(--font-sans);">
              </label>
              <div style="display:flex;gap:8px;margin-top:8px;">
                <button id="st-fetch-models" class="btn-sm">获取模型列表</button>
                <button id="st-test-conn" class="btn-sm">测试连通性</button>
              </div>
              <hr style="border:none;border-top:1px solid var(--ink-700);margin:12px 0;">
              <label class="st-field"><span class="st-field-label">用户名</span>
                <input id="st-username" type="text" value="${esc(s.userName)}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;font-family:var(--font-sans);">
              </label>
              <label class="st-field"><span class="st-field-label">角色名</span>
                <input id="st-charactername" type="text" value="${esc(s.characterName)}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;font-family:var(--font-sans);">
              </label>
            </div>`;
          wirePrimaryEvents(el);
          break;
        }
        case 'secondary': {
          const sec = s.api.secondary || { enabled: false, baseUrl: '', apiKey: '', model: '', temperature: 0.7, maxTokens: 8000 };
          content.innerHTML = s.apiMode !== 'dual'
            ? `<div style="padding:10px;background:rgba(255,213,79,0.1);border:1px solid rgba(255,213,79,0.3);border-radius:4px;font-size:12px;color:var(--amber-300);">当前为单 API 模式。在「主 API」面板切换到双 API 模式以启用。</div>`
            : `<div style="display:flex;flex-direction:column;gap:12px;">
                <label class="st-field"><span class="st-field-label">Base URL</span><input id="st-sec-baseurl" type="text" value="${esc(sec.baseUrl)}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;"></label>
                <label class="st-field"><span class="st-field-label">API Key</span><input id="st-sec-apikey" type="password" value="${esc(sec.apiKey)}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;"></label>
                <label class="st-field"><span class="st-field-label">Model</span><input id="st-sec-model" type="text" value="${esc(sec.model)}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;"></label>
                <div style="display:flex;gap:12px;">
                  <label class="st-field" style="flex:1;"><span class="st-field-label">温度</span><input id="st-sec-temp" type="number" min="0" max="2" step="0.1" value="${sec.temperature ?? 0.7}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;"></label>
                  <label class="st-field" style="flex:1;"><span class="st-field-label">Max Tokens</span><input id="st-sec-maxtokens" type="number" min="1" max="32768" value="${sec.maxTokens ?? 8000}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;"></label>
                </div>
              </div>`;
          wireSecondaryEvents(el);
          break;
        }
        case 'tags': {
          const tags = s.customTags || [];
          content.innerHTML = `
            <div>
              <p style="font-size:12px;color:var(--fg-tertiary);margin-bottom:12px;">注册标签由解析器识别。</p>
              <div style="margin-bottom:12px;" id="st-tags-list">
                ${tags.map((t, i) => `<span style="display:inline-block;padding:4px 8px;background:var(--ink-700);border-radius:4px;margin:4px;font-size:13px;">${esc(t)} <button data-st-del-tag="${i}" style="border:none;background:transparent;cursor:pointer;color:var(--fg-quaternary);">×</button></span>`).join('')}
              </div>
              <button id="st-add-tag" class="btn-sm">+ 新增</button>
            </div>`;
          wireTagsEvents(el);
          break;
        }
        case 'prompt':
          content.innerHTML = `
            <div>
              <textarea id="st-format-prompt" style="width:100%;height:240px;padding:8px;font-family:var(--font-mono);font-size:13px;background:var(--ink-800);color:var(--fg-primary);border:1px solid var(--ink-600);border-radius:4px;">${esc(s.formatPromptTemplate || '')}</textarea>
              <button id="st-reset-prompt" class="btn-sm" style="margin-top:8px;">恢复默认</button>
            </div>`;
          wirePromptEvents(el);
          break;
        case 'display':
          content.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:16px;">
              <fieldset style="border:1px solid var(--ink-600);border-radius:4px;padding:12px;">
                <legend style="font-size:14px;font-weight:bold;">思考过程显示</legend>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:4px;"><input type="radio" name="st-thinking" value="fold" ${s.thinkingDisplay==='fold'?'checked':''}> 折叠 (默认)</label>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:4px;"><input type="radio" name="st-thinking" value="hide" ${s.thinkingDisplay==='hide'?'checked':''}> 隐藏</label>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:4px;"><input type="radio" name="st-thinking" value="inline" ${s.thinkingDisplay==='inline'?'checked':''}> 同区显示</label>
              </fieldset>
              <fieldset style="border:1px solid var(--ink-600);border-radius:4px;padding:12px;">
                <legend style="font-size:14px;font-weight:bold;">UI 模式</legend>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:4px;"><input type="radio" name="st-uimode" value="game" ${s.uiMode==='game'?'checked':''}> 游戏模式 (正文+选项)</label>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:4px;"><input type="radio" name="st-uimode" value="chat" ${s.uiMode==='chat'?'checked':''}> 纯聊天模式</label>
              </fieldset>
            </div>`;
          wireDisplayEvents(el);
          break;
        case 'backup':
          content.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:16px;">
              <fieldset style="border:1px solid var(--sakura-500);border-radius:4px;padding:12px;"><legend style="color:var(--sakura-400);font-weight:bold;">导出</legend><p style="font-size:12px;color:var(--fg-tertiary);margin-bottom:8px;">将所有数据导出为 JSON 文件。</p><button id="st-export-all" class="btn-sm" style="background:var(--sakura-500);color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;">导出全部数据</button></fieldset>
              <fieldset style="border:1px solid var(--wisteria-400);border-radius:4px;padding:12px;"><legend style="color:var(--wisteria-300);font-weight:bold;">导入</legend><p style="font-size:12px;color:var(--fg-tertiary);margin-bottom:8px;"><strong>会覆盖现有数据</strong></p><button id="st-import-all" class="btn-sm" style="background:var(--wisteria-500);color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;">导入备份文件</button></fieldset>
              <fieldset style="border:1px solid var(--amber-400);border-radius:4px;padding:12px;"><legend style="color:var(--amber-400);font-weight:bold;">清除</legend><p style="font-size:12px;color:var(--fg-tertiary);margin-bottom:8px;"><strong>不可恢复</strong></p><button id="st-clear-all" class="btn-sm" style="background:var(--amber-500);color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;">清除所有数据</button></fieldset>
            </div>`;
          wireBackupEvents(el);
          break;
      }
    });
  });

  // Wire initial tab events
  wirePrimaryEvents(el);
  wireBackupEvents(el);
}

function wirePrimaryEvents(el) {
  const apiMode = el.querySelector('#st-apimode');
  if (apiMode) apiMode.addEventListener('change', () => store.updateSettings({ apiMode: apiMode.value }));

  const baseUrl = el.querySelector('#st-baseurl');
  if (baseUrl) baseUrl.addEventListener('input', () => {
    const s = store.settings || DEFAULT_SETTINGS;
    store.updateSettings({ api: { ...s.api, baseUrl: baseUrl.value } });
  });

  const apiKey = el.querySelector('#st-apikey');
  if (apiKey) apiKey.addEventListener('input', () => {
    const s = store.settings || DEFAULT_SETTINGS;
    store.updateSettings({ api: { ...s.api, apiKey: apiKey.value } });
  });

  const model = el.querySelector('#st-model');
  if (model) model.addEventListener('input', () => {
    const s = store.settings || DEFAULT_SETTINGS;
    store.updateSettings({ api: { ...s.api, model: model.value } });
  });

  const userName = el.querySelector('#st-username');
  if (userName) userName.addEventListener('input', () => store.updateSettings({ userName: userName.value }));

  const charName = el.querySelector('#st-charactername');
  if (charName) charName.addEventListener('input', () => store.updateSettings({ characterName: charName.value }));

  const fetchBtn = el.querySelector('#st-fetch-models');
  if (fetchBtn) fetchBtn.addEventListener('click', async () => {
    const s = store.settings || DEFAULT_SETTINGS;
    const r = await fetchModels(s.api);
    if (r.source === 'remote') GameNotify.success('模型列表', `已获取 ${r.models.length} 个模型`);
    else GameNotify.warn('获取失败', r.error || '未知错误');
  });

  const testBtn = el.querySelector('#st-test-conn');
  if (testBtn) testBtn.addEventListener('click', async () => {
    const s = store.settings || DEFAULT_SETTINGS;
    const r = await testConnection(s.api);
    if (r.ok) GameNotify.success('连通正常', '');
    else GameNotify.error('测试失败', `HTTP ${r.status || r.error}`);
  });
}

function wireSecondaryEvents(el) {
  const updateSec = (patch) => {
    const s = store.settings || DEFAULT_SETTINGS;
    const sec = { ...(s.api.secondary || { enabled: false, baseUrl: '', apiKey: '', model: '', temperature: 0.7, maxTokens: 8000 }), ...patch, enabled: true };
    store.updateSettings({ api: { ...s.api, secondary: sec } });
  };
  const baseUrl = el.querySelector('#st-sec-baseurl');
  if (baseUrl) baseUrl.addEventListener('input', () => updateSec({ baseUrl: baseUrl.value }));
  const apiKey = el.querySelector('#st-sec-apikey');
  if (apiKey) apiKey.addEventListener('input', () => updateSec({ apiKey: apiKey.value }));
  const model = el.querySelector('#st-sec-model');
  if (model) model.addEventListener('input', () => updateSec({ model: model.value }));
  const temp = el.querySelector('#st-sec-temp');
  if (temp) temp.addEventListener('input', () => updateSec({ temperature: Number(temp.value) }));
  const maxT = el.querySelector('#st-sec-maxtokens');
  if (maxT) maxT.addEventListener('input', () => updateSec({ maxTokens: Number(maxT.value) }));
}

function wireTagsEvents(el) {
  const addBtn = el.querySelector('#st-add-tag');
  if (addBtn) addBtn.addEventListener('click', () => {
    const v = prompt('新标签名(小写、无空格)');
    if (v && /^[a-z][a-z0-9_-]*$/.test(v)) {
      const s = store.settings || DEFAULT_SETTINGS;
      store.updateSettings({ customTags: [...(s.customTags || []), v] });
      // Refresh tags list
      const list = el.querySelector('#st-tags-list');
      if (list) {
        const newTags = [...(s.customTags || []), v];
        list.innerHTML = newTags.map((t, i) => `<span style="display:inline-block;padding:4px 8px;background:var(--ink-700);border-radius:4px;margin:4px;font-size:13px;">${esc(t)} <button data-st-del-tag="${i}" style="border:none;background:transparent;cursor:pointer;color:var(--fg-quaternary);">×</button></span>`).join('');
        wireTagsDeleteButtons(el);
      }
    }
  });
  wireTagsDeleteButtons(el);
}

function wireTagsDeleteButtons(el) {
  el.querySelectorAll('[data-st-del-tag]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-st-del-tag'));
      const s = store.settings || DEFAULT_SETTINGS;
      const newTags = (s.customTags || []).filter((_, i) => i !== idx);
      store.updateSettings({ customTags: newTags });
      const list = el.querySelector('#st-tags-list');
      if (list) {
        list.innerHTML = newTags.map((t, i) => `<span style="display:inline-block;padding:4px 8px;background:var(--ink-700);border-radius:4px;margin:4px;font-size:13px;">${esc(t)} <button data-st-del-tag="${i}" style="border:none;background:transparent;cursor:pointer;color:var(--fg-quaternary);">×</button></span>`).join('');
        wireTagsDeleteButtons(el);
      }
    });
  });
}

function wirePromptEvents(el) {
  const ta = el.querySelector('#st-format-prompt');
  if (ta) ta.addEventListener('input', () => store.updateSettings({ formatPromptTemplate: ta.value }));
  const reset = el.querySelector('#st-reset-prompt');
  if (reset) reset.addEventListener('click', () => {
    store.updateSettings({ formatPromptTemplate: DEFAULT_FORMAT_PROMPT });
    const ta2 = el.querySelector('#st-format-prompt');
    if (ta2) ta2.value = DEFAULT_FORMAT_PROMPT;
  });
}

function wireDisplayEvents(el) {
  el.querySelectorAll('input[name="st-thinking"]').forEach(r => {
    r.addEventListener('change', () => { if (r.checked) store.updateSettings({ thinkingDisplay: r.value }); });
  });
  el.querySelectorAll('input[name="st-uimode"]').forEach(r => {
    r.addEventListener('change', () => { if (r.checked) store.updateSettings({ uiMode: r.value }); });
  });
}

function wireBackupEvents(el) {
  const exportBtn = el.querySelector('#st-export-all');
  if (exportBtn) exportBtn.addEventListener('click', async () => {
    const data = await exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sillytavern-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    GameNotify.success('备份已导出', '');
  });

  const importBtn = el.querySelector('#st-import-all');
  if (importBtn) importBtn.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const backup = JSON.parse(text);
        if (!confirm(`确认导入? ${backup.lorebooks?.length ?? 0} 世界书 / ${backup.presets?.length ?? 0} 预设 / ${backup.chats?.length ?? 0} 对话`)) return;
        await importAllData(backup);
        GameNotify.success('已导入', '请刷新页面');
      } catch (err) { GameNotify.error('导入失败', err.message); }
    };
    inp.click();
  });

  const clearBtn = el.querySelector('#st-clear-all');
  if (clearBtn) clearBtn.addEventListener('click', async () => {
    if (!confirm('确定清除所有数据?')) return;
    if (!confirm('再次确认: 所有世界书、预设、对话、设置都将被删除。')) return;
    await clearAllData();
    GameNotify.success('数据已清除', '请刷新页面');
  });
}

// ========== LOREBOOK MODAL ==========

export function openLorebooks() {
  const books = store.lorebooks;
  const activeSet = new Set(store.settings?.activeLorebookIds || []);

  let listHtml = '';
  if (books.length === 0) {
    listHtml = '<p style="color:var(--fg-tertiary);font-size:14px;">暂无世界书。可新建或从 SillyTavern JSON 导入。</p>';
  } else {
    listHtml = books.map(book => {
      const active = activeSet.has(book.id);
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;margin:4px 0;background:${active?'rgba(255,107,154,0.08)':'var(--ink-800)'};border-radius:6px;border:1px solid ${active?'var(--sakura-500)':'transparent'};">
        <div><strong>${esc(book.name)}</strong><span style="margin-left:8px;font-size:12px;color:var(--fg-quaternary);">${book.entries.length} 条目</span></div>
        <div style="display:flex;gap:6px;">
          <button class="btn-sm st-lb-toggle" data-lb-id="${book.id}">${active?'停用':'启用'}</button>
          <button class="btn-sm st-lb-edit" data-lb-id="${book.id}">编辑</button>
          <button class="btn-sm st-lb-export" data-lb-id="${book.id}">导出</button>
          <button class="btn-sm st-lb-delete" data-lb-id="${book.id}" style="color:var(--amber-400);">删除</button>
        </div>
      </div>`;
    }).join('');
  }

  const body = `
    <div id="st-lorebook-list" style="max-height:60vh;overflow-y:auto;">${listHtml}</div>
    <div style="margin-top:16px;display:flex;gap:8px;">
      <button id="st-lb-new" class="btn-sm">+ 新建世界书</button>
      <button id="st-lb-import" class="btn-sm">导入 JSON</button>
    </div>
  `;

  const modal = GameModal.open({
    size: 'md',
    title: '世界书管理',
    subtitle: `共 ${books.length} 本`,
    body,
  });

  requestAnimationFrame(() => {
    const el = modal.el;
    if (!el) return;
    wireLorebookEvents(el, modal);
  });
}

function wireLorebookEvents(el, modal) {
  el.querySelectorAll('.st-lb-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      store.toggleLorebook(btn.getAttribute('data-lb-id'));
    });
  });
  el.querySelectorAll('.st-lb-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-lb-id');
      const book = store.lorebooks.find(b => b.id === id);
      if (book) openLorebookEditor(book);
    });
  });
  el.querySelectorAll('.st-lb-export').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-lb-id');
      const book = store.lorebooks.find(b => b.id === id);
      if (book) exportToJson(exportLorebook(book), `${book.name}.json`);
    });
  });
  el.querySelectorAll('.st-lb-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-lb-id');
      const book = store.lorebooks.find(b => b.id === id);
      if (book && confirm(`删除 "${book.name}"?`)) {
        await store.deleteLorebook(id);
        modal.close();
        openLorebooks();
      }
    });
  });

  const newBtn = el.querySelector('#st-lb-new');
  if (newBtn) newBtn.addEventListener('click', () => {
    store.addLorebookFromDefault('新世界书');
    modal.close();
    openLorebooks();
  });

  const importBtn = el.querySelector('#st-lb-import');
  if (importBtn) importBtn.addEventListener('click', async () => {
    const data = await importJsonFile();
    if (!data) return;
    if (data.entries) {
      const lb = importLorebook(data);
      const id = crypto.randomUUID();
      await saveLorebook({ ...lb, id, createdAt: Date.now(), updatedAt: Date.now() });
      store.loadAll();
      modal.close();
      openLorebooks();
      GameNotify.success('已导入', lb.name);
    } else {
      GameNotify.warn('格式错误', '不是有效的 SillyTavern 世界书');
    }
  });
}

// ========== LOREBOOK EDITOR ==========

function openLorebookEditor(book) {
  let workBook = JSON.parse(JSON.stringify(book)); // deep clone
  let editingEntryId = null;

  function getEditingEntry() {
    return workBook.entries.find(e => e.id === editingEntryId) || null;
  }

  function rebuildEditor() {
    const content = modal.el?.querySelector('#st-editor-content');
    if (!content) return;
    content.innerHTML = buildEditorHtml();
    wireEditorContent(modal);
  }

  function buildEditorHtml() {
    const entry = getEditingEntry();
    const sorted = [...workBook.entries].sort((a, b) => a.order - b.order);
    const listHtml = sorted.length === 0
      ? '<p style="color:var(--fg-tertiary);font-size:13px;">暂无条目</p>'
      : sorted.map(e => {
          const isEditing = editingEntryId === e.id;
          return `<div style="padding:10px 12px;margin:4px 0;background:${isEditing?'var(--ink-600)':'var(--ink-800)'};border-radius:6px;border:1px solid ${isEditing?'var(--wisteria-400)':'transparent'};">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div style="flex:1;cursor:pointer;" class="st-click-entry" data-eid="${e.id}">
                <strong style="font-size:13px;">${esc(e.keys.join(', ') || '(无关键词)')}</strong>
                <span style="margin-left:8px;font-size:11px;color:var(--fg-quaternary);">${POSITION_LABELS[e.position] || e.position} | order:${e.order}</span>
              </div>
              <div style="display:flex;gap:4px;">
                <button class="btn-sm st-edit-entry" data-eid="${e.id}">${isEditing?'收起':'编辑'}</button>
                <button class="btn-sm st-del-entry" data-eid="${e.id}" style="color:var(--amber-400);">删除</button>
              </div>
            </div>
            <div style="margin-top:4px;font-size:12px;color:var(--fg-secondary);max-height:48px;overflow:hidden;">${esc(e.content.slice(0, 120))}${e.content.length>120?'…':''}</div>
          </div>`;
        }).join('');

    let formHtml = '';
    if (entry) {
      formHtml = `
        <hr style="margin:12px 0;border:none;border-top:1px solid var(--ink-600);">
        <div style="display:flex;flex-direction:column;gap:8px;" id="st-entry-form">
          <label class="st-field"><span class="st-field-label">关键词 (逗号分隔)</span>
            <input id="st-entry-keys" type="text" value="${esc(entry.keys.join(', '))}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;">
          </label>
          <label class="st-field"><span class="st-field-label">内容</span>
            <textarea id="st-entry-content" style="width:100%;height:120px;padding:6px;font-family:var(--font-sans);font-size:13px;background:var(--ink-800);color:var(--fg-primary);border:1px solid var(--ink-600);border-radius:4px;">${esc(entry.content)}</textarea>
          </label>
          <div style="display:flex;gap:12px;">
            <label class="st-field" style="flex:1;"><span class="st-field-label">位置</span>
              <select id="st-entry-pos" style="padding:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;">
                ${Object.entries(POSITION_LABELS).map(([k,v]) => `<option value="${k}" ${entry.position===k?'selected':''}>${v}</option>`).join('')}
              </select>
            </label>
            <label class="st-field" style="flex:1;"><span class="st-field-label">排序</span>
              <input id="st-entry-order" type="number" min="0" max="9999" value="${entry.order}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;">
            </label>
          </div>
          <div style="display:flex;gap:12px;align-items:center;">
            <label style="font-size:12px;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="st-entry-constant" ${entry.constant?'checked':''}> 常驻</label>
            <label style="font-size:12px;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="st-entry-selective" ${entry.selective?'checked':''}> 选择性</label>
            <label style="font-size:12px;display:flex;align-items:center;gap:4px;">概率
              <input id="st-entry-prob" type="number" min="0" max="100" value="${entry.probability}" style="width:60px;margin-left:4px;padding:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:4px;color:var(--fg-primary);font-size:12px;">
            </label>
          </div>
        </div>`;
    }

    return `
      <div>
        <label class="st-field"><span class="st-field-label">名称</span>
          <input id="st-book-name" type="text" value="${esc(workBook.name)}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;">
        </label>
        <div style="display:flex;gap:12px;margin:12px 0;">
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="st-book-recursive" ${workBook.recursiveScanning?'checked':''}> 递归扫描</label>
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="st-book-casesensitive" ${workBook.caseSensitive?'checked':''}> 区分大小写</label>
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="st-book-wholewords" ${workBook.matchWholeWords?'checked':''}> 全词匹配</label>
        </div>
        <strong style="font-size:13px;">条目 (${workBook.entries.length})</strong>
        <div id="st-entry-list" style="max-height:300px;overflow-y:auto;margin-top:8px;">${listHtml}</div>
        ${formHtml}
        <button id="st-add-entry" class="btn-sm" style="margin-top:12px;">+ 添加条目</button>
        <div style="margin-top:16px;display:flex;gap:8px;border-top:1px solid var(--ink-600);padding-top:12px;">
          <button id="st-save-book" class="btn-sm" style="background:var(--sakura-500);color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;">保存</button>
          <button id="st-cancel-book" class="btn-sm">取消</button>
        </div>
      </div>`;
  }

  function collectEntryFromForm() {
    const keys = document.getElementById('st-entry-keys')?.value || '';
    const content = document.getElementById('st-entry-content')?.value || '';
    const position = document.getElementById('st-entry-pos')?.value || 'after_char';
    const order = parseInt(document.getElementById('st-entry-order')?.value) || 100;
    const constant = document.getElementById('st-entry-constant')?.checked || false;
    const selective = document.getElementById('st-entry-selective')?.checked || false;
    const probability = parseInt(document.getElementById('st-entry-prob')?.value) || 100;
    return {
      keys: keys.split(',').map(s => s.trim()).filter(Boolean),
      content, position, order, constant, selective, probability,
      useProbability: probability < 100,
    };
  }

  const modal = GameModal.open({
    size: 'md',
    title: `编辑: ${esc(book.name)}`,
    subtitle: `${book.entries.length} 条目`,
    body: `<div id="st-editor-content">${buildEditorHtml()}</div>`,
  });

  // Store the book ID on the modal for later lookups
  modal.el.setAttribute('data-book-id', book.id);
  modal.el.setAttribute('data-editing-eid', '');

  requestAnimationFrame(() => wireEditorContent(modal));
}

function wireEditorContent(modal) {
  const el = modal.el;
  if (!el) return;

  function getBook() {
    const id = el.getAttribute('data-book-id');
    return store.lorebooks.find(b => b.id === id) || null;
  }

  function saveEntry() {
    const book = getBook();
    if (!book) return;
    const eid = el.getAttribute('data-editing-eid');
    if (!eid) return;
    const idx = book.entries.findIndex(e => e.id === eid);
    if (idx < 0) return;

    const keys = (document.getElementById('st-entry-keys')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
    const content = document.getElementById('st-entry-content')?.value || '';
    const position = document.getElementById('st-entry-pos')?.value || 'after_char';
    const order = parseInt(document.getElementById('st-entry-order')?.value) || 100;
    const constant = document.getElementById('st-entry-constant')?.checked || false;
    const selective = document.getElementById('st-entry-selective')?.checked || false;
    const probability = parseInt(document.getElementById('st-entry-prob')?.value) || 100;

    const nextEntries = book.entries.slice();
    nextEntries[idx] = { ...nextEntries[idx], keys, content, position, order, constant, selective, probability, useProbability: probability < 100 };
    const updated = { ...book, entries: nextEntries, updatedAt: Date.now() };
    store.updateLorebook(updated);
  }

  function rebuild() { openLorebookEditorRaw(getBook(), el.getAttribute('data-editing-eid'), modal); }

  // Edit entry
  el.querySelectorAll('.st-edit-entry').forEach(btn => {
    btn.addEventListener('click', () => {
      const eid = btn.getAttribute('data-eid');
      const currentEid = el.getAttribute('data-editing-eid');
      // Save current entry changes first
      if (currentEid && currentEid !== 'null') saveEntry();
      el.setAttribute('data-editing-eid', eid === currentEid ? '' : eid);
      setTimeout(rebuild, 50);
    });
  });

  // Click entry to edit
  el.querySelectorAll('.st-click-entry').forEach(div => {
    div.addEventListener('click', () => {
      const eid = div.getAttribute('data-eid');
      const currentEid = el.getAttribute('data-editing-eid');
      if (currentEid && currentEid !== 'null') saveEntry();
      el.setAttribute('data-editing-eid', eid);
      setTimeout(rebuild, 50);
    });
  });

  // Delete entry
  el.querySelectorAll('.st-del-entry').forEach(btn => {
    btn.addEventListener('click', () => {
      const book = getBook();
      if (!book) return;
      const eid = btn.getAttribute('data-eid');
      const updated = removeEntry(book, eid);
      store.updateLorebook(updated);
      if (el.getAttribute('data-editing-eid') === eid) el.setAttribute('data-editing-eid', '');
      setTimeout(rebuild, 50);
    });
  });

  // Save entry on field blur
  ['st-entry-keys', 'st-entry-content', 'st-entry-pos', 'st-entry-order', 'st-entry-constant', 'st-entry-selective', 'st-entry-prob'].forEach(id => {
    const field = document.getElementById(id);
    if (field) field.addEventListener('change', () => saveEntry());
  });

  // Book name
  const nameInput = el.querySelector('#st-book-name');
  if (nameInput) nameInput.addEventListener('change', () => {
    const book = getBook();
    if (!book) return;
    store.updateLorebook({ ...book, name: nameInput.value, updatedAt: Date.now() });
  });

  // Book checkboxes
  ['st-book-recursive', 'st-book-casesensitive', 'st-book-wholewords'].forEach((id, i) => {
    const cb = document.getElementById(id);
    if (cb) cb.addEventListener('change', () => {
      const book = getBook();
      if (!book) return;
      const keys = ['recursiveScanning', 'caseSensitive', 'matchWholeWords'];
      store.updateLorebook({ ...book, [keys[i]]: cb.checked, updatedAt: Date.now() });
    });
  });

  // Add entry
  const addBtn = el.querySelector('#st-add-entry');
  if (addBtn) addBtn.addEventListener('click', () => {
    const book = getBook();
    if (!book) return;
    const newEntry = createDefaultEntry();
    const updated = { ...book, entries: [...book.entries, newEntry], updatedAt: Date.now() };
    store.updateLorebook(updated);
    el.setAttribute('data-editing-eid', newEntry.id);
    setTimeout(rebuild, 50);
  });

  // Save & close
  const saveBtn = el.querySelector('#st-save-book');
  if (saveBtn) saveBtn.addEventListener('click', () => {
    saveEntry();
    GameNotify.success('已保存', getBook()?.name || '');
    modal.close();
  });

  const cancelBtn = el.querySelector('#st-cancel-book');
  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    saveEntry();
    modal.close();
  });
}

// Helper to re-open the editor inline
function openLorebookEditorRaw(book, editingEntryId, modal) {
  const content = modal.el?.querySelector('#st-editor-content');
  if (!content) return;

  const sorted = [...book.entries].sort((a, b) => a.order - b.order);
  const listHtml = sorted.length === 0
    ? '<p style="color:var(--fg-tertiary);font-size:13px;">暂无条目</p>'
    : sorted.map(e => {
        const isEditing = editingEntryId === e.id;
        return `<div style="padding:10px 12px;margin:4px 0;background:${isEditing?'var(--ink-600)':'var(--ink-800)'};border-radius:6px;border:1px solid ${isEditing?'var(--wisteria-400)':'transparent'};">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="flex:1;cursor:pointer;" class="st-click-entry" data-eid="${e.id}">
              <strong style="font-size:13px;">${esc(e.keys.join(', ') || '(无关键词)')}</strong>
              <span style="margin-left:8px;font-size:11px;color:var(--fg-quaternary);">${POSITION_LABELS[e.position] || e.position} | order:${e.order}</span>
            </div>
            <div style="display:flex;gap:4px;">
              <button class="btn-sm st-edit-entry" data-eid="${e.id}">${isEditing?'收起':'编辑'}</button>
              <button class="btn-sm st-del-entry" data-eid="${e.id}" style="color:var(--amber-400);">删除</button>
            </div>
          </div>
          <div style="margin-top:4px;font-size:12px;color:var(--fg-secondary);max-height:48px;overflow:hidden;">${esc(e.content.slice(0, 120))}${e.content.length>120?'…':''}</div>
        </div>`;
      }).join('');

  const entry = book.entries.find(e => e.id === editingEntryId) || null;
  let formHtml = '';
  if (entry) {
    formHtml = `
      <hr style="margin:12px 0;border:none;border-top:1px solid var(--ink-600);">
      <div style="display:flex;flex-direction:column;gap:8px;">
        <label class="st-field"><span class="st-field-label">关键词 (逗号分隔)</span>
          <input id="st-entry-keys" type="text" value="${esc(entry.keys.join(', '))}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;">
        </label>
        <label class="st-field"><span class="st-field-label">内容</span>
          <textarea id="st-entry-content" style="width:100%;height:120px;padding:6px;font-family:var(--font-sans);font-size:13px;background:var(--ink-800);color:var(--fg-primary);border:1px solid var(--ink-600);border-radius:4px;">${esc(entry.content)}</textarea>
        </label>
        <div style="display:flex;gap:12px;">
          <label class="st-field" style="flex:1;"><span class="st-field-label">位置</span>
            <select id="st-entry-pos" style="padding:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;">
              ${Object.entries(POSITION_LABELS).map(([k,v]) => `<option value="${k}" ${entry.position===k?'selected':''}>${v}</option>`).join('')}
            </select>
          </label>
          <label class="st-field" style="flex:1;"><span class="st-field-label">排序</span>
            <input id="st-entry-order" type="number" min="0" max="9999" value="${entry.order}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;">
          </label>
        </div>
        <div style="display:flex;gap:12px;">
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="st-entry-constant" ${entry.constant?'checked':''}> 常驻</label>
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="st-entry-selective" ${entry.selective?'checked':''}> 选择性</label>
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;">概率 <input id="st-entry-prob" type="number" min="0" max="100" value="${entry.probability}" style="width:60px;margin-left:4px;padding:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:4px;color:var(--fg-primary);font-size:12px;"></label>
        </div>
      </div>`;
  }

  content.innerHTML = `
    <div>
      <label class="st-field"><span class="st-field-label">名称</span>
        <input id="st-book-name" type="text" value="${esc(book.name)}" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;">
      </label>
      <div style="display:flex;gap:12px;margin:12px 0;">
        <label style="font-size:12px;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="st-book-recursive" ${book.recursiveScanning?'checked':''}> 递归扫描</label>
        <label style="font-size:12px;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="st-book-casesensitive" ${book.caseSensitive?'checked':''}> 区分大小写</label>
        <label style="font-size:12px;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="st-book-wholewords" ${book.matchWholeWords?'checked':''}> 全词匹配</label>
      </div>
      <strong style="font-size:13px;">条目 (${book.entries.length})</strong>
      <div id="st-entry-list" style="max-height:300px;overflow-y:auto;margin-top:8px;">${listHtml}</div>
      ${formHtml}
      <button id="st-add-entry" class="btn-sm" style="margin-top:12px;">+ 添加条目</button>
      <div style="margin-top:16px;display:flex;gap:8px;border-top:1px solid var(--ink-600);padding-top:12px;">
        <button id="st-save-book" class="btn-sm" style="background:var(--sakura-500);color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;">保存</button>
        <button id="st-cancel-book" class="btn-sm">取消</button>
      </div>
    </div>`;

  // Wire up the rebuilt content
  setTimeout(() => wireEditorContent(modal), 50);
}

// ========== PRESET MODAL ==========

export function openPresets() {
  const presets = store.presets;
  let listHtml = presets.map(p => {
    const active = p.id === store.settings?.activePresetId;
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;margin:4px 0;background:${active?'rgba(106,85,214,0.08)':'var(--ink-800)'};border-radius:6px;border:1px solid ${active?'var(--wisteria-500)':'transparent'};">
      <div><strong>${esc(p.name)}</strong><span style="margin-left:8px;font-size:12px;color:var(--fg-quaternary);">model: ${esc(p.settings?.openai_model || '?')}</span></div>
      <div style="display:flex;gap:6px;">
        <button class="btn-sm st-pre-set-active" data-pre-id="${p.id}">${active?'取消':'设为默认'}</button>
        <button class="btn-sm st-pre-delete" data-pre-id="${p.id}" style="color:var(--amber-400);">删除</button>
      </div>
    </div>`;
  }).join('');

  const body = `
    <div style="max-height:60vh;overflow-y:auto;">${listHtml || '<p style="color:var(--fg-tertiary);">暂无预设</p>'}</div>
    <div style="margin-top:16px;display:flex;gap:8px;">
      <button id="st-pre-new" class="btn-sm">+ 新建预设</button>
      <button id="st-pre-import" class="btn-sm">导入 JSON</button>
    </div>
  `;

  const modal = GameModal.open({ size: 'md', title: '预设管理', subtitle: `共 ${presets.length} 个`, body });

  requestAnimationFrame(() => {
    const el = modal.el;
    if (!el) return;
    el.querySelectorAll('.st-pre-set-active').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-pre-id');
        store.updateSettings({ activePresetId: store.settings?.activePresetId === id ? null : id });
        modal.close(); openPresets();
      });
    });
    el.querySelectorAll('.st-pre-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-pre-id');
        if (confirm('删除此预设?')) { await store.deletePreset(id); modal.close(); openPresets(); }
      });
    });
    const newBtn = el.querySelector('#st-pre-new');
    if (newBtn) newBtn.addEventListener('click', () => { store.addPresetFromDefault('新预设'); modal.close(); openPresets(); });
    const importBtn = el.querySelector('#st-pre-import');
    if (importBtn) importBtn.addEventListener('click', async () => {
      const data = await importJsonFile();
      if (!data) return;
      const p = importPreset(data);
      const id = crypto.randomUUID();
      await savePreset({ ...p, id, createdAt: Date.now(), updatedAt: Date.now() });
      store.loadAll();
      modal.close(); openPresets();
      GameNotify.success('已导入', p.name);
    });
  });
}

// ========== VARIABLES MODAL ==========

export function openVariables() {
  const chat = store.activeChat;
  const s = store.settings || DEFAULT_SETTINGS;
  const defaultVars = s.defaultVariables || {};
  const chatVars = chat?.variables || {};
  const rules = s.variableRules || { extractFromResponse: true, useSecondaryApi: false, allowedKeys: [] };
  let activeTab = 'default';

  function buildVarRows(vars, prefix) {
    const entries = Object.entries(vars);
    if (entries.length === 0) return '<p style="color:var(--fg-tertiary);font-size:13px;">暂无变量</p>';
    return entries.map(([k, v]) => `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
        <input type="text" value="${esc(k)}" class="st-var-key" data-prefix="${prefix}" data-oldkey="${esc(k)}" style="flex:1;padding:6px 8px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;" placeholder="变量名">
        <input type="text" value="${esc(String(v))}" class="st-var-val" data-prefix="${prefix}" data-key="${esc(k)}" style="flex:1;padding:6px 8px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;" placeholder="值">
        <button class="btn-sm st-var-del" data-prefix="${prefix}" data-key="${esc(k)}" style="color:var(--amber-400);">删除</button>
      </div>
    `).join('');
  }

  function buildDefaultTab() {
    return `
      <div>
        <p style="font-size:12px;color:var(--fg-tertiary);margin-bottom:12px;">默认变量将在创建新对话时自动注入。修改此处不会影响已有对话。</p>
        <div id="st-vars-list-default">${buildVarRows(defaultVars, 'default')}</div>
        <button class="btn-sm st-var-add" data-prefix="default" style="margin-top:8px;">+ 添加</button>
      </div>`;
  }

  function buildChatTab() {
    if (!chat) return '<p style="color:var(--fg-tertiary);">暂无活跃对话。请先创建对话或切换到默认变量标签。</p>';
    return `
      <div>
        <p style="font-size:12px;color:var(--fg-tertiary);margin-bottom:12px;">当前对话「${esc(chat.name)}」的变量。AI 回复中的 &lt;vars&gt; 标签会自动更新此处。</p>
        <div id="st-vars-list-chat">${buildVarRows(chatVars, 'chat')}</div>
        <button class="btn-sm st-var-add" data-prefix="chat" style="margin-top:8px;">+ 添加</button>
      </div>`;
  }

  function buildRulesTab() {
    const allowedKeys = (rules.allowedKeys || []).join(', ');
    return `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <p style="font-size:12px;color:var(--fg-tertiary);">配置 AI 回复中变量提取的行为。回复中的 <code style="background:var(--ink-700);padding:1px 4px;border-radius:3px;">&lt;vars&gt;{"HP": 38}&lt;/vars&gt;</code> 标签会被解析并更新变量。</p>
        <label style="font-size:13px;display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="st-rule-extract" ${rules.extractFromResponse !== false ? 'checked' : ''}> 从回复中提取变量
        </label>
        <label style="font-size:13px;display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="st-rule-secondary" ${rules.useSecondaryApi ? 'checked' : ''}> 使用次 API 提取变量 (需配置次 API)
        </label>
        <label class="st-field"><span class="st-field-label">允许更新的变量 (逗号分隔，留空表示全部允许)</span>
          <input id="st-rule-keys" type="text" value="${esc(allowedKeys)}" placeholder="HP, 金钱, 好感度" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;">
        </label>
        <div style="font-size:12px;color:var(--fg-quaternary);margin-top:4px;">
          支持格式: <code>&lt;vars&gt;{"key": value}&lt;/vars&gt;</code> (JSON 对象) 或 <code>&lt;var name="key" value="val"/&gt;</code>
        </div>
      </div>`;
  }

  function buildContent(tab) {
    switch (tab) {
      case 'default': return buildDefaultTab();
      case 'chat': return buildChatTab();
      case 'rules': return buildRulesTab();
      default: return '';
    }
  }

  const body = `
    <div style="display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid var(--ink-600);padding-bottom:8px;">
      <button class="st-var-tab btn-tab" data-st-var-tab="default" style="background:var(--ink-600);color:var(--fg-primary);padding:4px 10px;border-radius:4px;border:none;font-size:13px;cursor:pointer;">默认变量</button>
      <button class="st-var-tab btn-tab" data-st-var-tab="chat" style="background:transparent;color:var(--fg-tertiary);padding:4px 10px;border-radius:4px;border:none;font-size:13px;cursor:pointer;">对话变量${chat ? ' · '+esc(chat.name) : ''}</button>
      <button class="st-var-tab btn-tab" data-st-var-tab="rules" style="background:transparent;color:var(--fg-tertiary);padding:4px 10px;border-radius:4px;border:none;font-size:13px;cursor:pointer;">更新规则</button>
    </div>
    <div id="st-var-content">${buildContent('default')}</div>
  `;

  const modal = GameModal.open({
    size: 'md',
    title: '变量管理',
    subtitle: `默认 ${Object.keys(defaultVars).length} 项${chat ? ' | 对话 ' + Object.keys(chatVars).length + ' 项' : ''}`,
    body,
  });

  requestAnimationFrame(() => wireVarEvents(modal));
}

function wireVarEvents(modal) {
  const el = modal.el;
  if (!el) return;

  function saveDefaultVars() {
    const next = {};
    el.querySelectorAll('.st-var-key[data-prefix="default"]').forEach((kInp, i) => {
      const vInps = el.querySelectorAll('.st-var-val[data-prefix="default"]');
      const vInp = vInps[i];
      if (kInp && vInp && kInp.value.trim()) {
        const num = Number(vInp.value);
        next[kInp.value.trim()] = Number.isNaN(num) ? vInp.value : num;
      }
    });
    store.updateSettings({ defaultVariables: next });
  }

  function saveChatVars() {
    if (!store.activeChat) return;
    const next = {};
    el.querySelectorAll('.st-var-key[data-prefix="chat"]').forEach((kInp, i) => {
      const vInps = el.querySelectorAll('.st-var-val[data-prefix="chat"]');
      const vInp = vInps[i];
      if (kInp && vInp && kInp.value.trim()) {
        const num = Number(vInp.value);
        next[kInp.value.trim()] = Number.isNaN(num) ? vInp.value : num;
      }
    });
    store.setChatVariables(next);
  }

  function saveRules() {
    const extract = document.getElementById('st-rule-extract')?.checked ?? true;
    const secondary = document.getElementById('st-rule-secondary')?.checked ?? false;
    const keysStr = document.getElementById('st-rule-keys')?.value || '';
    const allowedKeys = keysStr.split(',').map(s => s.trim()).filter(Boolean);
    store.updateSettings({ variableRules: { extractFromResponse: extract, useSecondaryApi: secondary, allowedKeys } });
  }

  // Type-change on inputs saves
  el.querySelectorAll('.st-var-key, .st-var-val').forEach(inp => {
    inp.addEventListener('change', () => {
      if (inp.getAttribute('data-prefix') === 'default') saveDefaultVars();
      else saveChatVars();
    });
  });

  // Delete buttons
  el.querySelectorAll('.st-var-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const prefix = btn.getAttribute('data-prefix');
      const key = btn.getAttribute('data-key');
      if (prefix === 'default') {
        const vars = { ...(store.settings?.defaultVariables || {}) };
        delete vars[key];
        store.updateSettings({ defaultVariables: vars });
      } else if (prefix === 'chat' && store.activeChat) {
        const vars = { ...(store.activeChat.variables || {}) };
        delete vars[key];
        store.setChatVariables(vars);
      }
      modal.close();
      openVariables();
    });
  });

  // Add buttons
  el.querySelectorAll('.st-var-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const prefix = btn.getAttribute('data-prefix');
      if (prefix === 'default') {
        const vars = { ...(store.settings?.defaultVariables || {}), 'new_var': '' };
        store.updateSettings({ defaultVariables: vars });
      } else if (prefix === 'chat' && store.activeChat) {
        const vars = { ...(store.activeChat.variables || {}), 'new_var': '' };
        store.setChatVariables(vars);
      }
      modal.close();
      openVariables();
    });
  });

  // Rule inputs
  const ruleExtract = el.querySelector('#st-rule-extract');
  if (ruleExtract) ruleExtract.addEventListener('change', saveRules);
  const ruleSecondary = el.querySelector('#st-rule-secondary');
  if (ruleSecondary) ruleSecondary.addEventListener('change', saveRules);
  const ruleKeys = el.querySelector('#st-rule-keys');
  if (ruleKeys) ruleKeys.addEventListener('change', saveRules);

  // Tab switching
  el.querySelectorAll('.st-var-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-st-var-tab');
      // Save current tab's data before switching
      const currentContent = el.querySelector('#st-var-content');
      if (currentContent) {
        if (currentContent.querySelector('.st-var-key[data-prefix="default"]')) saveDefaultVars();
        if (currentContent.querySelector('.st-var-key[data-prefix="chat"]')) saveChatVars();
        if (currentContent.querySelector('#st-rule-extract')) saveRules();
      }

      // Update tab buttons
      el.querySelectorAll('.st-var-tab').forEach(b => {
        b.style.background = 'transparent';
        b.style.color = 'var(--fg-tertiary)';
      });
      btn.style.background = 'var(--ink-600)';
      btn.style.color = 'var(--fg-primary)';

      // Rebuild content
      const content = el.querySelector('#st-var-content');
      if (!content) return;

      const chat = store.activeChat;
      const s = store.settings || DEFAULT_SETTINGS;
      const defaultVars = s.defaultVariables || {};
      const chatVars = chat?.variables || {};
      const rules = s.variableRules || { extractFromResponse: true, useSecondaryApi: false, allowedKeys: [] };

      function buildVarRows(vars, prefix) {
        const entries = Object.entries(vars);
        if (entries.length === 0) return '<p style="color:var(--fg-tertiary);font-size:13px;">暂无变量</p>';
        return entries.map(([k, v]) => `
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
            <input type="text" value="${esc(k)}" class="st-var-key" data-prefix="${prefix}" data-oldkey="${esc(k)}" style="flex:1;padding:6px 8px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;" placeholder="变量名">
            <input type="text" value="${esc(String(v))}" class="st-var-val" data-prefix="${prefix}" data-key="${esc(k)}" style="flex:1;padding:6px 8px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;" placeholder="值">
            <button class="btn-sm st-var-del" data-prefix="${prefix}" data-key="${esc(k)}" style="color:var(--amber-400);">删除</button>
          </div>
        `).join('');
      }

      switch (tab) {
        case 'default':
          content.innerHTML = `
            <div>
              <p style="font-size:12px;color:var(--fg-tertiary);margin-bottom:12px;">默认变量将在创建新对话时自动注入。</p>
              <div id="st-vars-list-default">${buildVarRows(defaultVars, 'default')}</div>
              <button class="btn-sm st-var-add" data-prefix="default" style="margin-top:8px;">+ 添加</button>
            </div>`;
          break;
        case 'chat':
          content.innerHTML = chat
            ? `<div>
                <p style="font-size:12px;color:var(--fg-tertiary);margin-bottom:12px;">当前对话「${esc(chat.name)}」的变量。</p>
                <div id="st-vars-list-chat">${buildVarRows(chatVars, 'chat')}</div>
                <button class="btn-sm st-var-add" data-prefix="chat" style="margin-top:8px;">+ 添加</button>
              </div>`
            : '<p style="color:var(--fg-tertiary);">暂无活跃对话。请先创建对话或切换到默认变量标签。</p>';
          break;
        case 'rules': {
          const allowedKeys = (rules.allowedKeys || []).join(', ');
          content.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:12px;">
              <p style="font-size:12px;color:var(--fg-tertiary);">配置 AI 回复中变量提取的行为。</p>
              <label style="font-size:13px;display:flex;align-items:center;gap:8px;">
                <input type="checkbox" id="st-rule-extract" ${rules.extractFromResponse !== false ? 'checked' : ''}> 从回复中提取变量
              </label>
              <label style="font-size:13px;display:flex;align-items:center;gap:8px;">
                <input type="checkbox" id="st-rule-secondary" ${rules.useSecondaryApi ? 'checked' : ''}> 使用次 API 提取变量
              </label>
              <label class="st-field"><span class="st-field-label">允许更新的变量 (逗号分隔，留空表示全部允许)</span>
                <input id="st-rule-keys" type="text" value="${esc(allowedKeys)}" placeholder="HP, 金钱, 好感度" style="width:100%;padding:6px 8px;margin-top:4px;background:var(--ink-800);border:1px solid var(--ink-600);border-radius:6px;color:var(--fg-primary);font-size:13px;">
              </label>
            </div>`;
          break;
        }
      }

      // Re-wire events for the new content
      wireVarEvents(modal);
    });
  });
}

// ========== HISTORY DRAWER ==========

export function openHistory() {
  const chats = store.chats;
  let listHtml = chats.map(c => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;margin:4px 0;background:${c.id===store.activeChatId?'var(--ink-600)':'var(--ink-800)'};border-radius:6px;cursor:pointer;border:1px solid ${c.id===store.activeChatId?'var(--sakura-500)':'transparent'};" data-chat-id="${c.id}">
      <div>
        <strong>${esc(c.name)}</strong>
        <div style="font-size:11px;color:var(--fg-quaternary);">${c.messages.length} 消息 · ${new Date(c.updatedAt).toLocaleString('zh-CN')}</div>
      </div>
      <button class="btn-sm st-chat-del" data-chat-id="${c.id}" style="color:var(--amber-400);">删除</button>
    </div>
  `).join('');

  const body = `
    <div style="max-height:60vh;overflow-y:auto;">${listHtml || '<p style="color:var(--fg-tertiary);">暂无对话</p>'}</div>
    <button id="st-chat-new" class="btn-sm" style="margin-top:12px;">+ 新建对话</button>
  `;

  const modal = GameModal.open({ size: 'md', title: '对话历史', subtitle: `共 ${chats.length} 个`, body });

  requestAnimationFrame(() => {
    const el = modal.el;
    if (!el) return;
    el.querySelectorAll('[data-chat-id]').forEach(div => {
      div.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        store.selectChat(div.getAttribute('data-chat-id'));
        GameNotify.info('已切换', '');
      });
    });
    el.querySelectorAll('.st-chat-del').forEach(btn => {
      btn.addEventListener('click', () => {
        store.removeChat(btn.getAttribute('data-chat-id'));
        modal.close(); openHistory();
      });
    });
    const newBtn = el.querySelector('#st-chat-new');
    if (newBtn) newBtn.addEventListener('click', () => {
      const name = prompt('对话名称', (store.settings?.characterName || 'AI') + ' - 新对话');
      if (name) { store.createChat(name); modal.close(); openHistory(); }
    });
  });
}
