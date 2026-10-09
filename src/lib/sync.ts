// What happens when the phone is online:
//   1. your Keep/Nah decisions go to Spotify (kept songs into your playlists, all of them out of the inbox,
//      which makes the Spotify app delete its download of the ones you said Nah to)
//   2. the inbox is topped back up with new picks, which the Spotify app downloads for offline
//   3. covers are saved on the phone so the cards still look right offline

import { MAX_PER_ARTIST, History, Recommender, type Seed } from './recommender';
import { lastfm, spotify } from './session';
import { LoginNeededError, SpotifyError, type Playlist, type Spotify, type Track } from './spotify';
import {
  HISTORY_LIMIT,
  describe,
  getLive,
  getState,
  setLive,
  setState,
  songFromTrack,
  type Decision,
  type Song,
} from './store';
import { artUri, cacheArt, pruneArt } from './storage';
import { norm, songKey, weightedShuffle } from './text';

let running: Promise<void> | null = null;
let again = false;

/** Start a sync, or if one is running, run another right after it (so nothing is missed). */
export function requestSync(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await runSync();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

let soonTimer: ReturnType<typeof setTimeout> | null = null;

/** After a Keep/Nah while online: sync in a few seconds (so a quick Undo doesn't hit Spotify). */
export function syncSoon(): void {
  if (soonTimer) clearTimeout(soonTimer);
  soonTimer = setTimeout(() => {
    soonTimer = null;
    if (getLive().online) requestSync();
  }, 6000);
}

/** Sync if it's been a while (app opened, came back to the foreground). */
export function syncIfStale(maxAgeMs = 60_000): void {
  const { lastSyncAt } = getState();
  if (!lastSyncAt || Date.now() - lastSyncAt > maxAgeMs) requestSync();
}

function step(text: string, done?: number, total?: number) {
  setLive({ sync: { running: true, step: text, done, total } });
}

async function runSync(): Promise<void> {
  if (!getLive().loggedIn || !getLive().online) return;
  const sp = spotify();
  if (!sp.hasAllScopes) {
    setLive({ sync: { running: false, needsLogin: true, error: 'Spofftilist needs a new Spotify permission. Log in again.' } });
    return;
  }
  try {
    step('Connecting to Spotify');
    const me = await sp.me();
    setState((s) => ({ ...s, account: { id: me.id, name: me.display_name || me.id } }));

    step('Loading your playlists');
    const playlists = await sp.myPlaylists();
    const inboxId = await ensureInbox(sp, playlists);

    await applyDecisions(sp, inboxId, playlists);

    step('Checking your inbox');
    const remote = dedupe(await sp.playlistTracks(inboxId));
    setState((s) => {
      const old = new Map(s.inbox.map((song) => [song.uri, song]));
      return { ...s, inbox: remote.map((t) => songFromTrack(t, old.get(t.uri)?.seed)), playlists: [...playlists] };
    });

    const st = getState();
    const pending = new Set(st.decisions.map((d) => d.song.uri));
    const need = st.settings.inboxSize - st.inbox.filter((song) => !pending.has(song.uri)).length;
    if (need > 0) await refill(sp, inboxId, need);

    await cacheCovers();
    setState((s) => ({ ...s, lastSyncAt: Date.now() }));
    setLive({ sync: { running: false } });
  } catch (e) {
    console.warn('Sync failed', e);
    setLive({ sync: { running: false, error: friendly(e), needsLogin: e instanceof LoginNeededError } });
  }
}

async function ensureInbox(sp: Spotify, playlists: Playlist[]): Promise<string> {
  const { inboxId, settings } = getState();
  let inbox =
    playlists.find((p) => p.id === inboxId) ?? playlists.find((p) => p.name === settings.inboxName);
  if (!inbox) {
    step('Creating your inbox playlist');
    inbox = await sp.createPlaylist(
      settings.inboxName,
      'Fresh picks from Spofftilist. Turn on Download so they play offline.',
    );
    playlists.unshift(inbox);
  }
  const id = inbox.id;
  setState((s) => ({ ...s, inboxId: id }));
  return id;
}

async function applyDecisions(sp: Spotify, inboxId: string, playlists: Playlist[]): Promise<void> {
  const todo = [...getState().decisions];
  const contents = new Map<string, Set<string>>(); // playlist id -> song URIs, loaded when needed
  for (let i = 0; i < todo.length; i++) {
    const d = todo[i];
    step('Saving your picks to Spotify', i + 1, todo.length);
    let target: Playlist | undefined;
    if (d.action === 'keep' && d.playlist) {
      const choice = d.playlist;
      target = playlists.find((p) => p.id === choice.id) ?? playlists.find((p) => p.name === choice.name);
      if (!target) {
        target = await sp.createPlaylist(choice.name, 'Songs kept from Spofftilist');
        playlists.unshift(target);
      }
      if (!contents.has(target.id)) {
        contents.set(target.id, new Set((await sp.playlistTracks(target.id)).map((t) => t.uri)));
      }
      const has = contents.get(target.id)!;
      if (!has.has(d.song.uri)) {
        await sp.addToPlaylist(target.id, [d.song.uri]);
        has.add(d.song.uri);
      }
    }
    await sp.removeFromPlaylist(inboxId, [d.song.uri]);
    markApplied(d, target, playlists);
  }
}

/** One decision is on Spotify now: drop it from the queue and learn from it. */
function markApplied(d: Decision, target: Playlist | undefined, playlists: Playlist[]) {
  setState((s) => {
    const nahArtists = { ...s.nahArtists };
    if (d.action === 'nah') for (const a of d.song.artists) nahArtists[norm(a)] = (nahArtists[norm(a)] ?? 0) + 1;
    const lastPlaylist =
      target && s.lastPlaylist && !s.lastPlaylist.id && s.lastPlaylist.name === target.name
        ? { id: target.id, name: target.name }
        : s.lastPlaylist;
    return {
      ...s,
      decisions: s.decisions.filter((x) => !(x.at === d.at && x.song.uri === d.song.uri)),
      inbox: s.inbox.filter((song) => song.uri !== d.song.uri),
      kept: d.action === 'keep' ? [d.song, ...s.kept.filter((k) => k.uri !== d.song.uri)].slice(0, 100) : s.kept,
      nahArtists,
      lastPlaylist,
      playlists: [...playlists],
      stats: {
        kept: s.stats.kept + (d.action === 'keep' ? 1 : 0),
        nah: s.stats.nah + (d.action === 'nah' ? 1 : 0),
      },
    };
  });
}

async function refill(sp: Spotify, inboxId: string, need: number): Promise<void> {
  step('Picking songs you might like', 0, need);
  const st = getState();
  const history = new History(st.seenUris, st.seenKeys);
  for (const song of st.inbox) history.add(song);

  // Seeds: songs you kept count most, then what you've been playing on Spotify lately.
  const [recent, top] = await Promise.all([
    sp.recentlyPlayed(50).catch(rethrowLogin),
    sp.topTracks('short_term', 30).catch(rethrowLogin),
  ]);
  const seeds = new Map<string, Seed>();
  const addSeed = (name: string, artists: string[], weight: number, uri?: string) => {
    const key = songKey(name, artists[0] ?? '');
    const existing = seeds.get(key);
    if (existing) existing.weight += weight;
    else seeds.set(key, { name, artists, uri, weight });
  };
  for (const k of st.kept.slice(0, 40)) addSeed(k.name, k.artists, 3, k.uri);
  for (const t of top) addSeed(t.name, t.artists.map((a) => a.name), 1.5, t.uri);
  for (const t of recent) addSeed(t.name, t.artists.map((a) => a.name), 1, t.uri);
  for (const t of [...recent, ...top]) history.add(t); // you already know these
  if (!seeds.size) {
    for (const t of await sp.topTracks('medium_term', 30).catch(rethrowLogin)) addSeed(t.name, t.artists.map((a) => a.name), 1, t.uri);
  }
  if (!seeds.size) {
    for (const t of await lastfm().chartTopTracks(30)) addSeed(t.title, [t.artist], 1);
  }

  const nah = st.nahArtists;
  const rec = new Recommender(sp, lastfm(), history, (artist) => (nah[artist] ?? 0) >= 2);
  for (const song of st.inbox) {
    for (const a of song.artists) rec.artistCount.set(norm(a), Math.min(MAX_PER_ARTIST, (rec.artistCount.get(norm(a)) ?? 0) + 1));
  }

  const order = weightedShuffle([...seeds.values()], (s) => s.weight);
  let added = 0;
  let batch: Song[] = [];
  let failures = 0;
  const flush = async () => {
    if (!batch.length) return;
    const songs = batch;
    batch = [];
    await sp.addToPlaylist(inboxId, songs.map((s) => s.uri));
    setState((s) => ({
      ...s,
      inbox: [...s.inbox, ...songs.filter((song) => !s.inbox.some((x) => x.uri === song.uri))],
      seenUris: [...history.uris].slice(-HISTORY_LIMIT),
      seenKeys: [...history.keys].slice(-HISTORY_LIMIT),
    }));
  };

  // Go round the seeds (best first), up to 2 picks from each per round, until the inbox is full.
  // A seed with nothing new left drops out of the rotation.
  const active = [...order];
  let i = 0;
  for (let round = 0; added + batch.length < need && active.length && round < need * 4; round++) {
    i %= active.length;
    const seed = active[i];
    try {
      const want = Math.min(2, need - added - batch.length);
      const got = await rec.picksFor(seed, want);
      for (const t of got) batch.push(songFromTrack(t, describe(seed)));
      if (got.length) i++;
      else active.splice(i, 1);
    } catch (e) {
      rethrowLogin(e);
      active.splice(i, 1);
      if (++failures > 6) throw e;
    }
    step('Picking songs you might like', added + batch.length, need);
    if (batch.length >= 5) {
      added += batch.length;
      await flush();
    }
  }
  added += batch.length;
  await flush();
  setState((s) => ({
    ...s,
    seenUris: [...history.uris].slice(-HISTORY_LIMIT),
    seenKeys: [...history.keys].slice(-HISTORY_LIMIT),
  }));
}

async function cacheCovers(): Promise<void> {
  const st = getState();
  const missing = st.inbox.filter((s) => s.image && !artUri(s.id));
  for (let i = 0; i < missing.length; i++) {
    step('Saving covers for offline', i + 1, missing.length);
    try {
      await cacheArt(missing[i].id, missing[i].image!);
    } catch (e) {
      console.warn('Cover download failed', e);
    }
  }
  const keep = [...st.inbox, ...st.decisions.map((d) => d.song)];
  pruneArt(new Map(keep.map((s) => [s.id, s.image])));
}

function dedupe(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter((t) => !seen.has(t.uri) && seen.add(t.uri));
}

function rethrowLogin(e: unknown): never | [] {
  if (e instanceof LoginNeededError) throw e;
  if (e instanceof SpotifyError && e.status === 401) throw e;
  return [];
}

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof Error && (e.name === 'AbortError' || /network request failed|failed to fetch/i.test(msg))) {
    return "Couldn't reach Spotify. Check your connection and try again.";
  }
  if (e instanceof SpotifyError && e.status === 403 && /registered|allowlist|user may not/i.test(msg)) {
    return 'This Spotify account is not allowed to use your Spotify app yet. Add it under User Management in the Spotify developer dashboard.';
  }
  return msg;
}
