import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assetPathFor, seoFor, SEO_PAGES } from '../src/index.js';

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('cada idioma tiene direccion propia y sirve la misma aplicacion', () => {
  for (const path of ['/', '/es', '/en', '/fr'])
    assert.equal(assetPathFor(path), '/index.html', `${path} deberia servir el juego`);
  assert.equal(assetPathFor('/de'), '');
});

test('la cabecera reescrita cambia de idioma y no duplica la canonica', () => {
  assert.equal(seoFor('/xx'), null);

  const es = seoFor('/');
  assert.equal(es.lang, 'es');
  assert.equal(es.canonical, 'https://picasyfijas.fans/');
  // /es es la misma pagina que la raiz: su canonica apunta ahi.
  assert.equal(seoFor('/es').canonical, es.canonical);

  const en = seoFor('/en');
  assert.equal(en.lang, 'en');
  assert.equal(en.canonical, 'https://picasyfijas.fans/en');
  assert.match(en.title, /Bulls and Cows/);

  const fr = seoFor('/fr');
  assert.equal(fr.locale, 'fr_FR');
  assert.equal(fr.image, 'https://picasyfijas.fans/og-fr.png');
  assert.match(fr.description, /d[ée]duction|code secret/i);

  // Titulos y descripciones distintos por idioma: si se repiten, los
  // buscadores tratan las tres direcciones como contenido duplicado.
  const titles = new Set(Object.keys(SEO_PAGES).map((p) => seoFor(p).title));
  assert.equal(titles.size, 3);
});

test('el Worker localiza la cabecera de las paginas de idioma', async () => {
  const source = await read('src/index.js');
  assert.match(source, /new HTMLRewriter\(\)/);
  assert.match(source, /link\[rel="canonical"\]/);
  assert.match(source, /seo \? localizeHtml\(asset, seo\) : asset/);
});

test('robots.txt abre el juego, cierra administracion y anuncia el sitemap', async () => {
  const robots = await read('public/robots.txt');
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Disallow: \/admin$/m);
  assert.match(robots, /^Disallow: \/api$/m);
  assert.match(robots, /^Sitemap: https:\/\/picasyfijas\.fans\/sitemap\.xml$/m);
});

test('el sitemap lista las tres direcciones con sus alternativas', async () => {
  const sitemap = await read('public/sitemap.xml');
  for (const loc of [
    'https://picasyfijas.fans/',
    'https://picasyfijas.fans/en',
    'https://picasyfijas.fans/fr',
  ])
    assert.ok(sitemap.includes(`<loc>${loc}</loc>`), `falta ${loc}`);
  for (const hreflang of ['es', 'en', 'fr', 'x-default'])
    assert.ok(sitemap.includes(`hreflang="${hreflang}"`), `falta hreflang ${hreflang}`);
});

test('la portada declara metadatos, alternativas y datos estructurados', async () => {
  const html = await read('public/index.html');
  assert.match(html, /<meta name="description" content="[^"]{80,}"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/picasyfijas\.fans\/">/);
  for (const hreflang of ['es', 'en', 'fr', 'x-default'])
    assert.ok(
      html.includes(`<link rel="alternate" hreflang="${hreflang}"`),
      `falta hreflang ${hreflang}`,
    );
  assert.match(html, /<meta property="og:image" content="https:\/\/picasyfijas\.fans\/og-es\.png">/);
  assert.match(html, /<meta property="og:image:width" content="1200">/);
  assert.match(html, /<meta property="og:image:height" content="630">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);

  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(ld, 'falta el bloque ld+json');
  const data = JSON.parse(ld[1]);
  assert.equal(data['@type'], 'VideoGame');
  assert.ok(data.alternateName.includes('Bulls and Cows'));
  assert.deepEqual(data.inLanguage, ['es', 'en', 'fr']);
});

test('quien llega a /en o /fr ve la aplicacion en ese idioma', async () => {
  const html = await read('public/index.html');
  assert.match(html, /const URL_LANG = \{'\/es':'es','\/en':'en','\/fr':'fr'\}\[location\.pathname\]/);
  assert.match(html, /let lang = URL_LANG \|\| localStorage\.getItem\('pf_lang'\) \|\| 'es';/);
});

test('la administracion no se indexa', async () => {
  const admin = await read('public/admin.html');
  assert.match(admin, /<meta name="robots" content="noindex,nofollow,noarchive">/);
});

test('cada idioma comparte su propia tarjeta social de 1200x630', async () => {
  // Un PNG guarda el ancho y el alto en los ocho bytes que siguen a la
  // cabecera IHDR: basta leerlos para saber que la tarjeta tiene la medida
  // que esperan las redes sociales.
  const { readFile: readBytes } = await import('node:fs/promises');
  for (const lang of ['es', 'en', 'fr']) {
    assert.equal(seoFor(lang === 'es' ? '/' : `/${lang}`).image,
      `https://picasyfijas.fans/og-${lang}.png`);
    const png = await readBytes(new URL(`../public/og-${lang}.png`, import.meta.url));
    assert.equal(png.readUInt32BE(16), 1200, `og-${lang}.png deberia medir 1200 de ancho`);
    assert.equal(png.readUInt32BE(20), 630, `og-${lang}.png deberia medir 630 de alto`);
  }
});

test('el Worker cambia tambien la tarjeta social por idioma', async () => {
  const source = await read('src/index.js');
  assert.match(source, /meta\[property="og:image"\]', set\("content", seo\.image\)/);
  assert.match(source, /meta\[name="twitter:image"\]', set\("content", seo\.image\)/);
});

test('las reglas tienen pagina propia y rastreable en cada idioma', async () => {
  const routes = {
    '/como-se-juega': 'rules-es.html',
    '/en/how-to-play': 'rules-en.html',
    '/fr/comment-jouer': 'rules-fr.html',
  };
  for (const [route, file] of Object.entries(routes))
    assert.equal(assetPathFor(route), `/${file}`, `${route} deberia servir ${file}`);

  const sitemap = await read('public/sitemap.xml');
  for (const route of Object.keys(routes))
    assert.ok(sitemap.includes(`<loc>https://picasyfijas.fans${route}</loc>`), `falta ${route}`);
});

test('cada pagina de reglas lleva el texto del juego, sin JavaScript', async () => {
  // La unica fuente del texto es RULES, dentro del juego. Si alguien edita las
  // reglas y no vuelve a generar las paginas, esta prueba lo detiene.
  const game = await read('public/index.html');
  const block = game.slice(game.indexOf('const RULES = {'));
  const words = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  for (const [lang, route] of [
    ['es', '/como-se-juega'],
    ['en', '/en/how-to-play'],
    ['fr', '/fr/comment-jouer'],
  ]) {
    const page = await read(`public/rules-${lang}.html`);
    const opening = `\n  ${lang}:` + '`';
    const from = block.indexOf(opening);
    assert.notEqual(from, -1, `no encuentro RULES.${lang}`);
    const source = block.slice(from + opening.length, block.indexOf('`', from + opening.length));
    assert.ok(
      words(page).includes(words(source)),
      `rules-${lang}.html no coincide con RULES.${lang}: vuelve a ejecutar tools/make-rules-pages.py`,
    );

    assert.ok(page.includes(`<html lang="${lang}">`));
    assert.ok(page.includes(`<link rel="canonical" href="https://picasyfijas.fans${route}">`));
    assert.match(page, /<h1>/);
    // Sin <script> ejecutable: la pagina debe leerse aunque no haya JavaScript.
    assert.equal(page.match(/<script(?![^>]*application\/ld\+json)/), null);
  }
});

test('el juego enlaza sus reglas con un enlace de verdad', async () => {
  const game = await read('public/index.html');
  const links = game.match(/<a class="link" data-rules-link href="\/como-se-juega"/g);
  assert.equal(links.length, 2, 'las dos entradas a las reglas deben ser enlaces');
  assert.match(game, /RULES_PAGE_PATH = \{es:'\/como-se-juega', en:'\/en\/how-to-play', fr:'\/fr\/comment-jouer'\}/);
  assert.match(game, /document\.querySelectorAll\('\[data-rules-link\]'\)\.forEach\(a=>\{ a\.href = rulesHref; \}\)/);
});
