/**
 * Dual-API router with streaming support.
 */

export function createApiRouter(settings, deps) {
  const fetchImpl = deps?.fetch ?? globalThis.fetch;
  const useSecondary = !!(settings.secondary?.enabled);

  function targetFor(task) {
    if (!useSecondary) return 'primary';
    return task === 'story' ? 'primary' : 'secondary';
  }

  function endpointFor(target) {
    if (target === 'secondary' && settings.secondary) {
      return {
        baseUrl: settings.secondary.baseUrl,
        apiKey: settings.secondary.apiKey,
        model: settings.secondary.model,
      };
    }
    return { baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model };
  }

  async function callOnce(target, body) {
    const ep = endpointFor(target);
    return await fetchImpl(`${ep.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ep.apiKey}`,
      },
      body: JSON.stringify({ ...body, model: ep.model }),
    });
  }

  async function call(task, payload) {
    const target = targetFor(task);
    if (target === 'secondary') {
      try {
        const res = await callOnce('secondary', payload);
        if (!res.ok) throw new Error(`secondary HTTP ${res.status}`);
        return { targetUsed: 'secondary', response: res };
      } catch {
        const res = await callOnce('primary', payload);
        return { targetUsed: 'primary', response: res };
      }
    }
    const res = await callOnce('primary', payload);
    return { targetUsed: 'primary', response: res };
  }

  /**
   * Send a streaming chat-completion request.
   * @param {Object} args
   * @param {string} args.task - 'story' | 'summary' | 'vars'
   * @param {Array} args.messages
   * @param {Function} args.onChunk - called with each text delta
   * @returns {Promise<void>}
   */
  async function sendStream(args) {
    const { task, messages, onChunk } = args;
    const { response } = await call(task, { messages, stream: true });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No body');
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const part of parts) {
        const lines = part.split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try {
            const json = JSON.parse(data);
            const delta = json?.choices?.[0]?.delta?.content ?? '';
            if (delta) onChunk(delta);
          } catch { /* ignore bad line */ }
        }
      }
    }
  }

  return { targetFor, call, sendStream };
}
