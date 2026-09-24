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
import { Bento, Chip, GUTTER, PAGE_MARGIN } from '../src/ui/Bento';
import { KeyboardGutter } from '../src/ui/KeyboardGutter';
import { useTheme } from '../src/ui/ThemeProvider';
import { Body, Display, Meta } from '../src/ui/Type';

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
        <View style={styles.head}>
          <Display style={{ fontSize: 28 }}>{tr('people.title')}</Display>
          <Pressable onPress={() => setDraft({ name: '', phone: '', notes: '', preferred: 'whatsapp' })} hitSlop={8}>
            <Meta style={{ color: t.ink }}>{tr('people.add')}</Meta>
          </Pressable>
        </View>
        <Pressable onPress={() => void importPhone()}>
          <Meta style={{ color: t.ink }}>{tr('people.import')}</Meta>
        </Pressable>
        {notice ? <Body style={{ color: t.dim, width: '100%' }}>{notice}</Body> : null}
        {draft && draft.id == null ? (
          <Bento span={2} style={{ gap: 10 }}>
            <ContactEditor draft={draft} onChange={setDraft} onCancel={() => setDraft(null)} onSave={() => void save()} />
          </Bento>
        ) : null}
        {people.length === 0 && !draft ? (
          <Bento span={2}>
            <Meta>{tr('people.none')}</Meta>
          </Bento>
        ) : null}
        {people.map((person) => {
          const editing = draft?.id === person.id;
          return (
            <Bento key={person.id} span={2} style={editing ? { gap: 10 } : styles.row}>
              {editing && draft ? (
                <ContactEditor draft={draft} onChange={setDraft} onCancel={() => setDraft(null)} onSave={() => void save()} />
              ) : (
                <>
                  <Pressable
                    style={{ flex: 1, gap: 6 }}
                    onPress={() =>
                      setDraft({
                        id: person.id,
                        name: person.name,
                        phone: person.phone,
                        notes: person.notes,
                        preferred: person.preferred,
                      })
                    }
                  >
                    <Body>{person.name}</Body>
                    <Meta>
                      {tr(`people.${person.preferred}`)}
                      {person.phone ? ` · ${person.phone}` : ''}
                    </Meta>
                  </Pressable>
                  <Pressable
                    hitSlop={10}
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
                  >
                    <Meta>{tr('common.delete')}</Meta>
                  </Pressable>
                </>
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
  const t = useTheme();
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
      <View style={styles.row}>
        <Pressable onPress={onCancel} style={{ flex: 1, paddingVertical: 10 }}>
          <Meta>{tr('common.cancel')}</Meta>
        </Pressable>
        <Pressable
          onPress={onSave}
          style={{ flex: 1, backgroundColor: t.inverse, borderRadius: t.radiusChip, paddingVertical: 12, alignItems: 'center' }}
        >
          <Meta style={{ color: t.inverseInk }}>{tr('common.save')}</Meta>
        </Pressable>
      </View>
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
