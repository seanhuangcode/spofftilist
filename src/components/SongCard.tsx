import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { duration } from '../lib/links';
import type { Song } from '../lib/store';
import { artUri } from '../lib/storage';
import { C, R } from '../theme';

type Props = {
  song: Song;
  index: number;
  total: number;
  nowPlaying: boolean;
  onPrev: () => void;
  onNext: () => void;
};

export function SongCard({ song, index, total, nowPlaying, onPrev, onNext }: Props) {
  const { width, height } = useWindowDimensions();
  const size = Math.min(width - 48, height * 0.38, 420);
  const local = artUri(song.id);
  // If the saved copy can't be read, try the online one; if that fails too, the note icon shows through.
  const [failed, setFailed] = useState<string[]>([]);
  const cover = [local, song.image].find((u): u is string => !!u && !failed.includes(u));

  return (
    <View style={styles.wrap}>
      <View style={[styles.art, { width: size, height: size }]}>
        <Ionicons name="musical-notes" size={size * 0.3} color={C.faint} />
        {cover ? (
          <Image
            key={cover}
            source={{ uri: cover }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setFailed((f) => [...f, cover])}
          />
        ) : null}
      </View>

      <View style={[styles.nav, { width: size }]}>
        <Pressable onPress={onPrev} disabled={index === 0} hitSlop={12} accessibilityLabel="Previous song">
          <Ionicons name="chevron-back" size={22} color={index === 0 ? C.border : C.sub} />
        </Pressable>
        <View style={styles.navMid}>
          {nowPlaying ? (
            <Text style={[styles.tag, { color: C.green }]}>NOW PLAYING IN SPOTIFY</Text>
          ) : (
            <Text style={styles.tag}>
              {index + 1} OF {total}
            </Text>
          )}
        </View>
        <Pressable onPress={onNext} disabled={index >= total - 1} hitSlop={12} accessibilityLabel="Next song">
          <Ionicons name="chevron-forward" size={22} color={index >= total - 1 ? C.border : C.sub} />
        </Pressable>
      </View>

      <View style={[styles.info, { width: size }]}>
        <Text style={styles.title} numberOfLines={2}>
          {song.name}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {song.artists.join(', ')}
          {song.durationMs ? `  ·  ${duration(song.durationMs)}` : ''}
        </Text>
        {song.seed ? (
          <Text style={styles.reason} numberOfLines={2}>
            picked because you played {song.seed}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  art: {
    borderRadius: R.md,
    backgroundColor: C.raised,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  nav: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  navMid: { flex: 1, alignItems: 'center' },
  tag: { color: C.sub, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  info: { marginTop: 10 },
  title: { color: C.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  artist: { color: C.sub, fontSize: 16, marginTop: 4 },
  reason: { color: C.faint, fontSize: 13, fontStyle: 'italic', marginTop: 8 },
});
