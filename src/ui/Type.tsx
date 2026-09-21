import { Platform, Text, type TextProps } from 'react-native';
import { useTheme } from './ThemeProvider';

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });
const sans = Platform.select({ ios: undefined, android: 'sans-serif', default: undefined });

export function Display({ style, ...rest }: TextProps) {
  const t = useTheme();
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: serif,
          fontSize: 30,
          lineHeight: 36,
          color: t.ink,
          letterSpacing: -0.4,
          fontWeight: '400',
        },
        style,
      ]}
    />
  );
}

export function Body({ style, ...rest }: TextProps) {
  const t = useTheme();
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: sans,
          fontSize: 15,
          lineHeight: 22,
          color: t.ink,
        },
        style,
      ]}
    />
  );
}

export function Meta({ style, ...rest }: TextProps) {
  const t = useTheme();
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: sans,
          fontSize: 11,
          lineHeight: 14,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: t.dim,
        },
        style,
      ]}
    />
  );
}

export const serifFamily = serif;
