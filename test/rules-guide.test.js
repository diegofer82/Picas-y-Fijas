import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SCORE, difficulty, scoreGame } from '../src/score.js';
import { ARENA } from '../src/arena.js';
import { DAILY_RULES } from '../src/daily.js';
import { LIMITS, evaluate } from '../src/game.js';
import puzzleData from '../src/puzzle-data.js';

/* «Como se juega» por capitulos (5.4.0). Las instrucciones se habian quedado
   en la 3: decian que el ranking ordenaba por victorias, hablaban de una pausa
   que la bolsa de tiempo no tiene y no nombraban ni los puntos ni las
   temporadas. Lo que estas pruebas impiden es que vuelva a pasar en silencio:
   cada cifra que la guia cuenta —lo que vale una victoria, cuantos caben en una
   arena, cuanto espera una partida— se compara aqui con la constante del
   servidor que la decide. Si alguien cambia la regla, la prueba le manda a
   cambiar tambien el texto, en los tres idiomas. */

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const html = await read('public/index.html');
const LANGS = ['es', 'en', 'fr'];

function fn(name) {
  const start = html.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `falta ${name}`);
  const end = html.indexOf('\n}\n', start);
  return html.slice(start, end + 2);
}
function constBlock(name) {
  const start = html.indexOf(`const ${name}={`);
  assert.ok(start >= 0, `falta ${name}`);
  return html.slice(start, html.indexOf('\n};', start) + 3);
}

const rulesStart = html.indexOf('const RULES = {');
const rulesSource = html.slice(rulesStart, html.indexOf('\n};', rulesStart) + 3);
const RULES = new Function(`${rulesSource}\nreturn RULES;`)();
const guideCss = html.slice(html.indexOf('/* guia:inicio'), html.indexOf('/* guia:fin */') + '/* guia:fin */'.length);

const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const chapter = (guide, n) => {
  const start = guide.indexOf(`id="rk${n}"`);
  const next = guide.indexOf(`id="rk${n + 1}"`);
  return guide.slice(start, next < 0 ? guide.length : next);
};
// Los valores de una lista de puntos: lo que va en negrita al final de cada fila.
const listValues = (list) => [...list.matchAll(/<li><span>.*?<\/span><b>([^<]*)<\/b><\/li>/g)].map((m) => m[1]);
const pointLists = (guide) => [...chapter(guide, 5).matchAll(/<ul class="rk-pts">([\s\S]*?)<\/ul>/g)].map((m) => m[1]);

// Una partida terminada de mentira: Ana descifra en `mine` intentos.
function finished(over = {}, mine = 5, theirs = mine - 1, solved = true) {
  const digits = over.digits || 4;
  const guesses = [
    ...Array.from({ length: mine }, (_, i) => ({ by: 'Ana', guess: 'x', fijas: solved && i === mine - 1 ? digits : 0, picas: 0 })),
    ...Array.from({ length: theirs }, () => ({ by: 'Beto', guess: 'x', fijas: 0, picas: 0 })),
  ];
  return {
    game_id: 'GUIA', status: 'finished', p1: 'Ana', p2: 'Beto', mode: 'numbers', num_colors: 10, digits,
    allow_repeats: 0, max_attempts: 0, turn_seconds: 0, time_mode: 'turn', winner: 'Ana', finish_reason: '',
    updated_at: '2026-10-03T12:00:00.000Z', guesses: JSON.stringify(guesses), ...over,
  };
}
const ana = (game) => scoreGame(game).players.find((player) => player.username === 'Ana');
const beto = (game) => scoreGame(game).players.find((player) => player.username === 'Beto');

test('la guia tiene siete capitulos y el mismo esqueleto en los tres idiomas', () => {
  // El texto fuera, y lo que cambia de idioma dentro de un atributo tambien.
  const skeleton = (guide) => guide
    .replace(/>[^<]+</g, '><')
    .replace(/ aria-label="[^"]*"/g, ' aria-label')
    .replace(/ href="\/[^"]*"/g, ' href');
  for (const lang of LANGS) {
    const guide = RULES[lang];
    assert.equal(skeleton(guide), skeleton(RULES.es), `${lang} no tiene el esqueleto de es`);

    const ids = [...guide.matchAll(/<div class="rk-ch t-[a-z]+" id="(rk\d)">/g)].map((m) => m[1]);
    assert.deepEqual(ids, ['rk1', 'rk2', 'rk3', 'rk4', 'rk5', 'rk6', 'rk7']);
    const nav = guide.slice(guide.indexOf('<nav class="rk-nav"'), guide.indexOf('</nav>'));
    assert.deepEqual([...nav.matchAll(/<a href="#(rk\d)">/g)].map((m) => m[1]), ids, 'la fila de arriba lleva a los siete');

    for (let n = 1; n <= 7; n++) {
      const part = chapter(guide, n);
      const step = part.slice(part.indexOf('<nav class="rk-step"'));
      assert.ok(step.includes(`<span class="rk-count">${n} / 7</span>`), `${lang}: capitulo ${n} sin su cuenta`);
      assert.equal(step.includes(`class="rk-prev" href="#rk${n - 1}"`), n > 1, `${lang}: «anterior» del capitulo ${n}`);
      assert.equal(step.includes(`class="rk-next" href="#rk${n + 1}"`), n < 7, `${lang}: «siguiente» del capitulo ${n}`);
    }

    // RULES se copia tal cual a paginas sin script: HTML fijo, sin interpolar.
    assert.equal(guide.includes('${'), false);
    assert.doesNotMatch(guide, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'ni un emoji: los iconos se dibujan');
    // openRules() busca la pantalla abierta con `section:not(.hidden)`.
    assert.equal(guide.includes('<section'), false, 'un <section> dentro de la guia confundiria a openRules');
    assert.equal(guide.split('<div class="rk-lab" hidden></div>').length, 2, 'un solo hueco para el laboratorio, y escondido');
  }
});

test('los puntos que cuenta la guia son los que reparte el servidor', () => {
  const base = difficulty(finished());
  for (const lang of LANGS) {
    const guide = RULES[lang];
    const part = chapter(guide, 5);

    // La suma de arriba: 10 por ganar, mas la dificultad, mas la economia.
    const sum = part.slice(part.indexOf('<div class="rk-sum">'), part.indexOf('</div>\n      <h4>'));
    assert.deepEqual([...sum.matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1]),
      [String(SCORE.win), `0–${SCORE.maxDifficulty}`, `0–${SCORE.attemptBudget - 2}`], `${lang}: la suma`);

    // Lo que vale cada final, fila por fila.
    const [endings, levels] = pointLists(guide).map(listValues);
    assert.equal(endings.length, 6);
    assert.match(endings[0], new RegExp(`^${SCORE.win} \\+ .+ \\+ .+`), `${lang}: ganar`);
    assert.match(endings[1], new RegExp(`^${SCORE.draw} \\+ `), `${lang}: empatar`);
    assert.equal(endings[2], String(SCORE.loss), `${lang}: perder`);
    assert.equal(endings[3], '0', `${lang}: abandonar`);
    assert.equal(endings[4], String(SCORE.forfeit), `${lang}: ganar por abandono`);
    assert.match(endings[5], new RegExp(`^${SCORE.win} \\+ [^+]+$`), `${lang}: ganar por tiempo no lleva economia`);

    // Los tres ejemplos de dificultad y los dos recargos.
    assert.deepEqual(levels, [
      String(difficulty(finished({ digits: 3 }))),
      String(difficulty(finished({ digits: 4 }))),
      String(difficulty(finished({ digits: 6, allow_repeats: 1 }))),
      `+${difficulty(finished({ max_attempts: 10 })) - base}`,
      `+${difficulty(finished({ turn_seconds: 60 })) - base}`,
    ], `${lang}: la dificultad`);

    // Las barras de la economia, de uno a siete intentos.
    const bars = [...part.matchAll(/<div><b>(\d+)<\/b><i style="height:\d+px"><\/i><span>([^<]+)<\/span><\/div>/g)];
    assert.deepEqual(bars.map((m) => m[2]), ['1', '2', '3', '4', '5', '6', '7+']);
    assert.deepEqual(bars.map((m) => Number(m[1])),
      [1, 2, 3, 4, 5, 6, 7].map((tries) => ana(finished({}, tries)).points - SCORE.win - base), `${lang}: la economia`);

    // El recibo: cuatro cifras sin repetir, reloj por turno, quinto intento.
    const example = ana(finished({ turn_seconds: 60 }, 5));
    const ticket = part.slice(part.indexOf('<div class="rk-ticket">'));
    const figures = [...ticket.slice(0, ticket.indexOf('</dl>')).matchAll(/<dd>([^<]+)<\/dd>/g)].map((m) => m[1]);
    assert.deepEqual(figures.slice(0, 3),
      [String(SCORE.win), String(example.difficulty), String(example.points - SCORE.win - example.difficulty)], `${lang}: el recibo`);
    assert.match(figures[3], new RegExp(`^${example.points} `), `${lang}: el total del recibo`);
    assert.match(text(ticket), /\(7\) \+ .+ \(2\)/, 'la dificultad del recibo, desglosada');
  }

  // Y lo que las filas dicen con palabras es lo que hace la cuenta.
  const draw = finished({ winner: '' });
  assert.equal(ana(draw).points, SCORE.draw + Math.round(base / 2), 'empatar: cuatro mas media dificultad');
  assert.equal(beto(finished()).points, SCORE.loss);
  const left = finished({ finish_reason: 'abandon' }, 2, 2, false);
  assert.equal(ana(left).points, SCORE.forfeit);
  assert.equal(beto(left).points, 0, 'quien abandona no se lleva nada');
  const flag = finished({ finish_reason: 'timeout', time_mode: 'bank', bank_seconds: 180 }, 3, 3, false);
  assert.equal(ana(flag).points, SCORE.win + difficulty(flag), 'ganar por tiempo: sin economia');
  assert.equal(difficulty(finished({ turn_seconds: 86400, time_mode: 'correspondence' })), base, 'la correspondencia no suma');
  assert.equal(SCORE.maxDifficulty, 14);
});

test('la guia explica la temporada y lo que no reparte puntos', async () => {
  const season = await read('src/season.js');
  assert.match(season, /ORDER BY points DESC,wins DESC,played ASC LIMIT 50/, 'el orden y el corte que cuenta la guia');
  const words = {
    es: ['mes natural', 'UTC', 'los 50 primeros', 'más victorias', 'menos partidas', 'Solo puntúan los duelos'],
    en: ['calendar month', 'UTC', 'the top 50', 'more wins', 'fewer games', 'Only duels against another person score'],
    fr: ['mois civil', 'UTC', 'les 50 premiers', 'le plus de victoires', 'le moins de parties', 'Seuls les duels'],
  };
  for (const lang of LANGS) {
    const part = text(chapter(RULES[lang], 5));
    for (const phrase of words[lang]) assert.ok(part.includes(phrase), `${lang}: falta «${phrase}»`);
  }
  // Ninguna guia vuelve a decir que el ranking cuenta victorias.
  assert.match(text(chapter(RULES.es, 5)), /no ordena por victorias: ordena por puntos/);
});

test('los limites y los modos que cuenta la guia son los del servidor', () => {
  const hours = (ms) => ms / 3600000;
  const total = puzzleData.levels.reduce((sum, level) => sum + level.puzzles.length, 0);
  const perLevel = puzzleData.levels[0].puzzles.length;
  assert.ok(puzzleData.levels.every((level) => level.puzzles.length === perLevel));
  const facts = {
    es: [
      `${ARENA.minPlayers} a ${ARENA.maxPlayers} jugadores`, `con ${ARENA.minPlayers} jugadores como mínimo`,
      `${DAILY_RULES.digits} cifras sin repetir`, `${DAILY_RULES.maxAttempts} intentos`,
      `${total} enigmas`, `los ${perLevel} enigmas fáciles`, `hasta ${LIMITS.maxOpenGames} partidas`,
      `espera rival ${hours(LIMITS.waitingTtlMs)} horas`, `privada, ${hours(LIMITS.privateWaitingTtlMs)} horas`,
      `tras ${hours(LIMITS.activeTtlMs)} horas sin actividad`, `hasta ${LIMITS.manualPauseMs / 60000} minutos`,
    ],
    en: [
      `${ARENA.minPlayers} to ${ARENA.maxPlayers} players`, `at least ${ARENA.minPlayers} players`,
      `${DAILY_RULES.digits} digits, no repeats`, `${DAILY_RULES.maxAttempts} tries`,
      `${total} puzzles`, `all ${perLevel} easy puzzles`, `up to ${LIMITS.maxOpenGames} games`,
      `waits ${hours(LIMITS.waitingTtlMs)} hours`, `invitation, ${hours(LIMITS.privateWaitingTtlMs)} hours`,
      `after ${hours(LIMITS.activeTtlMs)} hours without activity`, `up to ${LIMITS.manualPauseMs / 60000} minutes`,
    ],
    fr: [
      `${ARENA.minPlayers} à ${ARENA.maxPlayers} joueurs`, `avec ${ARENA.minPlayers} joueurs au minimum`,
      `${DAILY_RULES.digits} chiffres sans répétition`, `${DAILY_RULES.maxAttempts} essais`,
      `${total} énigmes`, `les ${perLevel} énigmes faciles`, `jusqu’à ${LIMITS.maxOpenGames} parties`,
      `adversaire ${hours(LIMITS.waitingTtlMs)} heures`, `privée, ${hours(LIMITS.privateWaitingTtlMs)} heures`,
      `après ${hours(LIMITS.activeTtlMs)} heures sans activité`, `${LIMITS.manualPauseMs / 60000} minutes au plus`,
    ],
  };
  for (const lang of LANGS) {
    const guide = text(RULES[lang]);
    for (const fact of facts[lang]) assert.ok(guide.includes(fact), `${lang}: la guia no dice «${fact}»`);
  }
  // La bolsa de tiempo no tiene pausa: la guia vieja decia lo contrario.
  const bank = text(chapter(RULES.es, 3)).split('Bolsa de tiempo')[1].split('Correspondencia')[0];
  assert.match(bank, /Pausa Ninguna/);
});

test('las doce insignias de la guia son las del juego, en su orden y con su nombre', () => {
  const codes = [...constBlock('BADGE_ART').matchAll(/\n {2}(\w+):\{/g)].map((m) => m[1]);
  assert.equal(codes.length, 12);
  const plain = (s) => s.replace(/’/g, "'");
  LANGS.forEach((lang, index) => {
    const cells = [...chapter(RULES[lang], 6).matchAll(/<div><span data-badge="(\w+)"><\/span><b>([^<]+)<\/b><small>[^<]+<\/small><\/div>/g)];
    assert.deepEqual(cells.map((m) => m[1]), codes, `${lang}: las insignias, en el orden del perfil`);
    for (const [, code, name] of cells) {
      // El catalogo trae cada nombre tres veces, en el orden es, en, fr.
      const names = [...html.matchAll(new RegExp(`badge_${code}:"([^"]*)"`, 'g'))].map((m) => m[1]);
      assert.equal(names.length, 3, `badge_${code} en los tres idiomas`);
      assert.equal(plain(name), plain(names[index]), `${lang}: ${code} se llama como en el perfil`);
    }
  });
});

test('dentro del juego la guia cambia de capitulo sin tocar la direccion ni llamar al API', () => {
  const paint = fn('paintRules');
  assert.match(paint, /RULES\[lang\] \|\| RULES\.es/);
  assert.match(paint, /pintarIconos\(body\)/, 'los huecos de icono se rellenan');
  assert.match(paint, /badgeSVG\(el\.dataset\.badge,40\)/, 'y los de insignia');
  assert.match(paint, /classList\.add\('live'\)/, 'la clase que apaga el :target de las paginas publicas');
  assert.match(fn('openRules'), /paintRules\(\);\s*show\('rules'\)/);

  const click = fn('rulesClick');
  assert.match(click, /closest\('a\[href\^="#rk"\]'\)/);
  // Un cambio de fragmento dispararia popstate, y con el el «atras» de la app.
  assert.match(click, /ev\.preventDefault\(\)/);
  const go = fn('rulesGo');
  assert.match(go, /calmMotion\(\)/, 'el capitulo no sube ni se desplaza suave con «reducir movimiento»');
  assert.match(go, /aria-current/);

  for (const name of ['openRules', 'paintRules', 'rulesClick', 'rulesGo', 'rulesLabKey', 'paintRulesLab']) {
    const body = fn(name);
    assert.doesNotMatch(body, /\bapi\(|fetch\(/, `${name} no pide nada al servidor`);
    assert.doesNotMatch(body, /location\.hash|history\.(push|replace)State/, `${name} no toca la direccion`);
  }
  // Cambiar de idioma con la guia abierta la repinta en el idioma nuevo.
  assert.match(fn('applyI18n'), /currentView==='rules'&&typeof paintRules==='function'\) paintRules\(\)/);

  const keys = LANGS.map((lang) => {
    const block = html.match(new RegExp(`Object\\.assign\\(I18N\\.${lang},\\{rules_lab_title:[^\\n]*`));
    assert.ok(block, `${lang}: faltan los textos del laboratorio`);
    return [...block[0].matchAll(/(rules_lab_\w+):"/g)].map((m) => m[1]).join(',');
  });
  assert.equal(new Set(keys).size, 1, 'las mismas claves en los tres idiomas');
  assert.equal(keys[0].split(',').length, 12);
});

test('el laboratorio puntua como el ejemplo de la guia y como el servidor', () => {
  const secret = html.match(/const RULES_LAB_SECRET='(\d+)';/)[1];
  const marks = new Function(`const RULES_LAB_SECRET='${secret}';${fn('rulesLabMarks')}\nreturn rulesLabMarks;`)();

  for (const lang of LANGS) {
    const example = chapter(RULES[lang], 1);
    assert.equal([...example.matchAll(/<span class="rk-tile sec">(\d)<\/span>/g)].map((m) => m[1]).join(''), secret,
      `${lang}: el codigo del ejemplo es el del laboratorio`);
    const tiles = [...example.matchAll(/<span class="rk-tile">(\d)<i class="rk-pip s( [fp])?"><\/i><\/span>/g)];
    const guess = tiles.map((m) => m[1]).join('');
    assert.equal(guess.length, secret.length);
    assert.deepEqual(tiles.map((m) => (m[2] || '').trim()), marks(guess), `${lang}: las marcas del ejemplo`);
    const score = evaluate(secret, guess);
    assert.match(example, new RegExp(`<span class="rk-pill f">${score.fijas} `));
    assert.match(example, new RegExp(`<span class="rk-pill p">${score.picas} `));
  }

  // Cualquier intento sin repetir: las marcas suman lo mismo que cuenta el servidor.
  for (const guess of ['4271', '1724', '0356', '4127', '9871', '2417']) {
    const score = evaluate(secret, guess), got = marks(guess);
    assert.equal(got.filter((mark) => mark === 'f').length, score.fijas, guess);
    assert.equal(got.filter((mark) => mark === 'p').length, score.picas, guess);
  }
  // El teclado del laboratorio no deja repetir cifra, que es lo que hace cierta esa cuenta.
  assert.match(fn('rulesLabKey'), /!rulesLabGuess\.includes\(key\)/);
  assert.doesNotMatch(fn('paintRulesLab'), /Deduce/, 'el laboratorio no deduce nada');
});

test('la hoja de la guia solo usa verde y naranja para las pistas', () => {
  assert.ok(guideCss.length > 5000, 'la hoja va de marca a marca');
  for (const rule of guideCss.split('\n').filter((line) => /var\(--(fija|pica)/.test(line)))
    assert.match(rule, /^\.rk-(pip|pill)\./, `verde y naranja son informacion: ${rule.slice(0, 50)}`);
  // Sin script los capitulos se abren con :target; con script, con una clase.
  assert.match(guideCss, /@supports selector\(:has\(\*\)\)/);
  assert.match(guideCss, /\.rk:not\(\.live\) \.rk-ch:target/);
  assert.match(guideCss, /\.rk\.live \.rk-ch\.on\{display:block\}/);
  assert.match(guideCss, /@media print\{\s*\.rk \.rk-ch\{display:block!important\}/);
});

test('las paginas publicas llevan la misma guia, dibujada y sin script', async () => {
  const ico = new Function(`${constBlock('ICONS')}\n${fn('ico')}\nreturn ico;`)();
  const badgeSVG = new Function(`${constBlock('BADGE_ART')}\n${fn('badgeSVG')}\nreturn badgeSVG;`)();
  for (const lang of LANGS) {
    const page = await read(`public/rules-${lang}.html`);
    assert.ok(page.includes(guideCss), `rules-${lang}.html no lleva la hoja del juego: vuelve a ejecutar npm run pages`);
    assert.equal(/data-ico="\w+"( data-ico-size="\d+")?><\/span>/.test(page), false, `${lang}: queda un icono sin dibujar`);
    assert.equal(/data-badge="\w+"><\/span>/.test(page), false, `${lang}: queda una insignia sin dibujar`);
    // El generador dibuja con sus propios gemelos de ico() y badgeSVG(): que no se separen.
    assert.ok(page.includes(`data-ico="podio" data-ico-size="28">${ico('podio', 28)}</span>`), `${lang}: el icono no es el del juego`);
    for (const code of ['first_win', 'wins_50'])
      assert.ok(page.includes(`<span data-badge="${code}">${badgeSVG(code, 40)}</span>`), `${lang}: la insignia ${code} no es la del juego`);
    assert.ok(page.includes('<div class="rk-lab" hidden></div>'), 'el laboratorio es del juego: aqui se queda escondido');
    assert.match(page, /family=JetBrains\+Mono/, 'los codigos, con la tipografia de los codigos');
    assert.equal(page.includes('class="rk live"'), false);
  }
});
