import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useT } from '../i18n';
import { GUTTER, PAGE_MARGIN } from '../ui/Bento';
import { KeyboardGutter } from '../ui/KeyboardGutter';
import { useTheme } from '../ui/ThemeProvider';
import { Display, Meta } from '../ui/Type';

export function AgendaScroll({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <KeyboardGutter style={{ backgroundColor: t.bg }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: t.bg }}
        contentContainerStyle={agendaStyles.content}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardGutter>
  );
}

export function SectionHead({
  title,
  action,
  onPress,
}: {
  title: string;
  action: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <View style={agendaStyles.sectionHead}>
      <Display style={{ fontSize: 28 }}>{title}</Display>
      <Pressable onPress={onPress} hitSlop={8}>
        <Meta style={{ color: t.ink }}>{action}</Meta>
      </Pressable>
    </View>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Meta>{label}</Meta>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.dim}
        style={[agendaStyles.input, { color: t.ink, borderColor: t.line, borderRadius: t.radiusChip }]}
      />
    </View>
  );
}

export function FormActions({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const t = useTheme();
  const tr = useT();
  return (
    <View style={agendaStyles.row}>
      <Pressable onPress={onCancel} style={{ flex: 1, paddingVertical: 10 }}>
        <Meta>{tr('common.cancel')}</Meta>
      </Pressable>
      <Pressable
        onPress={onSave}
        style={{
          flex: 1,
          backgroundColor: t.inverse,
          borderRadius: t.radiusChip,
          paddingVertical: 12,
          alignItems: 'center',
        }}
      >
        <Meta style={{ color: t.inverseInk }}>{tr('common.save')}</Meta>
      </Pressable>
    </View>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Meta style={{ width: '100%' }}>{message}</Meta>;
}

export const agendaStyles = StyleSheet.create({
  content: {
    padding: PAGE_MARGIN,
    gap: GUTTER,
    paddingBottom: 40,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' },
  sectionHead: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
});
