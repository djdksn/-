/**
 * bridge.js — Merges live chat.variables into static GameData for UI display.
 * Character name matching links data.js entries to NPC花名册 entries.
 */

function getNpcLive(charName, chatVariables) {
  if (!chatVariables) return null;
  const npcs = chatVariables['NPC花名册'];
  if (!npcs) return null;
  const npc = npcs[charName];
  if (!npc?.动态数据) return null;
  const d = npc.动态数据;
  return {
    好感度: d.人物好感度,
    身体状态: d.身体状态,
    穿着: d.人物穿着,
    内心想法: d.内心想法,
    经历: d.经历,
    性行为次数: d.经历?.性行为次数,
    性交次数: d.经历?.性交次数,
    口交次数: d.经历?.口交次数,
    肛交次数: d.经历?.肛交次数,
    足交次数: d.经历?.足交次数,
  };
}

function getCourseLive(courseVarKey, chatVariables) {
  if (!chatVariables) return null;
  const courses = chatVariables['课程'];
  if (!courses) return null;
  const c = courses[courseVarKey];
  if (!c?.动态数据) return null;
  const d = c.动态数据;
  return {
    课程进展: d.课程进展,
    期中备注: d.期中考核?.备注,
    期末备注: d.期末考核?.备注,
  };
}

export function enhanceCharacter(char, chatVariables) {
  const live = getNpcLive(char.name, chatVariables);
  if (!live) return char;
  return { ...char, _live: live };
}

export function enhanceCourse(course, chatVariables) {
  const live = getCourseLive(course.varKey, chatVariables);
  if (!live) return course;
  return { ...course, _live: live };
}

export function getLiveCharacters(chatVariables) {
  if (typeof GameData === 'undefined') return [];
  return GameData.characters.map(c => enhanceCharacter(c, chatVariables));
}

export function getLiveCourses(chatVariables) {
  if (typeof GameData === 'undefined') return [];
  return GameData.courses.map(c => enhanceCourse(c, chatVariables));
}

/**
 * Get the current value of a top-level variable or path.
 */
export function getVariable(chatVariables, path) {
  if (!chatVariables) return undefined;
  const parts = path.split('.');
  let cur = chatVariables;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * Format a live NPC status block for display.
 */
export function renderLiveStatus(live) {
  if (!live) return '';
  const favColor = { '厌恶': 'var(--vermil-400)', '一般': 'var(--fg-tertiary)', '友善': 'var(--moss-300)', '爱慕': 'var(--sakura-400)' };
  const parts = [];
  if (live.好感度) parts.push(`<span style="color:${favColor[live.好感度] || 'var(--fg-tertiary)'}">好感度: ${live.好感度}</span>`);
  if (live.性行为次数 !== undefined) parts.push(`行为: ${live.性行为次数} | 性交: ${live.性交次数} | 口: ${live.口交次数}`);
  if (live.内心想法) parts.push(`<em>"${escapeHtml(live.内心想法.slice(0, 80))}${live.内心想法.length > 80 ? '…' : ''}"</em>`);

  const bodyFeedback = live.身体状态?.整体反馈;
  if (bodyFeedback) parts.push(`身体: ${escapeHtml(bodyFeedback)}`);

  const clothes = live.穿着;
  if (clothes && Object.keys(clothes).length > 0) {
    parts.push(`穿着: ${Object.values(clothes).filter(Boolean).join(' / ')}`);
  }

  return parts.length > 0
    ? `<div class="live-status" style="margin-top:12px;padding:10px 14px;background:linear-gradient(180deg,rgba(106,85,214,0.08),rgba(255,107,154,0.05));border:1px solid rgba(106,85,214,0.18);border-radius:10px;font-size:var(--fs-sm);line-height:1.7;display:flex;flex-direction:column;gap:4px;">
        <div style="font-size:var(--fs-xs);color:var(--fg-quaternary);letter-spacing:0.08em;margin-bottom:2px;">实时状态 (来自变量系统)</div>
        ${parts.map(p => `<div>${p}</div>`).join('')}
      </div>`
    : '';
}

/**
 * Render course progress badge.
 */
export function renderCourseProgress(live) {
  if (!live?.课程进展) return '';
  const colors = { '未开始': 'var(--ink-500)', '进行中': 'var(--amber-400)', '已完成': 'var(--moss-400)' };
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:var(--fs-xs);background:${colors[live.课程进展] || 'var(--ink-600)'};color:#fff;margin-left:8px;">${live.课程进展}</span>`;
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

export function initBridge(store) {
  if (!store) return;
  store.subscribe(() => {
    const chat = store.activeChat;
    if (!chat?.variables) return;
    window.__liveVariables = chat.variables;
  });
  // initial sync
  const chat = store.activeChat;
  if (chat?.variables) {
    window.__liveVariables = chat.variables;
  }
}
