import { initLlama, type LlamaContext, type TokenData } from 'llama.rn';
import { t } from '../i18n';
import { listFacts } from '../db/facts';
import type { PromptFact } from '../db/factsFormat';
import { recentTurns } from '../db/turns';
import { localPath, MODELS } from '../models/catalog';
import { nextHeavierModelId } from '../models/tier';
import { peekSettings } from '../settings/store';
import { readCloudKey } from '../settings/secrets';
import { fallbackAsk, matchCommand } from './fallback';
import { looksLikeTask } from './intent';
import { cloudReplyText, cloudRequest, type CloudProvider, type CloudTurn } from './cloud';
import { buildChatPrompt, buildSystemPrompt } from './prompt';
import { parseReply, REPLY_SCHEMA, spokenChat, toolReplyUsable, type AssistantReply } from './tools';
import { takeSentences } from '../voice/sentences';

/**
 * Wraps llama.cpp (via llama.rn) as a single long-lived context.
 *
 * Loading a GGUF costs seconds and hundreds of megabytes of RAM, so we do it once and
 * reuse the context for every request. On-device chat stays on the phone. A cloud
 * provider is used only when Settings has one selected and a key is saved.
 */

export type EngineStatus =
  | { state: 'unloaded' }
  | { state: 'loading'; progress: number }
  | { state: 'ready'; modelName: string }
  | { state: 'error'; message: string };

let context: LlamaContext | null = null;
let loadedPath: string | null = null;
let status: EngineStatus = { state: 'unloaded' };
let loading: Promise<void> | null = null;
/** Reloads the resident model after a heavier task attempt, without blocking the spoken answer. */
let restoring: Promise<void> | null = null;

const listeners = new Set<(s: EngineStatus) => void>();

function setStatus(next: EngineStatus): void {
  status = next;
  listeners.forEach((fn) => fn(next));
}

export function subscribeEngine(fn: (s: EngineStatus) => void): () => void {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}

export const getEngineStatus = (): EngineStatus => status;
export const isLlmReady = (): boolean => status.state === 'ready';

/** Loads the model. Safe to call repeatedly; concurrent calls share one load. */
export async function loadLlm(modelPath: string): Promise<void> {
  if (status.state === 'ready' && loadedPath === modelPath) return;
  if (loadedPath && loadedPath !== modelPath) await unloadLlm();
  if (loading) return loading;

  loading = (async () => {
    setStatus({ state: 'loading', progress: 0 });
    try {
      context = await initLlama(
        {
          model: modelPath,
          // 2048 tokens is plenty for a short command plus a few turns of history,
          // and keeps the KV cache small enough for a phone.
          n_ctx: 1024,
          n_threads: 4,
          // Android GPU offload via OpenCL is still unreliable across vendors; CPU is
          // predictable and a 1.5B Q4 model is fast enough for one-shot commands.
          n_gpu_layers: 0,
        },
        (progress) => setStatus({ state: 'loading', progress: progress / 100 }),
      );

      loadedPath = modelPath;
      setStatus({ state: 'ready', modelName: modelPath.split('/').pop() ?? 'model' });
    } catch (error) {
      context = null;
      loadedPath = null;
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      loading = null;
    }
  })();

  return loading;
}

export async function unloadLlm(): Promise<void> {
  await context?.release();
  context = null;
  loadedPath = null;
  setStatus({ state: 'unloaded' });
}

export type AskHooks = {
  /** Fired for each completed chat sentence so speech can start early. */
  onSentence?: (sentence: string) => void;
  /** Fired once before a heavier GGUF is loaded for a failed tool call. */
  onSwap?: () => void;
  /**
   * When false, a bad tool parse is returned as-is.
   * Search follow-ups pass false so a summary never swaps models.
   */
  escalate?: boolean;
};

/**
 * Sends one user utterance through the model and returns the parsed reply.
 *
 * Chit-chat uses a short prompt and streams sentences. Tasks use JSON-schema
 * grammar. If that grammar result is unusable and a heavier file is downloaded,
 * the resident model is swapped out for one attempt, then loaded again.
 */
export async function ask(userText: string, hooks?: AskHooks): Promise<AssistantReply> {
  const settings = peekSettings();
  const locale = settings.locale;
  const command = matchCommand(userText, locale);
  if (command) return command;

  if (settings.llmProvider !== 'local') {
    const key = await readCloudKey();
    if (key) {
      try {
        return await askCloud(userText, settings.llmProvider, settings.cloudModel, key, locale);
      } catch {
        return { say: t('cloud.failed') };
      }
    }
  }

  if (restoring) await restoring;
  if (!context) return fallbackAsk(userText, locale);

  if (!looksLikeTask(userText)) return completeChat(userText, locale, hooks?.onSentence);

  const raw = await completeTool(userText, locale);
  if (toolReplyUsable(raw) || hooks?.escalate === false) return parseReply(raw);

  const fastPath = loadedPath;
  const heavier = fastPath ? heavierModelPath(fastPath) : null;
  if (!heavier) return parseReply(raw);

  hooks?.onSwap?.();
  let reply: AssistantReply;
  try {
    await loadLlm(heavier);
    reply = parseReply(await completeTool(userText, locale));
  } catch {
    reply = parseReply(raw);
  }
  restoreResident(fastPath);
  return reply;
}

function restoreResident(fastPath: string | null): void {
  if (!fastPath || loadedPath === fastPath) return;
  restoring = loadLlm(fastPath)
    .catch(() => {
      // The heavier model stays loaded if the resident file cannot be restored.
    })
    .finally(() => {
      restoring = null;
    });
}

function heavierModelPath(currentPath: string): string | null {
  const fileName = currentPath.split('/').pop();
  const current = MODELS.find((model) => model.fileName === fileName);
  const downloaded = MODELS.filter((model) => model.kind === 'llm' && localPath(model)).map(
    (model) => model.id,
  );
  const nextId = nextHeavierModelId(current?.id ?? null, downloaded);
  if (!nextId) return null;
  const spec = MODELS.find((model) => model.id === nextId);
  return spec ? localPath(spec) : null;
}

async function localMessages(
  userText: string,
  systemFor: (facts: PromptFact[]) => string,
): Promise<{ role: string; content: string }[]> {
  const [history, facts] = await Promise.all([recentTurns(6), listFacts()]);
  return [
    { role: 'system', content: systemFor(facts) },
    ...history
      .filter((turn) => turn.role !== 'system')
      .map((turn) => ({ role: turn.role, content: turn.text })),
    { role: 'user', content: userText },
  ];
}

async function completeChat(
  userText: string,
  locale: 'en' | 'es',
  onSentence?: (sentence: string) => void,
): Promise<AssistantReply> {
  if (!context) return fallbackAsk(userText, locale);

  const messages = await localMessages(userText, (facts) =>
    buildChatPrompt(Date.now(), facts, locale, true),
  );
  let buffer = '';
  let emitted = 0;

  const emit = (full: string, flush: boolean): void => {
    if (!onSentence) return;
    if (full.trimStart().startsWith('{')) {
      if (!flush) return;
      const say = spokenChat(full);
      const spoken = takeSentences(say);
      for (const sentence of spoken.sentences) onSentence(sentence);
      if (spoken.rest.trim()) onSentence(spoken.rest.trim());
      return;
    }
    const { sentences, rest } = takeSentences(full);
    for (const sentence of sentences.slice(emitted)) onSentence(sentence);
    emitted = sentences.length;
    if (flush && rest.trim()) onSentence(rest.trim());
  };

  const result = await context.completion(
    {
      messages,
      jinja: true,
      temperature: 0.3,
      top_p: 0.9,
      n_predict: 48,
    },
    (data: TokenData) => {
      if (typeof data.accumulated_text === 'string') buffer = data.accumulated_text;
      else buffer += data.token ?? '';
      emit(buffer, false);
    },
  );

  const raw = result.text || result.content || buffer;
  emit(raw, true);
  return { say: spokenChat(raw) };
}

async function completeTool(userText: string, locale: 'en' | 'es'): Promise<string> {
  if (!context) return '';

  const messages = await localMessages(userText, (facts) =>
    buildSystemPrompt(Date.now(), facts, locale, true),
  );

  const result = await context.completion({
    messages,
    jinja: true,
    response_format: {
      type: 'json_schema',
      json_schema: { strict: true, schema: REPLY_SCHEMA as unknown as object },
    },
    // Low but non-zero: deterministic enough to follow the format, not robotic.
    temperature: 0.1,
    top_p: 0.9,
    n_predict: 128,
  });

  return result.text || result.content || '';
}

async function askCloud(
  userText: string,
  provider: CloudProvider,
  model: string,
  apiKey: string,
  locale: 'en' | 'es',
): Promise<AssistantReply> {
  const [history, facts] = await Promise.all([recentTurns(6), listFacts()]);
  const messages: CloudTurn[] = [
    { role: 'system', content: buildSystemPrompt(Date.now(), facts, locale, false) },
    ...history
      .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
      .map((turn) => ({ role: turn.role as 'user' | 'assistant', content: turn.text })),
    { role: 'user', content: userText },
  ];
  const request = cloudRequest({ provider, model, apiKey, messages });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    if (!response.ok) return { say: t('cloud.failed') };
    const payload: unknown = await response.json();
    return parseReply(cloudReplyText(provider, payload));
  } finally {
    clearTimeout(timer);
  }
}
