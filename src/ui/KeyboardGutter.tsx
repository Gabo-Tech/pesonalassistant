import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Platform, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Pads the bottom of a screen by the IME height on Android.
 * iOS keeps KeyboardAvoidingView `padding`; adding both would double-shift.
 */
export function KeyboardGutter({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [bottom, setBottom] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const shown = Keyboard.addListener('keyboardDidShow', (event) => {
      setBottom(Math.max(0, event.endCoordinates.height));
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => setBottom(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return (
    <View style={[{ flex: 1 }, style, Platform.OS === 'android' ? { paddingBottom: bottom } : null]}>
      {children}
    </View>
  );
}
