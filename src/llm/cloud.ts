/**
 * Optional cloud chat. The API key is only placed in a request header, never in the
 * URL, the JSON body, or the log line.
 */

export const CLOUD_PROVIDERS = ['openai', 'anthropic', 'gemini', 'openrouter'] as const;
export type CloudProvider = (typeof CLOUD_PROVIDERS)[number];

export const CLOUD_PRESETS: Record<CloudProvider, readonly string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4.1-mini'],
  anthropic: ['claude-3-5-haiku-latest', 'claude-sonnet-4-5'],
  gemini: ['gemini-2.0-flash', 'gemini-2.5-flash'],
  openrouter: ['openai/gpt-4o-mini', 'google/gemini-2.0-flash-001'],
};

export function defaultCloudModel(provider: CloudProvider): string {
  return CLOUD_PRESETS[provider][0];
}

export type CloudTurn = { role: 'system' | 'user' | 'assistant'; content: string };

export type CloudHttpRequest = {
  url: string;
  model: string;
  headers: Record<string, string>;
  body: string;
};

export function cloudRequest(input: {
  provider: CloudProvider;
  model: string;
  apiKey: string;
  messages: CloudTurn[];
}): CloudHttpRequest {
  const model = input.model.trim() || defaultCloudModel(input.provider);
  const system = input.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const dialogue = input.messages.filter((message) => message.role !== 'system');

  if (input.provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      model,
      headers: {
        'content-type': 'application/json',
        'x-api-key': input.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        temperature: 0.1,
        system,
        messages: dialogue.map((message) => ({ role: message.role, content: message.content })),
      }),
    };
  }

  if (input.provider === 'gemini') {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      model,
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': input.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: dialogue.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
    };
  }

  const url =
    input.provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
  return {
    url,
    model,
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: input.messages,
    }),
  };
}

/** Safe to print. Callers must not log headers or the body builder's key. */
export function safeCloudLog(request: Pick<CloudHttpRequest, 'url' | 'model'>): string {
  return `${request.model} ${request.url}`;
}

export function cloudReplyText(provider: CloudProvider, payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;

  if (provider === 'anthropic') {
    const content = record.content;
    if (!Array.isArray(content)) return '';
    const first = content[0] as { text?: string } | undefined;
    return first?.text ?? '';
  }

  if (provider === 'gemini') {
    const candidates = record.candidates;
    if (!Array.isArray(candidates)) return '';
    const parts = (candidates[0] as { content?: { parts?: { text?: string }[] } } | undefined)?.content
      ?.parts;
    return parts?.[0]?.text ?? '';
  }

  const choices = record.choices;
  if (!Array.isArray(choices)) return '';
  const message = (choices[0] as { message?: { content?: string } } | undefined)?.message;
  return message?.content ?? '';
}
