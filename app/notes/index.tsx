import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { deleteNote, listNotes, searchNotes, type Note } from '../../src/db/notes';
import { useT } from '../../src/i18n';
import { noteSnippet } from '../../src/notes/title';
import { Bento, GUTTER, PAGE_MARGIN } from '../../src/ui/Bento';
import { KeyboardGutter } from '../../src/ui/KeyboardGutter';
import { useTheme } from '../../src/ui/ThemeProvider';
import { Body, Display, Meta } from '../../src/ui/Type';

export default function NotesScreen() {
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState('');

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

  return (
    <KeyboardGutter style={{ backgroundColor: t.bg }}>
    <View style={{ flex: 1, backgroundColor: t.bg, padding: PAGE_MARGIN, gap: GUTTER }}>
      <Bento span={2} style={styles.toolbar}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={tr('notes.search')}
          placeholderTextColor={t.dim}
          style={[styles.input, { color: t.ink }]}
        />
        <Pressable
          style={[styles.add, { backgroundColor: t.inverse, borderRadius: t.radiusChip }]}
          onPress={() => router.push('/notes/new')}
        >
          <Meta style={{ color: t.inverseInk }}>{tr('notes.new')}</Meta>
        </Pressable>
      </Bento>

      <FlatList
        data={notes}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ gap: GUTTER, paddingBottom: 24 }}
        ListEmptyComponent={
          <Meta style={{ textAlign: 'center', marginTop: 32 }}>{tr('notes.empty')}</Meta>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/notes/${item.id}`)}>
            <Bento span={2} style={styles.note}>
              <View style={{ flex: 1, gap: 6 }}>
                <Display style={{ fontSize: 22, lineHeight: 28 }}>
                  {item.title.trim() || item.body.split('\n')[0]?.slice(0, 80) || tr('notes.untitled')}
                </Display>
                {noteSnippet(item.body) ? (
                  <Body style={{ color: t.dim }} numberOfLines={3}>
                    {noteSnippet(item.body)}
                  </Body>
                ) : null}
                <Body style={{ color: t.dim, fontSize: 11, lineHeight: 16 }}>
                  {new Date(item.updated_at).toLocaleString()}
                </Body>
              </View>
              <Pressable
                onPress={() => {
                  Alert.alert(tr('common.delete'), tr('notes.deleteConfirm'), [
                    { text: tr('common.cancel'), style: 'cancel' },
                    {
                      text: tr('common.delete'),
                      style: 'destructive',
                      onPress: () => {
                        void deleteNote(item.id).then(refresh);
                      },
                    },
                  ]);
                }}
                hitSlop={10}
              >
                <Meta>{tr('common.delete')}</Meta>
              </Pressable>
            </Bento>
          </Pressable>
        )}
      />
    </View>
    </KeyboardGutter>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: { flex: 1, fontSize: 15, paddingHorizontal: 0, paddingVertical: 4 },
  add: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
});
