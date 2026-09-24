import { Contact, ContactField } from 'expo-contacts';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import {
  createContact,
  deleteContact,
  importContact,
  listContacts,
  updateContact,
  type Contact as Person,
  type PreferredChannel,
} from '../src/db/contacts';
import { useT } from '../src/i18n';
import { Bento, Chip, GUTTER, PAGE_MARGIN, Row } from '../src/ui/Bento';
import { Button, TextAction } from '../src/ui/Button';
import { KeyboardGutter } from '../src/ui/KeyboardGutter';
import { useTheme } from '../src/ui/ThemeProvider';
import { Body, Meta } from '../src/ui/Type';

type Draft = { id?: number; name: string; phone: string; notes: string; preferred: PreferredChannel };

const CHANNELS: PreferredChannel[] = ['whatsapp', 'signal', 'call'];

export default function PeopleScreen() {
  const t = useTheme();
  const tr = useT();
  const [people, setPeople] = useState<Person[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setPeople(await listContacts());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const save = async () => {
    if (!draft?.name.trim()) return;
    const input = {
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      notes: draft.notes,
      preferred: draft.preferred,
    };
    if (draft.id) await updateContact(draft.id, input);
    else await createContact(input);
    setDraft(null);
    await refresh();
  };

  const importPhone = async () => {
    Alert.alert(tr('people.import'), tr('people.importConfirm'), [
      { text: tr('common.cancel'), style: 'cancel' },
      { text: tr('people.import'), onPress: () => void runImport() },
    ]);
  };

  const runImport = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CONTACTS);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setNotice(tr('people.denied'));
        return;
      }
    }
    const rows = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES]);
    let added = 0;
    for (const row of rows) {
      const name = row.fullName?.trim();
      if (!name) continue;
      const phone = row.phones?.[0]?.number ?? '';
      if (await importContact({ name, phone })) added += 1;
    }
    setNotice(tr('people.imported', { count: added }));
    await refresh();
  };

  return (
    <KeyboardGutter style={{ backgroundColor: t.bg }}>
      <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={styles.content}>
        <View style={{ width: '100%', gap: 8 }}>
          <Button
            label={tr('people.add')}
            onPress={() => setDraft({ name: '', phone: '', notes: '', preferred: 'whatsapp' })}
          />
          <Button label={tr('people.import')} onPress={() => void importPhone()} tone="secondary" />
          <Body style={{ color: t.dim }}>{tr('people.importHint')}</Body>
        </View>
        {notice ? <Body style={{ color: t.dim, width: '100%' }}>{notice}</Body> : null}
        {draft && draft.id == null ? (
          <Bento span={2} style={{ gap: 10 }}>
            <ContactEditor draft={draft} onChange={setDraft} onCancel={() => setDraft(null)} onSave={() => void save()} />
          </Bento>
        ) : null}
        {people.length === 0 && !draft ? (
          <Bento span={2}>
            <Body style={{ color: t.dim }}>{tr('people.none')}</Body>
          </Bento>
        ) : null}
        {people.map((person) => {
          const editing = draft?.id === person.id;
          return (
            <Bento key={person.id} span={2} style={{ gap: 10 }}>
              {editing && draft ? (
                <ContactEditor draft={draft} onChange={setDraft} onCancel={() => setDraft(null)} onSave={() => void save()} />
              ) : (
                <Row
                  title={person.name}
                  subtitle={`${tr(`people.${person.preferred}`)}${person.phone ? ` · ${person.phone}` : ''}`}
                  onPress={() =>
                    setDraft({
                      id: person.id,
                      name: person.name,
                      phone: person.phone,
                      notes: person.notes,
                      preferred: person.preferred,
                    })
                  }
                  trailing={
                    <TextAction
                      label={tr('common.delete')}
                      danger
                      onPress={() => {
                        Alert.alert(tr('common.delete'), tr('people.delete'), [
                          { text: tr('common.cancel'), style: 'cancel' },
                          {
                            text: tr('common.delete'),
                            style: 'destructive',
                            onPress: () => void deleteContact(person.id).then(refresh),
                          },
                        ]);
                      }}
                    />
                  }
                />
              )}
            </Bento>
          );
        })}
      </ScrollView>
    </KeyboardGutter>
  );
}

function ContactEditor({
  draft,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const tr = useT();
  return (
    <>
      <Meta>{draft.id ? tr('people.edit') : tr('people.add')}</Meta>
      <Field label={tr('people.name')} value={draft.name} onChange={(name) => onChange({ ...draft, name })} />
      <Field label={tr('people.phone')} value={draft.phone} onChange={(phone) => onChange({ ...draft, phone })} />
      <Field label={tr('people.notes')} value={draft.notes} onChange={(notes) => onChange({ ...draft, notes })} />
      <View style={styles.chips}>
        {CHANNELS.map((channel) => (
          <Chip
            key={channel}
            label={tr(`people.${channel}`)}
            active={draft.preferred === channel}
            onPress={() => onChange({ ...draft, preferred: channel })}
          />
        ))}
      </View>
      <Button label={tr('common.save')} onPress={onSave} />
      <Button label={tr('common.cancel')} onPress={onCancel} tone="secondary" />
    </>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Meta>{label}</Meta>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholderTextColor={t.dim}
        style={[styles.input, { color: t.ink, borderColor: t.line, borderRadius: t.radiusChip }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: PAGE_MARGIN, gap: GUTTER, paddingBottom: 40, flexDirection: 'row', flexWrap: 'wrap' },
  head: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
});
