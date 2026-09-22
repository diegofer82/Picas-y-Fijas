import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Serie Plaza, lote 6 (4.7.0): volver cada dia. El codigo del dia, el ranking
   con su podio, el perfil con las insignias dibujadas, los enigmas en rejilla,
   la arena con sus barras y la tarjeta de fin con confeti. Lo que no puede
   pasar: que un teclado deduzca por nadie, que una pantalla nueva cueste una
   lectura mas en D1, que la arena enseñe algo del codigo que no estuviera ya
   en la clasificacion, o que el sondeo relance la tarjeta cada dos segundos. */

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const worker = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');

function section(id) {
  const start = html.indexOf(`<section id="${id}"`);
  assert.ok(start >= 0, `falta ${id}`);
  return html.slice(start, html.indexOf('</section>', start));
}
function fn(name) {
  const start = html.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `falta ${name}`);
  const end = html.indexOf('\n}\n', start);
  return html.slice(start, end + 2);
}

test('las insignias se dibujan: adios a los emoji de BADGE_ICONS', () => {
  assert.doesNotMatch(html, /BADGE_ICONS/);
  const art = html.slice(html.indexOf('const BADGE_ART={'), html.indexOf('const BADGE_ORDER='));
  const codes = [...art.matchAll(/^\s{2}(\w+):\{bg:/gm)].map((m) => m[1]);
  assert.deepEqual(codes, ['first_win', 'solved_4', 'fast_finish', 'expert_rules', 'wins_10', 'wins_50', 'days_7'],
    'las siete del servidor, en el orden de la rejilla');
  assert.doesNotMatch(art, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'ningun emoji');
  // El verde y el naranja son informacion del juego: ninguna insignia los usa.
  assert.doesNotMatch(art, /#12A150|#39D37E|#E0731A|#F6A040/i);
  assert.match(fn('badgeChipHTML'), /badgeSVG\(code,28\)/, 'la tarjeta final tambien las dibuja');
  // El perfil ensena las siete: las ganadas y, apagadas, las que faltan.
  const render = fn('renderProfile');
  assert.match(render, /BADGE_ORDER\.map\(code=>/);
  assert.match(render, /bcell\$\{got\?'':' off'\}/);
});

test('el codigo del dia, los enigmas y la arena escriben con el muelle, que no deduce', () => {
  for (const [id, pad] of [['s-daily', 'daily-pad'], ['s-puzzles', 'pz-pad'], ['s-arena', 'arena-pad']]) {
    const s = section(id);
    assert.match(s, new RegExp(`<div class="dock-pad" id="${pad}" role="group"></div>`), `${id} lleva su teclado`);
    assert.doesNotMatch(s, /<input type="text"/, `${id} ya no abre el teclado del telefono`);
  }
  for (const name of ['dailyPad', 'puzzlePad', 'arenaPad']) {
    const def = html.match(new RegExp(`const ${name}=makeDockPad\\(\\{[\\s\\S]*?\\}\\);\\n`));
    assert.ok(def, `falta ${name}`);
    assert.doesNotMatch(def[0], /marks:|Deduce|guesses|clues/, `${name} no mira las pistas`);
  }
  // El teclado fisico llega a los tres, igual que a la partida.
  const dock = fn('activeDock');
  assert.match(dock, /currentView==='daily'&&dailyData&&!dailyData\.finished\) return \{pad:dailyPad/);
  assert.match(dock, /currentView==='puzzles'&&puzzleOpen&&!puzzleOpen\.finished\) return \{pad:puzzlePad/);
  assert.match(dock, /currentView==='arena'&&[\s\S]*return \{pad:arenaPad/);
});

test('ninguna pantalla nueva pide nada al servidor que no pidiera antes', () => {
  // El podio y la tarjeta azul salen de la misma respuesta del ranking.
  assert.doesNotMatch(fn('renderRank') + fn('renderRankMe'), /\bapi\(/);
  // Lo que acaba de pasar en la arena sale de comparar dos sondeos.
  assert.doesNotMatch(fn('arenaEvents') + fn('renderArenaFeed') + fn('arenaRowHTML'), /\bapi\(/);
  // Los enigmas siguen sin API ni sesion.
  const puzzles = html.slice(html.indexOf('const PUZZLE_FILE='), html.indexOf('let historyEntries='));
  assert.doesNotMatch(puzzles, /\bapi\(/);
  // La tarjeta de fin y el confeti son cosa de la pantalla.
  assert.doesNotMatch(fn('endCardHTML') + fn('revealHTML') + fn('rainConfetti') + fn('playedTime'), /\bapi\(/);
});

test('la arena solo cuenta lo que la clasificacion ya ensena', () => {
  const events = fn('arenaEvents');
  for (const field of events.match(/row\.(\w+)/g) || [])
    assert.ok(['row.username', 'row.solvedAt', 'row.gaveUp', 'row.attempts', 'row.bestFijas'].includes(field), `${field} no es publico`);
  assert.doesNotMatch(events, /guess|secret|picas/, 'ni intentos ajenos, ni codigo, ni picas');
  // La barra de cada uno es su mejor numero de fijas, nunca sus picas.
  const row = fn('arenaRowHTML');
  assert.match(row, /row\.bestFijas/);
  assert.doesNotMatch(row, /picas|guesses/);
});

test('la tarjeta de fin se pinta una vez y el confeti es solo de la victoria', () => {
  assert.match(fn('paintOnce'), /if\(el\.dataset\.paint===key\) return false;/, 'el sondeo no la relanza');
  assert.match(fn('renderGame'), /if\(paintOnce\(banner,html\)\) countUp\(banner\);\n\s*paintOnce\(\$\('g-after'\),after\);/);
  assert.match(fn('endSound'), /if\(kind==='win'\) rainConfetti\(\);/);
  assert.match(fn('rainConfetti'), /if\(calmMotion\(\)\) return;/, 'con reducir movimiento no cae nada');
  // Repasar una partida del historial no es volver a ganarla.
  assert.match(fn('renderGame'), /if\(!endSoundPlayed&&!spectator&&!reviewingHistory\)/);
  // La revancha va antes que la rejilla y el analisis.
  const body = section('s-game');
  assert.ok(body.indexOf('id="g-rematch-zone"') < body.indexOf('id="g-after"'));
  assert.match(html, /<button class="btn ghost" onclick="shareCard\(\)">/, 'compartir no compite con la revancha');
});

test('los puntos de la tarjeta salen de la cuenta pura, sin leer nada', () => {
  const view = worker.slice(worker.indexOf('function gameView('), worker.indexOf('async function historyGame('));
  assert.match(view, /scoreGame\(game\)/);
  assert.doesNotMatch(view, /db\.|prepare\(/, 'ni una lectura mas en D1');
  assert.match(worker, /const response = gameView\(game, user\.username\);/, 'el sondeo de la partida');
  assert.match(worker, /response\.state = gameView\(updated, user\.username\);/, 'el intento que la termina');
  // El historial no los lleva: las partidas de antes de la 3.10.0 no los tenian.
  assert.match(worker, /async function historyGame[\s\S]*?return sanitizeGame\(game, user\.username\);/);
  assert.match(fn('renderGame'), /typeof st\.points==='number'&&!reviewingHistory/);
});

test('los textos nuevos existen en los tres idiomas', () => {
  for (const key of ['me_you', 'daily_kicker', 'daily_you_playing', 'ec_vs', 'ec_attempts', 'ec_time', 'ec_points',
    'reveal_tag', 'reveal_mine', 'rank_sub_month', 'rank_days_left', 'rank_how', 'rank_how_note', 'rank_me_pos',
    'rank_me_gap', 'rank_me_first', 'rank_me_none', 'profile_public', 'profile_badges_count', 'badge_missing',
    'pz_kicker', 'pz_level_name', 'arena_hero_t_active', 'arena_try_of', 'arena_feed_title', 'arena_ev_up',
    'arena_ev_solved', 'arena_ev_out', 'arena_ev_left', 'ago_s', 'ago_m'])
    assert.equal((html.match(new RegExp(`(?:[{,]|\\n\\s*)${key}:`, 'g')) || []).length, 3, `falta ${key} en alguno de los tres idiomas`);
});
