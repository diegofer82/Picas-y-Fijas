import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

/* Ver pensar al ordenador (E4-T4).

   El rival ya sabía deducir; lo que no hacía era decirlo. Ahora cada intento
   suyo llega con las dos cifras que explican la jugada: cuántos códigos
   seguían en pie antes y cuántos quedan después, y en cuántos grupos parte
   ese intento la lista. Salen del mismo solucionador que elige la jugada, así
   que no cuestan una pasada de más, funcionan sin conexión como el resto de la
   práctica y no tocan el código del jugador. */

const engineSource = await readFile(new URL("../public/deduce.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const context = vm.createContext({ Math });
vm.runInContext(engineSource, context);
const Deduce = context.Deduce;

const RULES = { mode: "numbers", digits: 3, numColors: 10, allowRepeats: false };

test("el solucionador dice con cuántos códigos contaba y en cuántos grupos los parte", () => {
  const solver = Deduce.createSolver(RULES, "normal");
  const total = Deduce.spaceSize(RULES);
  const first = solver.explain("012");
  assert.equal(first.before, total, "antes del primer intento están todos");
  assert.equal(first.groups, Deduce.split(Deduce.enumerate(RULES), "012").groups);
  assert.ok(first.groups > 1, "un intento útil no deja todo en el mismo grupo");
  const secret = "531";
  solver.record("012", Deduce.evaluate(secret, "012"));
  const second = solver.explain("345");
  assert.ok(second.before < total, "la lista se encogió con la primera pista");
  assert.equal(second.before, solver.candidateCount(), "es la misma lista que usa para jugar");
});

test("la explicación cuadra con la partida: antes, después y nunca el secreto", () => {
  const secret = "531";
  const solver = Deduce.createSolver(RULES, "expert", { random: () => 0.5 });
  const rows = [];
  for (let turn = 0; turn < 4; turn++) {
    const guess = solver.nextGuess();
    const { before, groups } = solver.explain(guess);
    const score = Deduce.evaluate(secret, guess);
    solver.record(guess, score);
    rows.push({ guess, before, groups, after: solver.candidateCount() });
    if (score.fijas === RULES.digits) break;
  }
  for (let index = 0; index < rows.length; index++) {
    assert.ok(rows[index].after <= rows[index].before, "una pista nunca agranda la lista");
    if (index > 0) assert.equal(rows[index].before, rows[index - 1].after, "la cuenta continúa de un intento al siguiente");
  }
  assert.equal(rows.at(-1).after, 1, "al final solo queda el código");
  assert.equal("secret" in solver, false, "el rival explica lo que deduce, no lo que le dijeron");
});

test("por encima del límite se calla el reparto en vez de bloquear el teléfono", () => {
  const huge = { mode: "numbers", digits: 5, numColors: 10, allowRepeats: true };
  assert.ok(Deduce.spaceSize(huge) > Deduce.EXPLAIN_LIMIT);
  const solver = Deduce.createSolver(huge, "easy");
  const thought = solver.explain("01234");
  assert.equal(thought.before, Deduce.spaceSize(huge), "el conteo sigue siendo exacto y gratis");
  assert.equal(thought.groups, 0, "recorrer cien mil códigos para adornar una línea, no");
});

test("la práctica pinta la explicación y no gasta ni una lectura en D1", () => {
  const practice = html.slice(html.indexOf("function computerThinkingText()"), html.indexOf("function handlePlayerComputerScore"));
  assert.doesNotMatch(practice, /\bapi\(/, "la práctica contra el computador nunca llama al servidor");
  assert.match(practice, /function thinkLine\(g\)\{/);
  assert.match(html, /computerGuesses\.push\(\{guess,\.\.\.score,before:thought\.before,after:practice\.solver\.candidateCount\(\),groups:thought\.groups\}\)/,
    "cada intento del ordenador se guarda con su explicación, así que sigue ahí al continuar la práctica");
  assert.match(html, /\$\('practice-turn-txt'\)\.textContent=computerThinkingText\(\)/,
    "mientras piensa, dice cuántos le quedan");
  assert.equal((html.match(/\$\('practice-turn-txt'\)\.textContent=computerThinkingText\(\)/g) || []).length, 2,
    "también al continuar una práctica guardada");
});

test("las frases del ordenador están en los tres idiomas", () => {
  for (const key of ["computer_thinking_left", "think_line", "think_groups"])
    assert.equal((html.match(new RegExp(key + ":", "g")) || []).length, 3, `falta ${key} en alguno de los tres idiomas`);
});
