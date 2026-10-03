/* Las cifras de la guia de estrategias, medidas y no opinadas.

   La guia recomendaba aperturas de memoria —1122 con repeticion, 123-456-789
   sin ella— y el propio juego, al puntuar una partida en «Como se jugo», les
   ponia «Correcto» y no «Optimo». Este script le pregunta al mismo motor que
   pone esa nota (public/deduce.js) cuantos codigos deja de media cada forma de
   apertura, cual es la mejor segunda jugada y cuantos intentos gasta quien
   juega siempre lo que menos deja; y a la cuenta de puntos del servidor
   (src/score.js), lo que vale cada juego de reglas. Lo que sale es
   tools/pdf/datos.json, que tools/pdf/guia.py dibuja en los tres idiomas.

   Uso:  node tools/pdf/make-datos.mjs      (tarda un par de minutos)
   Es determinista: no sortea nada. test/strategy-guide.test.js vuelve a medir
   lo que es barato de medir y falla si datos.json dice otra cosa. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCORE, codeSpace, difficulty } from '../../src/score.js';
import { ARENA } from '../../src/arena.js';
import { DAILY_RULES } from '../../src/daily.js';
import { LIMITS } from '../../src/game.js';
import puzzleData from '../../src/puzzle-data.js';

const path = (name) => fileURLToPath(new URL(`../../${name}`, import.meta.url));
new Function(readFileSync(path('public/deduce.js'), 'utf8'))();
const D = globalThis.Deduce;
const round = (value, places = 1) => Number(value.toFixed(places));

/* -------------------- las aperturas --------------------
   Antes del primer intento todas las posiciones y todos los simbolos valen lo
   mismo, asi que de una apertura solo importa su forma: cuantos simbolos
   distintos lleva y cuantas veces repite cada uno (ABCD, AABC, AABB...). */
export function shapes(digits, symbols) {
  const out = [];
  (function walk(left, max, parts) {
    if (!left) { if (parts.length <= symbols) out.push(parts.slice()); return; }
    for (let size = Math.min(left, max); size >= 1; size--) { parts.push(size); walk(left - size, size, parts); parts.pop(); }
  })(digits, digits, []);
  return out;
}
export const shapeCode = (parts) => parts.map((size, i) => String(i).repeat(size)).join('');
export const shapeName = (parts) => parts.map((size, i) => 'ABCDEF'[i].repeat(size)).join('');
// La misma frontera que gradeTurn(): optimo hasta un 10 % por encima del mejor.
export const gradeOf = (value, best) =>
  value <= best * 1.1 + 0.05 ? 'optimal' : value <= Math.max(best * 2, best + 1) + 1e-9 ? 'good' : 'wasted';

export function openingRow(rules) {
  const all = D.enumerate(rules);
  const list = shapes(rules.digits, rules.numColors)
    .filter((parts) => rules.allowRepeats || parts.every((size) => size === 1))
    .map((parts) => ({ shape: shapeName(parts), left: D.expectedLeft(all, shapeCode(parts), rules.digits) }))
    .sort((a, b) => a.left - b.left);
  const best = list[0].left;
  // El peor caso —el grupo mas grande que puede dejar— solo donde contarlo es barato.
  const worst = (shape) => {
    if (all.length > 300000) return null;
    const guess = shapeCode(shapes(rules.digits, rules.numColors).find((parts) => shapeName(parts) === shape)), groups = new Map();
    for (const secret of all) { const score = D.evaluate(secret, guess), key = score.fijas * 10 + score.picas; groups.set(key, (groups.get(key) || 0) + 1); }
    return Math.max(...groups.values());
  };
  return {
    mode: rules.mode, symbols: rules.numColors, digits: rules.digits, repeats: rules.allowRepeats, size: all.length,
    shapes: list.map((item) => ({ shape: item.shape, left: round(item.left), pct: round(100 * item.left / all.length), worst: worst(item.shape), grade: gradeOf(item.left, best) })),
  };
}

export const OPENING_RULES = [
  { mode: 'numbers', numColors: 10, digits: 3, allowRepeats: false },
  { mode: 'numbers', numColors: 10, digits: 4, allowRepeats: false },
  { mode: 'numbers', numColors: 10, digits: 5, allowRepeats: false },
  { mode: 'numbers', numColors: 10, digits: 6, allowRepeats: false },
  { mode: 'numbers', numColors: 10, digits: 3, allowRepeats: true },
  { mode: 'numbers', numColors: 10, digits: 4, allowRepeats: true },
  { mode: 'numbers', numColors: 10, digits: 5, allowRepeats: true },
  { mode: 'numbers', numColors: 10, digits: 6, allowRepeats: true },
  { mode: 'colors', numColors: 4, digits: 4, allowRepeats: true },
  { mode: 'colors', numColors: 6, digits: 4, allowRepeats: true },
  { mode: 'colors', numColors: 8, digits: 4, allowRepeats: true },
];

/* -------------------- la segunda jugada --------------------
   Tras la apertura, para cada respuesta posible: cuantos codigos quedan, cual
   es el intento que menos deja de media —buscado entre todos los codigos, no
   solo entre los que aun pueden ser— y como esta hecho respecto a la apertura:
   cuantas cifras deja en su sitio, cuantas cambia de sitio y cuantas estrena. */
export function bestProbe(candidates, all, digits) {
  if (candidates.length === 1) return { guess: candidates[0], left: 0 };
  const possible = new Set(candidates);
  let guess = null, left = Infinity, isCandidate = false;
  for (const probe of all) {
    const value = D.expectedLeft(candidates, probe, digits), candidate = possible.has(probe);
    if (value < left - 1e-9 || (Math.abs(value - left) <= 1e-9 && candidate && !isCandidate)) { guess = probe; left = value; isCandidate = candidate; }
  }
  return { guess, left };
}
export function secondMove(rules, open) {
  const all = D.enumerate(rules), groups = new Map();
  for (const secret of all) {
    const score = D.evaluate(secret, open), key = score.fijas * 10 + score.picas;
    if (!groups.has(key)) groups.set(key, { f: score.fijas, p: score.picas, list: [] });
    groups.get(key).list.push(secret);
  }
  const fresh = [...'0123456789'].filter((digit) => !open.includes(digit)).slice(0, rules.digits).join('');
  const rows = [...groups.values()].sort((a, b) => b.list.length - a.list.length).map((group) => {
    const best = bestProbe(group.list, all, rules.digits);
    let same = 0, moved = 0, added = 0;
    [...best.guess].forEach((digit, i) => { if (open[i] === digit) same++; else if (open.includes(digit)) moved++; else added++; });
    return {
      f: group.f, p: group.p, count: group.list.length, pct: round(100 * group.list.length / all.length),
      best: best.guess, same, moved, fresh: added, left: round(best.left),
      allNew: round(D.expectedLeft(group.list, fresh, rules.digits)),
    };
  });
  return { digits: rules.digits, size: all.length, open, allNewGuess: fresh, rows };
}

/* -------------------- cuantos intentos hacen falta --------------------
   Todos los codigos de cuatro cifras sin repetir, uno por uno, jugados por
   quien elige siempre el intento que menos deja de media. No es el optimo
   teorico, pero es la misma vara del analisis y sirve de techo razonable. */
function triesNeeded(rules, open) {
  const all = D.enumerate(rules), cache = new Map(), dist = {};
  let total = 0;
  for (const secret of all) {
    let candidates = all, guess = open, turns = 0, key = '';
    for (;;) {
      turns++;
      const score = D.evaluate(secret, guess);
      if (score.fijas === rules.digits) break;
      candidates = D.filter(candidates, guess, score);
      key += `${guess}:${score.fijas}${score.picas}|`;
      if (!cache.has(key)) cache.set(key, bestProbe(candidates, all, rules.digits).guess);
      guess = cache.get(key);
    }
    total += turns;
    dist[turns] = (dist[turns] || 0) + 1;
  }
  const upTo = (n) => round(100 * Object.entries(dist).filter(([turns]) => Number(turns) <= n).reduce((sum, [, count]) => sum + count, 0) / all.length);
  return { size: all.length, avg: round(total / all.length, 2), max: Math.max(...Object.keys(dist).map(Number)), dist, upTo4: upTo(4), upTo5: upTo(5), upTo6: upTo(6) };
}

/* Una partida de ejemplo, jugada por el motor: lo que queda tras cada intento. */
export function exampleGame(rules, open, secret) {
  const all = D.enumerate(rules), line = [];
  let candidates = all, guess = open;
  for (;;) {
    const score = D.evaluate(secret, guess);
    if (score.fijas < rules.digits) candidates = D.filter(candidates, guess, score);
    line.push({ guess, f: score.fijas, p: score.picas, left: score.fijas === rules.digits ? 0 : candidates.length });
    if (score.fijas === rules.digits) return { secret, line };
    guess = bestProbe(candidates, all, rules.digits).guess;
  }
}

/* -------------------- lo que paga cada juego de reglas -------------------- */
const game = (mode, symbols, digits, repeats, extra = {}) =>
  ({ mode, num_colors: symbols, digits, allow_repeats: repeats ? 1 : 0, max_attempts: 0, turn_seconds: 0, time_mode: 'turn', ...extra });
export const DIFFICULTY_RULES = [
  ['numbers', 10, 3, false], ['numbers', 10, 3, true], ['numbers', 10, 4, false], ['numbers', 10, 4, true],
  ['numbers', 10, 5, false], ['numbers', 10, 5, true], ['numbers', 10, 6, false], ['numbers', 10, 6, true],
  ['colors', 6, 4, true], ['colors', 8, 6, true],
];
export function scoring() {
  const base = game('numbers', 10, 4, false);
  return {
    win: SCORE.win, draw: SCORE.draw, loss: SCORE.loss, forfeit: SCORE.forfeit, abandon: 0, maxDifficulty: SCORE.maxDifficulty,
    economy: [1, 2, 3, 4, 5, 6, 7].map((tries) => Math.max(0, SCORE.attemptBudget - 2 * tries)),
    limitBonus: difficulty({ ...base, max_attempts: 10 }) - difficulty(base),
    clockBonus: difficulty({ ...base, turn_seconds: 60 }) - difficulty(base),
    correspondenceBonus: difficulty({ ...base, turn_seconds: 86400, time_mode: 'correspondence' }) - difficulty(base),
    rules: DIFFICULTY_RULES.map(([mode, symbols, digits, repeats]) => {
      const row = game(mode, symbols, digits, repeats);
      return { mode, symbols, digits, repeats, size: codeSpace(row), difficulty: difficulty(row) };
    }),
  };
}
export const limits = () => ({
  arenaMin: ARENA.minPlayers, arenaMax: ARENA.maxPlayers,
  dailyDigits: DAILY_RULES.digits, dailyAttempts: DAILY_RULES.maxAttempts,
  pauseMinutes: LIMITS.manualPauseMs / 60000,
  puzzles: puzzleData.levels.reduce((sum, level) => sum + level.puzzles.length, 0),
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const daily = { mode: 'numbers', numColors: 10, digits: 4, allowRepeats: false };
  const three = { mode: 'numbers', numColors: 10, digits: 3, allowRepeats: false };
  console.log('aperturas…');
  const openings = OPENING_RULES.map(openingRow);
  console.log('segunda jugada…');
  const second = secondMove(daily, '0123'), second3 = secondMove(three, '012');
  console.log('partidas enteras (lo mas lento)…');
  const tries = triesNeeded(daily, '0123'), tries3 = triesNeeded(three, '012');
  const example = exampleGame(three, '012', '250');
  const data = { source: 'node tools/pdf/make-datos.mjs', openings, second, second3, example, tries, tries3, scoring: scoring(), limits: limits() };
  writeFileSync(path('tools/pdf/datos.json'), JSON.stringify(data, null, 1) + '\n');
  console.log(`tools/pdf/datos.json · media ${tries.avg} intentos, como mucho ${tries.max}`);
}
