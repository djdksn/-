/**
 * Prompt Assembler
 */

import { createLorebookEngine } from './lorebook-engine.js';
import { getRegexedString, REGEX_PLACEMENT } from './regex-engine.js';
import { renderTemplate, buildGenerateContext } from './ejs-engine.js';
import { expandMacros } from './variable-macro.js';

export async function assemblePrompt(options) {
  const { userInput, history, preset, lorebooks, userName, characterName, variables, formatPrompt, regexScripts, characterTags, triggerFilter, additionalContexts } = options;

  const allMatchedEntries = [];
  const scanText = userInput + ' ' + history.slice(-3).map(m => m.content).join(' ');

  for (const book of lorebooks) {
    const engine = createLorebookEngine(book);
    const matches = engine.recursiveScan(scanText, 3, {
      characterName,
      characterTags,
      triggerFilter,
      additionalContexts,
      messageIndex: history.length,
    });
    allMatchedEntries.push(...matches);
  }

  const uniqueEntries = Array.from(
    new Map(allMatchedEntries.map(e => [e.entry.id, e])).values()
  ).sort((a, b) => a.score - b.score);

  // Separate at_depth entries from the rest
  const depthEntries = uniqueEntries.filter(e => e.entry.position === 'at_depth');
  const worldInfoEntries = uniqueEntries.filter(e => e.entry.position !== 'at_depth');

  const maxContextTokens = preset.settings.openai_max_context || preset.settings.max_length || 4096;
  let currentTokens = 0;

  const recentHistory = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === 'system') continue;
    const msgTokens = msg.content.length / 4;
    if (currentTokens + msgTokens > maxContextTokens * 0.8) break;
    recentHistory.unshift({ role: msg.role, content: msg.content });
    currentTokens += msgTokens;
  }

  // Inject at_depth entries at specified positions in chat history
  if (depthEntries.length > 0) {
    const ROLE_MAP = { 0: 'system', 1: 'user', 2: 'assistant' };
    // Sort by depth ascending, then inject from deepest to shallowest so indices stay stable
    const sorted = [...depthEntries].sort((a, b) => (a.entry.depth || 0) - (b.entry.depth || 0));
    for (let i = sorted.length - 1; i >= 0; i--) {
      const e = sorted[i];
      const injectDepth = Math.min(e.entry.depth || 0, recentHistory.length);
      const role = ROLE_MAP[e.entry.role] || 'system';
      const content = replaceMacros(e.entry.content, { userName, characterName, userInput, variables });
      recentHistory.splice(injectDepth, 0, { role, content });
    }
  }

  const promptOrder = (preset.settings.prompt_order || []);
  const prompts = (preset.settings.prompts || []);

  function resolvePromptContent(identifier) {
    if (identifier === 'worldInfoBefore' || identifier === 'worldInfoAfter') {
      const content = worldInfoEntries.map(e => e.entry.content).join('\n\n');
      if (!content) return null;
      return regexScripts && regexScripts.length > 0
        ? getRegexedString(content, REGEX_PLACEMENT.WORLD_INFO, { scripts: regexScripts, isPrompt: true })
        : content;
    }
    if (identifier === 'charDescription') return preset.settings.character_description || null;
    if (identifier === 'charPersonality') return preset.settings.character_personality || null;
    if (identifier === 'scenario') return preset.settings.scenario || null;
    if (identifier === 'personaDescription') return preset.settings.persona_description || null;
    if (identifier === 'dialogueExamples') return preset.settings.dialogue_examples || null;
    if (identifier === 'groupNudge') return preset.settings.group_nudge_prompt || null;
    if (identifier === 'impersonate') return preset.settings.impersonation_prompt || null;
    if (identifier === 'quietPrompt') return preset.settings.quiet_prompt || null;
    if (identifier === 'bias') return null;
    const custom = prompts.find(p => p.identifier === identifier);
    if (custom?.content) return custom.content;
    const direct = preset.settings[identifier];
    if (typeof direct === 'string' && direct.trim()) return direct;
    return null;
  }

  // Build EJS context once for all prompt items
  const ejsExtra = buildGenerateContext({
    chat: { id: '', name: '', messages: history, variables },
    userName,
    characterName,
    userInput,
  });

  const assembledMessages = [];
  let systemAccumulator = '';
  let hasChatHistory = false;

  for (const item of promptOrder) {
    if (item.enabled === false) continue;

    if (item.identifier === 'chatHistory') {
      hasChatHistory = true;
      if (systemAccumulator) {
        assembledMessages.push({ role: 'system', content: systemAccumulator });
        systemAccumulator = '';
      }
      assembledMessages.push(...recentHistory);
      continue;
    }

    const rawContent = resolvePromptContent(item.identifier);
    if (!rawContent) continue;

    let content = replaceMacros(rawContent, { userName, characterName, userInput, variables });
    if (!content.trim()) continue;

    // EJS processing for this prompt item
    content = await renderTemplate(content, ejsExtra);

    const role = item.role || 'system';
    if (role === 'system') {
      systemAccumulator += (systemAccumulator ? '\n\n' : '') + content;
    } else {
      if (systemAccumulator) {
        assembledMessages.push({ role: 'system', content: systemAccumulator });
        systemAccumulator = '';
      }
      assembledMessages.push({ role, content });
    }
  }

  if (formatPrompt) {
    let formatted = replaceMacros(formatPrompt, { userName, characterName, userInput, variables });
    formatted = await renderTemplate(formatted, ejsExtra);
    systemAccumulator += (systemAccumulator ? '\n\n' : '') + formatted;
  }

  if (systemAccumulator) {
    assembledMessages.unshift({ role: 'system', content: systemAccumulator });
  }

  if (!hasChatHistory) {
    assembledMessages.push(...recentHistory);
  }

  const processedInput = regexScripts && regexScripts.length > 0
    ? getRegexedString(userInput, REGEX_PLACEMENT.USER_INPUT, { scripts: regexScripts, isPrompt: true })
    : userInput;
  assembledMessages.push({ role: 'user', content: processedInput });

  const systemPrompt = assembledMessages
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n\n');

  return { messages: assembledMessages, matchedEntries: uniqueEntries, systemPrompt };
}

export function replaceMacros(template, context) {
  let result = template
    .replace(/\{\{user\}\}/g, context.userName)
    .replace(/\{\{char\}\}/g, context.characterName)
    .replace(/\{\{original\}\}/g, context.userInput);

  // Basic variable substitution (existing behavior)
  if (context.variables) {
    result = result.replace(/\{\{([^{}:]+)\}\}/g, (match, key) => {
      const trimmed = key.trim();
      // Skip format_message_variable — handled by expandMacros below
      if (trimmed.startsWith('format_message_variable')) return match;
      const value = context.variables?.[trimmed];
      return value !== undefined ? String(value) : match;
    });
  }

  // Advanced macro expansion (format_message_variable, registered macros)
  result = expandMacros(result, {
    chat: context.chat || {},
    userName: context.userName,
    characterName: context.characterName,
    userInput: context.userInput,
  });

  return result;
}

export const SUPPORTED_MACROS = [
  { name: '{{user}}', description: '用户名' },
  { name: '{{char}}', description: 'AI角色名' },
  { name: '{{original}}', description: '用户原始输入' },
  { name: '{{变量名}}', description: '自定义变量（例如 {{hp}}）' },
];
