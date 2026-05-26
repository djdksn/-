/**
 * API helpers for OpenAI-compatible endpoints.
 */

const COMMON_MODELS_BY_HOST = [
  { match: 'deepseek', models: ['deepseek-chat', 'deepseek-reasoner'] },
  { match: 'moonshot', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
  { match: 'kimi', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
  { match: 'dashscope', models: ['qwen-turbo', 'qwen-plus', 'qwen-max'] },
  { match: 'qwen', models: ['qwen-turbo', 'qwen-plus', 'qwen-max'] },
  { match: 'tongyi', models: ['qwen-turbo', 'qwen-plus', 'qwen-max'] },
  { match: 'openai', models: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini'] },
  { match: 'anthropic', models: ['claude-3-5-sonnet-latest', 'claude-3-opus-latest', 'claude-3-5-haiku-latest'] },
  { match: 'gemini', models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'] },
];

const FALLBACK_MODELS = ['gpt-3.5-turbo', 'gpt-4', 'deepseek-chat', 'qwen-turbo'];

export function getFallbackModels(baseUrl) {
  const url = baseUrl.toLowerCase();
  for (const { match, models } of COMMON_MODELS_BY_HOST) {
    if (url.includes(match)) return models;
  }
  return FALLBACK_MODELS;
}

function normalizeBaseUrl(url) {
  return url.trim().replace(/\/$/, '');
}

async function tryFetchModels(baseUrl, headers) {
  const res = await fetch(`${baseUrl}/models`, {
    headers: { Accept: 'application/json', ...headers },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return ((data.data ?? [])).map(m => m.id).filter(x => !!x).sort();
}

export async function fetchModels(target) {
  const baseUrl = normalizeBaseUrl(target.baseUrl);
  if (!baseUrl) {
    return { models: [], source: 'fallback', error: '请填写 API 基础 URL' };
  }
  const key = target.apiKey?.trim();
  let lastError;
  try {
    const models = await tryFetchModels(baseUrl, key ? { Authorization: `Bearer ${key}` } : {});
    if (models.length > 0) return { models, source: 'remote' };
  } catch (e) { lastError = e; }
  try {
    const models = await tryFetchModels(baseUrl, key ? { 'api-key': key } : {});
    if (models.length > 0) return { models, source: 'remote' };
  } catch (e) { lastError = e; }
  return {
    models: getFallbackModels(baseUrl),
    source: 'fallback',
    error: (lastError)?.message || 'unknown',
  };
}

export async function testConnection(target) {
  const baseUrl = normalizeBaseUrl(target.baseUrl);
  const key = target.apiKey?.trim();
  const model = target.model?.trim() || 'gpt-3.5-turbo';
  if (!baseUrl || !key) {
    return { ok: false, error: '请填写 URL 和 Key' };
  }
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, status: res.status, errorBody: text.slice(0, 200) };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
