import { Platform } from 'react-native';

/**
 * True in Safari on iOS older than 16.4. Spotify's login page uses JavaScript (class static blocks) that
 * those versions can't run, so it shows a blank white page there.
 */
export function spotifyLoginBroken(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const m = navigator.userAgent.match(/(?:iPhone|iPad|iPod).*? OS (\d+)_(\d+)/);
  if (!m) return false;
  const [major, minor] = [Number(m[1]), Number(m[2])];
  return major < 16 || (major === 16 && minor < 4);
}
