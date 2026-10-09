// First screen: what Spofftilist does, and the Spotify login button.

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CodeLogin } from '../components/CodeLogin';
import { Field } from '../components/Field';
import { spotifyLoginBroken } from '../lib/device';
import { redirectUri } from '../lib/session';
import { updateSettings, useStore } from '../lib/store';
import { C, R } from '../theme';

const STEPS: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }[] = [
  {
    icon: 'wifi',
    title: 'Online: it picks songs',
    text: 'Songs that sound like what you play go into a "Spofftilist Inbox" playlist. Spotify downloads them.',
  },
  {
    icon: 'airplane',
    title: 'Offline: you listen and decide',
    text: 'Play the inbox in Spotify. In Spofftilist, tap Keep to pick a playlist, or Nah.',
  },
  {
    icon: 'sync',
    title: 'Back online: it cleans up',
    text: 'Kept songs go into your playlists. Nah songs leave the inbox, so Spotify deletes them. Then it refills.',
  },
];

export default function Welcome() {
  const { state, live } = useStore();
  const s = state.settings;
  const missingKeys = !s.spotifyClientId || !s.lastfmApiKey;
  const oldPhone = spotifyLoginBroken();

  useEffect(() => {
    if (live.loggedIn) router.replace('/');
  }, [live.loggedIn]);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>Spofftilist</Text>
        <Text style={styles.tagline}>New songs picked for you, ready for when you’re offline.</Text>

        <View style={styles.steps}>
          {STEPS.map((step) => (
            <View key={step.title} style={styles.step}>
              <View style={styles.stepIcon}>
                <Ionicons name={step.icon} size={20} color={C.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepText}>{step.text}</Text>
              </View>
            </View>
          ))}
        </View>

        {missingKeys ? (
          <View style={styles.keys}>
            <Text style={styles.keysTitle}>Keys (same ones spotilist uses)</Text>
            <Field label="Spotify Client ID" value={s.spotifyClientId} onChange={(v) => updateSettings({ spotifyClientId: v.trim() })} />
            <Field label="Last.fm API key" value={s.lastfmApiKey} onChange={(v) => updateSettings({ lastfmApiKey: v.trim() })} />
            {Platform.OS !== 'web' ? (
              <Field label="Redirect URI" value={s.redirectUri} onChange={(v) => updateSettings({ redirectUri: v.trim() })} />
            ) : null}
          </View>
        ) : null}

        {live.sync.error ? <Text style={styles.error}>{live.sync.error}</Text> : null}

        {oldPhone ? (
          <>
            <View style={styles.warnBox}>
              <Ionicons name="phone-portrait-outline" size={20} color={C.amber} />
              <Text style={styles.warnText}>
                Spotify’s login page doesn’t load on iOS 15 (it shows a white screen). Log in on your computer and
                move the login here instead:
              </Text>
            </View>
            <CodeLogin />
          </>
        ) : null}

        <Pressable
          style={({ pressed }) => [styles.login, pressed && { backgroundColor: C.greenPressed }, missingKeys && { opacity: 0.4 }]}
          disabled={missingKeys}
          onPress={() => router.push('/login')}>
          <Ionicons name="musical-notes" size={20} color={C.onGreen} />
          <Text style={styles.loginText}>{oldPhone ? 'Try Spotify login anyway' : 'Log in with Spotify'}</Text>
        </Pressable>
        <Text style={styles.note}>Needs Spotify Premium for offline downloads.</Text>
        {Platform.OS === 'web' && !oldPhone ? <CodeLogin /> : null}
        {Platform.OS === 'web' ? (
          <Text style={styles.note} selectable>
            First time? Your Spotify app (developer.spotify.com/dashboard) needs this Redirect URI: {redirectUri()}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 24, paddingTop: 48 },
  logo: { color: C.text, fontSize: 40, fontWeight: '900', letterSpacing: -1.2 },
  tagline: { color: C.sub, fontSize: 17, marginTop: 8, lineHeight: 23 },
  steps: { marginTop: 32, gap: 20 },
  step: { flexDirection: 'row', gap: 14 },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1d3a28',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitle: { color: C.text, fontSize: 16, fontWeight: '800' },
  stepText: { color: C.sub, fontSize: 14, marginTop: 3, lineHeight: 19 },
  keys: { marginTop: 30, backgroundColor: C.card, borderRadius: R.md, padding: 14 },
  keysTitle: { color: C.text, fontWeight: '800', fontSize: 15 },
  login: {
    marginTop: 36,
    height: 56,
    borderRadius: R.pill,
    backgroundColor: C.green,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loginText: { color: C.onGreen, fontSize: 17, fontWeight: '800' },
  error: { color: C.red, fontSize: 14, marginTop: 24 },
  warnBox: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 28,
    padding: 14,
    borderRadius: R.md,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: '#4a3a16',
  },
  warnText: { color: C.text, fontSize: 14, lineHeight: 20, flex: 1 },
  note: { color: C.faint, fontSize: 13, textAlign: 'center', marginTop: 12 },
});
