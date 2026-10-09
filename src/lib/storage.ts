// On-device storage: app state as a JSON file, the Spotify login in the keychain/keystore,
// and album art cached as files so the song cards still have pictures offline.

import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

const stateFile = () => new File(Paths.document, 'state.json');
const artDir = () => new Directory(Paths.document, 'art');

export async function loadStateJson(): Promise<string | null> {
  const f = stateFile();
  return f.exists ? f.text() : null;
}

export function saveStateJson(json: string): void {
  const f = stateFile();
  if (!f.exists) f.create();
  f.write(json);
}

export const secret = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};

/** Local file URI for a song's cover, or null if it isn't downloaded. */
export function artUri(trackId: string): string | null {
  const f = new File(artDir(), `${trackId}.jpg`);
  return f.exists ? f.uri : null;
}

export async function cacheArt(trackId: string, url: string): Promise<void> {
  const dir = artDir();
  dir.create({ idempotent: true, intermediates: true });
  const f = new File(dir, `${trackId}.jpg`);
  if (!f.exists) await File.downloadFileAsync(url, f, { idempotent: true });
}

/** Delete covers for songs that are no longer on any card. `keep` is track id -> cover URL. */
export function pruneArt(keep: Map<string, string | undefined>): void {
  const dir = artDir();
  if (!dir.exists) return;
  for (const entry of dir.list()) {
    if (entry instanceof File && !keep.has(entry.name.replace(/\.jpg$/, ''))) entry.delete();
  }
}

export function clearAllFiles(): void {
  const dir = artDir();
  if (dir.exists) dir.delete();
  const f = stateFile();
  if (f.exists) f.delete();
}
