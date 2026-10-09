# Spofftilist

By **Sean Huang** ([@seanhuangcode](https://github.com/seanhuangcode))

Spofftilist is the phone version of [Vibe Queue (spotilist)](../spotilist), built for when you're offline.
It picks new songs that sound like what you play and puts them in a playlist that Spotify downloads.
You go through them offline: tap **Keep** to pick a playlist, or **Nah** to get rid of the song.

- **Online:** it finds songs like the ones you've been playing, using the same Last.fm approach as spotilist.
  It adds them to a **Spofftilist Inbox** playlist on Spotify, and the Spotify app downloads them.
- **Offline:** play the inbox in Spotify. Spofftilist shows a card for each song with **Keep** and **Nah**.
  Your choices are saved on the phone.
- **Back online:** it syncs on its own. Kept songs go into the playlist you picked, and Nah songs leave the
  inbox, so Spotify deletes the download. Then it tops the inbox back up with new picks.

It never suggests the same song twice. It favors artists other than the one each pick is based on, and it
stops picking artists you said Nah to twice. Songs you keep become the main seeds for later picks.

## Why the songs play in Spotify, not in Spofftilist

Spotify doesn't let other apps download or play its songs offline. Downloaded songs are locked inside the
Spotify app. So Spofftilist picks the songs and organizes them, and Spotify downloads and plays them.

## Use it on your iPhone

Spofftilist runs as a web app, so it works on iOS 15. It's hosted on GitHub Pages at
**https://seanhuangcode.github.io/spofftilist/**.

1. Open that link in **Safari** on your iPhone.
2. Tap **Share → Add to Home Screen**, then open Spofftilist from its new icon.
3. Tap **Log in with Spotify**. Google sign-in works here too.
4. After the first sync, tap **Open** on the tip, and turn on **Download** for **Spofftilist Inbox** in Spotify.
   From then on, Spotify downloads new picks whenever it's open and online.

To test offline mode, turn on airplane mode, go through a few songs, then turn it off and watch it sync.
The app keeps itself and the album covers on your phone, so it opens without internet.

You'll need **Spotify Premium** for the downloads. The Spotify app's dashboard needs this Redirect URI:
`https://seanhuangcode.github.io/spofftilist/callback`

### Updating the site

```bash
npm run build:web
```

This writes the site to `dist/`. Then push `dist/` to the `gh-pages` branch. The build fails if the code
uses JavaScript that iOS 15's Safari can't run.

To try the web build on this computer, at http://127.0.0.1:8888 (Spotify login works there too):

```bash
SPOFFTILIST_BASE_URL= npm run build:web && npm run serve:web
```

### Running it in Expo Go instead (iOS 16.4 or newer, or Android)

```bash
npx expo start
```

Then scan the QR code with Expo Go. There, Spotify login runs inside the app.

## Setup details

Spofftilist uses the same keys as spotilist. They're copied into `.env.local`, which git ignores, and
built into the app. Neither one gives access to your accounts. The Spotify Client ID is meant to be
public, and the Last.fm API key only identifies the app:

```
EXPO_PUBLIC_SPOTIFY_CLIENT_ID=...
EXPO_PUBLIC_LASTFM_API_KEY=...
EXPO_PUBLIC_SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback
```

You can also type them on the welcome screen or in Settings.

On the web, Spotify sends you back to the site's `/callback` page. In Expo Go, the login runs inside the
app, and the app catches Spotify's redirect to `http://127.0.0.1:8888/callback` itself. That's the
Redirect URI spotilist already uses. Spotify only accepts `https://` or `http://127.0.0.1` redirects now.

Your Spotify app is in Development Mode, so only accounts listed under **User Management** in the
[Spotify dashboard](https://developer.spotify.com/dashboard) can log in. Your own account already can.

## Settings

- **Songs to keep ready:** 10, 25 (default) or 50. That's roughly 3 MB of Spotify downloads per song.
- **Playlist suggested when you tap Keep:** "Vibe Finds" by default. It's created the first time you keep a song in it.
- **Waiting to sync:** every Keep/Nah that hasn't reached Spotify yet, each with an Undo.

## Code map

| File | What it does |
| --- | --- |
| `src/app/index.tsx` | The inbox: one card per song with Keep / Nah |
| `src/app/login.tsx`, `callback.tsx` | Spotify login (PKCE): a redirect on the web, a web view in Expo Go |
| `scripts/build-web.mjs` | Web build: offline service worker, Home Screen support, iOS 15 check |
| `src/lib/sync.ts` | Online sync: apply decisions, refill the inbox, save covers |
| `src/lib/recommender.ts` | Song picking, ported from spotilist's `recommender.py` |
| `src/lib/spotify.ts`, `lastfm.ts` | API clients, ported from spotilist |
| `src/lib/store.ts` | App state, saved on the phone so it all works offline |
