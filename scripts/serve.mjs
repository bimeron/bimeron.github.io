// Serves a built site locally, the way GitHub Pages does: `/path/` maps to `/path/index.html`
// and unknown paths get `404.html`.
//
// Usage: node scripts/serve.mjs [site dir] [port]

import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '_site');
const port = Number(process.argv[3] ?? 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

async function find(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const file = path.join(root, decoded.endsWith('/') ? `${decoded}index.html` : decoded);
  if (!file.startsWith(root)) return null;
  try {
    const stat = await fs.stat(file);
    if (stat.isFile()) return file;
    if (stat.isDirectory()) return find(`${decoded}/`);
  } catch {
    return null;
  }
  return null;
}

http
  .createServer(async (request, response) => {
    const { pathname } = new URL(request.url, 'http://localhost');
    const found = await find(pathname);
    const file = found ?? path.join(root, '404.html');
    response.writeHead(found ? 200 : 404, {
      'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    });
    response.end(await fs.readFile(file));
  })
  .listen(port, () => console.log(`serving ${root} at http://localhost:${port}/`));
