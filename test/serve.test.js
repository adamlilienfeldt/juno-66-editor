import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Runs the real server, with the install folder pointed at a temp directory so
// nothing lands in the actual Pro Tools folder.
const port = 20000 + Math.floor(Math.random() * 20000);
const origin = `http://localhost:${port}`;
let server;
let dir;

test.before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'juno66-midnam-'));
  server = spawn(process.execPath, ['serve.js'], {
    cwd: join(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(port), MIDNAM_DIR: dir },
  });
  await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve);
    server.once('exit', (code) => reject(new Error(`server exited with ${code}`)));
  });
});

test.after(async () => {
  server?.kill();
  if (dir) await rm(dir, { recursive: true, force: true });
});

/** Plain http.request, because fetch will not let a test set Origin. */
function post(body, headers) {
  return new Promise((resolve, reject) => {
    const req = request({ host: 'localhost', port, path: '/install-midnam', method: 'POST', headers }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

const json = { 'content-type': 'application/json' };
const installed = () => readFile(join(dir, 'Tubbutec juno-66.midnam'), 'utf8');

test('the editor can install the names, corrections included', async () => {
  const { status, body } = await post(JSON.stringify({ overrides: { 'adsr-attack': 90 } }), { ...json, origin });
  assert.equal(status, 200);
  assert.equal(body.path, join(dir, 'Tubbutec juno-66.midnam'));

  const xml = await installed();
  assert.match(xml, /<Control Type="7bit" Number="90" Name="Filter ADSR — Attack"\/>/);
  assert.match(xml, /<Patch Number="0" Name="Poly" ProgramChange="0"\/>/);
});

test('another website cannot trigger a write', async () => {
  const { status } = await post(JSON.stringify({ overrides: {} }), { ...json, origin: 'https://example.com' });
  assert.equal(status, 403);
});

test('a request with no origin is refused', async () => {
  const { status } = await post(JSON.stringify({ overrides: {} }), json);
  assert.equal(status, 403);
});

test('only JSON is accepted', async () => {
  const { status } = await post('overrides=1', { 'content-type': 'application/x-www-form-urlencoded', origin });
  assert.equal(status, 415);
});

test('controller numbers outside 0-127 are rejected, and nothing is written', async () => {
  const before = await installed();
  for (const bad of [{ 'adsr-attack': 128 }, { 'adsr-attack': -1 }, { 'adsr-attack': '30' }, [30]]) {
    const { status } = await post(JSON.stringify({ overrides: bad }), { ...json, origin });
    assert.equal(status, 400, JSON.stringify(bad));
  }
  assert.equal(await installed(), before);
});

test('an oversized body is refused', async () => {
  const { status } = await post(JSON.stringify({ overrides: {}, pad: 'x'.repeat(20000) }), { ...json, origin });
  assert.equal(status, 413);
});
