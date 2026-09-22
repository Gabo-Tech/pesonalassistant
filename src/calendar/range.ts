import type { MessageKey } from '../i18n/locale';

export type EventHorizonId = '7d' | '1m' | '6m' | '1y';

export const EVENT_HORIZONS: ReadonlyArray<{
  id: EventHorizonId;
  days: number;
  labelKey: MessageKey;
}> = [
  { id: '7d', days: 7, labelKey: 'agenda.horizon7d' },
  { id: '1m', days: 30, labelKey: 'agenda.horizon1m' },
  { id: '6m', days: 182, labelKey: 'agenda.horizon6m' },
  { id: '1y', days: 365, labelKey: 'agenda.horizon1y' },
];

const DAY_MS = 86_400_000;

export function horizonRange(
  id: EventHorizonId,
  now = Date.now(),
): { from: number; to: number; days: number } {
  const spec = EVENT_HORIZONS.find((item) => item.id === id) ?? EVENT_HORIZONS[0];
  return { from: now, to: now + spec.days * DAY_MS, days: spec.days };
}
