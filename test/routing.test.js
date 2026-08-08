import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assetPathFor } from '../src/index.js';

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
