import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useT } from '../i18n';
import { formatClockTime } from '../llm/time';
import { handleAlarmDismiss, handleAlarmSnooze, type RingingAlarm } from '../notify/alarmRing';
import { useTheme } from './ThemeProvider';
import { Body, Display, Meta } from './Type';

export function AlarmOverlay({ alarm }: { alarm: RingingAlarm }) {
  const t = useTheme();
  const tr = useT();
  const clock = formatClockTime(alarm.hour, alarm.minute);

  return (
    <SafeAreaView style={[styles.wrap, { backgroundColor: t.bg }]}>
      <Meta>{tr('alarm.title')}</Meta>
      <Display style={{ fontSize: 56, lineHeight: 64, marginTop: 12 }}>{clock}</Display>
      {alarm.label ? (
        <Body style={{ color: t.dim, marginTop: 8 }}>{alarm.label}</Body>
      ) : alarm.repeat === 'daily' ? (
        <Body style={{ color: t.dim, marginTop: 8 }}>{tr('alarm.everyDay')}</Body>
      ) : null}

      <View style={styles.row}>
        <Pressable
          onPress={() => void handleAlarmDismiss()}
          accessibilityRole="button"
          accessibilityLabel={tr('alarm.dismiss')}
          style={[
            styles.button,
            {
              borderRadius: t.radiusChip,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: t.line,
            },
          ]}
        >
          <Meta>{tr('alarm.dismiss')}</Meta>
        </Pressable>
        <Pressable
          onPress={() => void handleAlarmSnooze()}
          accessibilityRole="button"
          accessibilityLabel={tr('alarm.snooze')}
          style={[
            styles.button,
            { borderRadius: t.radiusChip, backgroundColor: t.inverse },
          ]}
        >
          <Meta style={{ color: t.inverseInk }}>{tr('alarm.snooze')}</Meta>
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
