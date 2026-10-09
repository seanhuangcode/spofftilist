// Starts the app: loads saved state and login, watches the connection, and syncs when online.

import NetInfo from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { loginFromAddress, restoreLogin, spotify } from './session';
import { getLive, getState, loadState, setCurrent, setLive, visibleInbox } from './store';
import { requestSync, syncIfStale } from './sync';

export function useBoot(): void {
  useEffect(() => {
    let booted = false;
    (async () => {
      await loadState();
      try {
        await restoreLogin();
        await loginFromAddress(); // opened from a "move login to your phone" link
      } catch (e) {
        setLive({ sync: { running: false, error: e instanceof Error ? e.message : String(e) } });
      } finally {
        setLive({ loaded: true });
      }
      booted = true;
      if (getLive().online) requestSync();
    })();

    // In a browser NetInfo would check the internet by fetching the site root, which on GitHub Pages
    // (github.io/ rather than github.io/spofftilist/) is a 404. The browser's own online flag is enough.
    if (Platform.OS === 'web') NetInfo.configure({ reachabilityShouldRun: () => false });

    const unsubscribeNet = NetInfo.addEventListener((net) => {
      const online = !!net.isConnected && net.isInternetReachable !== false;
      const wasOnline = getLive().online;
      if (online !== wasOnline) setLive({ online });
      if (online && !wasOnline && booted) requestSync();
      if (!online) setLive({ nowPlayingUri: undefined });
    });

    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active' && booted && getLive().online) syncIfStale();
    });

    return () => {
      unsubscribeNet();
      appState.remove();
    };
  }, []);
}

/** Online only: when you're playing one of the inbox songs in Spotify, jump to its card. */
export function useNowPlaying(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = async () => {
      if (AppState.currentState !== 'active' || getLive().sync.running) return;
      try {
        const uri = (await spotify().currentlyPlaying())?.uri;
        if (cancelled || uri === getLive().nowPlayingUri) return;
        setLive({ nowPlayingUri: uri });
        if (uri && visibleInbox(getState()).some((s) => s.uri === uri)) setCurrent(uri);
      } catch {
        // offline or not allowed; the cards still work without it
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled]);
}
