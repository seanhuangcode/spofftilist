// Picks songs with a similar vibe to ones you like and finds them on Spotify.
// Same approach as spotilist's recommender.py: Last.fm "similar tracks", favoring artists you
// don't already have, falling back to popular songs by similar artists.

import type { LastFM, Similar } from './lastfm';
import type { Spotify, Track } from './spotify';
import { cleanTitle, norm, songKey, weightedShuffle } from './text';

const MAX_LOOKUPS_PER_SEED = 10;
export const MAX_PER_ARTIST = 2; // per batch, so a batch is a variety of artists

export type Seed = { name: string; artists: string[]; uri?: string; weight: number };

/** Songs already played or suggested, so picks are actually new to you. */
export class History {
  uris: Set<string>;
  keys: Set<string>;

  constructor(uris: string[], keys: string[]) {
    this.uris = new Set(uris);
    this.keys = new Set(keys);
  }

  seen(uri: string | null, key: string | null): boolean {
    return (uri !== null && this.uris.has(uri)) || (key !== null && this.keys.has(key));
  }

  add(t: { uri: string; name: string; artists: { name: string }[] | string[] }): void {
    const first = t.artists[0];
    const artist = typeof first === 'string' ? first : (first?.name ?? '');
    this.uris.add(t.uri);
    this.keys.add(songKey(t.name, artist));
  }
}

type Candidate = { title: string; artist: string; match?: number };

export class Recommender {
  /** Picks so far this batch, per artist, so one artist can't take over the inbox. */
  artistCount = new Map<string, number>();
  /** Songs already looked up on Spotify and not found, so a second round on a seed doesn't redo them. */
  private notOnSpotify = new Set<string>();
  private similarCache = new Map<string, Promise<Similar[]>>();
  private viaArtistsCache = new Map<string, Promise<Candidate[]>>();

  constructor(
    private sp: Spotify,
    private fm: LastFM,
    private history: History,
    private avoidArtist: (normArtist: string) => boolean,
  ) {}

  /** Up to `want` new songs that sound like `seed`. */
  async picksFor(seed: Seed, want: number): Promise<Track[]> {
    const title = seed.name;
    const artist = seed.artists[0] ?? '';
    const seedArtists = new Set(seed.artists.map(norm));

    const notSeen = (c: Candidate) => !this.history.seen(null, songKey(c.title, c.artist));
    const similar = (await this.similarTo(artist, title)).filter(notSeen);
    const newArtist = similar.filter((c) => !seedArtists.has(norm(c.artist)));

    // Prefer artists you're not already listening to; only hit Last.fm again if needed.
    const pools: (() => Promise<Candidate[]>)[] = [
      async () => ranked(newArtist),
      async () => (await this.viaSimilarArtists(artist)).filter(notSeen),
      async () => ranked(similar),
    ];

    const picks: Track[] = [];
    const tried = new Set<string>();
    let lookups = 0;
    for (const pool of pools) {
      for (const c of await pool()) {
        const key = songKey(c.title, c.artist);
        const by = norm(c.artist);
        if (tried.has(key) || this.notOnSpotify.has(key)) continue;
        if (this.avoidArtist(by) || (this.artistCount.get(by) ?? 0) >= MAX_PER_ARTIST) continue;
        tried.add(key);
        lookups++;
        const track = await this.findOnSpotify(c.title, c.artist);
        if (!track) this.notOnSpotify.add(key);
        if (track && track.uri !== seed.uri && !this.history.seen(track.uri, key)) {
          picks.push(track);
          this.history.add(track);
          for (const a of new Set(track.artists.map((x) => norm(x.name)))) {
            this.artistCount.set(a, (this.artistCount.get(a) ?? 0) + 1);
          }
          if (picks.length >= want) return picks;
        }
        if (lookups >= MAX_LOOKUPS_PER_SEED) return picks;
      }
    }
    return picks;
  }

  /** Last.fm's similar songs, fetched once per seed per batch. */
  private similarTo(artist: string, title: string): Promise<Similar[]> {
    const key = songKey(title, artist);
    let p = this.similarCache.get(key);
    if (!p) {
      p = (async () => {
        const similar = await this.fm.similarTracks(artist, cleanTitle(title));
        if (similar.length || cleanTitle(title) === title) return similar;
        return this.fm.similarTracks(artist, title);
      })();
      p.catch(() => this.similarCache.delete(key));
      this.similarCache.set(key, p);
    }
    return p;
  }

  /** Fallback when Last.fm has no similar-song data: popular songs by similar artists. */
  private viaSimilarArtists(artist: string): Promise<Candidate[]> {
    const key = norm(artist);
    let p = this.viaArtistsCache.get(key);
    if (!p) {
      p = (async () => {
        const artists = weightedShuffle((await this.fm.similarArtists(artist)).slice(0, 15), (a) => a.match + 0.05);
        const out: Candidate[] = [];
        for (const a of artists.slice(0, 3)) {
          out.push(...weightedShuffle(await this.fm.topTracks(a.name), () => 1).slice(0, 4));
        }
        return out;
      })();
      p.catch(() => this.viaArtistsCache.delete(key));
      this.viaArtistsCache.set(key, p);
    }
    return p;
  }

  async findOnSpotify(title: string, artist: string): Promise<Track | null> {
    const wantTitle = norm(cleanTitle(title));
    const wantArtist = norm(artist);
    const queries = [`track:"${cleanTitle(title)}" artist:"${artist}"`, `${cleanTitle(title)} ${artist}`];
    for (const q of queries) {
      for (const t of await this.sp.searchTracks(q, 5)) {
        if (t.is_playable === false) continue;
        if (!t.artists.some((a) => norm(a.name) === wantArtist)) continue;
        const gotTitle = norm(cleanTitle(t.name));
        if (
          gotTitle === wantTitle ||
          (gotTitle && wantTitle && (gotTitle.startsWith(wantTitle) || wantTitle.startsWith(gotTitle)))
        ) {
          return t;
        }
      }
    }
    return null;
  }
}

/** (title, artist, match) from track.getSimilar: the top 20, shuffled so better matches tend to come first. */
function ranked(pool: Similar[]): Candidate[] {
  const top = [...pool].sort((a, b) => b.match - a.match).slice(0, 20);
  return weightedShuffle(top, (c) => c.match + 0.05);
}
