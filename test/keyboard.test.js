import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const publicHtml = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const adminHtml = await readFile(new URL('../public/admin.html', import.meta.url), 'utf8');

test('every typed game action can be submitted with Enter', () => {
  const bindings = [
    ['uname', 'btn-login'],
    ['upin', 'btn-login'],
    ['join-code-inp', 'btn-join-code'],
    ['secret-c', 'btn-create'],
    ['secret-j', 'btn-join'],
    ['secret-r', 'btn-rematch'],
    ['g-guess', 'g-guess-btn'],
  ];

  for (const [input, button] of bindings) {
    assert.match(publicHtml, new RegExp(`bindEnterToButton\\('${input}','${button}'\\)`));
  }
  assert.match(publicHtml, /event\.key!==['"]Enter['"]/);
  assert.match(publicHtml, /event\.isComposing/);
  assert.match(publicHtml, /event\.repeat/);
});

test('admin credentials can be submitted with Enter', () => {
  assert.match(adminHtml, /\$\('username'\)\.addEventListener\('keydown',submitLoginOnEnter\)/);
  assert.match(adminHtml, /\$\('pin'\)\.addEventListener\('keydown',submitLoginOnEnter\)/);
  assert.match(adminHtml, /e\.key!==['"]Enter['"]/);
});

test('the timer counts down from the received server snapshot only once', () => {
  assert.match(publicHtml, /data\.clientReceivedAt=clientReceivedAt/);
  assert.match(publicHtml, /const started=Number\(gState\.clientReceivedAt\)\|\|Date\.now\(\)/);
  assert.doesNotMatch(publicHtml, /new Date\(gState\.turnStartedAt\)\.getTime\(\)/);
});
