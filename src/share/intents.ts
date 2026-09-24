import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';
import { callUrl, digitsOnly, planDraft, signalChatUrl, type ShareTarget } from './reach';

export type { ShareTarget } from './reach';
export { planDraft } from './reach';

type TargetMeta = {
  label: string;
  packageName: string;
  /** Custom scheme used only to test "is this app installed?". */
  probeUrl: string;
};

export const TARGETS: Record<ShareTarget, TargetMeta> = {
  whatsapp: {
    label: 'WhatsApp',
    packageName: 'com.whatsapp',
    probeUrl: 'whatsapp://send?text=hi',
  },
  signal: {
    label: 'Signal',
    packageName: 'org.thoughtcrime.securesms',
    probeUrl: 'sgnl://signal.me',
  },
  x: {
    label: 'X',
    packageName: 'com.twitter.android',
    probeUrl: 'twitter://post',
  },
};

/**
 * Whether the official app is installed. Needs the <queries> block added by
 * plugins/withAssistantAndroid.js, otherwise Android 11+ always answers "no".
 */
export async function isTargetAvailable(target: ShareTarget): Promise<boolean> {
  try {
    return await Linking.canOpenURL(TARGETS[target].probeUrl);
  } catch {
    return false;
  }
}

export function normalizePhone(raw: string): string {
  return digitsOnly(raw);
}

/**
 * Opens the target app with the message pre-filled, and returns whether the body
 * was placed in the compose field (so the caller can decide whether to arm Send).
 *
 * This never sends anything by itself: it stops on the compose screen. Sending is
 * either the user's own tap, or the armed Accessibility service (see crawler.ts).
 */
export async function openCall(phone: string): Promise<void> {
  await Linking.openURL(callUrl(phone));
}

export async function openDraft(
  target: ShareTarget,
  text: string,
  recipient?: string | null,
): Promise<{ prefilled: boolean }> {
  if (Platform.OS !== 'android') {
    await Linking.openURL(webFallbackUrl(target, text, recipient));
    return { prefilled: Boolean(text.trim()) };
  }

  const plan = planDraft(target, text, recipient);
  if (plan.kind === 'url') {
    await Linking.openURL(plan.url);
    return { prefilled: plan.prefilled };
  }

  try {
    await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
      packageName: plan.packageName,
      type: 'text/plain',
      extra: { 'android.intent.extra.TEXT': plan.text },
    });
    return { prefilled: plan.prefilled };
  } catch {
    await Linking.openURL(webFallbackUrl(target, text, recipient));
    return { prefilled: Boolean(text.trim()) };
  }
}

function webFallbackUrl(target: ShareTarget, text: string, recipient?: string | null): string {
  const encoded = encodeURIComponent(text);
  switch (target) {
    case 'whatsapp': {
      const phone = recipient ? normalizePhone(recipient) : '';
      return `https://wa.me/${phone}?text=${encoded}`;
    }
    case 'signal':
      // Prefer text-bearing scheme when there is a body; chat URL only when empty.
      if (text.trim()) return `sgnl://send?text=${encoded}`;
      if (recipient && normalizePhone(recipient)) return signalChatUrl(recipient);
      return `sgnl://send?text=${encoded}`;
    case 'x':
      return `https://twitter.com/intent/tweet?text=${encoded}`;
  }
}

/** Opens the system Accessibility screen so the user can enable the send crawler. */
export async function openAccessibilitySettings(): Promise<void> {
  await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.ACCESSIBILITY_SETTINGS);
}

/** Opens Android text-to-speech settings so the user can install neural language packs. */
export async function openTtsSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await IntentLauncher.startActivityAsync('com.android.settings.TTS_SETTINGS');
  } catch {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.ACCESSIBILITY_SETTINGS);
  }
}
