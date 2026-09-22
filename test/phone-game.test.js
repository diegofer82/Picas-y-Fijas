import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Serie Plaza, lote 4 (4.5.0): la partida en telefono. La partida y la
   practica son una capa fija de tres pisos —cabecera con los relojes, diario
   que se desplaza y muelle con las fichas y «Adivinar»—, y el intento ya no es
   un campo de texto sino un teclado propio que se pliega. */

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

/* Un DOM de juguete: lo justo para que el muelle se pinte y se pulse. */
function fakeElement() {
  const listeners = {};
  const classes = new Set();
  const el = {
    innerHTML: '', textContent: '', disabled: false, attrs: {}, listeners,
    get className() { return [...classes].join(' '); },
    set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => classes.add(c)); },
    classList: {
      toggle(c, on) { if (on === undefined ? !classes.has(c) : on) classes.add(c); else classes.delete(c); },
      contains: (c) => classes.has(c), add: (c) => classes.add(c), remove: (c) => classes.delete(c),
    },
    setAttribute(k, v) { el.attrs[k] = String(v); },
    addEventListener(type, cb) { listeners[type] = cb; },
    querySelector: () => null,
  };
  return el;
}
function loadDock({ repeats, marks = {} }) {
  const els = {};
  const $ = (id) => (els[id] = els[id] || fakeElement());
  const src = fn('makeDockPad');
  const make = new Function('$', 't', 'esc', 'COLORS', 'symbolSVG', 'dockOpen', `${src}; return makeDockPad;`)(
    $, (k, p) => k + (p ? JSON.stringify(p) : ''), (s) => String(s), Array.from({ length: 8 }, () => ({ c: '#000' })),
    (k) => `<svg data-k="${k}"></svg>`, true);
  const pad = make({
    dock: 'dock', tiles: 'tiles', pad: 'pad', erase: 'erase', live: 'live',
    len: () => 4, mode: () => 'numbers', colors: () => 6, repeats: () => repeats, marks: () => marks,
  });
  return { pad, els };
}
const keys = (els) => [...els.pad.innerHTML.matchAll(/<button type="button" class="([^"]*)"[^>]*data-k="(\d)"[^>]*?( disabled)?>/g)]
  .map((m) => ({ k: m[2], cls: m[1], disabled: !!m[3] }));

test('la partida y la practica son una capa fija de tres pisos', () => {
  for (const id of ['s-game', 's-practice-game']) {
    const s = section(id);
    assert.match(s, new RegExp(`<section id="${id}" class="hidden gshell">`));
    const bar = s.indexOf('<header class="gbar">'), body = s.indexOf('class="gbody"'), dock = s.indexOf('class="gdock');
    assert.ok(bar >= 0 && body > bar && dock > body, `${id}: cabecera, diario y muelle, en ese orden`);
  }
  assert.match(html, /\.gshell\{position:fixed;/);
  assert.match(html, /\.gbody\{flex:1 1 auto;min-height:0;overflow-y:auto;/, 'solo el diario se desplaza');
  assert.match(html, /document\.body\.classList\.toggle\('in-shell', name==='game'\|\|name==='practice-game'\)/);
  // Los relojes viven en la cabecera, uno por jugador, para las tres formas de reloj.
  const game = section('s-game');
  assert.ok(game.indexOf('id="g-banks"') < game.indexOf('class="gbody"'));
  assert.match(fn('renderClocks'), /bankLeft\(st,side\)/);
  assert.match(fn('renderClocks'), /turnLeft\(\)/);
  // El chat de la partida pasa a la cabecera: el boton flotante taparia el muelle.
  assert.match(game, /id="g-chat-btn" onclick="openPrimaryChat\(\)"/);
  assert.match(html, /\$\('chat-launch'\)\.classList\.toggle\('hidden',!allowed\|\|view==='game'\)/);
});

test('el muelle no deja escribir lo imposible y tacha lo que el cuaderno descarto', () => {
  const { pad, els } = loadDock({ repeats: false, marks: { 9: 'out', 7: 'in' } });
  pad.refresh();
  assert.equal(keys(els).length, 10, 'diez cifras');
  pad.push('4'); pad.push('4'); pad.push('3');
  assert.equal(pad.get(), '43', 'sin repetidos no entra el segundo 4');
  let k = keys(els);
  assert.ok(k.find((x) => x.k === '4').disabled && /used/.test(k.find((x) => x.k === '4').cls), 'el 4 escrito sale tachado y apagado');
  const nine = k.find((x) => x.k === '9');
  assert.ok(/out/.test(nine.cls) && !nine.disabled, 'lo descartado en el cuaderno sale tachado pero se puede pulsar');
  assert.ok(!/out|used/.test(k.find((x) => x.k === '7').cls), 'lo confirmado no se tacha');
  pad.push('9'); pad.push('0'); pad.push('1');
  assert.equal(pad.get(), '4390', 'nunca mas largo que el codigo');
  pad.pop();
  assert.equal(pad.get(), '439');
  pad.setDisabled(true); pad.push('1'); pad.pop();
  assert.equal(pad.get(), '439', 'apagado, el muelle no cambia');
  assert.ok(keys(els).every((x) => x.disabled), 'y todas las teclas salen apagadas');
  const repeat = loadDock({ repeats: true });
  repeat.pad.refresh(); repeat.pad.push('4'); repeat.pad.push('4');
  assert.equal(repeat.pad.get(), '44', 'con repetidos si entra');
  // El teclado no deduce por nadie: solo mira las reglas y el cuaderno propio.
  assert.doesNotMatch(fn('makeDockPad'), /Deduce|guesses|gState/);
});

test('el teclado fisico sigue sirviendo y el foco no se lo roba ninguna ficha', () => {
  assert.match(html, /\$\(o\.dock\)\.addEventListener\('mousedown',e=>\{ if\(e\.target\.closest\('button'\)\) e\.preventDefault\(\); \}\)/);
  assert.match(html, /function activeDock\(\)\{/);
  assert.match(html, /let dockOpen=\(\(\)=>\{ try\{ return localStorage\.getItem\('pf_dock_open'\)!=='0'; \}/, 'el teclado plegado se recuerda');
});

test('el diario pone el mas reciente arriba y dibuja cada pista por su forma', () => {
  const stub = 'const t=(k,p)=>k+(p?JSON.stringify(p):"");const esc=s=>String(s);const COLORS=[];const symbolSVG=()=>"";const ico=()=>"<svg></svg>";';
  const src = ['spokenCode', 'tryLabel', 'tilesCodeHTML', 'tryPipsHTML', 'journalRowsHTML', 'friezeHTML']
    .map((name) => html.match(new RegExp(`function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`))[0]).join('\n');
  const J = new Function(`${stub}${src}; return {journalRowsHTML, friezeHTML};`)();
  const list = [{ guess: '0123', fijas: 1, picas: 2 }, { missed: true, reason: 'timeout' }, { guess: '4567', fijas: 0, picas: 0 }];
  const rows = J.journalRowsHTML('g', 'mine', { list, empty: '-', missed: 'perdido' }, 'numbers', 4);
  const ids = [...rows.matchAll(/id="(g-mine-e\d)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['g-mine-e3', 'g-mine-e2', 'g-mine-e1'], 'el mas reciente arriba, con su numero');
  assert.match(rows, /class="g jrow new" id="g-mine-e3"/, 'y marcado');
  assert.match(rows, /id="g-mine-e2"[^>]*><span class="jn" aria-hidden="true">2<\/span><span class="scoretxt">perdido<\/span>/);
  const first = rows.slice(rows.indexOf('id="g-mine-e1"'));
  assert.equal((first.match(/class="pip f"/g) || []).length, 1, 'una fija: un disco');
  assert.equal((first.match(/class="pip p"/g) || []).length, 2, 'dos picas: dos anillos');
  assert.equal((first.match(/class="pip"/g) || []).length, 1, 'y la posicion sin nada, punteada');
  const fz = J.friezeHTML('g', 'mine', list, 'numbers');
  assert.match(fz, /^<button type="button" class="fz new" onclick="jumpToTry\('g','mine',3\)"/, 'el friso tambien empieza por el ultimo');
  assert.equal((fz.match(/<button/g) || []).length, 3, 'una pastilla por intento');
  assert.match(html, /const FRIEZE_FROM=4;/, 'y solo aparece cuando la lista ya no cabe de un vistazo');
});

test('lo que se lee en la partida nace en los tres idiomas y sin emoji', () => {
  for (const key of ['turn_mine', 'turn_sub_attempt', 'turn_sub_attempt_max', 'turn_sub_turnclock', 'turn_sub_bank_inc', 'turn_sub_bank',
    'turn_sub_corr', 'game_attempt_no', 'clock_you', 'clock_your_turn', 'tab_mine', 'tab_player', 'tab_computer', 'tab_new',
    'tab_new_computer', 'journal_order', 'frieze_label', 'jrow_aria', 'jrow_missed_aria', 'dock_pad_show', 'dock_pad_hide',
    'dock_pad_show_aria', 'dock_pad_hide_aria', 'dock_erase', 'dock_keys', 'dock_live', 'dock_live_empty', 'secret_row',
    'secret_show', 'secret_hide', 'computer_chip', 'computer_code', ...Array.from({ length: 8 }, (_, i) => `sym_${i}`)]) {
    assert.equal((html.match(new RegExp(`[{,]${key}:"`, 'g')) || []).length, 3, `falta ${key} en alguno de los tres idiomas`);
  }
  // El computador de la practica dejo de ser un emoji en su contador y en el final.
  const practice = html.slice(html.indexOf('function renderPracticeStatus()'), html.indexOf('function syncRepeatAvailability'));
  assert.doesNotMatch(practice, /🤖/);
  assert.doesNotMatch(section('s-game') + section('s-practice-game'), /[\u{1F300}-\u{1FAFF}]/u);
});

test('tu codigo va plegado hasta que lo pides, y al final se ve', () => {
  assert.match(section('s-game'), /<button type="button" class="secret-peek" id="g-mysecret" aria-pressed="false" onclick="toggleSecretPeek\(\)">/);
  assert.match(fn('paintMySecret'), /const shown=!!secret&&\(secretPeek\|\|!!\(gState&&gState\.status==='finished'\)\)/);
});
