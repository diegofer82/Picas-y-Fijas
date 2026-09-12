import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CHAT, messageError } from '../src/chat.js';

const publicHtml = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('chat accepts short multilingual text and keyboard emoji',()=>{
  assert.equal(messageError('¡Bien joué! 😄'), '');
  assert.equal(CHAT.maxLength,300);
});

test('chat rejects empty messages, obvious URLs and oversized text',()=>{
  assert.match(messageError('   '),/Escribe/);
  assert.match(messageError('visita https://example.com'),/enlaces/);
  assert.match(messageError('example.com'),/enlaces/);
  assert.match(messageError('x'.repeat(301)),/300/);
});

test('profanity matching uses complete normalized words',()=>{
  assert.match(messageError('eres un idiota'),/no permitida/);
  assert.equal(messageError('Una putografía inexistente no coincide por fragmentos'), '');
});

test('nudge and retention policies match the 2.1 contract',()=>{
  assert.equal(CHAT.nudgeCooldownMs,30000);
  assert.equal(CHAT.lobbyRetentionMs,24*60*60*1000);
  assert.equal(CHAT.gameRetentionMs,7*24*60*60*1000);
  assert.equal(CHAT.gameOpenAfterFinishMs,24*60*60*1000);
});

test('the chat close control stays available while opening remains state-gated',()=>{
  assert.match(publicHtml, /onclick="closeChat\(\)"/);
  assert.match(publicHtml, /function closeChat\(\)\{\s*\$\('chat-panel'\)\.classList\.add\('hidden'\);/);
  assert.match(publicHtml, /if\(!panel\.classList\.contains\('hidden'\)\)\{closeChat\(\);return;\}\s*if\(!chatEnabled\)return;/);
});

test('new chat activity forces the message list to its latest entry',()=>{
  assert.match(publicHtml, /function renderChat\(scrollToLatest=false\)/);
  assert.match(publicHtml, /box\.scrollTop=\(scrollToLatest\|\|firstRender\|\|nearBottom\)\?box\.scrollHeight:previousTop/);
  assert.match(publicHtml, /renderChat\(scrollToLatest\|\|incoming\.length>0\)/);
  assert.match(publicHtml, /input\.value='';await pollChat\(true\)/);
});
