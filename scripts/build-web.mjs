// Builds the web app into dist/ so it can be hosted on GitHub Pages and added to an iPhone Home Screen.
//
//   npm run build:web                          -> for https://<you>.github.io/spofftilist/
//   SPOFFTILIST_BASE_URL= npm run build:web    -> served from the root, for testing on this computer
//
// On top of `expo export` it adds: a service worker (sw.js) so the app opens offline, a web manifest and
// iPhone meta tags for Add to Home Screen, a copy of the page for each route (GitHub Pages has no
// single-page-app fallback), and a check that the code runs on iOS 15's Safari.

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { checkSafari15 } from './check-safari15.mjs';

const BASE = process.env.SPOFFTILIST_BASE_URL ?? '/spofftilist';
const ROUTES = ['welcome', 'login', 'settings', 'callback']; // src/app/*.tsx besides index
const DIST = path.resolve('dist');

execSync('npx expo export --platform web --output-dir dist --clear', {
  stdio: 'inherit',
  env: { ...process.env, SPOFFTILIST_BASE_URL: BASE },
});

// ---------- index.html: iPhone Home Screen tags + service worker ----------

let html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
html = html.replace(
  /<meta name="viewport"[^>]*>/,
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
);
html = html.replace(
  '</head>',
  `<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Spofftilist">
<link rel="apple-touch-icon" href="${BASE}/icons/apple-touch-icon.png">
<link rel="manifest" href="${BASE}/manifest.json">
<style>html, body { background-color: #121212; }</style>
</head>`,
);
// Runs before the app's code: fills in what iOS 15.0–15.3 Safari is missing (a library calls
// crypto.randomUUID while starting up), and if the app still fails to start, shows the error and a
// reset button instead of a blank screen. Plain ES5 so it runs anywhere.
const BOOT = `<script>
(function () {
  function def(o, k, v) { if (o && !o[k]) Object.defineProperty(o, k, { value: v, writable: true, configurable: true }); }
  if (window.crypto && crypto.getRandomValues) {
    def(crypto, 'randomUUID', function () {
      var b = crypto.getRandomValues(new Uint8Array(16)), h = [];
      b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
      for (var i = 0; i < 16; i++) h.push((b[i] + 256).toString(16).slice(1));
      return h.slice(0, 4).join('') + '-' + h.slice(4, 6).join('') + '-' + h.slice(6, 8).join('') + '-' + h.slice(8, 10).join('') + '-' + h.slice(10).join('');
    });
  }
  function at(i) { var n = Math.trunc(i) || 0; if (n < 0) n += this.length; return n >= 0 && n < this.length ? this[n] : undefined; }
  def(Array.prototype, 'at', at); def(String.prototype, 'at', at);
  def(Array.prototype, 'findLastIndex', function (f) { for (var i = this.length - 1; i >= 0; i--) if (f(this[i], i, this)) return i; return -1; });
  def(Array.prototype, 'findLast', function (f) { var i = this.findLastIndex(f); return i < 0 ? undefined : this[i]; });
  def(Object, 'hasOwn', function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); });

  var lastError = '';
  function started() { var r = document.getElementById('root'); return r && r.childElementCount > 0; }
  function showFailure() {
    if (started() || document.getElementById('boot-error')) return;
    var d = document.createElement('div');
    d.id = 'boot-error';
    d.style.cssText = 'position:fixed;inset:0;padding:48px 24px;background:#121212;color:#fff;font:15px -apple-system,sans-serif;z-index:9;overflow:auto';
    d.innerHTML = '<h2 style="margin:0 0 12px">Spofftilist didn\\'t start</h2><p style="color:#a7a7a7">Send this to Claude:</p><pre style="white-space:pre-wrap;color:#f15e6c;font-size:13px"></pre><p style="color:#a7a7a7">' + navigator.userAgent + '</p><button style="margin-top:16px;padding:12px 20px;border:0;border-radius:99px;background:#1ed760;font-weight:700">Reset and reload</button>';
    d.querySelector('pre').textContent = lastError || 'No error message (timed out).';
    d.querySelector('button').onclick = function () {
      var jobs = [];
      if (navigator.serviceWorker) jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
      if (window.caches) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
      Promise.all(jobs).then(function () { location.reload(); }, function () { location.reload(); });
    };
    document.body.appendChild(d);
  }
  addEventListener('error', function (e) { lastError = (e.message || 'Error') + (e.filename ? '\\n' + e.filename.split('/').pop() + ':' + e.lineno : ''); setTimeout(showFailure, 1500); });
  addEventListener('unhandledrejection', function (e) { lastError = String(e.reason && (e.reason.stack || e.reason.message) || e.reason); setTimeout(showFailure, 1500); });
  setTimeout(showFailure, 12000);
})();
</script>`;
html = html.replace(/<script src="/, `${BOOT}\n<script src="`);
if (!html.includes('boot-error')) throw new Error('Could not add the startup script to index.html');

html = html.replace(
  '</body>',
  `<script>
  if ('serviceWorker' in navigator) {
    addEventListener('load', function () {
      navigator.serviceWorker.register('${BASE}/sw.js', { scope: '${BASE}/' });
    });
  }
</script>
</body>`,
);
fs.writeFileSync(path.join(DIST, 'index.html'), html);

// GitHub Pages serves /spofftilist/settings from settings.html, and anything else from 404.html.
for (const route of [...ROUTES, '404']) fs.writeFileSync(path.join(DIST, `${route}.html`), html);
fs.writeFileSync(path.join(DIST, '.nojekyll'), ''); // Expo's _expo folder would be hidden by Jekyll

fs.writeFileSync(
  path.join(DIST, 'manifest.json'),
  JSON.stringify(
    {
      name: 'Spofftilist',
      short_name: 'Spofftilist',
      description: "New songs picked for you, ready for when you're offline.",
      start_url: `${BASE}/`,
      scope: `${BASE}/`,
      display: 'standalone',
      background_color: '#121212',
      theme_color: '#121212',
      icons: [
        { src: `${BASE}/icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${BASE}/icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
      ],
    },
    null,
    2,
  ),
);

// ---------- service worker ----------

const files = listFiles(DIST)
  .map((f) => path.relative(DIST, f).split(path.sep).join('/'))
  .filter((f) => !f.startsWith('.') && f !== 'metadata.json' && !f.endsWith('.html'))
  // Only the Ionicons font is used; skip the other icon fonts Expo exports.
  .filter((f) => !f.endsWith('.ttf') || f.includes('Ionicons'))
  .concat('index.html');
const hash = createHash('sha256');
for (const f of files) hash.update(f).update(fs.readFileSync(path.join(DIST, f)));
const version = hash.digest('hex').slice(0, 12);
const precache = files.map((f) => `${BASE}/${f}`);

fs.writeFileSync(
  path.join(DIST, 'sw.js'),
  `// Generated by scripts/build-web.mjs. Keeps Spofftilist working offline.
const VERSION = ${JSON.stringify(version)};
const BASE = ${JSON.stringify(BASE)};
const APP_CACHE = 'spofftilist-app-' + VERSION;
const COVERS = 'spofftilist-covers'; // filled by src/lib/storage.web.ts during a sync
const PRECACHE = ${JSON.stringify(precache, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('spofftilist-app-') && k !== APP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameSite = url.origin === self.location.origin;

  // Opening the app: every page is the same app. Online, get the newest; offline, the saved copy.
  if (req.mode === 'navigate' && sameSite) {
    event.respondWith(
      withTimeout(fetch(req), 4000).catch(() => caches.match(BASE + '/index.html')),
    );
    return;
  }
  // The app's own code, fonts and icons: saved copy first.
  if (sameSite && url.pathname.startsWith(BASE + '/')) {
    event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
    return;
  }
  // Album covers: saved copy first, so the cards have pictures offline.
  if (req.destination === 'image') {
    event.respondWith(
      caches.open(COVERS).then((c) => c.match(req.url)).then((hit) => hit || fetch(req)),
    );
  }
  // Everything else (Spotify, Last.fm) goes straight to the network.
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
`,
);

const kb = (n) => `${Math.round(n / 1024)} KB`;
const total = files.reduce((n, f) => n + fs.statSync(path.join(DIST, f)).size, 0);
console.log(`\nService worker ${version}: ${files.length} files saved for offline (${kb(total)}).`);

// ---------- iOS 15 check ----------

const problems = files.filter((f) => f.endsWith('.js')).flatMap((f) => checkSafari15(path.join(DIST, f)));
if (problems.length) {
  console.error('\nThis build would not run on iOS 15 Safari:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('iOS 15 Safari check passed.');
console.log(`Built for ${BASE || '/'} in dist/`);

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p) : [p];
  });
}
