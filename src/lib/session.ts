// The one Spotify client the app shares, and login state.

import { Platform } from 'react-native';

import { LastFM } from './lastfm';
import { LoginNeededError, Spotify } from './spotify';
import { getState, resetAll, setLive } from './store';
import { clearAllFiles } from './storage';

/** Web login: the PKCE request, saved while you're away on Spotify's login page. */
export const LOGIN_REQUEST_KEY = 'login_request';

/** Where the web app is hosted (GitHub Pages). */
export const PUBLIC_SITE = 'https://seanhuangcode.github.io/spofftilist';

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

// ---------- moving the login to a phone ----------
// Spotify's login page doesn't load on iOS 15 Safari (it uses JavaScript from Safari 16.4). So you log in on
// a computer, and that login is handed to the phone as a link (QR code) or a code to paste.

/** A link that logs Spofftilist in on whatever device opens it. */
export function loginTransferLink(): string | null {
  const token = spotify().refreshToken;
  if (!token || Platform.OS !== 'web' || typeof window === 'undefined') return null;
  // Logged in through a local copy (http://127.0.0.1:8888)? The phone still needs the public site.
  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(window.location.origin);
  const site = local ? PUBLIC_SITE : `${window.location.origin}${process.env.EXPO_BASE_URL ?? ''}`;
  return `${site}/#login=${encodeURIComponent(token)}`;
}

export function loginTransferCode(): string | null {
  return spotify().refreshToken;
}

/** Accepts the code, or the whole link, from loginTransferLink. */
export async function loginWithCode(input: string): Promise<void> {
  const text = input.trim();
  const match = text.match(/[#&]login=([^&\s]+)/);
  const token = match ? decodeURIComponent(match[1]) : text;
  if (!/^[\w.~-]{20,}$/.test(token)) throw new Error("That doesn't look like a Spofftilist login code.");
  try {
    await spotify().useRefreshToken(token);
  } catch (e) {
    throw new Error(
      e instanceof LoginNeededError
        ? 'Spotify didn’t accept that code. It may have been used already: make a new one on your computer.'
        : e instanceof Error
          ? e.message
          : String(e),
    );
  }
  setLive({ loggedIn: true, sync: { running: false } });
}

/** Web: if the page was opened from a login link (…/#login=…), log in with it and tidy up the address. */
export async function loginFromAddress(): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location.hash.includes('login=')) return false;
  const hash = window.location.hash;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  await loginWithCode(hash);
  return true;
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
