import { initLlama, type LlamaContext } from 'llama.rn';
import { recentTurns } from '../db/turns';
import { fallbackAsk } from './fallback';
import { buildSystemPrompt } from './prompt';
import { parseReply, REPLY_SCHEMA, type AssistantReply } from './tools';

/**
 * Wraps llama.cpp (via llama.rn) as a single long-lived context.
 *
 * Loading a GGUF costs seconds and hundreds of megabytes of RAM, so we do it once and
 * reuse the context for every request. Everything here is CPU inference on the phone;
 * no prompt or reply ever leaves the device.
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
          n_ctx: 2048,
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

/**
 * Sends one user utterance through the model and returns the parsed reply.
 *
 * `response_format: json_schema` is the important part: llama.cpp compiles the schema
 * into a GBNF grammar and masks every token that would break it, so the output is
 * always parseable JSON with a valid tool name.
 */
export async function ask(userText: string): Promise<AssistantReply> {
  if (!context) return fallbackAsk(userText);

  const history = await recentTurns(6);

  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    ...history
      .filter((turn) => turn.role !== 'system')
      .map((turn) => ({ role: turn.role, content: turn.text })),
    { role: 'user', content: userText },
  ];

  const result = await context.completion({
    messages,
    jinja: true,
    response_format: {
      type: 'json_schema',
      json_schema: { strict: true, schema: REPLY_SCHEMA as unknown as object },
    },
    // Low but non-zero: deterministic enough to follow the format, not robotic.
    temperature: 0.3,
    top_p: 0.9,
    n_predict: 256,
  });

  return parseReply(result.text || result.content || '');
}
