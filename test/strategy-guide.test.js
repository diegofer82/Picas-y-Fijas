import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { SCORE, difficulty } from '../src/score.js';
import { OPENING_RULES, exampleGame, limits, openingRow, scoring, secondMove } from '../tools/pdf/make-datos.mjs';

/* La guia de estrategias (5.5.0). Hasta aqui recomendaba de memoria: abrir con
   1122 un codigo con repetidos, seguir 123-456-789 sin ellos. El propio juego,
   al puntuar la partida, les ponia «Correcto» y no «Optimo», y nadie lo habia
   mirado. Ahora la guia dibuja lo que mide el motor (tools/pdf/datos.json), y
   estas pruebas cierran las tres puertas por las que podria volver a separarse:
   que datos.json deje de ser lo que mide el motor, que las frases de la guia
   digan algo que los datos ya no sostienen, y que alguien cambie los textos y
   se olvide de regenerar los PDF. */

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const data = JSON.parse(await read('tools/pdf/datos.json'));
const texts = JSON.parse(await read('tools/pdf/textos.json'));
const generator = await read('tools/pdf/guia.py');
const LANGS = ['es', 'en', 'fr'];
const PDFS = {
  es: 'public/guia-estrategias-picas-y-fijas-es.pdf',
  en: 'public/picas-y-fijas-strategy-guide-en.pdf',
  fr: 'public/guide-strategies-picas-y-fijas-fr.pdf',
};

const opening = (mode, symbols, digits, repeats) =>
  data.openings.find((row) => row.mode === mode && row.symbols === symbols && row.digits === digits && row.repeats === repeats);
const shape = (row, name) => row.shapes.find((item) => item.shape === name);
const game = (digits, repeats, extra = {}) =>
  ({ mode: 'numbers', num_colors: 10, digits, allow_repeats: repeats ? 1 : 0, max_attempts: 0, turn_seconds: 0, time_mode: 'turn', ...extra });

test('las cifras de la guia son las que mide el motor del juego', () => {
  // Se vuelve a medir todo lo que es barato; lo demas se regenera con
  // `node tools/pdf/make-datos.mjs`.
  for (const rules of OPENING_RULES.filter((item) => item.digits <= 4)) {
    const stored = opening(rules.mode, rules.numColors, rules.digits, rules.allowRepeats);
    assert.deepEqual(stored, openingRow(rules), `apertura ${rules.mode} ${rules.numColors}/${rules.digits}: vuelve a ejecutar make-datos.mjs`);
  }
  assert.equal(data.openings.length, OPENING_RULES.length);
  assert.deepEqual(data.second, secondMove({ mode: 'numbers', numColors: 10, digits: 4, allowRepeats: false }, '0123'));
  assert.deepEqual(data.second3, secondMove({ mode: 'numbers', numColors: 10, digits: 3, allowRepeats: false }, '012'));
  assert.deepEqual(data.example, exampleGame({ mode: 'numbers', numColors: 10, digits: 3, allowRepeats: false }, '012', '250'));
  assert.deepEqual(data.scoring, scoring(), 'la cuenta de puntos cambio: la guia tiene que enterarse');
  assert.deepEqual(data.limits, limits());

  // Las partidas enteras tardan demasiado para repetirlas aqui: se comprueba
  // que lo guardado es coherente consigo mismo.
  for (const tries of [data.tries, data.tries3]) {
    const games = Object.values(tries.dist).reduce((sum, count) => sum + count, 0);
    const total = Object.entries(tries.dist).reduce((sum, [turns, count]) => sum + Number(turns) * count, 0);
    assert.equal(games, tries.size);
    assert.equal(Number((total / games).toFixed(2)), tries.avg);
    assert.equal(Math.max(...Object.keys(tries.dist).map(Number)), tries.max);
  }
});

test('lo que la guia aconseja es lo que dicen los datos', () => {
  const grade = (mode, symbols, digits, name) => shape(opening(mode, symbols, digits, true), name).grade;
  // «Con numeros, abre sin repetir hasta cuatro posiciones».
  for (const digits of [3, 4]) {
    const row = opening('numbers', 10, digits, true);
    assert.equal(row.shapes[0].shape, 'ABCD'.slice(0, digits), `con ${digits} cifras lo mejor es todo distinto`);
    assert.notEqual(grade('numbers', 10, digits, 'AABC'.slice(0, digits)), 'optimal', 'la pareja ya no es optima');
  }
  // La apertura que la guia recomendaba hasta la 5.4.0: «correcto», no «optimo».
  assert.equal(grade('numbers', 10, 4, 'AABB'), 'good');
  assert.equal(grade('numbers', 10, 4, 'AAAA'), 'wasted', 'la misma cifra en todas las posiciones, como apertura');
  // «A partir de cinco posiciones una pareja ya no cuesta nada, y con seis es lo mejor».
  assert.equal(grade('numbers', 10, 5, 'AABCD'), 'optimal');
  assert.match(opening('numbers', 10, 6, true).shapes[0].shape, /^AA/);
  // «Con pocos colores es al reves… con 8 vuelve a mandar el todo distinto».
  assert.equal(grade('colors', 4, 4, 'AABC'), 'optimal');
  assert.notEqual(grade('colors', 4, 4, 'ABCD'), 'optimal');
  assert.equal(grade('colors', 6, 4, 'AABC'), 'optimal');
  assert.equal(opening('colors', 8, 4, true).shapes[0].shape, 'ABCD');
  // AABB, la apertura clasica: mejor peor caso, peor media.
  const six = opening('colors', 6, 4, true);
  assert.ok(shape(six, 'AABB').worst < shape(six, 'AABC').worst && shape(six, 'AABB').left > shape(six, 'AABC').left);
  // Sin repeticion solo hay una forma: todas las aperturas valen lo mismo.
  for (const digits of [3, 4, 5, 6]) assert.equal(opening('numbers', 10, digits, false).shapes.length, 1);

  // La regla de la segunda jugada, fila por fila de la tabla que se dibuja.
  for (const table of [data.second, data.second3]) {
    for (const row of table.rows.filter((item) => item.pct >= 1)) {
      const tag = `${table.digits} cifras, ${row.f}F ${row.p}P`;
      if (row.f === 0 && row.p === 0) assert.equal(row.fresh, table.digits, `${tag}: todas nuevas`);
      else assert.ok(row.fresh < table.digits && row.left < row.allNew, `${tag}: estrenar todas ya no es lo mejor`);
      if (row.f === 0 && row.p > 0) assert.ok(row.same === 0 && row.moved === 2, `${tag}: recicla dos, en otro sitio`);
      if (row.f > 0) assert.ok(row.same >= 1 && row.same <= 2, `${tag}: deja una o dos donde estaban`);
    }
  }
  // «Un codigo con una sola de esas cifras, fuera de su sitio, le deja cuatro veces mas».
  const none = data.second.rows.find((row) => row.f === 0 && row.p === 0);
  const one = data.second.rows.find((row) => row.f === 0 && row.p === 1);
  assert.equal(one.count / none.count, 4);
  // Los ocho intentos del codigo del dia sobran; seis van justos.
  assert.ok(data.tries.max < data.limits.dailyAttempts && data.tries.max > 6);

  // «Al Experto»: los juegos de reglas que la guia da por buenos, y uno que no.
  assert.ok(difficulty(game(6, true)) >= 12);
  assert.ok(difficulty(game(5, true, { max_attempts: 10 })) >= 12 && difficulty(game(5, true)) < 12);
  assert.ok(difficulty(game(6, false, { turn_seconds: 60 })) >= 12);
  assert.ok(difficulty(game(4, true, { max_attempts: 10, turn_seconds: 60 })) >= 12);
  assert.ok(difficulty(game(4, true, { max_attempts: 10 })) < 12);
  // «Si quien abandona es tu rival, tu cobras 6: menos que cualquier victoria».
  assert.ok(SCORE.forfeit < SCORE.win);
});

test('los textos de la guia existen en los tres idiomas y solo citan cifras medidas', () => {
  const keys = Object.keys(texts.es);
  for (const lang of LANGS) assert.deepEqual(Object.keys(texts[lang]).sort(), [...keys].sort(), `${lang}: las mismas claves que es`);
  // Lo que va entre llaves lo rellena values_for() con datos.json: ninguna cifra a mano.
  const values = generator.slice(generator.indexOf('def values_for'), generator.indexOf('def made_of'));
  const known = new Set([...values.matchAll(/"(\w+)": /g)].map((m) => m[1]));
  for (const lang of LANGS) {
    for (const [key, text] of Object.entries(texts[lang])) {
      for (const [, name] of text.matchAll(/\{(\w+)\}/g)) assert.ok(known.has(name), `${lang}.${key} pide {${name}} y la guia no lo sabe rellenar`);
      assert.doesNotMatch(text, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, `${lang}.${key}: ni un emoji`);
    }
  }
  // Las frases que llevan una cifra del motor la piden por su nombre.
  for (const lang of LANGS) {
    assert.match(texts[lang].second_call, /\{avg\}.*\{upTo5\}.*\{max\}.*\{daily\}/s);
    assert.match(texts[lang].open_call, /\{pairExtra\}.*\{sameSymbol\}/s);
    assert.match(texts[lang].own_2, /\{none\}.*\{one\}.*\{ratio\}/s);
    assert.match(texts[lang].badge_1b, /\{upTo4\}.*\{upTo4of3\}/s);
  }
});

test('la guia se dibuja con la paleta Plaza, y verde y naranja son solo las pistas', () => {
  assert.match(generator, /TINTA = colors\.HexColor\("#1B1638"\)/);
  assert.match(generator, /FIJA = colors\.HexColor\("#12A150"\)/);
  assert.match(generator, /PICA = colors\.HexColor\("#E0731A"\)/);
  assert.doesNotMatch(generator, /#241E17|#5C4A33|#DDD2C0/, 'ningun color de la epoca Mesa');
  const pips = generator.slice(generator.indexOf('def draw_pips'), generator.indexOf('class Pips'));
  const rest = generator.replace(pips, '');
  assert.match(pips, /setFillColor\(FIJA\)/);
  assert.match(pips, /setFillColor\(PICA\)/);
  assert.equal((rest.match(/\bFIJA\b/g) || []).length, 1, 'el verde solo se usa para dibujar una fija');
  assert.equal((rest.match(/\bPICA\b/g) || []).length, 1, 'y el naranja, para una pica');
  // La pica se lee por su forma: un anillo, no un disco de otro color.
  assert.match(pips, /ring\.circle\(cx, y, radius\)\s+ring\.circle\(cx, y, radius \* 0\.5\)/);
  assert.match(generator, /c\.drawImage\(ImageReader\(str\(ICON\)\)/, 'la vaca de la portada es el icono de la app');
});

test('los PDF publicados salen de las fuentes que hay en el repositorio', async () => {
  // La misma huella que calcula guia.py: los archivos de texto, con LF.
  const digest = createHash('sha256');
  const sources = [...generator.match(/SOURCES = \[([^\]]+)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sources, ['tools/pdf/guia.py', 'tools/pdf/textos.json', 'tools/pdf/datos.json', 'public/icon-512.png']);
  for (const name of sources) {
    const bytes = await readFile(new URL(`../${name}`, import.meta.url));
    digest.update(name.endsWith('.png') ? bytes : Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1'));
  }
  const print = digest.digest('hex').slice(0, 16);
  for (const lang of LANGS) {
    const pdf = (await readFile(new URL(`../${PDFS[lang]}`, import.meta.url))).toString('latin1');
    assert.ok(pdf.startsWith('%PDF-'), `${PDFS[lang]} no es un PDF`);
    assert.ok(pdf.includes(`/Keywords (src:${print})`),
      `${PDFS[lang]} no sale de estas fuentes: vuelve a ejecutar python tools/pdf/build.py`);
    assert.ok(pdf.includes(`/Lang (${lang})`), `${PDFS[lang]} declara su idioma`);
  }
  const build = await read('tools/pdf/build.py');
  assert.match(build, /GENERADORES = \["guia\.py"\]/, 'un solo generador para los tres idiomas');
});
