import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

process.env.PORT = '0';
const { server } = await import('../server.mjs');
if (!server.listening) await once(server, 'listening');
const base = 'http://127.0.0.1:' + server.address().port;
after(() => new Promise((resolve) => server.close(resolve)));

test('local server serves the app and SVG with their correct content types', async () => {
  const index = await fetch(base + '/');
  assert.equal(index.status, 200);
  assert.match(await index.text(), /INMERVIA/);
  const icon = await fetch(base + '/favicon.svg');
  assert.equal(icon.headers.get('content-type'), 'image/svg+xml');
});

test('HEAD reports the model size without transferring a body', async () => {
  const response = await fetch(base + '/models/horse.glb', { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.ok(Number(response.headers.get('content-length')) > 0);
  assert.equal((await response.arrayBuffer()).byteLength, 0);
});

test('bad paths, missing resources and unsupported methods are distinct', async () => {
  assert.equal((await fetch(base + '/%zz')).status, 400);
  assert.equal((await fetch(base + '/%2e%2e%2fREADME.md')).status, 403);
  assert.equal((await fetch(base + '/missing.glb')).status, 404);
  const response = await fetch(base + '/', { method: 'POST' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
});
