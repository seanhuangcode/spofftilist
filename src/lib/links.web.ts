// Web version of links.ts. Safari asks "Open in Spotify?" for spotify: links, which also works offline
// and from a Home Screen web app (where opening a new tab doesn't).

export async function openInSpotify(kind: 'track' | 'playlist', id: string): Promise<void> {
  window.location.href = `spotify:${kind}:${id}`;
}

export { duration, timeAgo } from './format';
