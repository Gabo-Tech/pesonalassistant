import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from './ThemeProvider';
import { Bento, BentoLabel } from './Bento';
import { Body, Meta } from './Type';
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

  return (
    <Bento span={2} style={{ gap: 12 }}>
      <BentoLabel>Confirm</BentoLabel>
      <Body>{pending.summary}</Body>
      <Body style={{ color: t.dim }}>{pending.detail}</Body>

      <View style={styles.row}>
        <Pressable
          style={[
            styles.button,
            {
              borderRadius: t.radiusChip,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: t.line,
              backgroundColor: 'transparent',
            },
          ]}
          onPress={onCancel}
        >
          <Meta style={{ color: t.dim }}>Cancel</Meta>
        </Pressable>
        <Pressable
          style={[
            styles.button,
            {
              borderRadius: t.radiusChip,
              backgroundColor: t.inverse,
            },
          ]}
          onPress={onConfirm}
        >
          <Meta style={{ color: t.inverseInk }}>{pending.confirmLabel}</Meta>
        </Pressable>
      </View>

      <Meta>
        {voiceHint && micReady
          ? 'Tap a button, or say send or cancel'
          : voiceHint
            ? 'Tap a button, or type send / cancel'
            : 'Voice confirmation is off. Use the buttons'}
      </Meta>
    </Bento>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  button: { flex: 1, paddingVertical: 14, alignItems: 'center' },
});
