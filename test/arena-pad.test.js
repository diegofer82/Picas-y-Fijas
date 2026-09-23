import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* La arena y lo que se escribe en ella (5.0.1).

   Hasta la 4.6.0 cada sondeo de cuatro segundos vaciaba el campo del intento
   —`applyMode` lo ponia a cero al repintar—, y en una arena de verdad un
   jugador tardo dos minutos en poder mandar su primer intento. La 4.7.0 cambio
   el campo por el muelle, que guarda lo escrito, pero quedaban dos restos: tras
   cada intento el teclado seguia apagado hasta el sondeo siguiente, y una
   respuesta lenta podia pintar la arena como estaba antes del intento. Estas
   pruebas hacen correr el codigo de la pagina tal cual, con un DOM de juguete y
   un servidor que responde cuando la prueba lo decide. */

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

function fn(name) {
  const start = html.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `falta ${name}`);
  const end = html.indexOf('\n}\n', start);
  return html.slice(start, end + 2);
}

function fakeElement() {
  const classes = new Set();
  const el = {
    innerHTML: '', textContent: '', disabled: false, attrs: {},
    get className() { return [...classes].join(' '); },
    set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
    classList: {
      toggle(c, on) { if (on === undefined ? !classes.has(c) : on) classes.add(c); else classes.delete(c); },
      contains: (c) => classes.has(c), add: (c) => classes.add(c), remove: (c) => classes.delete(c),
    },
    setAttribute(k, v) { el.attrs[k] = String(v); },
    removeAttribute(k) { delete el.attrs[k]; },
    addEventListener() {},
    querySelector: () => null,
  };
  return el;
}

/* La arena en marcha, con Ana jugando. Cada llamada al servidor queda en
   `calls` hasta que la prueba la contesta. */
function loadArena() {
  const els = {};
  const $ = (id) => (els[id] = els[id] || fakeElement());
  const calls = [];
  const api = (action, payload) => new Promise((resolve) => calls.push({ action, payload, resolve }));
  const pad = html.match(/const arenaPad=makeDockPad\(\{[\s\S]*?\}\);\n/);
  assert.ok(pad, 'falta arenaPad');
  const playing = html.match(/function arenaPlaying\(st\)\{.*\}\n/);
  assert.ok(playing, 'falta arenaPlaying');
  const src = [
    `let arenaSt=null, arenaPollTimer=null, arenaBusy=false, arenaFeed=[], arenaPrev=null, arenaAsked=0, arenaPainted=0;`,
    `let arenaView={id:'ABCD',digits:4,mode:'numbers',numColors:10,allowRepeats:false,maxAttempts:10};`,
    `const user='Ana', lang='es', dockOpen=true, COLORS=[];`,
    fn('makeDockPad'), pad[0], playing[0], fn('arenaEvents'), fn('renderArena'),
    fn('refreshArena'), fn('sendArenaGuess'),
    `return { arenaPad, refreshArena, sendArenaGuess, state: () => arenaSt };`,
  ].join('\n');
  const noop = () => {};
  const stubs = {
    $, api, t: (k, p) => k + (p ? JSON.stringify(p) : ''), te: String, esc: String, tElide: (k) => k,
    symbolSVG: () => '', setVal: noop, validateLive: (v, d) => ({ cls: v.length === d ? 'ok' : 'bad' }),
    arenaRules: () => '', arenaRowHTML: () => '', codeViewHTML: () => '', endCardHTML: () => '', tryPipsHTML: () => '',
    renderArenaFeed: noop, renderArenaLog: noop, rainConfetti: noop, toast: noop, stopArenaPoll: noop, enterLobby: noop,
  };
  const arena = new Function(...Object.keys(stubs), src)(...Object.values(stubs));
  return { ...arena, calls, els };
}

const stateAfter = (attempts) => ({
  ok: true, arenaId: 'ABCD', status: 'active', digits: 4, mode: 'numbers', numColors: 10, allowRepeats: false,
  maxAttempts: 10, players: 3, minPlayers: 3, maxPlayers: 8, youArePlaying: true, youAreHost: false, solved: false,
  attempts, attemptsLeft: 10 - attempts,
  guesses: Array.from({ length: attempts }, () => ({ guess: '5678', fijas: 0, picas: 0 })),
  board: [{ username: 'Ana', attempts, bestFijas: 0 }, { username: 'Carlos', attempts: 0, bestFijas: 0 }],
});
const settle = () => new Promise((resolve) => setImmediate(resolve));
const type = (pad, code) => [...code].forEach((k) => pad.push(k));

test('lo que se esta escribiendo sobrevive al sondeo', async () => {
  const a = loadArena();
  const first = a.refreshArena();
  a.calls.shift().resolve(stateAfter(0));
  await first;
  type(a.arenaPad, '12');
  for (let i = 0; i < 3; i++) {
    const poll = a.refreshArena();
    a.calls.shift().resolve(stateAfter(0));
    await poll;
  }
  assert.equal(a.arenaPad.get(), '12', 'tres sondeos despues, las dos cifras siguen ahi');
  type(a.arenaPad, '34');
  assert.equal(a.arenaPad.get(), '1234');
  // El campo de texto que el sondeo vaciaba no vuelve.
  assert.doesNotMatch(fn('renderArena'), /applyMode|\.value=''/);
});

test('tras un intento el teclado se enciende sin esperar al sondeo', async () => {
  const a = loadArena();
  const first = a.refreshArena();
  a.calls.shift().resolve(stateAfter(0));
  await first;
  type(a.arenaPad, '5678');
  const sent = a.sendArenaGuess();
  const guess = a.calls.shift();
  assert.equal(guess.action, 'arenaGuess');
  assert.equal(guess.payload.guess, '5678');
  guess.resolve({ ok: true, fijas: 0, picas: 0, solved: false, attempts: 1, attemptsLeft: 9 });
  await settle();
  const after = a.calls.shift();
  assert.equal(after.action, 'arenaState', 'despues del intento se pide el estado');
  after.resolve(stateAfter(1));
  await sent;
  assert.equal(a.arenaPad.isDisabled(), false, 'el teclado ya esta encendido');
  type(a.arenaPad, '12');
  assert.equal(a.arenaPad.get(), '12', 'y lo que se pulsa entra enseguida');
});

test('una respuesta lenta no devuelve la arena a antes del ultimo intento', async () => {
  const a = loadArena();
  const slow = a.refreshArena();
  const fresh = a.refreshArena();
  const [old, recent] = a.calls.splice(0, 2);
  recent.resolve(stateAfter(1));
  await fresh;
  old.resolve(stateAfter(0));
  await slow;
  assert.equal(a.state().attempts, 1, 'se queda el estado mas nuevo');
  assert.equal(a.els['arena-try'].textContent, 'arena_try_of{"n":2,"max":10}');
});
