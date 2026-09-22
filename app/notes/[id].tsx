import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { createNote, deleteNote, getNote, updateNote } from '../../src/db/notes';
import { useT } from '../../src/i18n';
import { MarkdownView } from '../../src/notes/MarkdownView';
import { inferNoteTitle } from '../../src/notes/title';
import { GUTTER, PAGE_MARGIN } from '../../src/ui/Bento';
import { KeyboardGutter } from '../../src/ui/KeyboardGutter';
import { useTheme } from '../../src/ui/ThemeProvider';
import { Meta } from '../../src/ui/Type';

export default function NoteEditorScreen() {
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const noteId = isNew ? null : Number(id);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState(false);
  const [loaded, setLoaded] = useState(isNew);

  useEffect(() => {
    if (noteId == null || Number.isNaN(noteId)) return;
    void getNote(noteId).then((note) => {
      if (!note) {
        router.back();
        return;
      }
      setTitle(note.title);
      setBody(note.body);
      setLoaded(true);
    });
  }, [noteId, router]);

  const save = useCallback(async () => {
    const nextTitle = inferNoteTitle(body, title);
    if (isNew) {
      await createNote(nextTitle, body);
    } else if (noteId != null) {
      await updateNote(noteId, { title: nextTitle, body });
    }
    router.back();
  }, [body, isNew, noteId, router, title]);

  const remove = useCallback(() => {
    if (noteId == null) {
      router.back();
      return;
    }
    Alert.alert(tr('common.delete'), tr('notes.deleteConfirm'), [
      { text: tr('common.cancel'), style: 'cancel' },
      {
        text: tr('common.delete'),
        style: 'destructive',
        onPress: () => {
          void deleteNote(noteId).then(() => router.back());
        },
      },
    ]);
  }, [noteId, router, tr]);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <KeyboardGutter>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Meta>{tr('common.back')}</Meta>
        </Pressable>
        <Pressable onPress={() => setPreview((value) => !value)} hitSlop={10}>
          <Meta>{preview ? tr('common.write') : tr('common.preview')}</Meta>
        </Pressable>
        <Pressable onPress={() => void save()} hitSlop={10}>
          <Meta style={{ color: t.ink }}>{tr('common.save')}</Meta>
        </Pressable>
      </View>

      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={tr('notes.placeholderTitle')}
        placeholderTextColor={t.dim}
        style={[styles.title, { color: t.ink }]}
      />

      {preview ? (
        <ScrollView contentContainerStyle={styles.bodyPad}>
          <MarkdownView source={body || title} />
        </ScrollView>
      ) : (
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder={tr('notes.placeholderBody')}
          placeholderTextColor={t.dim}
          style={[styles.body, { color: t.ink }]}
          multiline
          textAlignVertical="top"
        />
      )}

      {!isNew ? (
        <Pressable onPress={remove} style={styles.delete}>
          <Meta>{tr('common.delete')}</Meta>
        </Pressable>
      ) : null}
      </KeyboardGutter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: PAGE_MARGIN,
    paddingTop: PAGE_MARGIN,
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    paddingHorizontal: PAGE_MARGIN,
    paddingVertical: 8,
  },
  body: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    paddingHorizontal: PAGE_MARGIN,
    paddingBottom: 24,
  },
  bodyPad: { paddingHorizontal: PAGE_MARGIN, paddingBottom: 48, gap: GUTTER },
  delete: { padding: PAGE_MARGIN, alignItems: 'center' },
});
