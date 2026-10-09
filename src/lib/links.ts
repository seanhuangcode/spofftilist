import { Linking } from 'react-native';

/** Open a song or playlist in the Spotify app (works offline too), or on the web if it isn't installed. */
export async function openInSpotify(kind: 'track' | 'playlist', id: string): Promise<void> {
  try {
    await Linking.openURL(`spotify:${kind}:${id}`);
  } catch {
    await Linking.openURL(`https://open.spotify.com/${kind}/${id}`);
  }
}

export { duration, timeAgo } from './format';
