import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/* E3-T3: la tarjeta de fin de partida. Se calcula entera en el navegador, no
   toca el API y, sobre todo, no puede llevar dentro ningún código: ni el mío,
   ni el del rival, ni el del día. Estas pruebas leen el cliente tal como se
   sirve, igual que las de E3-T2. */

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

function clientFunctions() {
  const marks = html.match(/const DAILY_FIJA='[^']+', DAILY_PICA='[^']+', DAILY_NADA='[^']+';/);
  const grid = html.match(/function shareGridRows\(guesses,digits\)\{[\s\S]*?\n\}/);
  const text = html.match(/function shareCardText\(card\)\{[\s\S]*?\n\}/);
  assert.ok(marks && grid && text, "la tarjeta vive en public/index.html");
  const es = html.match(/Object\.assign\(I18N\.es,\{share_card_btn:[\s\S]*?\}\);/)[0];
  const dict = new Function(`const I18N={es:{}};${es}return I18N.es;`)();
  const stubs = `
    const t=(key,params={})=>{let out=String(${JSON.stringify(dict)}[key]||key);for(const k in params)out=out.split('{'+k+'}').join(String(params[k]));return out;};
    const formatPracticeTime=ms=>Math.round(ms/1000)+'s';
    const location={origin:'https://picasyfijas.fans'};
  `;
  return new Function(`${stubs}\n${marks[0]}\n${grid[0]}\n${text[0]}\nreturn {shareGridRows,shareCardText};`)();
}

test("la tarjeta cuenta los intentos sin enseñar ninguna cifra", () => {
  const { shareCardText } = clientFunctions();
  const text = shareCardText({
    digits: 4, solved: true, attempts: 3, durationMs: 133000,
    guesses: [
      { guess: "0123", fijas: 0, picas: 2 },
      { guess: "4567", fijas: 1, picas: 1 },
      { guess: "4589", fijas: 4, picas: 0 },
    ],
  });
  const lines = text.split("\n");
  assert.equal(lines[0], "Picas y Fijas");
  assert.match(lines[1], /3 intentos/);
  assert.equal(lines.length, 2 + 3 + 1, "cabecera, una fila por intento y el enlace");
  assert.equal(lines[lines.length - 1], "https://picasyfijas.fans/");
  const grid = lines.slice(2, -1).join("");
  assert.ok(!/[0-9]/.test(grid), "ninguna cifra del intento aparece en la rejilla");
  assert.ok(!text.includes("4589"), "el código no viaja en la tarjeta");
});

test("un intento perdido al tiempo se dibuja vacío y no cuenta como acierto", () => {
  const { shareGridRows } = clientFunctions();
  const rows = shareGridRows([{ missed: true, reason: "timeout" }, { guess: "1234", fijas: 1, picas: 0 }], 3);
  assert.equal(rows.length, 2);
  assert.equal(new Set([...rows[0]]).size, 1, "un intento perdido son tres marcas iguales");
  assert.equal([...rows[0]].length, 3);
  assert.equal([...rows[1]].length, 3);
});

test("la tarjeta se ofrece al acabar cualquier partida, no solo la del día", () => {
  const calls = html.match(/shareCardBlock\(\{/g) || [];
  assert.ok(calls.length >= 3, "partida contra una persona, práctica contra el ordenador y práctica en solitario");
  // La partida entre dos personas: la tarjeta sale de mis intentos, y quien
  // solo mira una partida ajena no tiene nada que compartir.
  const game = html.match(/if\(!spectator\)\{\n\s*const digits=parseInt\(st\.digits,10\);[\s\S]*?\}\)\);/);
  assert.ok(game, "la partida contra una persona arma la tarjeta con `mine`");
  assert.match(game[0], /guesses:mine/);
  assert.doesNotMatch(game[0], /theirs|opponentSecret|mySecret/);
});

test("nada de la tarjeta llama al servidor y su texto existe en los tres idiomas", () => {
  const block = html.match(/function shareCardText\(card\)\{[\s\S]*?\n\}/)[0]
    + html.match(/function shareCardBlock\(card\)\{[\s\S]*?\n\}/)[0]
    + html.match(/async function shareCard\(\)\{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(block, /\bapi\(/, "la tarjeta no gasta ni una lectura en D1");
  for (const key of ["share_card_btn", "share_card_copied", "share_card_solved", "share_card_solved_one", "share_card_failed"])
    assert.equal((html.match(new RegExp(key + ":", "g")) || []).length, 3, `falta ${key} en alguno de los tres idiomas`);
});
