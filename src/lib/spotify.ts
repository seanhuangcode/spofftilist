// Minimal Spotify Web API client with PKCE login (no client secret needed). Ported from spotilist.
// Uses the endpoint names from Spotify's February 2026 changes (/me/playlists, /playlists/{id}/items).

import * as Crypto from 'expo-crypto';

import { secret } from './storage';

const API = 'https://api.spotify.com/v1';
const ACCOUNTS = 'https://accounts.spotify.com';
const TOKEN_KEY = 'spotify_token';
const TIMEOUT_MS = 20000;

export const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-read-private', // lets search use your country, so picks are playable for you
  'user-read-recently-played', // what you've been listening to = seeds for new picks
  'user-top-read',
  'user-read-currently-playing', // online: jump to the card of the inbox song you're playing
];

export type Track = {
  uri: string;
  id: string;
  name: string;
  artists: { name: string; id?: string }[];
  album: { name: string; images: { url: string; width?: number | null; height?: number | null }[] };
  duration_ms: number;
  is_playable?: boolean;
};

export type Playlist = { id: string; name: string };

type Token = { access_token: string; refresh_token: string; expires_at: number; scope: string };

export class SpotifyError extends Error {
  constructor(public status: number, message: string) {
    super(`Spotify ${status}: ${message}`);
  }
}

/** The saved login is gone or expired; the person has to log in again. */
export class LoginNeededError extends Error {
  constructor(message = 'Spotify login expired. Log in again.') {
    super(message);
  }
}

const qs = (params: Record<string, string | number | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------- login (PKCE) ----------

const VERIFIER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

function randomString(length: number): string {
  return Array.from(Crypto.getRandomBytes(length), (b) => VERIFIER_CHARS[b % VERIFIER_CHARS.length]).join('');
}

export type LoginRequest = { url: string; verifier: string; state: string; redirectUri: string };

export async function startLogin(clientId: string, redirectUri: string): Promise<LoginRequest> {
  const verifier = randomString(96);
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  const challenge = digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const state = randomString(16);
  const url = `${ACCOUNTS}/authorize?${qs({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES.join(' '),
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    show_dialog: 'true',
  })}`;
  return { url, verifier, state, redirectUri };
}

/** If `url` is Spotify sending us back to the redirect URI, pull out the code (or error). */
export function parseRedirect(url: string, req: LoginRequest): { code?: string; error?: string } | null {
  if (!url.startsWith(req.redirectUri)) return null;
  const query = url.split('?')[1]?.split('#')[0] ?? '';
  const params: Record<string, string> = {};
  for (const part of query.split('&')) {
    const [k, v = ''] = part.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  if (params.error) return { error: params.error };
  if (params.state !== req.state) return { error: 'state mismatch' };
  return params.code ? { code: params.code } : { error: 'no code in redirect' };
}

// ---------- API client ----------

export class Spotify {
  private token: Token | null = null;
  private refreshing: Promise<void> | null = null;
  private searchMarket: string | null = 'from_token';
  private meCache: { id: string; display_name?: string } | null = null;

  constructor(public clientId: string) {}

  async load(): Promise<boolean> {
    const raw = await secret.get(TOKEN_KEY);
    this.token = raw ? JSON.parse(raw) : null;
    return this.loggedIn;
  }

  get loggedIn(): boolean {
    return !!this.token?.refresh_token;
  }

  /** False when Spofftilist has started asking for a permission the saved login doesn't have. */
  get hasAllScopes(): boolean {
    const have = new Set((this.token?.scope ?? '').split(' '));
    return SCOPES.every((s) => have.has(s));
  }

  async logout(): Promise<void> {
    this.token = null;
    this.meCache = null;
    await secret.remove(TOKEN_KEY);
  }

  private async saveToken(tok: any): Promise<void> {
    const old = this.token;
    this.token = {
      access_token: tok.access_token,
      refresh_token: tok.refresh_token ?? old?.refresh_token,
      scope: tok.scope ?? old?.scope ?? '',
      expires_at: Date.now() + ((tok.expires_in ?? 3600) - 60) * 1000,
    };
    await secret.set(TOKEN_KEY, JSON.stringify(this.token));
  }

  private async tokenRequest(body: Record<string, string>): Promise<any> {
    const r = await fetchWithTimeout(`${ACCOUNTS}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: qs(body),
    });
    const data = await r.json().catch(() => ({}));
    if (r.status !== 200) {
      const msg = data.error_description || data.error || `HTTP ${r.status}`;
      // 400 = the refresh token was revoked or expired (they last ~6 months), so log in again.
      if (r.status === 400 || r.status === 401) throw new LoginNeededError(`Spotify login failed: ${msg}`);
      throw new SpotifyError(r.status, msg);
    }
    return data;
  }

  async exchangeCode(code: string, req: LoginRequest): Promise<void> {
    const tok = await this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: req.redirectUri,
      client_id: this.clientId,
      code_verifier: req.verifier,
    });
    this.meCache = null;
    await this.saveToken(tok);
  }

  /** The saved login, for moving it to another device (see session.ts). */
  get refreshToken(): string | null {
    return this.token?.refresh_token ?? null;
  }

  /** Log in with a login moved over from another device. Throws if Spotify doesn't accept it. */
  async useRefreshToken(refreshToken: string): Promise<void> {
    const previous = this.token;
    this.token = { access_token: '', refresh_token: refreshToken, scope: SCOPES.join(' '), expires_at: 0 };
    this.meCache = null;
    try {
      await this.ensureToken();
      await this.me();
    } catch (e) {
      this.token = previous;
      throw e;
    }
  }

  private async ensureToken(): Promise<void> {
    if (!this.token) throw new LoginNeededError('Not logged in to Spotify.');
    if (Date.now() < this.token.expires_at) return;
    if (!this.refreshing) {
      const refreshToken = this.token.refresh_token;
      this.refreshing = this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: this.clientId })
        .then((tok) => this.saveToken(tok))
        .finally(() => {
          this.refreshing = null;
        });
    }
    await this.refreshing;
  }

  async call(method: string, path: string, opts: { params?: Record<string, any>; body?: any } = {}, retry = true): Promise<any> {
    await this.ensureToken();
    const query = opts.params ? `?${qs(opts.params)}` : '';
    const r = await fetchWithTimeout(`${API}${path}${query}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token!.access_token}`,
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (r.status === 429 && retry) {
      const wait = Math.min(Number(r.headers.get('Retry-After') ?? '5') || 5, 60);
      await new Promise((res) => setTimeout(res, wait * 1000));
      return this.call(method, path, opts, false);
    }
    if (r.status === 401 && retry) {
      this.token!.expires_at = 0;
      return this.call(method, path, opts, false);
    }
    const text = await r.text();
    if (r.status >= 400) {
      let msg = text;
      try {
        msg = JSON.parse(text).error.message;
      } catch {}
      throw new SpotifyError(r.status, msg || `HTTP ${r.status}`);
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null; // some endpoints answer with plain text instead of JSON
    }
  }

  // ---------- endpoints ----------

  async me(): Promise<{ id: string; display_name?: string }> {
    if (!this.meCache) this.meCache = await this.call('GET', '/me');
    return this.meCache!;
  }

  async recentlyPlayed(limit = 50): Promise<Track[]> {
    const data = await this.call('GET', '/me/player/recently-played', { params: { limit } });
    return (data?.items ?? []).map((i: any) => i.track).filter(Boolean);
  }

  async topTracks(timeRange: 'short_term' | 'medium_term' | 'long_term', limit = 30): Promise<Track[]> {
    const data = await this.call('GET', '/me/top/tracks', { params: { time_range: timeRange, limit } });
    return (data?.items ?? []).filter(Boolean);
  }

  /** The playing track, or null (nothing playing, ad, podcast...). */
  async currentlyPlaying(): Promise<Track | null> {
    const data = await this.call('GET', '/me/player/currently-playing', { params: { market: 'from_token' } });
    if (!data || data.currently_playing_type !== 'track' || !data.item) return null;
    return data.item;
  }

  async searchTracks(q: string, limit = 5): Promise<Track[]> {
    const params = { q, type: 'track', limit };
    if (this.searchMarket) {
      try {
        const data = await this.call('GET', '/search', { params: { ...params, market: this.searchMarket } });
        return data?.tracks?.items ?? [];
      } catch (e) {
        if (!(e instanceof SpotifyError) || e.status !== 403) throw e;
        this.searchMarket = null; // Spotify won't share your country; search without it
      }
    }
    const data = await this.call('GET', '/search', { params });
    return data?.tracks?.items ?? [];
  }

  /** Playlists you can add songs to (ones you own or collaborate on). */
  async myPlaylists(): Promise<Playlist[]> {
    const myId = (await this.me()).id;
    const out: Playlist[] = [];
    for (let offset = 0; ; offset += 50) {
      const page = await this.call('GET', '/me/playlists', { params: { limit: 50, offset } });
      for (const p of page?.items ?? []) {
        if (p && (p.owner?.id === myId || p.collaborative)) out.push({ id: p.id, name: p.name });
      }
      if (!page?.next) return out;
    }
  }

  async createPlaylist(name: string, description: string): Promise<Playlist> {
    const p = await this.call('POST', '/me/playlists', { body: { name, public: false, description } });
    return { id: p.id, name: p.name };
  }

  async playlistTracks(playlistId: string, maxItems = 3000): Promise<Track[]> {
    const out: Track[] = [];
    for (let offset = 0; offset < maxItems; offset += 50) {
      const page = await this.call('GET', `/playlists/${playlistId}/items`, { params: { limit: 50, offset } });
      for (const entry of page?.items ?? []) {
        const song = entry?.item ?? entry?.track; // "track" before Feb 2026
        if (song?.uri?.startsWith('spotify:track:')) out.push(song);
      }
      if (!page?.next) break;
    }
    return out;
  }

  async addToPlaylist(playlistId: string, uris: string[]): Promise<void> {
    for (let i = 0; i < uris.length; i += 100) {
      await this.call('POST', `/playlists/${playlistId}/items`, { body: { uris: uris.slice(i, i + 100) } });
    }
  }

  async removeFromPlaylist(playlistId: string, uris: string[]): Promise<void> {
    for (let i = 0; i < uris.length; i += 100) {
      const items = uris.slice(i, i + 100).map((uri) => ({ uri }));
      await this.call('DELETE', `/playlists/${playlistId}/items`, { body: { items } });
    }
  }
}
