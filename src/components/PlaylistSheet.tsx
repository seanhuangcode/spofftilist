// "Keep it in…" sheet: like spotilist's playlist dropdown. The playlist you used last is on top,
// and a new playlist you name offline gets created on Spotify at the next sync.

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pendingNewPlaylists, type PlaylistChoice, type Song, type State } from '../lib/store';
import { truncate } from '../lib/text';
import { C, R } from '../theme';

type Option = PlaylistChoice & { isNew: boolean; label: string };

export function playlistOptions(state: State): Option[] {
  const real = state.playlists.filter((p) => p.id !== state.inboxId);
  const realNames = new Set(real.map((p) => p.name));
  const options: Option[] = [];
  const add = (o: Option) => {
    if (!options.some((x) => (o.id ? x.id === o.id : !x.id && x.name === o.name))) options.push(o);
  };

  const last = state.lastPlaylist;
  if (last) {
    const match = real.find((p) => p.id === last.id) ?? real.find((p) => p.name === last.name);
    if (match) add({ ...match, isNew: false, label: match.name });
    else if (!last.id) add({ name: last.name, isNew: true, label: last.name });
  }
  for (const name of pendingNewPlaylists(state)) if (!realNames.has(name)) add({ name, isNew: true, label: name });
  const def = state.settings.defaultPlaylistName;
  if (def && !realNames.has(def)) add({ name: def, isNew: true, label: def });
  for (const p of real) add({ ...p, isNew: false, label: p.name });
  return options;
}

type Props = {
  visible: boolean;
  song: Song | undefined;
  state: State;
  onPick: (choice: PlaylistChoice) => void;
  onClose: () => void;
};

export function PlaylistSheet({ visible, song, state, onPick, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const options = useMemo(() => playlistOptions(state), [state]);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const last = state.lastPlaylist;

  const close = () => {
    setNaming(false);
    setNewName('');
    onClose();
  };
  const pick = (choice: PlaylistChoice) => {
    setNaming(false);
    setNewName('');
    onPick(choice);
  };
  const createNew = () => {
    const name = newName.trim();
    if (!name) return;
    const existing = options.find((o) => o.name.toLowerCase() === name.toLowerCase());
    pick(existing ? { id: existing.id, name: existing.name } : { name });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Keep it in…</Text>
          {song ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {song.name} · {song.artists.join(', ')}
            </Text>
          ) : null}

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {naming ? (
              <View style={styles.newRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Playlist name"
                  placeholderTextColor={C.faint}
                  value={newName}
                  onChangeText={setNewName}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={createNew}
                />
                <Pressable style={[styles.createBtn, !newName.trim() && { opacity: 0.4 }]} onPress={createNew}>
                  <Text style={styles.createText}>Keep</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.row} onPress={() => setNaming(true)}>
                <View style={[styles.icon, { backgroundColor: C.raised }]}>
                  <Ionicons name="add" size={22} color={C.text} />
                </View>
                <Text style={styles.rowText}>New playlist</Text>
              </Pressable>
            )}

            {options.map((o) => {
              const selected = !!last && (o.id ? o.id === last.id || (!last.id && o.name === last.name) : !last.id && o.name === last.name);
              return (
                <Pressable
                  key={o.id ?? `new:${o.name}`}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.raised }]}
                  onPress={() => pick({ id: o.id, name: o.name })}>
                  <View style={[styles.icon, { backgroundColor: o.isNew ? '#1d3a28' : C.raised }]}>
                    <Ionicons name={o.isNew ? 'sparkles' : 'musical-notes'} size={18} color={o.isNew ? C.green : C.sub} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowText} numberOfLines={1}>
                      {truncate(o.label, 40)}
                    </Text>
                    {o.isNew ? <Text style={styles.rowSub}>New · created on Spotify when you’re online</Text> : null}
                  </View>
                  {selected ? <Ionicons name="checkmark-circle" size={22} color={C.green} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: R.lg,
    borderTopRightRadius: R.lg,
    paddingHorizontal: 16,
    paddingTop: 10,
    maxHeight: 560,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 14 },
  title: { color: C.text, fontSize: 20, fontWeight: '800' },
  subtitle: { color: C.sub, fontSize: 14, marginTop: 4, marginBottom: 10 },
  list: { marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 6, borderRadius: R.sm },
  icon: { width: 44, height: 44, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  rowText: { color: C.text, fontSize: 16, fontWeight: '600' },
  rowSub: { color: C.green, fontSize: 12, marginTop: 2 },
  newRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  input: {
    flex: 1,
    backgroundColor: C.raised,
    color: C.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: R.sm,
  },
  createBtn: { backgroundColor: C.green, paddingHorizontal: 18, paddingVertical: 12, borderRadius: R.pill },
  createText: { color: C.onGreen, fontWeight: '800', fontSize: 15 },
});
