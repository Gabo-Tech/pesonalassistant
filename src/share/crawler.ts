import { requireOptionalNativeModule } from 'expo-modules-core';
import type { ShareTarget } from './intents';

/**
 * JS side of the Android "send crawler".
 *
 * There is no supported API to send a personal WhatsApp/Signal message or post to X
 * from another app, so after the user confirms we open the real app on the draft and
 * an AccessibilityService taps its Send button. The rules that keep this honest:
 *
 *  - It is armed for exactly one send, with the approved text, and disarms itself.
 *  - It is armed only from commitPending(), i.e. after a tap or spoken confirm.
 *  - If the user never enabled the Accessibility permission, everything still works;
 *    the draft just waits for a human tap.
 *
 * requireOptionalNativeModule returns null when the native module is not in the
 * binary, so the whole app keeps running in that case instead of crashing.
 */

type SendCrawlerModule = {
  isEnabled(): boolean;
  arm(packageName: string, text: string, timeoutMs: number): void;
  disarm(): void;
};

const native = requireOptionalNativeModule<SendCrawlerModule>('SendCrawler');

export const isCrawlerAvailable = (): boolean => native !== null;

/** True only when the user turned our service on in Android Accessibility settings. */
export function isCrawlerEnabled(): boolean {
  try {
    return native?.isEnabled() ?? false;
  } catch {
    return false;
  }
}

const PACKAGES: Record<ShareTarget, string> = {
  whatsapp: 'com.whatsapp',
  signal: 'org.thoughtcrime.securesms',
  x: 'com.twitter.android',
};

/**
 * Authorises exactly one automated Send tap.
 * Returns whether the tap will be automatic, so the UI can tell the user what to expect.
 */
export function armSend(target: ShareTarget, text: string, timeoutMs = 15_000): boolean {
  if (!native || !isCrawlerEnabled()) return false;
  try {
    native.arm(PACKAGES[target], text, timeoutMs);
    return true;
  } catch {
    return false;
  }
}

export function disarmSend(): void {
  try {
    native?.disarm();
  } catch {
    // Nothing armed.
  }
}
