import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from './ThemeProvider';
import { Body } from './Type';

export function TextAction({
  label,
  onPress,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={8}
      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}
    >
      <Body style={{ color: danger ? t.danger : t.ink, fontSize: 14, lineHeight: 18 }}>{label}</Body>
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  tone = 'primary',
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'secondary' | 'danger';
}) {
  const t = useTheme();
  const filled = tone === 'primary';
  const danger = tone === 'danger';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        minHeight: 48,
        paddingHorizontal: 16,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: t.radiusChip,
        backgroundColor: filled ? t.inverse : 'transparent',
        borderWidth: filled ? 0 : StyleSheet.hairlineWidth,
        borderColor: danger ? t.danger : t.line,
      }}
    >
      <Body style={{ color: filled ? t.inverseInk : danger ? t.danger : t.ink }}>{label}</Body>
    </Pressable>
  );
}
