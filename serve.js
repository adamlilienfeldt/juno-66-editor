// Minimal static server. Web MIDI needs a secure context, and file:// is not
// one — so the page has to be served, and localhost counts as secure.
//
// It also does the one thing the page cannot: write the .midnam file into the
// folder Pro Tools reads controller names from.
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { buildMidnam } from './src/midnam.js';
import { isValidCc } from './src/overrides.js';
import { PARAM_GROUPS, PLAY_MODES } from './src/params.js';

const root = import.meta.dirname;
const port = Number(process.env.PORT) || 8173;

// Overridable so the tests can point it somewhere harmless.
const midnamDir = process.env.MIDNAM_DIR
  || join(homedir(), 'Library', 'Audio', 'MIDI Patch Names', 'DigiDesign');
const midnamPath = join(midnamDir, 'Tubbutec juno-66.midnam');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const ALLOWED_ORIGINS = new Set([
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
  `http://[::1]:${port}`,
]);

function reply(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readBody(request, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new RangeError('body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Write the .midnam into Pro Tools' folder.
 *
 * The page sends only its controller number corrections. The document itself
 * is built here, from the same code as the download, so nothing a request
 * carries is written to disk verbatim, and neither the path nor the filename
 * can be chosen by the caller.
 */
async function installMidnam(request, response) {
  // Any website open in the browser can aim a POST at localhost. Browsers
  // always send Origin on a POST, so a missing or foreign one is refused.
  if (!ALLOWED_ORIGINS.has(request.headers.origin)) {
    reply(response, 403, { error: 'refused: request did not come from the editor' });
    return;
  }
  // Also makes a cross-site request a non-simple one, which the browser will
  // not send without a CORS preflight this server never answers.
  if (!request.headers['content-type']?.startsWith('application/json')) {
    reply(response, 415, { error: 'expected application/json' });
    return;
  }

  let overrides;
  try {
    ({ overrides } = JSON.parse(await readBody(request, 16 * 1024)));
  } catch (error) {
    reply(response, error instanceof RangeError ? 413 : 400, { error: 'unreadable request' });
    return;
  }
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)
      || !Object.values(overrides).every(isValidCc)) {
    reply(response, 400, { error: 'overrides must map parameter ids to controller numbers 0-127' });
    return;
  }

  try {
    await mkdir(midnamDir, { recursive: true });
    await writeFile(midnamPath, buildMidnam(PARAM_GROUPS, PLAY_MODES, overrides));
    reply(response, 200, { path: midnamPath });
  } catch (error) {
    reply(response, 500, { error: `could not write ${midnamPath}: ${error.message}` });
  }
}

createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);

  if (url.pathname === '/install-midnam') {
    if (request.method === 'POST') await installMidnam(request, response);
    else reply(response, 405, { error: 'POST only' });
    return;
  }

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
// localhost only: with a write endpoint, being reachable from the rest of the
// network is no longer harmless.
}).listen(port, 'localhost', () => {
  console.log(`juno-66 editor → http://localhost:${port}`);
});
