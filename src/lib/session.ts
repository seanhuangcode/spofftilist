// The one Spotify client the app shares, and login state.

import { Platform } from 'react-native';

import { LastFM } from './lastfm';
import { Spotify } from './spotify';
import { getState, resetAll, setLive } from './store';
import { clearAllFiles } from './storage';

/** Web login: the PKCE request, saved while you're away on Spotify's login page. */
export const LOGIN_REQUEST_KEY = 'login_request';

let client: Spotify | null = null;

export function spotify(): Spotify {
  const id = getState().settings.spotifyClientId;
  if (!client) client = new Spotify(id);
  client.clientId = id;
  return client;
}

/**
 * Where Spotify sends you back after logging in. On the phone app it's spotilist's loopback URI (caught
 * inside the login web view). On the web it's this site's /callback page, e.g.
 * https://seanhuangcode.github.io/spofftilist/callback, which must be listed in the Spotify dashboard.
 */
export function redirectUri(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}${process.env.EXPO_BASE_URL ?? ''}/callback`;
  }
  return getState().settings.redirectUri;
}

export function lastfm(): LastFM {
  return new LastFM(getState().settings.lastfmApiKey);
}

export async function restoreLogin(): Promise<void> {
  const loggedIn = await spotify().load();
  setLive({ loggedIn });
}

export async function logout(): Promise<void> {
  await spotify().logout();
  clearAllFiles();
  resetAll();
  setLive({ loggedIn: false, sync: { running: false }, nowPlayingUri: undefined });
}
