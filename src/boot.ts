import { useEffect, useState } from 'react';
import { getDb } from './db';
import { loadLlm, subscribeEngine, type EngineStatus } from './llm/engine';
import { MODELS, localPath, type ModelSpec } from './models/catalog';
import { prepareNotifications } from './notify';
import { loadSettings, peekSettings } from './settings/store';
import { isSttReady, loadStt } from './voice/stt';

/**
 * Picks which downloaded model to use: the one chosen in Settings if it is still
 * present, otherwise the first available of that kind.
 */
export function resolveModel(kind: ModelSpec['kind']): { spec: ModelSpec; path: string } | null {
  const settings = peekSettings();
  const preferred = kind === 'llm' ? settings.llmModelPath : settings.sttModelPath;

  const candidates = MODELS.filter((m) => m.kind === kind);
  const chosen =
    candidates.find((m) => preferred && localPath(m) === preferred) ??
    candidates.find((m) => localPath(m) !== null);

  if (!chosen) return null;
  const path = localPath(chosen);
  return path ? { spec: chosen, path } : null;
}

export type BootState = {
  ready: boolean;
  engine: EngineStatus;
  sttReady: boolean;
  /** Set when no model files are on the device yet. */
  needsModels: boolean;
  error: string | null;
};

/**
 * Runs once at app start: open the database, ask for notification permission, and
 * load whichever models the user has already downloaded.
 */
export function useBoot(): BootState {
  const [state, setState] = useState<BootState>({
    ready: false,
    engine: { state: 'unloaded' },
    sttReady: false,
    needsModels: false,
    error: null,
  });

  useEffect(() => subscribeEngine((engine) => setState((prev) => ({ ...prev, engine }))), []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await loadSettings();
        await getDb();
        await prepareNotifications();

        const llm = resolveModel('llm');
        const stt = resolveModel('stt');

        if (cancelled) return;
        setState((prev) => ({ ...prev, ready: true, needsModels: !llm || !stt }));

        // Speech first: it is ~30MB and makes the app feel alive quickly, while the
        // LLM can take several seconds to memory-map.
        if (stt) {
          await loadStt(stt.path);
          if (!cancelled) setState((prev) => ({ ...prev, sttReady: isSttReady() }));
        }

        if (llm && !cancelled) await loadLlm(llm.path);
      } catch (error) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            ready: true,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
