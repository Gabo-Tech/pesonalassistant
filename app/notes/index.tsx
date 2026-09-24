import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  deleteFolder,
  deleteNote,
  ensureFolder,
  listFolders,
  listNotes,
  moveNote,
  renameFolder,
  reorderNote,
  searchNotes,
  setNoteMark,
  type Folder,
  type Note,
  type NoteScope,
} from '../../src/db/notes';
import { useT } from '../../src/i18n';
import { isInboxLabel, noteAccentNames, noteColorKey } from '../../src/notes/organize';
import { noteSnippet } from '../../src/notes/title';
import { Bento, Chip, GUTTER, PAGE_MARGIN } from '../../src/ui/Bento';
import { Button } from '../../src/ui/Button';
import { KeyboardGutter } from '../../src/ui/KeyboardGutter';
import { noteAccents, type NoteAccent } from '../../src/ui/theme';
import { useTheme } from '../../src/ui/ThemeProvider';
import { Body, Display, Meta } from '../../src/ui/Type';

type Menu =
  | { kind: 'note'; note: Note; panel: 'actions' | 'color' | 'move' }
  | { kind: 'folder'; folder: Folder }
  | { kind: 'name'; folderId: number | null; draft: string; error: string };

export default function NotesScreen() {
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<NoteScope>('all');
  const [menu, setMenu] = useState<Menu | null>(null);

  const refresh = useCallback(async () => {
    const [nextNotes, nextFolders] = await Promise.all([
      query.trim() ? searchNotes(query.trim(), 100) : listNotes(scope),
      listFolders(),
    ]);
    setNotes(nextNotes);
    setFolders(nextFolders);
  }, [query, scope]);

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

  useEffect(() => {
    if (typeof scope === 'number' && folders.length > 0 && !folders.some((folder) => folder.id === scope)) {
      setScope('all');
    }
  }, [folders, scope]);

  const closeMenu = () => setMenu(null);
  const searching = query.trim().length > 0;
  const canReorder = !searching && scope !== 'all';

  const openNewNote = () => {
    router.push(typeof scope === 'number' ? `/notes/new?folder=${scope}` : '/notes/new');
  };

  const saveFolderName = async () => {
    if (!menu || menu.kind !== 'name') return;
    const draft = menu.draft;
    if (isInboxLabel(draft)) {
      setScope('inbox');
      closeMenu();
      return;
    }
    if (!draft.trim()) return;
    if (menu.folderId == null) {
      try {
        const folder = await ensureFolder(draft);
        setScope(folder.id);
        closeMenu();
        await refresh();
      } catch {
        setMenu({ ...menu, error: tr('notes.folderTaken') });
      }
      return;
    }
    const result = await renameFolder(menu.folderId, draft);
    if (result === 'taken') {
      setMenu({ ...menu, error: tr('notes.folderTaken') });
      return;
    }
    if (result === 'empty') return;
    closeMenu();
    await refresh();
  };

  const removeFolder = (folder: Folder) => {
    Alert.alert(tr('notes.deleteFolder'), tr('notes.deleteFolderConfirm'), [
      { text: tr('common.cancel'), style: 'cancel' },
      {
        text: tr('common.delete'),
        style: 'destructive',
        onPress: () => {
          void deleteFolder(folder.id).then(() => {
            setScope('all');
            closeMenu();
            return refresh();
          });
        },
      },
    ]);
  };

  const removeNote = (note: Note) => {
    Alert.alert(tr('common.delete'), tr('notes.deleteConfirm'), [
      { text: tr('common.cancel'), style: 'cancel' },
      {
        text: tr('common.delete'),
        style: 'destructive',
        onPress: () => {
          void deleteNote(note.id).then(() => {
            closeMenu();
            return refresh();
          });
        },
      },
    ]);
  };

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
            onPress={openNewNote}
          >
            <Meta style={{ color: t.inverseInk }}>{tr('notes.new')}</Meta>
          </Pressable>
        </Bento>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          keyboardShouldPersistTaps="handled"
        >
          <Chip label={tr('notes.all')} active={scope === 'all'} onPress={() => setScope('all')} />
          <Chip label={tr('notes.inbox')} active={scope === 'inbox'} onPress={() => setScope('inbox')} />
          {folders.map((folder) => (
            <Chip
              key={folder.id}
              label={folder.name}
              active={scope === folder.id}
              onPress={() => setScope(folder.id)}
              onLongPress={() => setMenu({ kind: 'folder', folder })}
            />
          ))}
          <Chip
            label={tr('notes.newFolder')}
            active={false}
            onPress={() => setMenu({ kind: 'name', folderId: null, draft: '', error: '' })}
          />
        </ScrollView>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: GUTTER, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {notes.length === 0 ? (
            <View style={{ gap: 16, marginTop: 32, alignItems: 'stretch' }}>
              <Body style={{ color: t.dim, textAlign: 'center' }}>
                {searching || scope === 'all' ? tr('notes.empty') : tr('notes.folderEmpty')}
              </Body>
              {!searching ? <Button label={tr('notes.new')} onPress={openNewNote} /> : null}
            </View>
          ) : (
            notes.map((item) => {
              const accent = item.color in noteAccents ? noteAccents[item.color as NoteAccent] : null;
              const showFolder = searching || scope === 'all';
              return (
                <Pressable
                  key={item.id}
                  onPress={() => router.push(`/notes/${item.id}`)}
                  onLongPress={() => setMenu({ kind: 'note', note: item, panel: 'actions' })}
                >
                  <Bento span={2} style={styles.note}>
                    {accent ? <View style={[styles.accent, { backgroundColor: accent }]} /> : null}
                    <View style={{ flex: 1, gap: 6 }}>
                      {item.pinned ? <Meta style={{ color: t.ink }}>{tr('notes.pinned')}</Meta> : null}
                      <Display style={{ fontSize: 22, lineHeight: 28 }}>
                        {item.title.trim() ||
                          item.body.split('\n')[0]?.slice(0, 80) ||
                          tr('notes.untitled')}
                      </Display>
                      {noteSnippet(item.body) ? (
                        <Body style={{ color: t.dim }} numberOfLines={3}>
                          {noteSnippet(item.body)}
                        </Body>
                      ) : null}
                      <Body style={{ color: t.dim, fontSize: 13, lineHeight: 18 }}>
                        {showFolder ? `${item.folder_name ?? tr('notes.inbox')} · ` : ''}
                        {new Date(item.updated_at).toLocaleString()}
                      </Body>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={tr('notes.menu')}
                      hitSlop={8}
                      onPress={() => setMenu({ kind: 'note', note: item, panel: 'actions' })}
                      style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Ionicons name="ellipsis-horizontal" size={20} color={t.ink} />
                    </Pressable>
                  </Bento>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>

      <Modal visible={menu != null} transparent animationType="fade" onRequestClose={closeMenu}>
        <KeyboardGutter>
          <Pressable style={styles.scrim} onPress={closeMenu}>
            <Pressable
              onPress={() => {}}
              style={[
                styles.sheet,
                { backgroundColor: t.surface, borderColor: t.line, borderRadius: t.radius },
              ]}
            >
              {menu?.kind === 'note' && menu.panel === 'actions' ? (
                <NoteActions
                  note={menu.note}
                  canReorder={canReorder}
                  onPin={() => {
                    void setNoteMark(menu.note.id, { pinned: !menu.note.pinned }).then(() => {
                      closeMenu();
                      return refresh();
                    });
                  }}
                  onColor={() => setMenu({ ...menu, panel: 'color' })}
                  onMove={() => setMenu({ ...menu, panel: 'move' })}
                  onUp={() => {
                    void reorderNote(menu.note.id, 'up').then(() => {
                      closeMenu();
                      return refresh();
                    });
                  }}
                  onDown={() => {
                    void reorderNote(menu.note.id, 'down').then(() => {
                      closeMenu();
                      return refresh();
                    });
                  }}
                  onDelete={() => removeNote(menu.note)}
                />
              ) : null}

              {menu?.kind === 'note' && menu.panel === 'color' ? (
                <View style={styles.swatches}>
                  <Pressable
                    onPress={() => {
                      void setNoteMark(menu.note.id, { color: '' }).then(() => {
                        closeMenu();
                        return refresh();
                      });
                    }}
                    style={[styles.clear, { borderColor: t.line }]}
                  >
                    <Meta>{tr('notes.clearColor')}</Meta>
                  </Pressable>
                  {noteAccentNames.map((name) => (
                    <Pressable
                      key={name}
                      accessibilityLabel={tr(noteColorKey(name))}
                      onPress={() => {
                        void setNoteMark(menu.note.id, { color: name }).then(() => {
                          closeMenu();
                          return refresh();
                        });
                      }}
                      style={[
                        styles.swatch,
                        {
                          backgroundColor: noteAccents[name],
                          borderColor: menu.note.color === name ? t.ink : 'transparent',
                        },
                      ]}
                    />
                  ))}
                </View>
              ) : null}

              {menu?.kind === 'note' && menu.panel === 'move' ? (
                <View style={{ gap: 8 }}>
                  <Pressable
                    onPress={() => {
                      void moveNote(menu.note.id, null).then(() => {
                        closeMenu();
                        return refresh();
                      });
                    }}
                  >
                    <Meta style={{ color: menu.note.folder_id == null ? t.ink : t.dim }}>
                      {tr('notes.inbox')}
                    </Meta>
                  </Pressable>
                  {folders.map((folder) => (
                    <Pressable
                      key={folder.id}
                      onPress={() => {
                        void moveNote(menu.note.id, folder.id).then(() => {
                          closeMenu();
                          return refresh();
                        });
                      }}
                    >
                      <Meta style={{ color: menu.note.folder_id === folder.id ? t.ink : t.dim }}>
                        {folder.name}
                      </Meta>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {menu?.kind === 'folder' ? (
                <View style={{ gap: 14 }}>
                  <Display style={{ fontSize: 22, lineHeight: 28 }}>{menu.folder.name}</Display>
                  <Pressable
                    onPress={() =>
                      setMenu({ kind: 'name', folderId: menu.folder.id, draft: menu.folder.name, error: '' })
                    }
                  >
                    <Meta>{tr('notes.rename')}</Meta>
                  </Pressable>
                  <Pressable onPress={() => removeFolder(menu.folder)}>
                    <Meta>{tr('notes.deleteFolder')}</Meta>
                  </Pressable>
                </View>
              ) : null}

              {menu?.kind === 'name' ? (
                <View style={{ gap: 12 }}>
                  <TextInput
                    value={menu.draft}
                    onChangeText={(draft) => setMenu({ ...menu, draft, error: '' })}
                    placeholder={tr('notes.folderName')}
                    placeholderTextColor={t.dim}
                    autoFocus
                    style={[styles.input, { color: t.ink }]}
                  />
                  {menu.error ? <Body style={{ color: t.dim }}>{menu.error}</Body> : null}
                  <Pressable onPress={() => void saveFolderName()}>
                    <Meta style={{ color: t.ink }}>{tr('common.save')}</Meta>
                  </Pressable>
                </View>
              ) : null}
            </Pressable>
          </Pressable>
        </KeyboardGutter>
      </Modal>
    </KeyboardGutter>
  );
}

function NoteActions({
  note,
  canReorder,
  onPin,
  onColor,
  onMove,
  onUp,
  onDown,
  onDelete,
}: {
  note: Note;
  canReorder: boolean;
  onPin: () => void;
  onColor: () => void;
  onMove: () => void;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
}) {
  const tr = useT();
  const t = useTheme();
  return (
    <View style={{ gap: 14 }}>
      <Display style={{ fontSize: 22, lineHeight: 28 }} numberOfLines={1}>
        {note.title.trim() || tr('notes.untitled')}
      </Display>
      <Pressable onPress={onPin}>
        <Meta>{note.pinned ? tr('notes.unpin') : tr('notes.pin')}</Meta>
      </Pressable>
      <Pressable onPress={onColor}>
        <Meta>{tr('notes.color')}</Meta>
      </Pressable>
      <Pressable onPress={onMove}>
        <Meta>{tr('notes.move')}</Meta>
      </Pressable>
      {canReorder ? (
        <View style={styles.reorder}>
          <Pressable onPress={onUp} hitSlop={8}>
            <Meta>{tr('notes.moveUp')}</Meta>
          </Pressable>
          <Pressable onPress={onDown} hitSlop={8}>
            <Meta>{tr('notes.moveDown')}</Meta>
          </Pressable>
        </View>
      ) : null}
      <Pressable onPress={onDelete}>
        <Meta style={{ color: t.dim }}>{tr('common.delete')}</Meta>
      </Pressable>
    </View>
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
  chips: { gap: 8, alignItems: 'center' },
  note: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  accent: { width: 4, borderRadius: 2 },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    padding: PAGE_MARGIN,
  },
  sheet: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 12,
  },
  swatches: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2 },
  clear: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  reorder: { flexDirection: 'row', gap: 18 },
});
