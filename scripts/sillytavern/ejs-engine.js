/**
 * ejs-engine.js — EJS template renderer wrapping ejs.js
 * Handles <% ... %> blocks in prompts and messages.
 */
import { variableStore } from './variable-store.js';

// ejs is loaded globally via <script> tag, exposed as window.ejs

const ESCAPE_PATTERN = /<#escape-ejs>([\s\S]*?)<#\/escape-ejs>/g;

function escapeEjsBlocks(text) {
  return text.replace(ESCAPE_PATTERN, (_, content) => {
    const escaped = content.replace(/<%([\s\S]*?)%>/g, '&lt;%$1%&gt;');
    return escaped;
  });
}

function unescapeEjsBlocks(text) {
  return text.replace(/&lt;%([\s\S]*?)%&gt;/g, '<%$1%>');
}

/**
 * Build the context object passed to ejs templates.
 * Uses synchronous variable accessors — ensureLoaded() must be called first.
 */
function buildContext(extra = {}) {
  const { chat, msg, userName, characterName, userInput } = extra;

  const ctx = {
    getvar: (key, opts) => variableStore.getVarSync(key, opts, chat, msg?.id),
    setvar: (key, value, opts) => variableStore.setVarSync(key, value, opts, chat, msg?.id),
    incvar: (key, delta, opts) => variableStore.incVarSync(key, delta, opts, chat, msg?.id),
    decvar: (key, delta, opts) => variableStore.decVarSync(key, delta, opts, chat, msg?.id),
    print: (...args) => args.join(' '),
    console: {
      log: (...args) => console.log('[EJS]', ...args),
      warn: (...args) => console.warn('[EJS]', ...args),
      error: (...args) => console.error('[EJS]', ...args),
    },
    variables: chat?.variables || {},
    char: characterName || '',
    user: userName || '',
    input: userInput || '',
    chat: chat ? { id: chat.id, name: chat.name, messageCount: chat.messages?.length || 0 } : {},
  };

  return ctx;
}

/**
 * Render a single template string with error handling.
 */
export async function renderTemplate(template, extra = {}) {
  if (!template || typeof template !== 'string') return template;

  // Skip if no EJS tags present (fast path)
  if (!/<%/.test(template)) return template;

  await variableStore.ensureLoaded();

  const preprocessed = escapeEjsBlocks(template);
  const ctx = buildContext(extra);

  try {
    const result = window.ejs.render(preprocessed, ctx, {
      openDelimiter: '<%',
      closeDelimiter: '%>',
    });
    return unescapeEjsBlocks(result);
  } catch (err) {
    console.error('[EJS] Template render error:', err.message, '\nTemplate:', template.slice(0, 200));
    // Return original text on error — don't break the conversation
    return template;
  }
}

/**
 * Render all messages in an array, processing each content field.
 */
export async function renderMessages(messages, extra = {}) {
  const result = [];
  for (const msg of messages) {
    let content = msg.content;
    if (typeof content === 'string') {
      content = await renderTemplate(content, { ...extra, msg });
    } else if (Array.isArray(content)) {
      // Handle OAI-style content array
      content = await Promise.all(content.map(async (part) => {
        if (part.type === 'text' && part.text) {
          return { ...part, text: await renderTemplate(part.text, { ...extra, msg }) };
        }
        return part;
      }));
    }
    result.push({ ...msg, content });
  }
  return result;
}

/**
 * Build context specifically for the generate phase (before sending to LLM).
 * Exposes additional context from prompt assembly.
 */
export function buildGenerateContext(options) {
  const { chat, userName, characterName, userInput } = options;
  return buildContext({
    chat,
    userName,
    characterName,
    userInput,
  });
}
