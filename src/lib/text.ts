// Name matching helpers, ported from spotilist's recommender.py so Last.fm and Spotify agree on names.

// ASCII punctuation and common Unicode punctuation (Python's [^\w ] for the scripts we care about).
const PUNCT = /[\u0000-\u001F!-/:-@[-^`{-\u007F -⁯　-〿！-／]+/g;
const COMBINING = /[̀-ͯ]/g;

/** 'Song (feat. X) - Remastered 2011' -> 'Song' */
export function cleanTitle(title: string): string {
  let t = title.replace(/\s+-\s+.*$/, '');
  t = t.replace(/\s*[(\[][^)\]]*(feat\.|ft\.|with |remaster|version|edit|live)[^)\]]*[)\]]/gi, '');
  return t.trim() || title;
}

export function norm(s: string): string {
  let out = typeof s.normalize === 'function' ? s.normalize('NFKD') : s;
  out = out.replace(COMBINING, '').toLowerCase();
  out = out.replace(PUNCT, ' ');
  out = out.trim().replace(/^the\s+/, '');
  return out.replace(/\s+/g, ' ').trim();
}

export function songKey(title: string, artist: string): string {
  return `${norm(artist)}|${norm(cleanTitle(title))}`;
}

/** Better matches tend to come first, but not always, so you don't get the same picks every time. */
export function weightedShuffle<T>(items: T[], weight: (it: T) => number): T[] {
  return items
    .map((it) => ({ it, k: Math.random() ** (1 / Math.max(weight(it), 0.01)) }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.it);
}

export function truncate(text: string, n: number): string {
  return text.length <= n ? text : text.slice(0, n - 1).trimEnd() + '…';
}
