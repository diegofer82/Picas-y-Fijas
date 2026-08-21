import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assetPathFor, canonicalRedirect } from '../src/index.js';

test('public entry routes resolve to their HTML assets', () => {
  assert.equal(assetPathFor('/'), '/index.html');
  assert.equal(assetPathFor('/admin'), '/admin.html');
  assert.equal(assetPathFor('/api'), '');
});

test('entry HTML is routed through the Worker to prevent stale releases', async () => {
  const config=JSON.parse(await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
  assert.ok(config.assets.run_worker_first.includes('/'));
  assert.ok(config.assets.run_worker_first.includes('/index.html'));
  const source=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
  assert.match(source,/["']cache-control["']\s*,\s*["']no-store, max-age=0["']/);
});

test('every alias host redirects to the canonical domain, keeping the game link', () => {
  const at = (u) => canonicalRedirect(new URL(u));

  // El apex se sirve tal cual: redirigirlo seria un bucle.
  assert.equal(at('https://picasyfijas.fans/?game=A7K2QX'), null);
  // localhost queda fuera para no romper `wrangler dev`.
  assert.equal(at('http://localhost:8788/'), null);

  for (const host of ['www.picasyfijas.fans', 'picas-y-fijas.picas-y-fijas.workers.dev']) {
    const res = at(`https://${host}/?game=A7K2QX`);
    assert.equal(res.status, 301, `${host} deberia redirigir`);
    assert.equal(res.headers.get('location'), 'https://picasyfijas.fans/?game=A7K2QX');
  }

  // La redireccion conserva la ruta, no solo la raiz.
  assert.equal(
    at('https://www.picasyfijas.fans/admin').headers.get('location'),
    'https://picasyfijas.fans/admin',
  );
});
