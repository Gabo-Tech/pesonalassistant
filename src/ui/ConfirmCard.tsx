import { useT } from '../i18n';
import { useTheme } from './ThemeProvider';
import { Bento, BentoLabel } from './Bento';
import { Button } from './Button';
import { Body } from './Type';
import type { Pending } from '../share/confirmGate';

/**
 * The approval card. It shows the exact payload, because "confirm" is meaningless
 * unless the user can see precisely what they are approving.
 */
export function ConfirmCard({
  pending,
  voiceHint,
  micReady,
  onConfirm,
  onCancel,
}: {
  pending: Pending;
  /** Whether spoken confirmation is currently accepted. */
  voiceHint: boolean;
  /** Mic stream is actually running, so "say send" is true. */
  micReady: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTheme();
  const tr = useT();

  return (
    <Bento span={2} style={{ gap: 12 }}>
      <BentoLabel>{tr('confirm.title')}</BentoLabel>
      <Body>{pending.summary}</Body>
      <Body style={{ color: t.dim }}>{pending.detail}</Body>

      <Button label={pending.confirmLabel} onPress={onConfirm} />
      <Button label={tr('common.cancel')} onPress={onCancel} tone="secondary" />

      <Body style={{ color: t.dim, fontSize: 13, lineHeight: 18 }}>
        {voiceHint && micReady
          ? tr('voice.confirmTapOrSay')
          : voiceHint
            ? tr('voice.confirmTapOrType')
            : tr('voice.confirmOff')}
      </Body>
    </Bento>
  );
}
