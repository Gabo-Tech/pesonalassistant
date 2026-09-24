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
import {
  createNote,
  deleteNote,
  getNote,
  listFolders,
  updateNote,
  type Folder,
} from '../../src/db/notes';
import { useT } from '../../src/i18n';
import { MarkdownView } from '../../src/notes/MarkdownView';
import { noteAccentNames, noteColorKey, type NoteAccent } from '../../src/notes/organize';
import { inferNoteTitle } from '../../src/notes/title';
import { Chip, GUTTER, PAGE_MARGIN } from '../../src/ui/Bento';
import { Button } from '../../src/ui/Button';
import { KeyboardGutter } from '../../src/ui/KeyboardGutter';
import { noteAccents } from '../../src/ui/theme';
import { useTheme } from '../../src/ui/ThemeProvider';
import { Meta } from '../../src/ui/Type';

function folderFromParam(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d+$/.test(value)) return null;
  return Number(value);
}

export default function NoteEditorScreen() {
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const { id, folder } = useLocalSearchParams<{ id: string; folder?: string }>();
  const isNew = id === 'new';
  const noteId = isNew ? null : Number(id);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState(false);
  const [loaded, setLoaded] = useState(isNew);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState<number | null>(folderFromParam(folder));
  const [pinned, setPinned] = useState(false);
  const [color, setColor] = useState<NoteAccent | ''>('');
  const [organize, setOrganize] = useState(false);
  const [baseline, setBaseline] = useState(() =>
    isNew
      ? JSON.stringify({
          title: '',
          body: '',
          folderId: folderFromParam(folder),
          pinned: false,
          color: '',
        })
      : '',
  );

  useEffect(() => {
    void listFolders().then(setFolders);
  }, []);

  useEffect(() => {
    if (noteId == null || Number.isNaN(noteId)) return;
    void getNote(noteId).then((note) => {
      if (!note) {
        router.back();
        return;
      }
      setTitle(note.title);
      setBody(note.body);
      setFolderId(note.folder_id);
      setPinned(note.pinned === 1);
      setColor(note.color in noteAccents ? (note.color as NoteAccent) : '');
      setBaseline(JSON.stringify({ title: note.title, body: note.body, folderId: note.folder_id, pinned: note.pinned === 1, color: note.color in noteAccents ? note.color : '' }));
      setLoaded(true);
    });
  }, [noteId, router]);

  const save = useCallback(async () => {
    const nextTitle = inferNoteTitle(body, title);
    const options = { folderId, pinned, color };
    if (isNew) {
      await createNote(nextTitle, body, options);
    } else if (noteId != null) {
      await updateNote(noteId, { title: nextTitle, body, ...options });
    }
    router.back();
  }, [body, color, folderId, isNew, noteId, pinned, router, title]);

  const dirty =
    loaded &&
    baseline !== JSON.stringify({ title, body, folderId, pinned, color });

  const leave = useCallback(() => {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert(tr('notes.unsaved'), tr('notes.unsavedBody'), [
      { text: tr('common.cancel'), style: 'cancel' },
      { text: tr('common.back'), style: 'destructive', onPress: () => router.back() },
    ]);
  }, [baseline, body, color, dirty, folderId, pinned, router, title, tr]);

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
          <View style={{ flex: 1 }}>
            <Button label={tr('common.back')} onPress={leave} tone="secondary" />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={preview ? tr('common.write') : tr('common.preview')}
              onPress={() => setPreview((value) => !value)}
              tone="secondary"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button label={tr('common.save')} onPress={() => void save()} />
          </View>
        </View>

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={tr('notes.placeholderTitle')}
          placeholderTextColor={t.dim}
          style={[styles.title, { color: t.ink }]}
        />

        <View style={{ paddingHorizontal: PAGE_MARGIN, paddingBottom: 8 }}>
          <Button
            label={tr('notes.organize')}
            tone="secondary"
            onPress={() => setOrganize((value) => !value)}
          />
        </View>
        {organize ? (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tools}
              keyboardShouldPersistTaps="handled"
            >
              <Chip
                label={pinned ? tr('notes.unpin') : tr('notes.pin')}
                active={pinned}
                onPress={() => setPinned((value) => !value)}
              />
              <Pressable
                onPress={() => setColor('')}
                style={[styles.clear, { borderColor: color === '' ? t.ink : t.line }]}
              >
                <Meta>{tr('notes.clearColor')}</Meta>
              </Pressable>
              {noteAccentNames.map((name) => (
                <Pressable
                  key={name}
                  accessibilityLabel={tr(noteColorKey(name))}
                  onPress={() => setColor(name)}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: noteAccents[name],
                      borderColor: color === name ? t.ink : 'transparent',
                    },
                  ]}
                />
              ))}
            </ScrollView>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tools}
              keyboardShouldPersistTaps="handled"
            >
              <Chip label={tr('notes.inbox')} active={folderId == null} onPress={() => setFolderId(null)} />
              {folders.map((item) => (
                <Chip
                  key={item.id}
                  label={item.name}
                  active={folderId === item.id}
                  onPress={() => setFolderId(item.id)}
                />
              ))}
            </ScrollView>
          </>
        ) : null}

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
          <View style={styles.delete}>
            <Button label={tr('common.delete')} onPress={remove} tone="danger" />
          </View>
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
  tools: {
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: PAGE_MARGIN,
    paddingBottom: 8,
  },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2 },
  clear: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
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
