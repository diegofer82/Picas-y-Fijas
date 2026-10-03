import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { LEVELS, buildPuzzles, serialize, serializeModule } from "../tools/make-puzzles.mjs";

/* Enigmas de deducción (E4-T5).

   `public/puzzles.json` es un archivo generado, y «generado» solo significa
   algo si se puede comprobar: por eso el generador es determinista y aquí se
   vuelve a ejecutar para comparar byte a byte con lo publicado.

   Lo otro que hay que vigilar es la promesa del enigma: una sola solución. Si
   quedaran dos códigos compatibles, quien juega acertaría o fallaría por azar,
   y comprobar la respuesta —que es comprobar la compatibilidad, porque el
   archivo no guarda la solución— dejaría de tener sentido. */

const engineSource = await readFile(new URL("../public/deduce.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const raw = await readFile(new URL("../public/puzzles.json", import.meta.url), "utf8");
const context = vm.createContext({ Math });
vm.runInContext(engineSource, context);
const Deduce = context.Deduce;
const published = JSON.parse(raw);

function solutions(rules, clues) {
  let left = Deduce.enumerate(rules);
  for (const [guess, fijas, picas] of clues) left = Deduce.filter(left, guess, { fijas, picas });
  return left;
}

test("el archivo publicado es exactamente el que produce el generador", () => {
  assert.equal(raw, serialize(buildPuzzles(published.seed)),
    "public/puzzles.json se regenera con `node tools/make-puzzles.mjs`, no se edita a mano");
});

test("el Worker lleva los mismos enigmas, generados en la misma pasada", async () => {
  // Desde la 5.3.0 el servidor comprueba las respuestas, así que necesita las
  // pistas. `src/puzzle-data.js` es el mismo contenido como módulo, y también
  // se compara byte a byte: dos copias que salen del mismo generador no se
  // pueden separar sin que esta prueba lo diga.
  const moduleRaw = await readFile(new URL("../src/puzzle-data.js", import.meta.url), "utf8");
  assert.equal(moduleRaw, serializeModule(buildPuzzles(published.seed)),
    "src/puzzle-data.js se regenera con `node tools/make-puzzles.mjs`, no se edita a mano");
  const { default: bundled } = await import("../src/puzzle-data.js");
  assert.deepEqual(bundled, published);
});

test("cada enigma tiene una solución y solo una", () => {
  assert.equal(published.levels.length, LEVELS.length);
  for (const level of published.levels) {
    const spec = LEVELS.find((candidate) => candidate.level === level.level);
    assert.ok(spec, `nivel inesperado: ${level.level}`);
    assert.deepEqual(level.rules, spec.rules);
    assert.equal(level.puzzles.length, spec.count);
    const seen = new Set();
    for (const puzzle of level.puzzles) {
      const left = solutions(level.rules, puzzle.clues);
      assert.equal(left.length, 1, `${puzzle.id} no tiene solución única (${left.length})`);
      assert.ok(puzzle.clues.length >= spec.minClues && puzzle.clues.length <= spec.maxClues,
        `${puzzle.id} tiene ${puzzle.clues.length} pistas`);
      for (const [guess, fijas] of puzzle.clues) {
        assert.equal(guess.length, level.rules.digits);
        assert.notEqual(fijas, level.rules.digits, "una pista nunca es el código servido en bandeja");
      }
      assert.equal(seen.has(puzzle.id), false, `${puzzle.id} repetido`);
      seen.add(puzzle.id);
    }
  }
});

test("la respuesta no está escrita en el enigma", () => {
  // El archivo se puede abrir: lo importante es que no haya nada que leer. Un
  // enigma solo lleva sus pistas, y su solución no está entre ellas, así que
  // hay que deducirla igual desde dentro del archivo que desde la pantalla.
  for (const level of published.levels)
    for (const puzzle of level.puzzles) {
      const answer = solutions(level.rules, puzzle.clues)[0];
      assert.deepEqual(Object.keys(puzzle).sort(), ["clues", "id"], `${puzzle.id} guarda algo más que sus pistas`);
      assert.equal(puzzle.clues.some(([guess]) => guess === answer), false,
        `${puzzle.id} deja ver su solución entre las pistas`);
    }
  assert.doesNotMatch(raw, /"(code|secret|solution|answer)"/, "el archivo no guarda soluciones");
});

test("comprobar una respuesta es comprobar que es compatible con las pistas", () => {
  const level = published.levels[0];
  const puzzle = level.puzzles[0];
  const answer = solutions(level.rules, puzzle.clues)[0];
  const turns = puzzle.clues.map(([guess, fijas, picas]) => ({ guess, fijas, picas }));
  assert.equal(Deduce.contradicts(answer, turns), false);
  const wrong = Deduce.enumerate(level.rules).find((code) => code !== answer);
  assert.equal(Deduce.contradicts(wrong, turns), true, "cualquier otro código contradice alguna pista");
});

test("los enigmas se juegan sin cuenta, y sin cuenta no tocan el servidor", () => {
  // Hasta la 5.2.1 esta pantalla no llamaba al API nunca. Desde la 5.3.0 lo
  // resuelto viaja a la cuenta, pero solo cuando la hay: la única llamada es
  // `puzzleSync` y su función sale en la primera línea si no hay sesión.
  // `test/puzzle-sync.test.js` la hace correr sin sesión y cuenta las llamadas.
  const block = html.slice(html.indexOf("const PUZZLE_FILE="), html.indexOf("let historyEntries="));
  assert.deepEqual(block.match(/\bapi\(/g), ["api("], "una sola llamada al API en toda la pantalla");
  assert.match(block, /async function syncPuzzles\(known\)\{\n  if\(!sessionToken\|\|!user\) return;[\s\S]*?api\('puzzleSync'/,
    "y detrás de la sesión");
  assert.match(block, /fetch\(PUZZLE_FILE/, "los enigmas se descargan del archivo publicado");
  assert.match(html, /const GUEST_VIEWS = new Set\(\[[^\]]*'puzzles'/, "se puede jugar sin cuenta");
  assert.match(html, /<section id="s-puzzles" class="hidden">/);
  assert.match(html, /onclick="openPuzzles\(\)"/);
});

test("los enigmas hablan los tres idiomas", () => {
  for (const key of ["pz_title", "pz_hint", "pz_check", "pz_reveal", "pz_solved", "pz_wrong",
    "pz_revealed", "pz_progress", "pz_clues_count", "pz_play_title", "lobby_puzzles"])
    assert.equal((html.match(new RegExp(key + ":", "g")) || []).length, 3, `falta ${key} en alguno de los tres idiomas`);
});
