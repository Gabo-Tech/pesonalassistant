import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from './ThemeProvider';
import { orbInk } from './theme';
import { Meta } from './Type';
import type { SessionState } from '../voice/session';

const LABEL: Record<SessionState, string> = {
  off: 'Tap to talk',
  idle: 'Listening for wake word',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  confirming: 'Waiting for confirmation',
};

export function Orb({
  state,
  active,
  onPress,
}: {
  state: SessionState;
  /** True while the user's voice is actually being captured. */
  active: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;
  const busy = state === 'listening' || state === 'thinking' || active;
  const { ring, fill } = orbInk(t, active && state === 'idle' ? 'listening' : state);

  useEffect(() => {
    if (!busy) {
      pulse.stopAnimation();
      Animated.timing(pulse, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [busy, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });

  return (
    <View style={styles.wrap}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Push to talk">
        <Animated.View
          style={[
            styles.orb,
            {
              borderColor: ring,
              backgroundColor: t.surface,
              transform: [{ scale }],
              opacity: busy ? ringOpacity : 1,
            },
          ]}
        >
          {fill ? <View style={[styles.core, { backgroundColor: fill }]} /> : null}
        </Animated.View>
      </Pressable>
      <Meta>{LABEL[state]}</Meta>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 16, paddingVertical: 8 },
  orb: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: { width: 72, height: 72, borderRadius: 36 },
});
