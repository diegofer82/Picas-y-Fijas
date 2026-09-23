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

/* 5.0.2: las burbujas de los hilos privados viven en el vestibulo. Al pasar a
   una pantalla sin chat, setChatContext tiene que esconderlas en el acto: antes
   se quedaban flotando sobre el teclado del codigo del dia y la rejilla de
   enigmas en un telefono de 375 px. */
test('al salir del vestibulo, setChatContext esconde las burbujas del chat privado', () => {
  const start = publicHtml.indexOf('function setChatContext(view){');
  assert.ok(start >= 0, 'falta setChatContext');
  const src = publicHtml.slice(start, publicHtml.indexOf('\n}\n', start) + 2);
  const els = {};
  const fake = () => { const c = new Set(); return { classList: { add: (k) => c.add(k), remove: (k) => c.delete(k), toggle: (k, on) => (on === undefined ? !c.has(k) : on) ? c.add(k) : c.delete(k), contains: (k) => c.has(k) } }; };
  const $ = (id) => (els[id] = els[id] || fake());
  const noop = () => {};
  const run = new Function('$', 'sessionToken', 'game', 'gState', 'stopChatPoll', 'placeChat', 'renderChat', 'updateChatBadge', 'updateChatLabels', 'startChatPoll', 'refreshPrivateThreads', 'renderPrivateThreads',
    `let chatEnabled=false, selectedPrivateThread=null, chatRoom='', chatItems=[], chatLastId=0, chatUnread=0; ${src}; return setChatContext;`)(
    $, 'sesion', {}, null, noop, noop, noop, noop, noop, noop, noop, noop);
  // Estado de partida: en el vestibulo las burbujas estan a la vista.
  $('private-chat-bubbles').classList.remove('hidden');
  $('private-chat-menu').classList.remove('hidden');
  for (const view of ['daily', 'puzzles', 'rank', 'profile']) {
    $('private-chat-bubbles').classList.remove('hidden');
    run(view);
    assert.ok($('private-chat-bubbles').classList.contains('hidden'), `las burbujas siguen a la vista en ${view}`);
    assert.ok($('private-chat-menu').classList.contains('hidden'), `el menu de hilos sigue a la vista en ${view}`);
    assert.ok($('chat-launch').classList.contains('hidden'), `el boton flotante sigue a la vista en ${view}`);
  }
});
