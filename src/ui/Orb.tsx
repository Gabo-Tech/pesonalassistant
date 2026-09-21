import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { orbColor, theme } from './theme';
import type { SessionState } from '../voice/session';

const LABEL: Record<SessionState, string> = {
  off: 'Tap to talk',
  idle: 'Listening for wake word',
  listening: 'Listening...',
  thinking: 'Thinking...',
  speaking: 'Speaking',
  confirming: 'Waiting for your confirmation',
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
  const pulse = useRef(new Animated.Value(0)).current;
  const busy = state === 'listening' || state === 'thinking' || active;

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
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [busy, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const color = orbColor[state];

  return (
    <View style={styles.wrap}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Push to talk">
        <Animated.View
          style={[
            styles.orb,
            { borderColor: color, transform: [{ scale }], shadowColor: color },
          ]}
        >
          <View style={[styles.core, { backgroundColor: color }]} />
        </Animated.View>
      </Pressable>
      <Text style={styles.label}>{LABEL[state]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 14 },
  orb: {
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 8,
  },
  core: { width: 54, height: 54, borderRadius: 27, opacity: 0.9 },
  label: { color: theme.textDim, fontSize: 14 },
});
