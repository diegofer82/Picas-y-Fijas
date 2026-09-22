import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Serie Plaza, lote 5 (4.6.0): el ordenador. Una sola interfaz y tres anchos
   —telefono por debajo de 720 px, rail de iconos y dos columnas hasta 1100,
   rail con nombres y tres columnas por encima—, el chat siempre abierto en el
   vestibulo y en la partida, y los dos diarios a la vista cuando caben. */

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

function section(id) {
  const start = html.indexOf(`<section id="${id}"`);
  assert.ok(start >= 0, `falta ${id}`);
  return html.slice(start, html.indexOf('</section>', start));
}
function fn(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `falta ${name}`);
  const end = html.indexOf('\n}\n', start);
  return html.slice(start, end + 2);
}

test('la marca se hace rail a partir de 720 px, y solo para quien tiene cuenta', () => {
  const brand = html.slice(html.indexOf('<div class="brand">'), html.indexOf('<!-- LOGIN -->'));
  const items = [...brand.matchAll(/class="rail-item" data-rail="(\w+)" onclick="railGo\('(\w+)'\)"/g)];
  assert.deepEqual(items.map((m) => m[1]), ['lobby', 'play', 'practice', 'arena', 'puzzles', 'rank']);
  assert.ok(items.every((m) => m[1] === m[2]), 'cada entrada va a su sitio');
  assert.match(brand, /id="rail-me" onclick="railGo\('me'\)"/, 'la inicial lleva al perfil propio');
  assert.doesNotMatch(brand, /[\u{1F300}-\u{1FAFF}]/u, 'los iconos del rail se dibujan');
  // Sin sesion, en la portada o delante de la puerta del correo no hay rail.
  assert.match(fn('show'), /document\.body\.classList\.toggle\('has-rail', !!sessionToken && name!=='login' && name!=='verify'\)/);
  // Tres anchos: el telefono queda intacto por debajo de 720 px.
  assert.match(html, /@media \(min-width:720px\)\{\n  body\.has-rail\{--rail-w:72px;/);
  assert.match(html, /@media \(min-width:1100px\)\{\n  body\.has-rail\{--rail-w:92px\}/);
  assert.match(html, /body\.has-rail \.wrap\{max-width:calc\(1600px - var\(--rail-w\)\)/, 'hasta 1600 px, despues se centra');
  assert.match(html, /body\.has-rail\.in-shell \.brand\{display:flex!important\}/, 'el rail sigue a la vista dentro de la partida');
});

test('salir por el rail pasa por la misma puerta que el boton de volver', () => {
  const go = fn('railGo');
  assert.match(go, /if\(currentView==='game'\)\{[\s\S]*else await quitGame\(\);/, 'la partida avisa de que te vas y sigue abierta');
  assert.match(go, /currentView==='practice-game'&&practice&&!practice\.finished\)\{\s*pauseActivePractice\(\);/, 'la practica se guarda');
  assert.match(go, /if\(railCurrent\(\)===dest\) return;/, 'pulsar donde ya estas no hace nada');
  assert.match(html, /async function leaveGame\(\)\{ await quitGame\(\); enterLobby\(\); \}/, 'volver al lobby y el rail comparten la salida');
  assert.match(fn('quitGame'), /api\('gamePresence',\{gameId:id,username:user,connected:false,reason:'lobby'\}\)/);
});

test('la partida se abre en columnas y solo la columna de jugar se desplaza', () => {
  for (const id of ['s-game', 's-practice-game']) {
    const s = section(id);
    for (const side of ['mine', 'theirs']) assert.match(s, new RegExp(`<h3 class="jhead" id="[\\w-]+" data-side="${side}"></h3>`), `${id}: titulo del diario ${side}`);
  }
  assert.match(section('s-game'), /<div class="gchat-slot" id="g-chat-slot"><\/div>/, 'la tercera columna es del chat');
  assert.match(html, /\.gshell \.gbar,\.gshell \.gbody\{display:contents\}/, 'la cabecera y el cuerpo ceden sus piezas a la rejilla');
  assert.match(html, /\.gshell>\.gdock\{order:7\}/, 'el muelle sube debajo del turno');
  assert.match(html, /\.gshell \.gdock\.folded \.dock-pad\{display:grid\}/, 'y su teclado no se pliega');
  assert.match(html, /\.gshell \.journal,#s-game \.gchat-slot\{align-self:start;position:sticky;/, 'el diario y el chat miden lo que la ventana');
  assert.match(fn('makeDockPad'), /dock\.classList\.toggle\('off',disabled\);/);
});

test('los dos diarios se ponen uno al lado del otro cuando su columna tiene sitio', () => {
  assert.match(html, /const DUO_MIN=480;/);
  assert.match(fn('syncJournalWidth'), /const duo=WIDE\.matches&&el\.clientWidth>=DUO_MIN;/, 'lo decide el ancho del diario, no el de la ventana');
  assert.match(html, /\.journal\.duo:not\(\.solo\) \.glog\{display:flex!important;/, 'los dos a la vista, tambien el de la pestaña cerrada');
  const render = fn('renderJournal');
  assert.match(render, /root\.classList\.toggle\('solo',!both\);/, 'la practica sola no se parte en dos');
  assert.match(render, /if\(tab==='theirs'\|\|duo\|\|journalSeen\[ctx\]<0\)/, 'con los dos a la vista no hay punto de novedad');
  // Cada titulo dice hacia que codigo apunta, sin revelar ninguno.
  assert.match(fn('renderGame'), /sub:spectator\?toward\(st\.p2\|\|''\):toward\(oppLabel\)/);
});

/* Un DOM de juguete para el chat anclado: lo justo para moverlo y medir su ritmo. */
function fakeEl(id) {
  const classes = new Set();
  return {
    id, parentNode: null, innerHTML: '', dataset: {},
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      toggle(c, on) { if (on === undefined ? !classes.has(c) : on) classes.add(c); else classes.delete(c); },
    },
    appendChild(child) { child.parentNode = this; },
  };
}
function loadChat({ wide, view, enabled = true }) {
  const els = {};
  const $ = (id) => (els[id] = els[id] || fakeEl(id));
  const body = fakeEl('body');
  body.insertBefore = (child) => { child.parentNode = body; };
  $('chat-panel').classList.add('hidden');
  $('chat-panel').parentNode = body;
  const doc = { body, activeElement: null };
  const src = ['chatDockSlot', 'placeChat', 'chatLive'].map(fn).join('\n');
  const api = new Function('$', 'document', 'WIDE', 'currentView', 'chatEnabled', 'renderChatThreads', 'updateChatBadge',
    `let chatUnread=3, chatTouchedAt=0;${src}; return { placeChat, chatLive, unread: () => chatUnread, touch: () => { chatTouchedAt = Date.now(); } };`)(
    $, doc, { matches: wide }, view, enabled, () => {}, () => {});
  return { api, els, body, doc };
}

test('en el ordenador el chat vive en su columna y no pregunta mas por estar a la vista', () => {
  const lobby = loadChat({ wide: true, view: 'lobby' });
  lobby.api.placeChat();
  const panel = lobby.els['chat-panel'];
  assert.equal(panel.parentNode, lobby.els['lobby-chat-slot'], 'en el vestibulo, a la derecha');
  assert.ok(panel.classList.contains('docked') && !panel.classList.contains('hidden'), 'siempre abierto');
  assert.equal(lobby.api.unread(), 0, 'a la vista no hay nada pendiente de leer');
  assert.ok(lobby.body.classList.contains('chat-docked'));
  // Siempre abierto no es sondear mas: mientras nadie lo usa va al ritmo del chat cerrado.
  assert.equal(lobby.api.chatLive(), false);
  lobby.api.touch();
  assert.equal(lobby.api.chatLive(), true, 'escribir en el lo acelera');
  assert.match(html, /chatTimer=setTimeout\(run,chatLive\(\)\?2500:\(currentChatRoom\(\)\.roomType==='private'\?3000:10000\)\);/);

  const game = loadChat({ wide: true, view: 'game' });
  game.api.placeChat();
  assert.equal(game.els['chat-panel'].parentNode, game.els['g-chat-slot'], 'en la partida, la tercera columna');

  // Por debajo de 1100 px, o en otra pantalla, vuelve a ser el panel flotante de siempre.
  const narrow = loadChat({ wide: false, view: 'lobby' });
  narrow.api.placeChat();
  assert.ok(!narrow.els['chat-panel'].classList.contains('docked'));
  assert.ok(narrow.els['chat-panel'].classList.contains('hidden'));
  const rank = loadChat({ wide: true, view: 'rank' });
  rank.els['chat-panel'].classList.add('docked');
  rank.api.placeChat();
  assert.equal(rank.els['chat-panel'].parentNode, rank.body, 'fuera de su columna vuelve a su esquina');
  assert.ok(rank.els['chat-panel'].classList.contains('hidden') && !rank.body.classList.contains('chat-docked'));
});

test('anclado, el chat no se cierra y las conversaciones privadas son pestañas', () => {
  assert.match(html, /\.chat-panel\.docked \.chat-close\{display:none\}/);
  assert.match(fn('toggleChat'), /if\(panel\.classList\.contains\('docked'\)\)\{\$\('chat-input'\)\.focus\(\);return;\}/);
  assert.match(html, /body\.chat-docked \.chat-launch,body\.chat-docked #g-chat-btn,body\.chat-docked \.private-chat-bubbles/);
  const threads = fn('renderChatThreads');
  assert.match(threads, /onclick="openLobbyChat\(\)"/, 'la del vestibulo, delante');
  assert.match(threads, /if\(box\.dataset\.html!==html\)/, 'el sondeo no rehace los botones si nada cambia');
  // Escape devuelve el teclado al muelle: el teclado fisico vuelve a escribir el intento.
  assert.match(html, /if\(\$\('chat-panel'\)\.classList\.contains\('docked'\)\)e\.target\.blur\(\);else closeChat\(\);/);
});

test('lo nuevo nace en los tres idiomas', () => {
  for (const key of ['rail_nav', 'rail_home', 'rail_play', 'rail_practice', 'rail_arena', 'rail_puzzles', 'rail_rank',
    'turn_kbd', 'jhead_toward', 'jhead_toward_you', 'jhead_toward_computer']) {
    assert.equal((html.match(new RegExp(`[{,]${key}:"`, 'g')) || []).length, 3, `falta ${key} en alguno de los tres idiomas`);
  }
});
