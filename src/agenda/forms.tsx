import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Button } from '../ui/Button';
import { useT } from '../i18n';
import { GUTTER, PAGE_MARGIN } from '../ui/Bento';
import { KeyboardGutter } from '../ui/KeyboardGutter';
import { useTheme } from '../ui/ThemeProvider';
import { Body, Display, Meta } from '../ui/Type';

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
  return (
    <View style={{ width: '100%', gap: 10, marginTop: 8 }}>
      <Display style={{ fontSize: 28 }}>{title}</Display>
      <Button label={action} onPress={onPress} tone="secondary" />
    </View>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
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
      {hint && value.trim() ? <Body style={{ color: t.dim, fontSize: 13, lineHeight: 18 }}>{hint}</Body> : null}
    </View>
  );
}

export function FormActions({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const tr = useT();
  return (
    <View style={{ gap: 8 }}>
      <Button label={tr('common.save')} onPress={onSave} />
      <Button label={tr('common.cancel')} onPress={onCancel} tone="secondary" />
    </View>
  );
}

export function FormError({ message }: { message: string | null }) {
  const t = useTheme();
  if (!message) return null;
  return <Body style={{ width: '100%', color: t.danger }}>{message}</Body>;
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
