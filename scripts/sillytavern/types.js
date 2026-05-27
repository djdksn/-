/**
 * SillyTavern Web - Core Types & Constants
 * Vanilla ES Module port from types.ts
 */

// ========== Constants ==========

export const POSITION_LABELS = {
  before_char: '角色前',
  after_char: '角色后',
  before_example: '示例前',
  after_example: '示例后',
  at_depth: '@深度',
  example_msg_top: '例消息顶',
  example_msg_bottom: '例消息底',
  outlet: '出口',
};

export const SELECTIVE_LOGIC_LABELS = {
  and_any: 'AND 任一',
  not_all: 'NOT 全部',
  not_any: 'NOT 任一',
  and_all: 'AND 全部',
};

export const DEFAULT_FORMAT_PROMPT = `【输出格式铁律 — 每回合必须完整输出以下全部标签，缺一即视为系统级错误】

禁止使用 Markdown 代码块（\`\`\`）包裹输出。直接输出裸 XML。

标签顺序与要求（必须全部出现，无一例外）：

1. <thinking>……</thinking>
   → 必填。内容：①本回合时间推进量 ②将出场的 NPC 姓名列表（逐一核对 NPC花名册） ③变量更新判断。

2. <maintext>……</maintext>
   → 必填。本回合剧情正文，可多段，保留自然换行。
   → 【命名铁律】写到的每个角色姓名必须与 NPC花名册 中该角色的键名逐字完全一致！"樱汐里"不是"神宫寺汐里"，"西园寺瑠衣"不是"小鸟游榴衣"，"桐岛可怜"不是"古手川可怜"。引用前必须在 <thinking> 中逐字核对。

3. <option>
选项 A
选项 B
选项 C
</option>
   → 必填。至少 3 个选项，每行一个，内容覆盖不同行动方向。

4. <sum>……</sum>
   → 必填。本回合剧情的一句话摘要，15-40 字。

5. <vars>{"键": "值"}</vars>
   → 选填。简单变量的 JSON 深合并（非 NPC/课程等结构化数据）。

6. <UpdateVariable>
<Analysis>（英文，不超过 80 词）</Analysis>
<JSONPatch>[…]</JSONPatch>
</UpdateVariable>
   → 选填。JSONPatch 必须是合法 JSON 数组，path 精确到叶子节点。
   → 【致命红线】对已存在于 NPC花名册 中的角色，严禁使用 "add" 操作！
   → 【静态锁死】严禁 path 中出现 "静态数据" 字样。

【回合完整性检查 — 输出前自检】
在输出结束前，逐条确认：<thinking> 有吗？<maintext> 有吗？<option> 有 3 项以上吗？<sum> 有吗？缺少任何一项必须补全。`;

export const DEFAULT_TAGS = ['maintext', 'option', 'sum', 'vars', 'thinking', 'think', 'w2g'];
export const DEFAULT_OPAQUE_TAGS = ['thinking', 'think'];

export const DEFAULT_SETTINGS = {
  api: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-3.5-turbo',
    timeout: 60000,
  },
  apiMode: 'single',
  activePresetId: null,
  activeLorebookIds: [],
  userName: '用户',
  characterName: '旧馆图书室',
  theme: 'dark',
  language: 'zh',
  autoSave: true,
  autoSaveInterval: 30,
  uiMode: 'game',
  customTags: ['maintext', 'option', 'sum', 'vars', 'thinking', 'think'],
  formatPromptTemplate: DEFAULT_FORMAT_PROMPT,
  thinkingDisplay: 'fold',
};

export const DEFAULT_PROMPT_ORDER = [
  { identifier: 'main', name: 'Main Prompt', role: 'system' },
  { identifier: 'worldInfoBefore', name: 'World Info (Before)', role: 'system' },
  { identifier: 'charDescription', name: 'Character Description', role: 'system' },
  { identifier: 'charPersonality', name: 'Character Personality', role: 'system' },
  { identifier: 'scenario', name: 'Scenario', role: 'system' },
  { identifier: 'personaDescription', name: 'Persona Description', role: 'system' },
  { identifier: 'dialogueExamples', name: 'Dialogue Examples', role: 'system' },
  { identifier: 'chatHistory', name: 'Chat History', role: 'system' },
  { identifier: 'worldInfoAfter', name: 'World Info (After)', role: 'system' },
  { identifier: 'groupNudge', name: 'Group Nudge', role: 'system' },
];

// ========== Factory Functions ==========

export function createDefaultPreset() {
  return {
    name: '默认预设',
    description: 'SillyTavern 兼容的默认 OpenAI 预设',
    settings: {
      temp_openai: 0.8,
      freq_pen_openai: 0,
      pres_pen_openai: 0,
      top_p_openai: 0.9,
      top_k_openai: 0,
      top_a_openai: 0,
      min_p_openai: 0,
      repetition_penalty_openai: 1,
      openai_max_context: 4096,
      openai_max_tokens: 2048,
      stream_openai: false,
      max_context_unlocked: false,
      chat_completion_source: 'openai',
      openai_model: 'gpt-3.5-turbo',
      main: 'Write {{char}}\'s next reply in a fictional chat between {{char}} and {{user}}.',
      nsfw: '',
      jailbreak: '',
      enhanceDefinitions: '',
      impersonation_prompt: '',
      new_chat_prompt: '',
      new_group_chat_prompt: '',
      new_example_chat_prompt: '',
      continue_nudge_prompt: '',
      wi_format: '',
      group_nudge_prompt: '',
      scenario_format: '',
      personality_format: '',
      prompts: [],
      prompt_order: DEFAULT_PROMPT_ORDER.map((p, i) => ({ ...p, enabled: true })),
    },
  };
}

export const VERSION = '3.0.0';
