import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useT } from '../i18n';
import { formatClockTime } from '../llm/time';
import { handleAlarmDismiss, handleAlarmSnooze, type RingingAlarm } from '../notify/alarmRing';
import { useTheme } from './ThemeProvider';
import { Button } from './Button';
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
        <View style={{ flex: 1 }}>
          <Button label={tr('alarm.snooze')} onPress={() => void handleAlarmSnooze()} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={tr('alarm.dismiss')} onPress={() => void handleAlarmDismiss()} tone="secondary" />
        </View>
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
});
