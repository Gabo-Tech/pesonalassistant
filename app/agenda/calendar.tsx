import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AgendaScroll, agendaStyles } from '../../src/agenda/forms';
import {
  bucketByDay,
  dayKeyFromParts,
  gridRange,
  loadCalendarItems,
  monthCells,
  presetForDay,
  weekStartsOn,
  type CalendarItem,
  type CalendarKind,
} from '../../src/calendar/items';
import { useT } from '../../src/i18n';
import type { MessageKey } from '../../src/i18n/locale';
import { localeTag } from '../../src/i18n/wake';
import { formatWhen } from '../../src/llm/time';
import { useSettings } from '../../src/settings/store';
import { Bento, Chip, PAGE_MARGIN } from '../../src/ui/Bento';
import { Button } from '../../src/ui/Button';
import { useTheme } from '../../src/ui/ThemeProvider';
import { Body, Display, Meta } from '../../src/ui/Type';

type DayPick = { year: number; month: number; day: number };

const KIND_KEY: Record<CalendarKind, MessageKey> = {
  event: 'agenda.kindEvent',
  task: 'agenda.kindTask',
  reminder: 'agenda.kindReminder',
};

function todayPick(now = new Date()): DayPick {
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

function weekdayLabels(locale: string, startsOn: 0 | 1): string[] {
  const sunday = new Date(2024, 0, 7);
  while (sunday.getDay() !== 0) sunday.setDate(sunday.getDate() + 1);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + startsOn + index);
    return date.toLocaleDateString(locale, { weekday: 'narrow' });
  });
}

export default function CalendarScreen() {
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [settings] = useSettings();
  const loc = localeTag(settings.locale);
  const startsOn = weekStartsOn(settings.locale);
  const [cursor, setCursor] = useState(() => {
    const now = todayPick();
    return { year: now.year, month: now.month };
  });
  const [selected, setSelected] = useState<DayPick>(() => todayPick());
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [denied, setDenied] = useState(false);

  const cells = useMemo(
    () => monthCells(cursor.year, cursor.month, startsOn),
    [cursor.month, cursor.year, startsOn],
  );
  const range = useMemo(() => gridRange(cells), [cells]);
  const labels = useMemo(() => weekdayLabels(loc, startsOn), [loc, startsOn]);
  const buckets = useMemo(() => bucketByDay(items), [items]);
  const today = todayPick();
  const todayKey = dayKeyFromParts(today.year, today.month, today.day);
  const selectedKey = dayKeyFromParts(selected.year, selected.month, selected.day);
  const selectedItems = buckets.get(selectedKey) ?? [];
  const cellWidth = Math.floor((width - PAGE_MARGIN * 2) / 7);
  const gridWidth = cellWidth * 7;

  const refresh = useCallback(async () => {
    try {
      const result = await loadCalendarItems(range.from, range.to, settings.calendarMode);
      setItems(result.items);
      setDenied(result.denied);
    } catch {
      setItems([]);
    }
  }, [range.from, range.to, settings.calendarMode]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const shift = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    const year = next.getFullYear();
    const month = next.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    setCursor({ year, month });
    setSelected({ year, month, day: Math.min(selected.day, days) });
  };

  const openItem = (item: CalendarItem) => {
    const pathname =
      item.kind === 'task' ? '/agenda/tasks' : item.kind === 'reminder' ? '/agenda/reminders' : '/agenda';
    router.replace({ pathname, params: { edit: item.id } });
  };

  const addOnDay = (kind: CalendarKind) => {
    const pathname = kind === 'task' ? '/agenda/tasks' : kind === 'reminder' ? '/agenda/reminders' : '/agenda';
    const at = String(presetForDay(selected.year, selected.month, selected.day));
    router.replace({ pathname, params: { at } });
  };

  const monthTitle = new Date(cursor.year, cursor.month, 1).toLocaleDateString(loc, {
    month: 'long',
    year: 'numeric',
  });
  const dayTitle = new Date(selected.year, selected.month, selected.day).toLocaleDateString(loc, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <AgendaScroll>
      <View style={{ width: '100%', gap: 12 }}>
        <View style={[agendaStyles.row, { justifyContent: 'space-between' }]}>
          <Pressable onPress={() => shift(-1)} hitSlop={12} accessibilityRole="button">
            <Ionicons name="chevron-back" size={22} color={t.ink} />
          </Pressable>
          <Display style={{ fontSize: 26, lineHeight: 32, flex: 1, textAlign: 'center' }}>{monthTitle}</Display>
          <Pressable onPress={() => shift(1)} hitSlop={12} accessibilityRole="button">
            <Ionicons name="chevron-forward" size={22} color={t.ink} />
          </Pressable>
        </View>
        <View style={{ alignItems: 'flex-start' }}>
          <Chip
            label={tr('agenda.today')}
            active={selectedKey === todayKey}
            onPress={() => {
              const now = todayPick();
              setCursor({ year: now.year, month: now.month });
              setSelected(now);
            }}
          />
        </View>
      </View>

      <View style={{ width: '100%', alignItems: 'center', gap: 4 }}>
        <View style={{ width: gridWidth, flexDirection: 'row' }}>
          {labels.map((label, index) => (
            <View key={`${label}-${index}`} style={{ width: cellWidth, alignItems: 'center' }}>
              <Meta>{label}</Meta>
            </View>
          ))}
        </View>
        <View style={{ width: gridWidth, flexDirection: 'row', flexWrap: 'wrap' }}>
          {cells.map((cell) => {
            const key = dayKeyFromParts(cell.year, cell.month, cell.day);
            const chosen = key === selectedKey;
            const isToday = key === todayKey;
            const hasItems = (buckets.get(key)?.length ?? 0) > 0;
            return (
              <Pressable
                key={key}
                onPress={() => {
                  setSelected({ year: cell.year, month: cell.month, day: cell.day });
                  if (!cell.inMonth) setCursor({ year: cell.year, month: cell.month });
                }}
                style={{ width: cellWidth, alignItems: 'center', paddingVertical: 4 }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: chosen ? t.ink : 'transparent',
                    borderWidth: isToday && !chosen ? StyleSheet.hairlineWidth : 0,
                    borderColor: t.ink,
                  }}
                >
                  <Body
                    style={{
                      color: chosen ? t.inverseInk : cell.inMonth ? t.ink : t.dim,
                      fontSize: 14,
                      lineHeight: 18,
                    }}
                  >
                    {cell.day}
                  </Body>
                </View>
                <View
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    marginTop: 3,
                    backgroundColor: hasItems ? t.ink : 'transparent',
                  }}
                />
              </Pressable>
            );
          })}
        </View>
      </View>

      {denied ? (
        <Bento span={2}>
          <Body>{tr('agenda.calendarDenied')}</Body>
        </Bento>
      ) : null}

      <Display style={{ fontSize: 22, lineHeight: 28, width: '100%' }}>{dayTitle}</Display>
      <View style={{ width: '100%', gap: 8 }}>
        <Button tone="secondary" label={tr('agenda.addEvent')} onPress={() => addOnDay('event')} />
        <Button tone="secondary" label={tr('agenda.addTask')} onPress={() => addOnDay('task')} />
        <Button tone="secondary" label={tr('agenda.addReminder')} onPress={() => addOnDay('reminder')} />
      </View>
      {selectedItems.length === 0 ? (
        <Bento span={2}>
          <Body style={{ color: t.dim }}>{tr('agenda.noneDay')}</Body>
        </Bento>
      ) : (
        selectedItems.map((item) => (
          <Pressable key={`${item.kind}-${item.id}-${item.start}`} onPress={() => openItem(item)} style={{ width: '100%' }}>
            <Bento span={2} style={{ gap: 4 }}>
              <Body>{item.title}</Body>
              <Meta>
                {tr(KIND_KEY[item.kind])}
                {' · '}
                {item.allDay ? tr('agenda.allDay') : formatWhen(item.start, loc)}
                {item.location ? ` — ${item.location}` : ''}
              </Meta>
            </Bento>
          </Pressable>
        ))
      )}
    </AgendaScroll>
  );
}
