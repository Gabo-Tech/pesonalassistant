import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from './ThemeProvider';
import { Meta } from './Type';

export const PAGE_MARGIN = 20;
export const GUTTER = 12;

export function Bento({
  span = 1,
  children,
  style,
}: {
  span?: 1 | 2;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const inner = Math.max(0, width - PAGE_MARGIN * 2);
  const tile = span === 2 ? inner : (inner - GUTTER) / 2;

  return (
    <View
      style={[
        {
          width: tile,
          backgroundColor: t.surface,
          borderRadius: t.radius,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.line,
          padding: 18,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function BentoLabel({ children }: { children: ReactNode }) {
  return <Meta style={{ marginBottom: 8 }}>{children}</Meta>;
}

export function Chip({
  label,
  active,
  onPress,
  onLongPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: t.radiusChip,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? t.ink : t.line,
        backgroundColor: active ? t.ink : 'transparent',
      }}
    >
      <Meta style={{ color: active ? t.inverseInk : t.dim, letterSpacing: 1 }}>{label}</Meta>
    </Pressable>
  );
}

export function InkSwitch({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const t = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ true: t.ink, false: t.line }}
      thumbColor={value ? t.inverseInk : t.dim}
    />
  );
}
