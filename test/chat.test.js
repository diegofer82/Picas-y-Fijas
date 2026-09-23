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

/* 5.1.0: la burbuja se quita deslizandola a un lado —o con el boton de su
   conversacion— y vuelve sola cuando el otro escribe; los avisos de la partida
   no la hacen volver ni encienden su punto rojo. La conversacion sigue en su
   pestaña del chat del lobby, tambien en el telefono. */
function clientFn(name) {
  const start = publicHtml.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `falta ${name}`);
  let depth = 0, i = publicHtml.indexOf('{', start);
  for (; i < publicHtml.length; i++) {
    if (publicHtml[i] === '{') depth++;
    else if (publicHtml[i] === '}' && --depth === 0) break;
  }
  return publicHtml.slice(start, i + 1);
}
function loadBubbles(threads) {
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const src = ['hiddenBubbles', 'saveHiddenBubbles', 'threadFromOther', 'threadUnread', 'bubbleThreads'].map(clientFn).join('\n');
  const api = new Function('localStorage', 'privateThreads', 'user',
    `const chatUserKey=(v)=>String(v||'').trim().toLocaleLowerCase();${src}; return { hiddenBubbles, saveHiddenBubbles, threadUnread, bubbleThreads };`)(
    localStorage, threads, 'Ana');
  return { api, store };
}

test('una burbuja quitada vuelve solo cuando el otro escribe', () => {
  const thread = { id: 7, opponent: 'Carlos', lastMessageId: 40, lastKind: 'user', lastSender: 'Carlos', lastBody: 'hola' };
  const threads = [thread];
  const { api } = loadBubbles(threads);
  assert.deepEqual(api.bubbleThreads().map((x) => x.id), [7]);
  api.saveHiddenBubbles({ 7: { m: 40, at: Date.now() } });
  assert.deepEqual(api.bubbleThreads(), [], 'quitada, no se ve');
  // Una partida nueva contra el mismo jugador deja avisos sin autor: no vuelve.
  Object.assign(thread, { lastMessageId: 41, lastKind: 'system', lastSender: '', lastBody: 'finished|' });
  assert.deepEqual(api.bubbleThreads(), [], 'un aviso de la partida no la hace volver');
  // Lo que escribe una misma tampoco.
  Object.assign(thread, { lastMessageId: 42, lastKind: 'user', lastSender: 'ana' });
  assert.deepEqual(api.bubbleThreads(), [], 'un mensaje propio no la hace volver');
  // Una reaccion o un mensaje del otro, si; y deja de estar quitada.
  Object.assign(thread, { lastMessageId: 43, lastKind: 'system', lastSender: 'Carlos', lastBody: 'react_gg|Carlos' });
  assert.deepEqual(api.bubbleThreads().map((x) => x.id), [7], 'vuelve con lo que escribe el otro');
  assert.deepEqual(api.hiddenBubbles(), {});
});

test('el punto rojo es para lo que escribe el otro, no para los avisos de la partida', () => {
  const thread = { id: 3, opponent: 'Carla', lastMessageId: 9, lastKind: 'system', lastSender: '', lastBody: 'finished|' };
  const { api, store } = loadBubbles([thread]);
  assert.equal(api.threadUnread(thread), false);
  Object.assign(thread, { lastMessageId: 10, lastKind: 'user', lastSender: 'Carla' });
  assert.equal(api.threadUnread(thread), true);
  store.set('pf_chat_read_3', '10');
  assert.equal(api.threadUnread(thread), false, 'leida, se apaga');
});

test('la burbuja se desliza para quitarla y tiene su boton y su camino de vuelta', () => {
  assert.match(publicHtml, /\.private-chat-bubble\{touch-action:pan-y\}/, 'el gesto es horizontal y la pagina sigue desplazandose');
  assert.match(publicHtml, /const gone=e\.type==='pointerup'&&Math\.abs\(d\.dx\)>=64/, 'se quita pasado un umbral, hacia cualquier lado');
  assert.match(publicHtml, /if\(!b\|\|Date\.now\(\)-bubbleSwipedAt<400\) return;/, 'soltarla no abre la conversacion');
  assert.match(publicHtml, /e\.key!=='Delete'&&e\.key!=='Backspace'/, 'con el teclado tambien se quita');
  assert.match(publicHtml, /id="chat-bubble-hide" type="button" onclick="hideCurrentBubble\(\)"/, 'y con un boton en la conversacion');
  assert.match(clientFn('renderChatThreads'), /const on=currentView==='lobby'&&privateThreads\.length>0;/, 'las pestañas, tambien en el telefono');
  assert.match(publicHtml, /#s-lobby\{padding-bottom:calc\(48px \+ var\(--burbujas,0\) \* 53px\)\}/, 'el pie del vestibulo sube por encima de lo que flota');
  assert.doesNotMatch(clientFn('renderPrivateThreads'), /[\u{1F300}-\u{1FAFF}]/u, 'el menu de hilos sin emoji');
  for (const key of ['chat_bubble_label', 'chat_bubble_hide', 'chat_bubble_hidden']) {
    assert.equal((publicHtml.match(new RegExp(`[{,]${key}:"`, 'g')) || []).length, 3, `falta ${key} en alguno de los tres idiomas`);
  }
});

test('la lista de hilos dice quien escribio lo ultimo', async () => {
  const { listThreads } = await import('../src/chat.js');
  const db = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [
    { id: 5, user1: 'Ana', user1_key: 'ana', user2: 'Carlos', user2_key: 'carlos', last_game_at: new Date().toISOString(), last_message_at: null, last_message_id: 12, last_kind: 'user', last_body: 'hola', last_sender: 'Carlos' },
  ] }) }) }) };
  const r = await listThreads(db, { username_key: 'ana' });
  assert.equal(r.threads[0].lastSender, 'Carlos');
  assert.equal(r.threads[0].opponent, 'Carlos');
});
