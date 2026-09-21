import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from './theme';
import type { Pending } from '../share/confirmGate';

/**
 * The approval card. It shows the exact payload, because "confirm" is meaningless
 * unless the user can see precisely what they are approving.
 */
export function ConfirmCard({
  pending,
  voiceHint,
  onConfirm,
  onCancel,
}: {
  pending: Pending;
  /** Whether spoken confirmation is currently accepted. */
  voiceHint: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>{pending.summary}</Text>
      <Text style={styles.detail}>{pending.detail}</Text>

      <View style={styles.row}>
        <Pressable style={[styles.button, styles.cancel]} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.confirm]} onPress={onConfirm}>
          <Text style={styles.confirmText}>{pending.confirmLabel}</Text>
        </Pressable>
      </View>

      <Text style={styles.hint}>
        {voiceHint
          ? 'Tap a button, or say "send" or "cancel".'
          : 'Voice confirmation is off. Use the buttons.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: theme.surfaceAlt,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.warn,
    padding: 16,
    gap: 10,
  },
  kicker: { color: theme.warn, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  detail: { color: theme.text, fontSize: 16, lineHeight: 22 },
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  button: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  cancel: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.border },
  confirm: { backgroundColor: theme.accent },
  cancelText: { color: theme.textDim, fontWeight: '600' },
  confirmText: { color: '#fff', fontWeight: '700' },
  hint: { color: theme.textDim, fontSize: 12 },
});
