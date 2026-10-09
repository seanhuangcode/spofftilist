// Last.fm lookups for "sounds like this" data (Spotify removed its own recommendations API).

const API = 'https://ws.audioscrobbler.com/2.0/';

export type Similar = { title: string; artist: string; match: number };

export class LastFM {
  constructor(private apiKey: string) {}

  private async get(method: string, params: Record<string, string | number>): Promise<any> {
    const query = Object.entries({ method, api_key: this.apiKey, format: 'json', autocorrect: 1, ...params })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    const r = await fetch(`${API}?${query}`);
    let data: any;
    try {
      data = await r.json();
    } catch {
      throw new Error(`Last.fm sent an unexpected reply (HTTP ${r.status})`);
    }
    if (data?.error) {
      // Error 6 = "not found", which just means no data for this song/artist.
      if (data.error === 6) return {};
      throw new Error(`Last.fm error ${data.error}: ${data.message}`);
    }
    return data;
  }

  /** Best match first. */
  async similarTracks(artist: string, track: string, limit = 50): Promise<Similar[]> {
    const data = await this.get('track.getsimilar', { artist, track, limit });
    const tracks: any[] = data?.similartracks?.track ?? [];
    return tracks.map((t) => ({ title: t.name, artist: t.artist?.name ?? '', match: Number(t.match ?? 0) }));
  }

  async similarArtists(artist: string, limit = 20): Promise<{ name: string; match: number }[]> {
    const data = await this.get('artist.getsimilar', { artist, limit });
    const artists: any[] = data?.similarartists?.artist ?? [];
    return artists.map((a) => ({ name: a.name, match: Number(a.match ?? 0) }));
  }

  async topTracks(artist: string, limit = 10): Promise<{ title: string; artist: string }[]> {
    const data = await this.get('artist.gettoptracks', { artist, limit });
    const tracks: any[] = data?.toptracks?.track ?? [];
    return tracks.map((t) => ({ title: t.name, artist: t.artist?.name ?? artist }));
  }

  /** Fallback seeds for a brand-new Spotify account with no listening history. */
  async chartTopTracks(limit = 30): Promise<{ title: string; artist: string }[]> {
    const data = await this.get('chart.gettoptracks', { limit });
    const tracks: any[] = data?.tracks?.track ?? [];
    return tracks.map((t) => ({ title: t.name, artist: t.artist?.name ?? '' }));
  }
}
