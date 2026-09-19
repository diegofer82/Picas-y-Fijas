import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

/* E4-T1 y E4-T2. El motor de deduccion sale del rival y pasa a ser de la casa:
   lo que se comprueba aqui es que sigue sin saber ningun secreto, que mide lo
   que dice medir, y que se niega a rehacer una partida cuyo espacio no cabe en
   el telefono de quien juega. */

const engineSource = await readFile(new URL("../public/deduce.js", import.meta.url), "utf8");
const rivalSource = await readFile(new URL("../public/computer-ai.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

const context = vm.createContext({ Math });
vm.runInContext(engineSource, context);
vm.runInContext(rivalSource, context);
const Deduce = context.Deduce;
const ComputerAI = context.ComputerAI;

const COLORS6 = { mode: "colors", numColors: 6, digits: 4, allowRepeats: true };

test("el rival ya no guarda saber propio: lo pide prestado al motor", () => {
  assert.equal(ComputerAI.evaluate, Deduce.evaluate);
  assert.equal(ComputerAI.enumerate, Deduce.enumerate);
  assert.equal(ComputerAI.compatible, Deduce.compatible);
  assert.equal(ComputerAI.createSolver, Deduce.createSolver);
  assert.doesNotMatch(rivalSource, /fijas\+\+|picas \+=/, "el rival no vuelve a implementar la puntuacion");
});

test("se sabe cuantos codigos hay sin fabricar ni uno", () => {
  for (const rules of [
    COLORS6,
    { mode: "colors", numColors: 4, digits: 3, allowRepeats: false },
    { mode: "numbers", digits: 3, allowRepeats: false },
    { mode: "numbers", digits: 2, allowRepeats: true },
  ]) assert.equal(Deduce.spaceSize(rules), Deduce.enumerate(rules).length, JSON.stringify(rules));
  assert.equal(Deduce.spaceSize({ mode: "numbers", digits: 6, allowRepeats: true }), 1000000);
});

test("un intento parte la lista de posibles en grupos que suman el total", () => {
  const all = Deduce.enumerate(COLORS6);
  const { buckets, worst } = Deduce.split(all, "0123");
  let total = 0;
  for (const size of buckets.values()) total += size;
  assert.equal(total, all.length);
  assert.ok(worst < all.length, "un intento util no deja todo en el mismo grupo");
});

test("el motor no recibe ni deduce el secreto: solo intentos y puntuaciones", () => {
  const secret = "5042";
  const history = [];
  let candidates = Deduce.enumerate(COLORS6);
  for (const guess of ["0123", "4501", "5042"]) {
    const score = Deduce.evaluate(secret, guess);
    history.push({ guess, ...score });
    candidates = Deduce.filter(candidates, guess, score);
  }
  assert.deepEqual([...candidates], [secret], "las pistas bastan para quedarse con uno");
  assert.equal(Deduce.compatible(secret, history), true);
  assert.equal(Object.keys(Deduce).includes("secret"), false);
});

test("cada intento recibe una nota y se senala la jugada que decidio la partida", () => {
  const secret = "5042";
  const guesses = ["0123", "4501", "5042"].map((guess) => ({ guess, ...Deduce.evaluate(secret, guess) }));
  const report = Deduce.gradeGame(COLORS6, guesses);
  assert.equal(report.available, true);
  assert.equal(report.notes.length, 3);
  for (const note of report.notes) assert.ok(["optimal", "good", "wasted"].includes(note.label), note.label);
  assert.equal(report.notes[0].before, Deduce.spaceSize(COLORS6), "antes del primer intento estan todos");
  assert.ok(report.notes[0].after < report.notes[0].before, "la lista se encoge con la primera pista");
  assert.equal(report.notes.at(-1).after, 1, "al final solo queda el codigo");
  assert.equal(report.decisiveIndex, report.notes.findIndex((note) => note.before > 1 && note.after === 1),
    "la jugada decisiva es aquella tras la cual solo quedaba un codigo");
  assert.ok(report.decisiveIndex >= 0);
});

test("repetir un intento que ya no ensena nada se nota como desperdiciado", () => {
  const secret = "5042";
  const first = { guess: "0123", ...Deduce.evaluate(secret, "0123") };
  const again = { guess: "0123", ...Deduce.evaluate(secret, "0123") };
  const report = Deduce.gradeGame(COLORS6, [first, again]);
  assert.equal(report.notes[1].label, "wasted");
  assert.equal(report.notes[1].before, report.notes[1].after, "no descarto ni un codigo");
});

test("un turno perdido al tiempo no recibe nota, y sin espacio abarcable no hay analisis", () => {
  const secret = "5042";
  const guesses = [{ missed: true, reason: "timeout" }, { guess: "0123", ...Deduce.evaluate(secret, "0123") }];
  assert.equal(Deduce.gradeGame(COLORS6, guesses).notes.length, 1);
  const huge = Deduce.gradeGame({ mode: "numbers", digits: 6, allowRepeats: true }, [{ guess: "012345", fijas: 0, picas: 2 }]);
  assert.equal(huge.available, false, "un millon de codigos no se rehace en el telefono de nadie");
  assert.equal(huge.notes.length, 0);
});

test("la pagina carga el motor antes que el rival y no gasta nada en D1", () => {
  assert.ok(html.indexOf('src="/deduce.js"') < html.indexOf('src="/computer-ai.js"'), "deduce.js va primero");
  const block = html.match(/function analysisBlock\(rules,guesses\)\{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(block, /\bapi\(/, "el analisis no cuesta ni una lectura");
  assert.doesNotMatch(block, /secret/, "el analisis no toca ningun secreto");
  const calls = html.match(/analysisBlock\((?!rules,guesses\)\{)/g) || [];
  assert.ok(calls.length >= 4, "el codigo del dia, las dos practicas y la partida entre personas");
  for (const key of ["analysis_title", "analysis_optimal", "analysis_good", "analysis_wasted", "analysis_left", "analysis_decisive", "analysis_foot"])
    assert.equal((html.match(new RegExp(key + ":", "g")) || []).length, 3, `falta ${key} en alguno de los tres idiomas`);
});
