/* Enigmas de deduccion (E4-T5).
   «Aqui tienes unas pistas: deduce el codigo.» Es contenido en solitario, sin
   rival y sin una sola fila en D1, asi que se fabrica aqui una vez y se
   publica como `public/puzzles.json`, que NO se edita a mano.

   Dos decisiones sostienen el archivo:

   - El enigma no guarda su solucion. No hace falta: cada enigma tiene una
     unica combinacion compatible con sus pistas, de modo que comprobar una
     respuesta es exactamente comprobar que es compatible, y revelarla es
     filtrar el espacio. Asi nadie encuentra la respuesta abriendo el archivo.
   - El generador es determinista: la misma semilla produce el mismo archivo,
     byte a byte. Por eso una prueba puede volver a generarlo y comparar, que
     es la unica forma de que «generado» signifique algo.

   Uso: node tools/make-puzzles.mjs
*/
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const engineSource = await readFile(new URL('../public/deduce.js', import.meta.url), 'utf8');
const context = vm.createContext({ Math });
vm.runInContext(engineSource, context);
const Deduce = context.Deduce;

export const SEED = 20260920;

/* Tres escalones del mismo juego: el espacio crece y las pistas bajan. Todos
   en numeros sin repetidos, que es como se aprende a deducir; los colores y
   los repetidos ya tienen su sitio en la practica y en las partidas. */
export const LEVELS = [
  { level: 'easy', rules: { mode: 'numbers', digits: 3, allowRepeats: false }, count: 24, minClues: 3, maxClues: 4 },
  { level: 'normal', rules: { mode: 'numbers', digits: 4, allowRepeats: false }, count: 24, minClues: 3, maxClues: 5 },
  { level: 'expert', rules: { mode: 'numbers', digits: 5, allowRepeats: false }, count: 24, minClues: 3, maxClues: 5 },
];

function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function survivors(all, clues) {
  let left = all;
  for (const clue of clues) {
    left = Deduce.filter(left, clue.g, { fijas: clue.f, picas: clue.p });
    if (left.length < 2) break;
  }
  return left;
}

/* Un enigma nace de un codigo y de pistas tomadas al azar, y solo cuenta
   cuando las pistas dejan una unica combinacion en pie. Despues se le quitan
   las pistas que sobran, una a una empezando por la ultima: lo que queda es el
   enigma mas apretado que daban esas tiradas, y ahi esta la dificultad. */
function buildLevel(spec, random) {
  const all = Deduce.enumerate(spec.rules);
  const digits = spec.rules.digits;
  const puzzles = [];
  const seen = new Set();
  for (let attempt = 0; attempt < 20000 && puzzles.length < spec.count; attempt++) {
    const secret = all[Math.floor(random() * all.length) % all.length];
    let clues = [];
    let left = all;
    for (let step = 0; step < spec.maxClues + 3 && left.length > 1; step++) {
      const probe = all[Math.floor(random() * all.length) % all.length];
      if (probe === secret || clues.some((clue) => clue.g === probe)) continue;
      const score = Deduce.evaluate(secret, probe);
      clues.push({ g: probe, f: score.fijas, p: score.picas });
      left = Deduce.filter(left, probe, score);
    }
    if (left.length !== 1) continue;
    for (let index = clues.length - 1; index >= 0; index--) {
      const trial = clues.filter((_, position) => position !== index);
      if (trial.length && survivors(all, trial).length === 1) clues = trial;
    }
    if (clues.length < spec.minClues || clues.length > spec.maxClues) continue;
    if (clues.some((clue) => clue.f === digits)) continue;
    const signature = clues.map((clue) => `${clue.g}:${clue.f}:${clue.p}`).sort().join('|');
    if (seen.has(signature)) continue;
    seen.add(signature);
    puzzles.push({
      id: `${spec.level}-${String(puzzles.length + 1).padStart(2, '0')}`,
      clues: clues.map((clue) => [clue.g, clue.f, clue.p]),
    });
  }
  if (puzzles.length < spec.count)
    throw new Error(`No se completaron los enigmas de ${spec.level}: ${puzzles.length}/${spec.count}`);
  return { level: spec.level, rules: spec.rules, puzzles };
}

export function buildPuzzles(seed = SEED) {
  const random = mulberry32(seed);
  return {
    version: 1,
    seed,
    generator: 'tools/make-puzzles.mjs',
    levels: LEVELS.map((spec) => buildLevel(spec, random)),
  };
}

/* Una pista por linea y un enigma por bloque: el archivo es generado, pero un
   diff que se pueda leer sigue valiendo la pena. */
export function serialize(data) {
  const lines = [];
  lines.push('{');
  lines.push(`  "version": ${data.version},`);
  lines.push(`  "seed": ${data.seed},`);
  lines.push(`  "generator": ${JSON.stringify(data.generator)},`);
  lines.push('  "levels": [');
  data.levels.forEach((level, levelIndex) => {
    lines.push('    {');
    lines.push(`      "level": ${JSON.stringify(level.level)},`);
    lines.push(`      "rules": ${JSON.stringify(level.rules)},`);
    lines.push('      "puzzles": [');
    level.puzzles.forEach((puzzle, puzzleIndex) => {
      const clues = puzzle.clues.map((clue) => JSON.stringify(clue)).join(', ');
      lines.push(`        { "id": ${JSON.stringify(puzzle.id)}, "clues": [${clues}] }`
        + (puzzleIndex === level.puzzles.length - 1 ? '' : ','));
    });
    lines.push('      ]');
    lines.push('    }' + (levelIndex === data.levels.length - 1 ? '' : ','));
  });
  lines.push('  ]');
  lines.push('}');
  return lines.join('\n') + '\n';
}

export const OUTPUT = new URL('../public/puzzles.json', import.meta.url);

if (process.argv[1] && process.argv[1].endsWith('make-puzzles.mjs')) {
  const data = buildPuzzles();
  await writeFile(OUTPUT, serialize(data), 'utf8');
  const total = data.levels.reduce((sum, level) => sum + level.puzzles.length, 0);
  console.log(`public/puzzles.json: ${total} enigmas en ${data.levels.length} niveles.`);
}
