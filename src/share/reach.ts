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
