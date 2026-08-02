import test from 'node:test';
import assert from 'node:assert/strict';
import { assetPathFor } from '../src/index.js';

test('public entry routes resolve to their HTML assets', () => {
  assert.equal(assetPathFor('/'), '/index.html');
  assert.equal(assetPathFor('/admin'), '/admin.html');
  assert.equal(assetPathFor('/api'), '');
});
