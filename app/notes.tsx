import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { createNote, deleteNote, listNotes, searchNotes, type Note } from '../src/db/notes';
import { theme } from '../src/ui/theme';

export default function NotesScreen() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');

  const refresh = useCallback(async () => {
    setNotes(query.trim() ? await searchNotes(query.trim()) : await listNotes());
  }, [query]);

  // Re-read on every focus so notes created by voice show up immediately.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const add = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;

    const [title, ...rest] = text.split('\n');
    await createNote(title.slice(0, 80), rest.join('\n'));
    setDraft('');
    await refresh();
  }, [draft, refresh]);

  return (
    <View style={styles.screen}>
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a note"
          placeholderTextColor={theme.textDim}
          style={styles.input}
          multiline
        />
        <Pressable style={styles.addButton} onPress={() => void add()}>
          <Text style={styles.addText}>Add</Text>
        </Pressable>
      </View>

      <TextInput
        value={query}
        onChangeText={(text) => {
          setQuery(text);
        }}
        onSubmitEditing={() => void refresh()}
        placeholder="Search notes"
        placeholderTextColor={theme.textDim}
        style={[styles.input, styles.search]}
      />

      <FlatList
        data={notes}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No notes yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.note}>
            <View style={styles.noteBody}>
              <Text style={styles.noteTitle}>{item.title}</Text>
              {item.body ? <Text style={styles.noteText}>{item.body}</Text> : null}
              <Text style={styles.noteDate}>
                {new Date(item.updated_at).toLocaleString()}
              </Text>
            </View>
            <Pressable
              onPress={async () => {
                await deleteNote(item.id);
                await refresh();
              }}
              hitSlop={10}
            >
              <Text style={styles.delete}>Delete</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, padding: 16, gap: 12 },
  composer: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  input: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    color: theme.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    maxHeight: 120,
  },
  search: { flex: 0 },
  addButton: {
    backgroundColor: theme.accent,
    borderRadius: theme.radius,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  addText: { color: '#fff', fontWeight: '700' },
  list: { gap: 10, paddingBottom: 24 },
  note: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: 14,
  },
  noteBody: { flex: 1, gap: 4 },
  noteTitle: { color: theme.text, fontSize: 16, fontWeight: '600' },
  noteText: { color: theme.textDim, fontSize: 14, lineHeight: 20 },
  noteDate: { color: theme.textDim, fontSize: 11, opacity: 0.7 },
  delete: { color: theme.bad, fontSize: 13 },
  empty: { color: theme.textDim, textAlign: 'center', marginTop: 32 },
});
