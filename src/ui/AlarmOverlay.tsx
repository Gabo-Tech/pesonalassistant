import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatClockTime } from '../llm/time';
import { handleAlarmDismiss, handleAlarmSnooze, type RingingAlarm } from '../notify/alarmRing';
import { useTheme } from './ThemeProvider';
import { Body, Display, Meta } from './Type';

export function AlarmOverlay({ alarm }: { alarm: RingingAlarm }) {
  const t = useTheme();
  const clock = formatClockTime(alarm.hour, alarm.minute);

  return (
    <SafeAreaView style={[styles.wrap, { backgroundColor: t.bg }]}>
      <Meta>Alarm</Meta>
      <Display style={{ fontSize: 56, lineHeight: 64, marginTop: 12 }}>{clock}</Display>
      {alarm.label ? (
        <Body style={{ color: t.dim, marginTop: 8 }}>{alarm.label}</Body>
      ) : alarm.repeat === 'daily' ? (
        <Body style={{ color: t.dim, marginTop: 8 }}>Every day</Body>
      ) : null}

      <View style={styles.row}>
        <Pressable
          onPress={() => void handleAlarmDismiss()}
          accessibilityRole="button"
          accessibilityLabel="Dismiss alarm"
          style={[
            styles.button,
            {
              borderRadius: t.radiusChip,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: t.line,
            },
          ]}
        >
          <Meta>Dismiss</Meta>
        </Pressable>
        <Pressable
          onPress={() => void handleAlarmSnooze()}
          accessibilityRole="button"
          accessibilityLabel="Snooze 10 minutes"
          style={[
            styles.button,
            { borderRadius: t.radiusChip, backgroundColor: t.inverse },
          ]}
        >
          <Meta style={{ color: t.inverseInk }}>Snooze 10 min</Meta>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', gap: 12, marginTop: 36 },
  button: { flex: 1, paddingVertical: 16, alignItems: 'center' },
});
