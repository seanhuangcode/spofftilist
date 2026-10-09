// Spotify login.
// Web: a normal redirect to Spotify, which sends you back to this site's /callback page.
// Phone app: Spotify only accepts https:// or http://127.0.0.1 redirect URIs now, and an app can't receive
// either, so the login page runs in a web view and we catch the redirect to http://127.0.0.1:8888/callback
// (the one spotilist already uses) before it loads.

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Message } from '../components/Message';
import { LOGIN_REQUEST_KEY, redirectUri, spotify } from '../lib/session';
import { parseRedirect, startLogin, type LoginRequest } from '../lib/spotify';
import { getState, setLive } from '../lib/store';
import { secret } from '../lib/storage';
import { requestSync } from '../lib/sync';
import { C } from '../theme';

export default function Login() {
  const [req, setReq] = useState<LoginRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const handled = useRef(false);

  useEffect(() => {
    let cancelled = false;
    startLogin(getState().settings.spotifyClientId, redirectUri())
      .then(async (r) => {
        if (cancelled) return;
        if (Platform.OS === 'web') {
          // Remembered across the trip to Spotify, for the /callback page.
          await secret.set(LOGIN_REQUEST_KEY, JSON.stringify(r));
          window.location.assign(r.url);
          return;
        }
        handled.current = false;
        setReq(r);
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setError(null);
    setReq(null);
    setBusy(false);
    setAttempt((n) => n + 1);
  };

  /** Returns true if `url` is the redirect back to us (so the web view shouldn't load it). */
  const check = (url: string): boolean => {
    if (!req) return false;
    const result = parseRedirect(url, req);
    if (!result) return false;
    if (handled.current) return true;
    handled.current = true;
    if (result.error) {
      setError(result.error === 'access_denied' ? 'You cancelled the login.' : `Spotify said: ${result.error}`);
      return true;
    }
    setBusy(true);
    spotify()
      .exchangeCode(result.code!, req)
      .then(() => {
        setLive({ loggedIn: true, sync: { running: false } });
        if (router.canGoBack()) router.back();
        else router.replace('/');
        requestSync();
      })
      .catch((e) => {
        setBusy(false);
        setError(e instanceof Error ? e.message : String(e));
      });
    return true;
  };

  if (error) {
    return (
      <Message
        title="Couldn't log in"
        text={`${error}\n\nIf it says the redirect URI is invalid, add ${redirectUri()} to your app's Redirect URIs in the Spotify developer dashboard.`}
        action={{ label: 'Try again', onPress: retry }}
      />
    );
  }

  if (Platform.OS === 'web') return <Message busy text="Opening Spotify…" />;
  if (!req || busy) return <Message busy text={busy ? 'Finishing login…' : undefined} />;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Text style={styles.hint}>
        Tip: Google blocks its sign-in inside apps. If you normally use Google, log in with your email instead (Spotify
        can email you a code).
      </Text>
      <WebView
        source={{ uri: req.url }}
        incognito
        style={{ flex: 1, backgroundColor: C.bg }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.center}>
            <ActivityIndicator color={C.green} />
          </View>
        )}
        onShouldStartLoadWithRequest={(e) => !check(e.url)}
        onNavigationStateChange={(e) => check(e.url)}
        onError={(e) => {
          if (!check(e.nativeEvent.url)) setError(e.nativeEvent.description || 'The login page failed to load.');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  hint: { color: C.sub, fontSize: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.card },
});
