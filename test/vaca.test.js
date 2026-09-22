import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

/* Serie Plaza, lote 2: la vaca sustituye al toro. Sus trazados viven en varios
   sitios a la vez —el logo de la cabecera, VACA_BODY en el script, las dos
   vacas de /admin y tools/make-icons.mjs— y estas pruebas son lo que impide que
   se separen, que era la debilidad de la regla «cambiarla en los tres». */

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const readBytes = (name) => readFile(new URL(`../${name}`, import.meta.url));

function constant(html, name) {
  const m = html.match(new RegExp(`const ${name}='([^']*)';`));
  assert.ok(m, `falta ${name}`);
  return m[1];
}
function faces(html) {
  const start = html.indexOf('const VACA_FACE={');
  assert.notEqual(start, -1, 'falta VACA_FACE');
  const block = html.slice(start, html.indexOf('};', start));
  return Object.fromEntries([...block.matchAll(/^\s*(\w+):'([^']*)'/gm)].map(m => [m[1], m[2]]));
}
const paths = (svg) => [...svg.matchAll(/ d="([^"]+)"/g)].map(m => m[1]);

/* El primer pixel de la primera fila no depende del filtro PNG: con x=0 y sin
   fila anterior, Sub, Up, Average y Paeth dejan el byte tal cual. */
function firstPixel(png) {
  assert.equal(png.toString('latin1', 1, 4), 'PNG');
  const colorType = png[25];
  const idat = [];
  for (let at = 8; at < png.length;) {
    const len = png.readUInt32BE(at), type = png.toString('latin1', at + 4, at + 8);
    if (type === 'IDAT') idat.push(png.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  assert.ok(colorType === 2 || colorType === 6, `tipo de color ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  return [raw[1], raw[2], raw[3]];
}

test('la vaca tiene cuatro humores y el toro ya no esta en el juego', async () => {
  const html = await read('public/index.html');
  assert.deepEqual(Object.keys(faces(html)), ['calm', 'alert', 'happy', 'sad']);
  assert.match(html, /function vacaSVG\(mood,width\)\{/);
  assert.doesNotMatch(html, /toroSVG|TORO_|class="toro"|\.toro\b/);
  // Los cuatro sitios que la piden: la portada, empate, victoria y derrota.
  // Desde la 4.4.0 el saludo del vestibulo lleva la inicial y no la vaca.
  const home = html.slice(html.indexOf('<section id="s-login"'), html.indexOf('<!-- BUZON DE SUGERENCIAS -->'));
  assert.match(home, /<div class="home-hero" aria-hidden="true">[\s\S]*<span data-vaca="alert" data-vaca-size="132"><\/span>/);
  assert.doesNotMatch(html, /lobby-vaca/);
  assert.match(html, /vacaSVG\('calm',118\)/);
  assert.match(html, /won\?vacaSVG\('happy',150\):vacaSVG\('sad',118\)/);
});

test('las barras de turno piden la vaca alerta y no repiten sus trazados', async () => {
  const html = await read('public/index.html');
  for (const id of ['practice-turn', 'g-turn']) {
    const bar = html.match(new RegExp(`<div class="turnbar[^"]*" id="${id}">(.*?)</div>`));
    assert.ok(bar, `falta ${id}`);
    assert.match(bar[1], /<span data-vaca="alert" data-vaca-size="34"><\/span>/);
    assert.doesNotMatch(bar[1], /<path/);
  }
  assert.match(html, /querySelectorAll\('\[data-vaca\]'\)\.forEach\(el=>\{\s*el\.outerHTML=vacaSVG\(/);
  assert.match(html, /\.turnbar \.vaca\{display:none\}/);
  assert.match(html, /\.turnbar\.mine \.vaca\{display:block/);
});

test('el logo de la cabecera y las vacas de /admin son la misma vaca del script', async () => {
  const html = await read('public/index.html');
  const body = constant(html, 'VACA_BODY');
  const calm = faces(html).calm;
  const logo = html.match(/<button type="button" class="logo" id="brand-home" onclick="brandHome\(\)">(<svg .*?<\/svg>)<\/button>/);
  assert.ok(logo, 'falta el logo');
  assert.ok(logo[1].includes(body + calm), 'el logo no dibuja la vaca tranquila de VACA_BODY');
  assert.match(logo[1], /viewBox="0 2 96 84" fill="none"/);

  const admin = await read('public/admin.html');
  const cows = [...admin.matchAll(/<svg class="vaca" [^>]*viewBox="0 2 96 84" fill="none"[^>]*>(.*?)<\/svg>/g)];
  assert.equal(cows.length, 2, 'la cabecera y el boton de volver');
  for (const cow of cows) assert.ok(cow[1].startsWith(body), 'una vaca de /admin se ha separado');
  assert.doesNotMatch(admin, /class="toro"/);
});

test('el generador de iconos dibuja los mismos trazados que el juego', async () => {
  const html = await read('public/index.html');
  const icons = await read('tools/make-icons.mjs');
  for (const d of [...paths(constant(html, 'VACA_BODY')), ...paths(faces(html).calm)]) {
    assert.ok(icons.includes(`'${d}'`), `make-icons.mjs no tiene el trazado ${d}`);
  }
  assert.match(icons, /const EYES = \[\[38, 46, 4\], \[58, 46, 4\]\];/);
  assert.match(icons, /const NOSTRILS = \[\[39, 67\], \[57, 67\]\];/);
});

test('los iconos y las tarjetas sociales se regeneraron con la marca nueva', async () => {
  for (const name of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']) {
    assert.deepEqual(firstPixel(await readBytes(`public/${name}`)), [0x2f, 0x5b, 0xff], `${name} no es azul`);
  }
  for (const lang of ['es', 'en', 'fr']) {
    assert.deepEqual(firstPixel(await readBytes(`public/og-${lang}.png`)), [0xff, 0xf5, 0xe8], `og-${lang} no es crema`);
  }
});

test('las paginas publicas definen todos los colores que piden sus dibujos', async () => {
  for (const name of ['install-es', 'install-en', 'install-fr', 'rules-es', 'rules-en', 'rules-fr']) {
    const page = await read(`public/${name}.html`);
    const root = page.match(/:root\{([^}]*)\}/);
    assert.ok(root, `${name} sin :root`);
    const defined = new Set([...root[1].matchAll(/(--[a-z0-9-]+):/g)].map(m => m[1]));
    for (const [, used] of page.matchAll(/var\((--[a-z0-9-]+)\)/g)) {
      assert.ok(defined.has(used), `${name} pide ${used} y no lo define`);
    }
    assert.match(page, /<meta name="theme-color" content="#FFF5E8"/);
    assert.match(page, /family=Bricolage\+Grotesque/);
  }
});

test('las guias en PDF llevan la paleta Plaza', async () => {
  for (const name of ['tools/pdf/crear_guia_estrategias.py', 'tools/pdf/create_strategy_translations.py']) {
    const src = await read(name);
    assert.match(src, /NAVY ?= ?colors\.HexColor\(["']#1B1638["']\)/, `${name}: la tinta no es la de Plaza`);
    assert.doesNotMatch(src, /#241E17|#5C4A33|#DDD2C0/, `${name} conserva colores de Mesa`);
  }
});
