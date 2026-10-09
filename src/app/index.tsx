// The inbox: one card per song waiting for your Keep or Nah. Works the same online and offline.

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlaylistSheet } from '../components/PlaylistSheet';
import { SongCard } from '../components/SongCard';
import { StatusBanner } from '../components/StatusBanner';
import { Toast } from '../components/Toast';
import { openInSpotify } from '../lib/links';
import {
  currentIndex,
  decide,
  setCurrent,
  setState,
  showToast,
  useStore,
  visibleInbox,
  type PlaylistChoice,
} from '../lib/store';
import { requestSync, syncSoon } from '../lib/sync';
import { useNowPlaying } from '../lib/useBoot';
import { C, R } from '../theme';

export default function Inbox() {
  const { state, live } = useStore();
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);
  useNowPlaying(live.loggedIn && live.online);

  if (!live.loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.green} />
      </View>
    );
  }
  if (!live.loggedIn) return <Redirect href="/welcome" />;

  const visible = visibleInbox(state);
  const index = currentIndex(state, visible);
  const song = visible[index];

  const afterDecision = () => {
    if (live.online) syncSoon();
  };

  const nah = () => {
    if (!song) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const d = decide(song, 'nah');
    showToast(
      live.online ? `Nah. Removing it from your inbox.` : `Nah. It leaves your phone next time you're online.`,
      d,
    );
    afterDecision();
  };

  const keep = (choice: PlaylistChoice) => {
    if (!song) return;
    setSheetOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const d = decide(song, 'keep', choice);
    showToast(live.online ? `Kept in ${choice.name}` : `Kept in ${choice.name} · syncs when you're online`, d);
    afterDecision();
  };

  const showTip = !!state.inboxId && !state.tipDismissed;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.logo}>Spofftilist</Text>
        <Pressable onPress={() => router.push('/settings')} hitSlop={12} accessibilityLabel="Settings">
          <Ionicons name="settings-outline" size={24} color={C.text} />
        </Pressable>
      </View>
      <View style={styles.banner}>
        <StatusBanner state={state} live={live} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 24 }]} bounces={false}>
        {showTip ? (
          <View style={styles.tip}>
            <Ionicons name="arrow-down-circle" size={22} color={C.green} />
            <Text style={styles.tipText}>
              <Text style={styles.tipTitle}>One-time step: </Text>
              turn on Download for “{state.settings.inboxName}” in Spotify so picks play offline.
            </Text>
            <Pressable style={styles.tipPrimary} onPress={() => openInSpotify('playlist', state.inboxId!)}>
              <Text style={styles.tipPrimaryText}>Open</Text>
            </Pressable>
            <Pressable
              onPress={() => setState((s) => ({ ...s, tipDismissed: true }))}
              hitSlop={10}
              accessibilityLabel="Dismiss">
              <Ionicons name="close" size={18} color={C.faint} />
            </Pressable>
          </View>
        ) : null}

        {song ? (
          <SongCard
            song={song}
            index={index}
            total={visible.length}
            nowPlaying={live.nowPlayingUri === song.uri}
            onPrev={() => setCurrent(visible[index - 1]?.uri)}
            onNext={() => setCurrent(visible[index + 1]?.uri)}
          />
        ) : (
          <Empty online={live.online} syncing={live.sync.running} waiting={state.decisions.length} />
        )}
      </ScrollView>

      {song ? (
        <View style={[styles.actions, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.buttons}>
            <Pressable
              style={({ pressed }) => [styles.btn, styles.nah, pressed && { backgroundColor: '#333' }]}
              onPress={nah}
              accessibilityLabel="Nah, remove this song">
              <Ionicons name="close" size={26} color={C.text} />
              <Text style={styles.nahText}>Nah</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.btn, styles.keep, pressed && { backgroundColor: C.greenPressed }]}
              onPress={() => setSheetOpen(true)}
              accessibilityLabel="Keep, add to a playlist">
              <Ionicons name="heart" size={22} color={C.onGreen} />
              <Text style={styles.keepText}>Keep</Text>
            </Pressable>
          </View>
          <Pressable style={styles.play} onPress={() => openInSpotify('track', song.id)} hitSlop={8}>
            <Ionicons name="play-circle" size={18} color={C.sub} />
            <Text style={styles.playText}>Play in Spotify</Text>
          </Pressable>
        </View>
      ) : null}

      <PlaylistSheet
        visible={sheetOpen}
        song={song}
        state={state}
        onPick={keep}
        onClose={() => setSheetOpen(false)}
      />
      {/* Up top, over the cover, so it never hides the next song's name. */}
      <Toast toast={live.toast} top={insets.top + 96} />
    </SafeAreaView>
  );
}

function Empty({ online, syncing, waiting }: { online: boolean; syncing: boolean; waiting: number }) {
  let icon: keyof typeof Ionicons.glyphMap = 'checkmark-done-circle';
  let title = "You're all caught up";
  let text = 'Spofftilist will pick a fresh batch of songs the next time you sync.';
  if (syncing) {
    icon = 'sparkles';
    title = 'Finding songs for you';
    text = 'Picking songs that sound like what you play and adding them to your inbox playlist in Spotify.';
  } else if (!online) {
    icon = 'cloud-offline';
    text = `Connect to the internet to get new songs.${
      waiting ? ` Your ${waiting} decision${waiting === 1 ? '' : 's'} will sync then too.` : ''
    }`;
  }
  return (
    <View style={styles.empty}>
      {syncing ? <ActivityIndicator size="large" color={C.green} /> : <Ionicons name={icon} size={56} color={C.faint} />}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
      {online && !syncing ? (
        <Pressable style={styles.emptyBtn} onPress={() => requestSync()}>
          <Text style={styles.emptyBtnText}>Get new songs</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  logo: { color: C.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.6 },
  banner: { paddingHorizontal: 20, marginTop: 10 },
  body: { paddingHorizontal: 24, paddingTop: 18, flexGrow: 1 },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.card,
    borderRadius: R.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1d3a28',
  },
  tipTitle: { color: C.text, fontWeight: '800' },
  tipText: { color: C.sub, fontSize: 13, lineHeight: 18, flex: 1 },
  tipPrimary: { backgroundColor: C.green, paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.pill },
  tipPrimaryText: { color: C.onGreen, fontWeight: '800', fontSize: 13 },
  actions: { paddingHorizontal: 24, paddingTop: 10, backgroundColor: C.bg },
  buttons: { flexDirection: 'row', gap: 14 },
  btn: {
    flex: 1,
    height: 58,
    borderRadius: R.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nah: { backgroundColor: C.raised },
  keep: { backgroundColor: C.green },
  nahText: { color: C.text, fontWeight: '800', fontSize: 18 },
  keepText: { color: C.onGreen, fontWeight: '800', fontSize: 18 },
  play: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 },
  playText: { color: C.sub, fontSize: 14, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { color: C.text, fontSize: 22, fontWeight: '800', marginTop: 8 },
  emptyText: { color: C.sub, fontSize: 15, textAlign: 'center', lineHeight: 21, maxWidth: 320 },
  emptyBtn: { backgroundColor: C.green, paddingHorizontal: 22, paddingVertical: 12, borderRadius: R.pill, marginTop: 8 },
  emptyBtnText: { color: C.onGreen, fontWeight: '800', fontSize: 15 },
});
