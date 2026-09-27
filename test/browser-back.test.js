import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

/* 5.2.1: el boton «atras» del navegador. La app es una sola pagina y nunca
   escribia en el historial, asi que «atras» salia del sitio desde cualquier
   pantalla. Ahora cada pantalla que no es raiz deja una entrada —una sola— y
   volver por ella pasa por la misma puerta que el rail. */

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

function fn(name) {
  const start = html.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `falta ${name}`);
  const end = html.indexOf('\n}\n', start);
  return html.slice(start, end + 2);
}

/* El bloque entero, desde las raices hasta el oyente de popstate, corre en
   un contexto con un historial falso que se comporta como el del navegador:
   pila de entradas, indice, y popstate asincrono al viajar. */
function makeWorld() {
  const start = html.indexOf('const ROOT_VIEWS=new Set(');
  const end = html.indexOf('function show(name){', start);
  assert.ok(start >= 0 && end > start, 'falta el bloque del historial');
  const block = html.slice(start, end);
  const calls = [];
  const listeners = [];
  const entries = [{ state: null }];
  let index = 0;
  const historyFake = {
    get state() { return entries[index].state; },
    pushState(state) { entries.splice(index + 1); entries.push({ state }); index = entries.length - 1; calls.push('push:' + state.pfDepth); },
    replaceState(state) { entries[index] = { state }; calls.push('replace:' + (state && state.pfDepth)); },
    go(n) { calls.push('go:' + n); const target = index + n; setTimeout(() => { if (target < 0 || target >= entries.length) return; index = target; fire(); }, 0); },
  };
  function fire() { for (const l of listeners) l({ state: entries[index].state }); }
  const ctx = {
    history: historyFake,
    location: { pathname: '/', search: '', hash: '' },
    window: { addEventListener(type, l) { if (type === 'popstate') listeners.push(l); } },
    setTimeout, clearTimeout,
    currentView: 'login', sessionToken: 'tok',
    log: [],
    closeSettingsMenu() {}, leaveCurrentView: async () => { ctx.log.push('leave'); },
    closeFeedback() { ctx.log.push('closeFeedback'); },
    enterLobby() { ctx.log.push('enterLobby'); ctx.show('lobby'); },
    exitGuest() { ctx.log.push('exitGuest'); ctx.show('login'); },
  };
  vm.createContext(ctx);
  vm.runInContext(block + '\nthis.syncHistory=syncHistory;this.browserBack=browserBack;', ctx);
  ctx.show = (name) => { const prev = ctx.currentView; ctx.currentView = name; ctx.syncHistory(prev, name); };
  const back = () => new Promise((resolve) => { index = Math.max(0, index - 1); fire(); setTimeout(resolve, 5); });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
  return { ctx, calls, entries, back, settle, depth: () => (entries[index].state && entries[index].state.pfDepth) || 0, at: () => index };
}

test('show() apunta cada cambio de pantalla en el historial', () => {
  assert.match(fn('show'), /currentView = name;\n  syncHistory\(previousView, name\);/, 'justo despues de cambiar la pantalla');
  assert.match(html, /const ROOT_VIEWS=new Set\(\['login','verify','lobby'\]\);/);
  assert.match(html, /try\{ history\.replaceState\(\{pfDepth:0\},'',historyURL\(\)\); \}catch\(e\)\{\}/, 'al cargar se parte de cero');
  assert.match(fn('browserBack'), /await leaveCurrentView\(\);/, 'sale por la puerta del rail');
  assert.match(fn('browserBack'), /if\(currentView==='feedback'\) closeFeedback\(\);\n  else if\(sessionToken\) enterLobby\(\);\n  else exitGuest\(\);/);
});

test('una pantalla deja una entrada, y solo una; volver por «atras» lleva al vestibulo', async () => {
  const w = makeWorld();
  w.ctx.show('lobby');
  assert.equal(w.depth(), 0);
  w.ctx.show('profile');
  assert.deepEqual(w.calls.at(-1), 'push:1', 'la primera pantalla de consulta empuja una entrada');
  w.ctx.show('rivals');
  assert.deepEqual(w.calls.at(-1), 'replace:1', 'la siguiente reemplaza, no apila');
  assert.equal(w.entries.length, 2);
  await w.back();
  assert.deepEqual(w.ctx.log, ['leave', 'enterLobby'], '«atras» sale por la puerta y vuelve al vestibulo');
  assert.equal(w.ctx.currentView, 'lobby');
  assert.equal(w.at(), 0, 'y se queda en la entrada raiz, dentro del sitio');
});

test('cuando la app vuelve al vestibulo por su cuenta, consume la entrada', async () => {
  const w = makeWorld();
  w.ctx.show('lobby'); w.ctx.show('rank');
  w.ctx.show('lobby');
  assert.equal(w.calls.at(-1), 'go:-1', 'Volver y la marca hacen retroceder el historial');
  await w.settle();
  assert.equal(w.at(), 0);
  assert.deepEqual(w.ctx.log, [], 'ese popstate es de la app y no vuelve a salir por la puerta');
  // Si entre tanto ya se abrio otra pantalla, esa pantalla recupera su entrada.
  w.ctx.show('daily'); w.ctx.show('lobby'); w.ctx.show('puzzles');
  await w.settle();
  assert.equal(w.depth(), 1, 'la pantalla abierta durante el viaje vuelve a tener entrada');
  await w.back();
  assert.equal(w.ctx.currentView, 'lobby');
});

test('el buzon vuelve a donde se entro, el invitado a la portada, y «adelante» no rompe nada', async () => {
  const w = makeWorld();
  w.ctx.show('lobby'); w.ctx.show('feedback');
  await w.back();
  assert.deepEqual(w.ctx.log, ['leave', 'closeFeedback'], 'como su boton Volver');
  const g = makeWorld();
  g.ctx.sessionToken = '';
  g.ctx.show('login'); g.ctx.show('practice');
  await g.back();
  assert.deepEqual(g.ctx.log, ['leave', 'exitGuest']);
  assert.equal(g.ctx.currentView, 'login');
  // «Adelante» desde la raiz: la pantalla de antes no se puede rehacer.
  const f = makeWorld();
  f.ctx.show('lobby'); f.ctx.show('history');
  await f.back();
  assert.equal(f.entries[1].state.pfDepth, 1, 'la entrada de profundidad 1 sigue delante');
  f.calls.length = 0;
  await new Promise((resolve) => { f.ctx.history.go(1); setTimeout(resolve, 10); });
  assert.equal(f.ctx.currentView, 'lobby', 'no se mueve de pantalla');
  assert.equal(f.calls.at(-1), 'replace:0', 'la entrada se queda como raiz');
});
