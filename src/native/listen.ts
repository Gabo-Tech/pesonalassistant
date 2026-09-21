import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Keeps a microphone foreground service alive so Android 14+ does not mute the
 * mic a few seconds after you leave the app.
 */
type ListenForegroundModule = {
  start(): void;
  stop(): void;
};

const native = requireOptionalNativeModule<ListenForegroundModule>('ListenForeground');

export function startListenService(): void {
  try {
    native?.start();
  } catch {
    // Dev client without the native module still records while the activity is open.
  }
}

export function stopListenService(): void {
  try {
    native?.stop();
  } catch {
    // Already stopped.
  }
}
