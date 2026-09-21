import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { createNote, deleteNote, listNotes, searchNotes, type Note } from '../src/db/notes';
import { Bento, GUTTER, PAGE_MARGIN } from '../src/ui/Bento';
import { useTheme } from '../src/ui/ThemeProvider';
import { Body, Display, Meta } from '../src/ui/Type';

export default function NotesScreen() {
  const t = useTheme();
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');

  const refresh = useCallback(async () => {
    setNotes(query.trim() ? await searchNotes(query.trim()) : await listNotes());
  }, [query]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      void refresh();
    }, 200);
    return () => clearTimeout(handle);
  }, [query, refresh]);

  const add = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;

    const [title, ...rest] = text.split('\n');
    await createNote(title.slice(0, 80), rest.join('\n'));
    setDraft('');
    await refresh();
  }, [draft, refresh]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, padding: PAGE_MARGIN, gap: GUTTER }}>
      <Bento span={2} style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a note"
          placeholderTextColor={t.dim}
          style={[styles.input, { color: t.ink }]}
          multiline
        />
        <Pressable
          style={[styles.add, { backgroundColor: t.inverse, borderRadius: t.radiusChip }]}
          onPress={() => void add()}
        >
          <Meta style={{ color: t.inverseInk }}>Add</Meta>
        </Pressable>
      </Bento>

      <Bento span={2}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search notes"
          placeholderTextColor={t.dim}
          style={[styles.input, { color: t.ink, paddingVertical: 0 }]}
        />
      </Bento>

      <FlatList
        data={notes}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ gap: GUTTER, paddingBottom: 24 }}
        ListEmptyComponent={
          <Meta style={{ textAlign: 'center', marginTop: 32 }}>No notes yet</Meta>
        }
        renderItem={({ item }) => (
          <Bento span={2} style={styles.note}>
            <View style={{ flex: 1, gap: 6 }}>
              <Display style={{ fontSize: 22, lineHeight: 28 }}>{item.title}</Display>
              {item.body ? <Body style={{ color: t.dim }}>{item.body}</Body> : null}
              <Body style={{ color: t.dim, fontSize: 11, lineHeight: 16 }}>
                {new Date(item.updated_at).toLocaleString()}
              </Body>
            </View>
            <Pressable
              onPress={async () => {
                await deleteNote(item.id);
                await refresh();
              }}
              hitSlop={10}
            >
              <Meta>Delete</Meta>
            </Pressable>
          </Bento>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  composer: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  input: {
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 0,
    paddingVertical: 4,
    maxHeight: 120,
  },
  add: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
});
