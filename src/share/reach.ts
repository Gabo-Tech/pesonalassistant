/** Digits only. wa.me and signal.me reject spaces and a leading plus in the path. */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function signalChatUrl(phone: string): string {
  return `https://signal.me/#p/+${digitsOnly(phone)}`;
}

export function callUrl(phone: string): string {
  const trimmed = phone.trim();
  const keepPlus = trimmed.startsWith('+') ? `+${digitsOnly(trimmed)}` : digitsOnly(trimmed);
  return `tel:${keepPlus}`;
}

export type ShareTarget = 'whatsapp' | 'signal' | 'x';

const PACKAGES: Record<ShareTarget, string> = {
  whatsapp: 'com.whatsapp',
  signal: 'org.thoughtcrime.securesms',
  x: 'com.twitter.android',
};

/** How openDraft will hand the message to the target app. Pure so tests can assert it. */
export type DraftPlan =
  | { kind: 'url'; url: string; prefilled: boolean }
  | { kind: 'send'; packageName: string; text: string; prefilled: true };

/**
 * Chooses deep link vs ACTION_SEND.
 *
 * Signal has no wa.me-style link that carries text, so phone+text must use SEND
 * (body prefilled) instead of signal.me (empty chat — dangerous with the send crawler).
 */
export function planDraft(
  target: ShareTarget,
  text: string,
  recipient?: string | null,
): DraftPlan {
  const body = text.trim();
  const phone = recipient ? digitsOnly(recipient) : '';

  if (target === 'whatsapp' && phone) {
    return {
      kind: 'url',
      url: `https://wa.me/${phone}?text=${encodeURIComponent(body)}`,
      prefilled: Boolean(body),
    };
  }

  // Signal chat deep link cannot carry a body. Prefer SEND whenever there is text.
  if (target === 'signal' && phone && !body) {
    return { kind: 'url', url: signalChatUrl(phone), prefilled: false };
  }

  return {
    kind: 'send',
    packageName: PACKAGES[target],
    text: body,
    prefilled: true,
  };
}
