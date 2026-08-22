import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assetPathFor } from '../src/index.js';

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const readBytes = (name) => readFile(new URL(`../${name}`, import.meta.url));

const LANGS = { es: '/instalar', en: '/en/install', fr: '/fr/installer' };
const STEP_KEYS = ['install_ios_1', 'install_ios_2', 'install_ios_3',
  'install_and_1', 'install_and_2', 'install_and_3'];

/* Los textos de los pasos viven una sola vez, en las claves install_* del
   juego. Esta funcion los lee igual que tools/make-install-pages.py. */
function installTexts(game, lang) {
  const marker = `Object.assign(I18N.${lang},{install_title:`;
  const start = game.indexOf(marker);
  assert.notEqual(start, -1, `faltan las claves install_* de ${lang}`);
  const block = game.slice(start, game.indexOf('});', start));
  return Object.fromEntries([...block.matchAll(/(install_[a-z0-9_]+):"([^"]*)"/g)]
    .map(([, key, value]) => [key, value]));
}

test('el juego ofrece instalarse y sabe cuando no puede', async () => {
  const game = await read('public/index.html');

  // La tarjeta del lobby y su boton.
  assert.match(game, /id="install-card"/);
  assert.match(game, /onclick="installAction\(\)"/);
  assert.match(game, /onclick="dismissInstall\(\)"/);

  // Android instala de un toque: hay que quedarse con el evento del navegador.
  assert.match(game, /addEventListener\('beforeinstallprompt'/);
  assert.match(game, /addEventListener\('appinstalled'/);

  // Ya instalado, o descartado hace poco, la tarjeta no debe volver a salir.
  assert.match(game, /display-mode: standalone/);
  assert.match(game, /pf_install_hide/);

  // El iPhone solo puede desde Safari; en un navegador incrustado no hay nada
  // que ofrecer salvo el enlace.
  assert.match(game, /const IOS_SAFARI =/);
  assert.match(game, /const IN_APP_BROWSER =/);
  assert.match(game, /function copyInstallLink/);

  // Los seis dibujos de los pasos.
  const art = game.slice(game.indexOf('const INSTALL_ART = {'));
  for (const name of ['share', 'sheet', 'add', 'menu', 'list', 'confirm'])
    assert.match(art.slice(0, art.indexOf('\n};')), new RegExp(`\\n  ${name}:\``),
      `INSTALL_ART deberia traer el dibujo ${name}`);
});

test('en el iPhone la tarjeta de notificaciones deja de ser un callejon sin salida', async () => {
  const game = await read('public/index.html');
  // Safari no da notificaciones a una pestana: decir solo "no se admiten"
  // dejaba al jugador sin salida, cuando la salida es instalar el juego.
  assert.match(game, /const iosNeedsInstall=!supported&&IS_IOS&&!isStandalone\(\)/);
  assert.match(game, /iosNeedsInstall\?t\('experience_ios_install'\)/);
  for (const lang of Object.keys(LANGS))
    assert.match(game, new RegExp(`Object\\.assign\\(I18N\\.${lang},\\{install_title:`));
});

test('cada idioma tiene las mismas claves de instalacion', async () => {
  const game = await read('public/index.html');
  const es = Object.keys(installTexts(game, 'es')).sort();
  assert.ok(es.length >= 18, `esperaba las claves install_*, encontre ${es.length}`);
  for (const key of STEP_KEYS) assert.ok(es.includes(key), `falta ${key}`);
  for (const lang of ['en', 'fr'])
    assert.deepEqual(Object.keys(installTexts(game, lang)).sort(), es,
      `${lang} no traduce las mismas claves que es`);
});

test('la guia de instalacion tiene pagina propia y rastreable en cada idioma', async () => {
  for (const [lang, route] of Object.entries(LANGS))
    assert.equal(assetPathFor(route), `/install-${lang}.html`, `${route} deberia servir install-${lang}.html`);

  const sitemap = await read('public/sitemap.xml');
  for (const route of Object.values(LANGS))
    assert.ok(sitemap.includes(`<loc>https://picasyfijas.fans${route}</loc>`), `falta ${route} en el sitemap`);

  // Sin esto Cloudflare serviria el asset antes de que el Worker vea la ruta.
  const wrangler = await read('wrangler.jsonc');
  for (const route of Object.values(LANGS))
    assert.ok(wrangler.includes(`"${route}"`), `falta ${route} en run_worker_first`);
});

test('cada pagina de instalacion lleva los pasos del juego, sin JavaScript', async () => {
  // La unica fuente de los pasos es el juego. Si alguien los reescribe y no
  // vuelve a generar las paginas, esta prueba lo detiene.
  const game = await read('public/index.html');

  for (const [lang, route] of Object.entries(LANGS)) {
    const page = await read(`public/install-${lang}.html`);
    const texts = installTexts(game, lang);
    for (const key of STEP_KEYS)
      assert.ok(page.includes(texts[key]),
        `install-${lang}.html no trae ${key}: vuelve a ejecutar tools/make-install-pages.py`);

    assert.ok(page.includes(`<html lang="${lang}">`));
    assert.ok(page.includes(`<link rel="canonical" href="https://picasyfijas.fans${route}">`));
    assert.match(page, /<h1>/);
    // Los dibujos tambien salen del juego, no son otros.
    assert.ok(page.includes('<svg width="84" height="60"'), `install-${lang}.html deberia dibujar los pasos`);
    // Debe leerse aunque no haya JavaScript.
    assert.equal(page.match(/<script(?![^>]*application\/ld\+json)/), null);
  }
});

test('el manifest ensena capturas reales del juego al ofrecer instalarlo', async () => {
  const manifest = JSON.parse(await read('public/manifest.webmanifest'));
  assert.ok(Array.isArray(manifest.screenshots) && manifest.screenshots.length,
    'sin screenshots Android solo muestra la barrita minima');
  assert.ok(manifest.description, 'el dialogo grande de Chrome tambien lee la descripcion');

  const narrow = manifest.screenshots.filter((s) => s.form_factor === 'narrow');
  assert.ok(narrow.length, 'falta al menos una captura de movil');

  for (const shot of manifest.screenshots) {
    assert.equal(shot.type, 'image/png');
    assert.ok(shot.label, `${shot.src} deberia llevar etiqueta`);
    const png = await readBytes(`public${shot.src}`);
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    assert.equal(`${width}x${height}`, shot.sizes, `${shot.src} no mide lo que dice el manifest`);
    // Chrome descarta las capturas fuera de estos limites.
    const [min, max] = width < height ? [width, height] : [height, width];
    assert.ok(min >= 320 && max <= 3840, `${shot.src} se sale del tamano admitido`);
    assert.ok(max / min <= 2.3, `${shot.src} es demasiado alargada para Chrome`);
  }

  // Chrome exige que todas las capturas de un mismo formato compartan forma.
  const shape = (s) => s.sizes.split('x').map(Number).reduce((w, h) => w / h);
  for (const form of ['narrow', 'wide']) {
    const group = manifest.screenshots.filter((s) => s.form_factor === form);
    for (const shot of group)
      assert.ok(Math.abs(shape(shot) - shape(group[0])) < 0.01,
        `${shot.src} no tiene la misma proporcion que las demas capturas ${form}`);
  }
});
