import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getDb } from './db';
import { loadLlm, subscribeEngine, type EngineStatus } from './llm/engine';
import { MODELS, localPath, type ModelSpec } from './models/catalog';
import { ensureAlarmChannel, ensureReminderChannel } from './notify';
import { startAlarmListeners } from './notify/alarmRing';
import { loadSettings, peekSettings, subscribeSettings } from './settings/store';
import { isSttReady, loadStt, subscribeStt } from './voice/stt';

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

const BootContext = createContext<BootState | null>(null);

function modelsMissing(): boolean {
  return resolveModel('llm') === null || resolveModel('stt') === null;
}

/**
 * Runs once at app start (root layout): open the database, create the reminder
 * and alarm channels, and load whichever models the user has already downloaded.
 */
export function BootProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BootState>({
    ready: false,
    engine: { state: 'unloaded' },
    sttReady: isSttReady(),
    needsModels: false,
    error: null,
  });

  useEffect(() => subscribeEngine((engine) => setState((prev) => ({ ...prev, engine }))), []);
  useEffect(() => subscribeStt((sttReady) => setState((prev) => ({ ...prev, sttReady }))), []);
  useEffect(
    () => subscribeSettings(() => setState((prev) => ({ ...prev, needsModels: modelsMissing() }))),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await loadSettings();
        await getDb();
        await ensureReminderChannel();
        await ensureAlarmChannel();
        startAlarmListeners();

        const llm = resolveModel('llm');
        const stt = resolveModel('stt');

        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          ready: true,
          needsModels: !llm || !stt,
        }));

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

  return <BootContext.Provider value={state}>{children}</BootContext.Provider>;
}

export function useBoot(): BootState {
  const value = useContext(BootContext);
  if (!value) throw new Error('useBoot must be used inside <BootProvider>');
  return value;
}
