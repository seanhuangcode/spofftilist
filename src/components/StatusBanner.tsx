import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { timeAgo } from '../lib/links';
import type { Live, State } from '../lib/store';
import { requestSync } from '../lib/sync';
import { C, R } from '../theme';

/** One line under the header: what the sync is doing, offline, or what went wrong. Offline comes first:
 *  you can't fix a login or retry a sync without internet anyway. */
export function StatusBanner({ state, live }: { state: State; live: Live }) {
  const { sync, online } = live;
  const waiting = state.decisions.length;
  const waitingText = waiting ? ` · ${waiting} to sync` : '';

  if (sync.running) {
    const progress = sync.total ? ` ${sync.done ?? 0}/${sync.total}` : '';
    return (
      <View style={styles.bar}>
        <ActivityIndicator size="small" color={C.green} />
        <Text style={styles.text} numberOfLines={1}>
          {sync.step ?? 'Syncing'}
          {progress}
        </Text>
      </View>
    );
  }

  if (!online) {
    return (
      <View style={styles.bar}>
        <View style={[styles.dot, { backgroundColor: C.faint }]} />
        <Text style={styles.text} numberOfLines={1}>
          Offline{waiting ? ` · ${waiting} decision${waiting === 1 ? '' : 's'} will sync later` : ' · listening mode'}
        </Text>
      </View>
    );
  }

  if (sync.needsLogin) {
    return (
      <Pressable style={[styles.bar, styles.alert]} onPress={() => router.push('/login')}>
        <Ionicons name="key" size={14} color={C.red} />
        <Text style={[styles.text, { color: C.text }]} numberOfLines={2}>
          {sync.error ?? 'Spotify login expired.'}
        </Text>
        <Text style={styles.action}>Log in</Text>
      </Pressable>
    );
  }

  if (sync.error) {
    return (
      <Pressable style={[styles.bar, styles.alert]} onPress={() => requestSync()}>
        <Ionicons name="warning" size={14} color={C.amber} />
        <Text style={[styles.text, { color: C.text }]} numberOfLines={2}>
          {sync.error}
        </Text>
        <Text style={styles.action}>Retry</Text>
      </Pressable>
    );
  }

  return (
    <Pressable style={styles.bar} onPress={() => requestSync()} accessibilityLabel="Sync now">
      <View style={[styles.dot, { backgroundColor: C.green }]} />
      <Text style={styles.text} numberOfLines={1}>
        Online · synced {timeAgo(state.lastSyncAt)}
        {waitingText}
      </Text>
      <Ionicons name="refresh" size={14} color={C.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: C.card,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: R.pill,
    maxWidth: '100%',
  },
  alert: { borderRadius: R.sm, alignSelf: 'stretch', backgroundColor: C.raised },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { color: C.sub, fontSize: 13, flexShrink: 1 },
  action: { color: C.green, fontWeight: '700', fontSize: 13, marginLeft: 'auto', flexShrink: 0 },
});
