import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Field } from '../components/Field';
import { LoginTransfer } from '../components/LoginTransfer';
import { openInSpotify, timeAgo } from '../lib/links';
import { logout, redirectUri } from '../lib/session';
import { undo, updateSettings, useStore } from '../lib/store';
import { requestSync } from '../lib/sync';
import { C, R } from '../theme';

const SIZES = [10, 25, 50];

export default function Settings() {
  const { state, live } = useStore();
  const s = state.settings;

  const confirmLogout = () => {
    const go = async () => {
      await logout();
      router.replace('/welcome');
    };
    const msg = 'Decisions that haven\'t synced yet will be lost. Your Spotify playlists stay as they are.';
    if (Platform.OS === 'web') {
      if (confirm(msg)) go();
      return;
    }
    Alert.alert('Log out?', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Section title="Waiting to sync">
        {state.decisions.length === 0 ? (
          <Text style={styles.muted}>Nothing waiting. Everything you decided is on Spotify.</Text>
        ) : (
          state.decisions
            .slice()
            .reverse()
            .map((d) => (
              <View key={`${d.at}:${d.song.uri}`} style={styles.decision}>
                <Ionicons
                  name={d.action === 'keep' ? 'heart' : 'close-circle'}
                  size={18}
                  color={d.action === 'keep' ? C.green : C.faint}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowText} numberOfLines={1}>
                    {d.song.name}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {d.action === 'keep' ? `Keep in ${d.playlist?.name}` : 'Nah'} · {d.song.artists.join(', ')}
                  </Text>
                </View>
                <Pressable onPress={() => undo(d)} hitSlop={8}>
                  <Text style={styles.link}>Undo</Text>
                </Pressable>
              </View>
            ))
        )}
        <Pressable
          style={[styles.button, (!live.online || live.sync.running) && { opacity: 0.4 }]}
          disabled={!live.online || live.sync.running}
          onPress={() => requestSync()}>
          <Ionicons name="sync" size={16} color={C.onGreen} />
          <Text style={styles.buttonText}>{live.sync.running ? 'Syncing…' : live.online ? 'Sync now' : 'Offline'}</Text>
        </Pressable>
        <Text style={styles.muted}>Last synced {timeAgo(state.lastSyncAt)}.</Text>
      </Section>

      <Section title="Inbox">
        <Text style={styles.label}>Songs to keep ready</Text>
        <View style={styles.segment}>
          {SIZES.map((n) => (
            <Pressable
              key={n}
              style={[styles.segmentItem, s.inboxSize === n && styles.segmentOn]}
              onPress={() => updateSettings({ inboxSize: n })}>
              <Text style={[styles.segmentText, s.inboxSize === n && { color: C.onGreen }]}>{n}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.muted}>Roughly {s.inboxSize * 3} MB of Spotify downloads (about 3 MB a song).</Text>
        {state.inboxId ? (
          <Pressable style={styles.row} onPress={() => openInSpotify('playlist', state.inboxId!)}>
            <Ionicons name="open-outline" size={18} color={C.text} />
            <Text style={styles.rowText}>Open “{s.inboxName}” in Spotify</Text>
          </Pressable>
        ) : null}
        <Text style={styles.muted}>
          In Spotify, turn on Download for this playlist once. New picks then download on their own whenever Spotify is
          open and online.
        </Text>
        <Field
          label="Playlist suggested when you tap Keep"
          value={s.defaultPlaylistName}
          onChange={(v) => updateSettings({ defaultPlaylistName: v })}
          hint="Created on Spotify the first time you keep a song in it."
        />
      </Section>

      <Section title="What it has learned">
        <Text style={styles.stat}>
          {state.stats.kept} kept · {state.stats.nah} nah · {state.seenKeys.length} songs it won’t suggest again
        </Text>
        <Text style={styles.muted}>
          New picks are based on songs you keep, then what you’ve played on Spotify lately. Artists you say Nah to
          twice stop being suggested.
        </Text>
      </Section>

      {Platform.OS === 'web' ? (
        <Section title="Move login to your phone">
          <Text style={styles.muted}>
            For iPhones on iOS 15, where Spotify’s login page stays white. Do this on your computer.
          </Text>
          <LoginTransfer />
        </Section>
      ) : null}

      <Section title="Account">
        <Text style={styles.stat}>{state.account ? `Logged in as ${state.account.name}` : 'Logged in to Spotify'}</Text>
        <Pressable style={styles.row} onPress={confirmLogout}>
          <Ionicons name="log-out-outline" size={18} color={C.red} />
          <Text style={[styles.rowText, { color: C.red }]}>Log out</Text>
        </Pressable>
      </Section>

      <Section title="Keys">
        <Field label="Spotify Client ID" value={s.spotifyClientId} onChange={(v) => updateSettings({ spotifyClientId: v.trim() })} />
        <Field label="Last.fm API key" value={s.lastfmApiKey} onChange={(v) => updateSettings({ lastfmApiKey: v.trim() })} />
        {Platform.OS === 'web' ? (
          <Text style={styles.muted} selectable>
            Redirect URI (add it in your Spotify app settings): {redirectUri()}
          </Text>
        ) : (
          <Field
            label="Redirect URI"
            value={s.redirectUri}
            onChange={(v) => updateSettings({ redirectUri: v.trim() })}
            hint="Must match a Redirect URI in your Spotify app settings."
          />
        )}
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 48 },
  section: { marginBottom: 22 },
  sectionTitle: { color: C.sub, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: C.card, borderRadius: R.md, padding: 14, gap: 10 },
  muted: { color: C.faint, fontSize: 13, lineHeight: 18 },
  label: { color: C.sub, fontSize: 12, fontWeight: '700' },
  stat: { color: C.text, fontSize: 15, fontWeight: '600' },
  decision: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  rowText: { color: C.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: C.sub, fontSize: 12, marginTop: 1 },
  link: { color: C.green, fontWeight: '800' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.green,
    borderRadius: R.pill,
    paddingVertical: 11,
    marginTop: 4,
  },
  buttonText: { color: C.onGreen, fontWeight: '800', fontSize: 15 },
  segment: { flexDirection: 'row', backgroundColor: C.raised, borderRadius: R.pill, padding: 3 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: R.pill },
  segmentOn: { backgroundColor: C.green },
  segmentText: { color: C.text, fontWeight: '800' },
});
