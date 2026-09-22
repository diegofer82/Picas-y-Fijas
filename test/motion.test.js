import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Serie Plaza, lote 7 (4.8.0): el movimiento. Los nueve gestos del lienzo,
   cada uno con su razon, y un solo interruptor que los apaga todos cuando el
   sistema pide «reducir movimiento». Lo que el script mueve por su cuenta
   —confeti, puntos, entrada de pantallas— lo pregunta antes. */

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

function fn(name) {
  const start = html.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `falta ${name}`);
  const end = html.indexOf('\n}\n', start);
  return html.slice(start, end + 2);
}

test('el interruptor de «reducir movimiento» lo apaga todo y es lo ultimo de la hoja', () => {
  const rule = '@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}';
  assert.ok(css.trimEnd().endsWith(rule), 'va al final, para que ninguna regla posterior lo pise');
  assert.match(fn('calmMotion'), /matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/);
  for (const name of ['rainConfetti', 'countUp', 'animateScreen'])
    assert.match(fn(name), /calmMotion\(\)/, `${name} pregunta antes de moverse`);
});

test('los nueve gestos tienen su animacion', () => {
  // 01 · pulsacion: 80 ms y el reborde fuera
  assert.match(css, /\.btn\{[^}]*transition:transform \.08s ease,box-shadow \.08s ease/);
  assert.match(css, /\.btn:active\{transform:translateY\(4px\);box-shadow:0 0 0 transparent\}/);
  // 02 · la ficha cae con resorte, 300 ms
  assert.match(css, /\.dock-tiles \.tile\.drop\{animation:tileDrop \.3s cubic-bezier\(\.34,1\.56,\.64,1\)\}/);
  // 03 · los indicios estallan de uno en uno, 80 ms de separacion
  assert.match(css, /:is\(\.jrow\.new,\.drow\.new\) \.jpips :is\(\.pip\.f,\.pip\.p\)\{animation:pipPop/);
  assert.match(css, /\.jpips \.pip:nth-child\(2\)\{animation-delay:\.08s\}/);
  // 04 · el turno propio respira cada 1,6 s
  assert.match(css, /\.bank\.mine\.running,\.rpill\.mine\{animation:turnWave 1\.6s ease-out infinite\}/);
  // 05 · bajo diez segundos el reloj tiembla 3 px
  assert.match(css, /@keyframes clockShake\{0%,100%\{transform:translateX\(0\)\}20%\{transform:translateX\(-3px\)\}/);
  assert.match(css, /\.bank\.running\.hot \.clock,\.chip\.hot\{animation:clockShake/);
  // 06 · la victoria trae confeti, tres segundos
  assert.match(fn('endSound'), /if\(kind==='win'\) rainConfetti\(\);/);
  // 07 · esqueletos
  assert.match(css, /\.sk\{[^}]*animation:skShimmer 1\.4s linear infinite\}/);
  // 08 · las pantallas suben 24 px en 220 ms
  assert.match(css, /@keyframes scrRise\{from\{opacity:0;transform:translateY\(24px\)\}/);
  assert.match(css, /\.rise\{animation:scrRise \.22s/);
  // 09 · los puntos se cuentan en menos de un segundo
  assert.match(fn('countUp'), /span=900/);
});

test('solo cae la ficha nueva, y el teclado sigue sin deducir', () => {
  const pad = fn('makeDockPad');
  assert.match(pad, /value\+=k; changed\(\);\n[\s\S]*?tile\.classList\.add\('drop'\)/);
  assert.doesNotMatch(pad, /Deduce|guesses|gState/);
});

test('el turno respira solo en tu tarjeta, y cruzar los diez segundos vibra una vez', () => {
  const clock = fn('paintClock');
  assert.match(clock, /\(o\.mine\?' mine':''\)/);
  assert.match(clock, /if\(o\.mine&&hot&&box\.dataset\.hot!=='1'\)\{ try\{ navigator\.vibrate&&navigator\.vibrate\(60\); \}catch\(e\)\{\} \}/);
  assert.match(fn('renderClocks'), /hot:10\}\);/, 'diez segundos para los dos relojes');
  // La pastilla del vestibulo que respira es la de «Te toca», nunca la del rival.
  assert.match(fn('renderMine'), /pillCls: invite \? 'hot' : g\.yourTurn \? 'mine' : ''/);
});

test('las listas dibujan su forma antes que los datos, y el sondeo no las borra', () => {
  for (const id of ['rank-list', 'rivals-list', 'daily-board', 'profile-body', 'hist-list', 'arena-board'])
    assert.match(html, new RegExp(`\\$\\('${id}'\\)\\.innerHTML=skelHTML\\(\\d\\);`), `${id} carga con esqueleto`);
  assert.doesNotMatch(html, /<div class="empty">…<\/div>/, 'ningun «…» de espera');
  // La recarga silenciosa del vestibulo no pinta esqueletos encima de lo que ya se ve.
  assert.match(fn('lobbyRefresh'), /if\(!detect\) lobbyListsNotice\(t\('loading'\), true\);/);
  assert.match(fn('lobbyListsNotice'), /if\(!\$\('mine-list'\)\.querySelector\('\.grow'\)\)/);
});

test('una pantalla solo se anima al cambiar, y volver es mas corto que ir', () => {
  const show = fn('show');
  assert.match(show, /const previousView = currentView;/);
  assert.match(show, /if\(previousView!==name\) animateScreen\(\$\('s-'\+name\), viewDepth\(name\)<viewDepth\(previousView\)\);/);
  assert.match(css, /\.settle\{animation:scrSettle \.16s/);
  assert.doesNotMatch(css, /translateX\(100%\)|translateX\(-100%\)/, 'nada de deslizar de lado');
});
