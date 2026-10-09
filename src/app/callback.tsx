// Web only: Spotify sends you here after you log in (…/callback?code=…&state=…).

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { Message } from '../components/Message';
import { LOGIN_REQUEST_KEY, spotify } from '../lib/session';
import { parseRedirect, type LoginRequest } from '../lib/spotify';
import { setLive, useStore } from '../lib/store';
import { secret } from '../lib/storage';
import { requestSync } from '../lib/sync';

export default function Callback() {
  const { live } = useStore();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Wait until saved settings are loaded, so the right Spotify client ID is used.
    if (!live.loaded || started.current) return;
    started.current = true;
    (async () => {
      const raw = await secret.get(LOGIN_REQUEST_KEY);
      const req: LoginRequest | null = raw ? JSON.parse(raw) : null;
      const result = req && typeof window !== 'undefined' ? parseRedirect(window.location.href, req) : null;
      if (!req || !result) {
        setError('This login link is out of date. Start the login again from Spofftilist.');
        return;
      }
      await secret.remove(LOGIN_REQUEST_KEY);
      if (result.error) {
        setError(result.error === 'access_denied' ? 'You cancelled the login.' : `Spotify said: ${result.error}`);
        return;
      }
      await spotify().exchangeCode(result.code!, req);
      setLive({ loggedIn: true, sync: { running: false } });
      router.replace('/');
      requestSync();
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [live.loaded]);

  if (error) {
    return <Message title="Couldn't log in" text={error} action={{ label: 'Back', onPress: () => router.replace('/') }} />;
  }
  return <Message busy text="Finishing login…" />;
}
