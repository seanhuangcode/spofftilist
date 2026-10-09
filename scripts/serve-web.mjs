// Serves dist/ the way GitHub Pages does (settings -> settings.html, unknown paths -> 404.html), for
// trying the web build on this computer. Port 8888 + /callback = the Redirect URI spotilist already
// registered with Spotify, so Spotify login works locally too:
//
//   SPOFFTILIST_BASE_URL= npm run build:web && npm run serve:web   ->  http://127.0.0.1:8888

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const DIST = path.resolve('dist');
const PORT = Number(process.env.PORT ?? 8888);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
};

http
  .createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const candidates = [pathname, `${pathname}.html`, path.join(pathname, 'index.html')];
    let file = candidates.map((p) => path.join(DIST, p)).find((p) => p.startsWith(DIST) && isFile(p));
    let status = 200;
    if (!file) {
      file = path.join(DIST, '404.html');
      status = 404;
    }
    res.writeHead(status, {
      'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, '127.0.0.1', () => console.log(`Serving dist/ at http://127.0.0.1:${PORT}`));

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}
