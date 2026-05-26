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

export const DEFAULT_FORMAT_PROMPT = `你必须严格按照以下 XML 标签格式输出回复，不要使用 Markdown 包裹：
<thinking>……</thinking>     ← 可选；内部任何字符都视为思考过程，不被解析
<maintext>……</maintext>     ← 必填；本回合的剧情正文，可多段，保留换行
<option>选项 A
选项 B
选项 C</option>              ← 必填；至少 2 项，每行一个
<sum>……</sum>               ← 必填；本回合一句话总结
<vars>{ "金钱": +10, "HP": 38 }</vars>   ← 选填；JSON 深合并`;

export const DEFAULT_TAGS = ['maintext', 'option', 'sum', 'vars', 'thinking', 'think'];
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
  characterName: 'AI',
  theme: 'dark',
  language: 'zh',
  autoSave: true,
  autoSaveInterval: 30,
  uiMode: 'game',
  customTags: ['maintext', 'option', 'sum', 'vars', 'thinking', 'think'],
  formatPromptTemplate: DEFAULT_FORMAT_PROMPT,
  thinkingDisplay: 'fold',
  defaultVariables: {},
  variableRules: {
    extractFromResponse: true,
    useSecondaryApi: false,
    allowedKeys: [],
  },
  variableSchema: [],
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
