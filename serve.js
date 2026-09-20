// Minimal static server. Web MIDI needs a secure context, and file:// is not
// one — so the page has to be served, and localhost counts as secure.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = import.meta.dirname;
const port = Number(process.env.PORT) || 8173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;

  // normalize() collapses any ../ before it can escape the project directory.
  const path = join(root, normalize(requested));
  if (!path.startsWith(root)) {
    response.writeHead(403).end('forbidden');
    return;
  }

  try {
    const body = await readFile(path);
    response.writeHead(200, {
      'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end('not found');
  }
}).listen(port, () => {
  console.log(`juno-66 editor → http://localhost:${port}`);
});
