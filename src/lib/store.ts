// App state: the inbox cards, your Keep/Nah decisions waiting to sync, and what Spofftilist has
// learned. Saved to a file on the phone so everything works offline.

import { useSyncExternalStore } from 'react';

import type { Playlist, Track } from './spotify';
import { loadStateJson, saveStateJson } from './storage';

export const HISTORY_LIMIT = 5000;

export type Song = {
  uri: string;
  id: string;
  name: string;
  artists: string[];
  album: string;
  image?: string; // remote cover URL; a copy is cached on the phone for offline
  durationMs: number;
  seed?: string; // "Song - Artist" it was picked from
};

export type PlaylistChoice = { id?: string; name: string }; // no id = create it when back online

export type Decision = {
  song: Song;
  action: 'keep' | 'nah';
  playlist?: PlaylistChoice;
  at: number;
};

export type Settings = {
  inboxSize: number;
  inboxName: string;
  defaultPlaylistName: string;
  spotifyClientId: string;
  lastfmApiKey: string;
  redirectUri: string;
};

export type State = {
  account?: { id: string; name: string };
  inboxId?: string;
  inbox: Song[]; // mirrors the inbox playlist on Spotify, in the same order
  decisions: Decision[]; // waiting to be synced to Spotify
  playlists: Playlist[];
  lastPlaylist?: PlaylistChoice;
  kept: Song[]; // recent keeps, used as seeds for new picks
  seenUris: string[];
  seenKeys: string[];
  nahArtists: Record<string, number>;
  currentUri?: string; // the card you're on
  settings: Settings;
  lastSyncAt?: number;
  tipDismissed?: boolean;
  stats: { kept: number; nah: number };
};

export type SyncStatus = {
  running: boolean;
  step?: string;
  done?: number;
  total?: number;
  error?: string;
  needsLogin?: boolean;
};

export type Toast = { id: number; text: string; undo?: Decision };

/** Things that aren't saved: they're worked out again every time the app starts. */
export type Live = {
  loaded: boolean;
  loggedIn: boolean;
  online: boolean;
  sync: SyncStatus;
  nowPlayingUri?: string;
  toast?: Toast;
};

export const defaultSettings = (): Settings => ({
  inboxSize: 25,
  inboxName: 'Spofftilist Inbox',
  defaultPlaylistName: 'Vibe Finds',
  spotifyClientId: process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? '',
  lastfmApiKey: process.env.EXPO_PUBLIC_LASTFM_API_KEY ?? '',
  redirectUri: process.env.EXPO_PUBLIC_SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8888/callback',
});

const defaultState = (): State => ({
  inbox: [],
  decisions: [],
  playlists: [],
  kept: [],
  seenUris: [],
  seenKeys: [],
  nahArtists: {},
  settings: defaultSettings(),
  stats: { kept: 0, nah: 0 },
});

type Snapshot = { state: State; live: Live };

let snapshot: Snapshot = {
  state: defaultState(),
  live: { loaded: false, loggedIn: false, online: false, sync: { running: false } },
};
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  for (const l of listeners) l();
}

export function getState(): State {
  return snapshot.state;
}

export function getLive(): Live {
  return snapshot.live;
}

export function setState(update: (s: State) => State): void {
  snapshot = { ...snapshot, state: update(snapshot.state) };
  emit();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      saveStateJson(JSON.stringify(snapshot.state));
    } catch (e) {
      console.warn('Could not save state', e);
    }
  }, 250);
}

export function setLive(update: Partial<Live> | ((l: Live) => Partial<Live>)): void {
  const patch = typeof update === 'function' ? update(snapshot.live) : update;
  snapshot = { ...snapshot, live: { ...snapshot.live, ...patch } };
  emit();
}

export function useStore(): Snapshot {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}

export async function loadState(): Promise<void> {
  try {
    const json = await loadStateJson();
    if (json) {
      const saved = JSON.parse(json) as Partial<State>;
      const base = defaultState();
      const settings = { ...base.settings, ...saved.settings };
      // Keys typed into the app win, but empty ones fall back to .env.local.
      for (const k of ['spotifyClientId', 'lastfmApiKey', 'redirectUri'] as const) {
        if (!settings[k]) settings[k] = base.settings[k];
      }
      snapshot = { ...snapshot, state: { ...base, ...saved, settings } };
    }
  } catch (e) {
    console.warn('Could not load saved state; starting fresh', e);
  }
  emit();
}

// ---------- derived ----------

export const pendingUris = (s: State) => new Set(s.decisions.map((d) => d.song.uri));

/** Inbox songs you haven't decided on yet: these are the cards. */
export function visibleInbox(s: State): Song[] {
  const pending = pendingUris(s);
  return s.inbox.filter((song) => !pending.has(song.uri));
}

export function currentIndex(s: State, visible = visibleInbox(s)): number {
  const i = visible.findIndex((song) => song.uri === s.currentUri);
  return i >= 0 ? i : 0;
}

/** Playlists you've picked offline that will be created on the next sync. */
export function pendingNewPlaylists(s: State): string[] {
  const names = s.decisions.filter((d) => d.playlist && !d.playlist.id).map((d) => d.playlist!.name);
  return [...new Set(names)];
}

export function describe(song: { name: string; artists: string[] }): string {
  return `${song.name} - ${song.artists.join(', ')}`;
}

export function songFromTrack(t: Track, seed?: string): Song {
  const images = t.album?.images ?? [];
  // Spotify lists images biggest first; ~300px is plenty for a phone card.
  const image = images.find((i) => (i.width ?? 0) <= 320 && (i.width ?? 0) >= 200) ?? images[0];
  return {
    uri: t.uri,
    id: t.id,
    name: t.name,
    artists: (t.artists ?? []).map((a) => a.name),
    album: t.album?.name ?? '',
    image: image?.url,
    durationMs: t.duration_ms ?? 0,
    seed,
  };
}

// ---------- actions ----------

let toastId = 0;

export function showToast(text: string, undo?: Decision): void {
  const id = ++toastId;
  setLive({ toast: { id, text, undo } });
  setTimeout(() => {
    if (snapshot.live.toast?.id === id) setLive({ toast: undefined });
  }, 6000);
}

export function setCurrent(uri: string | undefined): void {
  setState((s) => ({ ...s, currentUri: uri }));
}

/** Keep (into a playlist) or Nah. Saved on the phone; applied to Spotify on the next sync. */
export function decide(song: Song, action: 'keep' | 'nah', playlist?: PlaylistChoice): Decision {
  const decision: Decision = { song, action, playlist, at: Date.now() };
  setState((s) => {
    const visible = visibleInbox(s);
    const i = visible.findIndex((x) => x.uri === song.uri);
    const next = visible[i + 1] ?? visible[i - 1];
    return {
      ...s,
      decisions: [...s.decisions.filter((d) => d.song.uri !== song.uri), decision],
      lastPlaylist: action === 'keep' && playlist ? playlist : s.lastPlaylist,
      currentUri: next?.uri,
    };
  });
  return decision;
}

/** Take a decision back, if it hasn't been synced to Spotify yet. */
export function undo(decision: Decision): boolean {
  const pending = snapshot.state.decisions.some((d) => d.at === decision.at && d.song.uri === decision.song.uri);
  if (!pending) {
    showToast('Already saved to Spotify');
    return false;
  }
  setState((s) => ({
    ...s,
    decisions: s.decisions.filter((d) => d.at !== decision.at || d.song.uri !== decision.song.uri),
    currentUri: decision.song.uri,
  }));
  setLive({ toast: undefined });
  return true;
}

export function updateSettings(patch: Partial<Settings>): void {
  setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

/** Forget everything except the keys in Settings (used when logging out). */
export function resetAll(): void {
  setState((s) => ({ ...defaultState(), settings: s.settings }));
}
