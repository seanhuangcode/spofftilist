// Web version of storage.ts: state and login in localStorage, covers in the Cache Storage that the
// service worker (sw.js) reads from, so the cards keep their pictures offline.

const ls = () => (typeof localStorage === 'undefined' ? null : localStorage);

export async function loadStateJson(): Promise<string | null> {
  return ls()?.getItem('spofftilist:state') ?? null;
}

export function saveStateJson(json: string): void {
  ls()?.setItem('spofftilist:state', json);
}

export const secret = {
  get: async (key: string) => ls()?.getItem(`spofftilist:secret:${key}`) ?? null,
  set: async (key: string, value: string) => ls()?.setItem(`spofftilist:secret:${key}`, value),
  remove: async (key: string) => ls()?.removeItem(`spofftilist:secret:${key}`),
};

const COVERS = 'spofftilist-covers'; // same name as in scripts/build-web.mjs

/** The page always uses the online URL; offline, the service worker answers it from the cache. */
export function artUri(_trackId: string): string | null {
  return null;
}

export async function cacheArt(_trackId: string, url: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  const cache = await caches.open(COVERS);
  if (await cache.match(url)) return;
  const res = await fetch(url, { mode: 'cors' });
  if (res.ok) await cache.put(url, res);
}

/** Delete covers for songs that are no longer on any card. `keep` is track id -> cover URL. */
export function pruneArt(keep: Map<string, string | undefined>): void {
  if (typeof caches === 'undefined') return;
  const urls = new Set(keep.values());
  caches
    .open(COVERS)
    .then(async (cache) => {
      for (const req of await cache.keys()) if (!urls.has(req.url)) await cache.delete(req);
    })
    .catch(() => {});
}

export function clearAllFiles(): void {
  ls()?.removeItem('spofftilist:state');
  if (typeof caches !== 'undefined') caches.delete(COVERS).catch(() => {});
}
