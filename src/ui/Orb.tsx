import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useT } from '../i18n';
import { useTheme } from './ThemeProvider';
import { orbInk } from './theme';
import { Meta } from './Type';
import type { SessionState } from '../voice/session';

export function Orb({
  state,
  active,
  onPress,
  compact = false,
  showLabel = true,
}: {
  state: SessionState;
  /** True while the user's voice is actually being captured. */
  active: boolean;
  onPress: () => void;
  compact?: boolean;
  showLabel?: boolean;
}) {
  const t = useTheme();
  const tr = useT();
  const pulse = useRef(new Animated.Value(0)).current;
  const busy = state === 'listening' || state === 'thinking' || active;
  const { ring, fill } = orbInk(t, active && state === 'idle' ? 'listening' : state);
  const size = compact ? 56 : 132;
  const core = compact ? 28 : 72;

  const labels: Record<SessionState, string> = {
    off: tr('stt.off'),
    idle: tr('stt.waiting', { wake: '' }).replace(' “”', '').replace(' ""', ''),
    listening: tr('stt.listening'),
    thinking: tr('stt.thinking'),
    speaking: tr('stt.speaking'),
    confirming: tr('stt.confirming'),
  };

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
    <View style={[styles.wrap, compact && { gap: 0, paddingVertical: 0 }]}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={tr('stt.off')}>
        <Animated.View
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: 1,
              alignItems: 'center',
              justifyContent: 'center',
              borderColor: ring,
              backgroundColor: t.surface,
              transform: [{ scale }],
              opacity: busy ? ringOpacity : 1,
            },
          ]}
        >
          {fill ? (
            <View
              style={{
                width: core,
                height: core,
                borderRadius: core / 2,
                backgroundColor: fill,
              }}
            />
          ) : null}
        </Animated.View>
      </Pressable>
      {showLabel ? <Meta>{labels[state]}</Meta> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 16, paddingVertical: 8 },
});
