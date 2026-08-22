/* Genera las capturas que Chrome ensena al ofrecer instalar el juego.
 *
 * Con `screenshots` en el manifest, Android deja de mostrar la barrita minima
 * de "Anadir a pantalla de inicio" y abre el dialogo grande, con imagenes y
 * descripcion. Son las mismas capturas que ve quien duda si instalar, asi que
 * no valen dibujos: se toman del juego de verdad, corriendo en local.
 *
 * Uso:
 *   1. npx wrangler dev --port 8788      (o `npm run dev`)
 *   2. node tools/make-screenshots.mjs   (PF_URL para apuntar a otro sitio)
 *
 * Conduce Chrome por su protocolo de depuracion; no hace falta instalar nada.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'public', 'screenshots');
const TARGET = process.env.PF_URL || 'http://127.0.0.1:8788';
const PORT = 9333;

const CHROMES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

/* Lo que se ve en cada captura. `setup` corre dentro de la pagina, ya cargada. */
const SHOTS = [
  {
    file: 'practice-narrow.png',
    label: {
      es: 'Una partida en curso con fichas de color',
      en: 'A game in progress with coloured pegs',
      fr: 'Une partie en cours avec des pions de couleur',
    },
    form: 'narrow',
    setup: `
      hideCards();
      Object.assign(practiceCfg,{type:'solo',mode:'colors',numColors:6,digits:4,allowRepeats:false,maxAttempts:0,turnSeconds:0});
      syncPracticeControls(); startPractice(false);
      practice.secret='0325';
      for(const guess of ['0123','1420','3205'])
        practice.guesses.push({guess,...evaluatePractice(practice.secret,guess)});
      renderPracticeLog(); renderPracticeStatus();
    `,
  },
  {
    file: 'lobby-narrow.png',
    label: {
      es: 'El lobby: partidas abiertas y ranking',
      en: 'The lobby: open games and ranking',
      fr: 'Le lobby : parties ouvertes et classement',
    },
    form: 'narrow',
    setup: `await signIn('Ana'); clearSavedPractice(); renderPracticeResumeCard(); hideCards();`,
  },
  {
    file: 'home-narrow.png',
    label: {
      es: 'La entrada del juego',
      en: 'The game entrance',
      fr: "L'entrée du jeu",
    },
    form: 'narrow',
    setup: `show('login'); hideCards();`,
  },
  {
    file: 'practice-wide.png',
    label: {
      es: 'Picas y Fijas en el escritorio',
      en: 'Picas y Fijas on the desktop',
      fr: 'Picas y Fijas sur ordinateur',
    },
    form: 'wide',
    setup: `
      hideCards();
      Object.assign(practiceCfg,{type:'solo',mode:'numbers',digits:4,allowRepeats:false,maxAttempts:0,turnSeconds:0});
      syncPracticeControls(); startPractice(false);
      practice.secret='4071';
      for(const guess of ['1234','5061','4571'])
        practice.guesses.push({guess,...evaluatePractice(practice.secret,guess)});
      renderPracticeLog(); renderPracticeStatus();
    `,
  },
];

const SIZES = {
  narrow: { width: 412, height: 892, deviceScaleFactor: 2, mobile: true },
  wide: { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
};

/* Ayudas que se inyectan antes de cada `setup`. */
const HELPERS = `
  window.hideCards = () => {
    // Ni la tarjeta de instalar ni la de notificaciones pintan nada aqui:
    // la captura es justo lo que se ve dentro del dialogo de instalacion.
    for (const id of ['install-card','experience-card','private-chat-bubbles','chat-launch'])
      document.getElementById(id)?.classList.add('hidden');
  };
  window.signIn = async (name) => {
    document.getElementById('uname').value = name;
    document.getElementById('upin').value = '1234';
    await doLogin();
    await new Promise(r => setTimeout(r, 1200));
  };
  lang = 'es'; localStorage.setItem('pf_lang','es'); applyI18n();
`;

function chromePath() {
  const found = CHROMES.find(p => existsSync(p));
  if (!found) throw new Error('no encuentro Chrome; define CHROME_PATH');
  return found;
}

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const page = list.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('Chrome no respondio al protocolo de depuracion');
}

function client(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    let id = 0;
    ws.onerror = reject;
    ws.onmessage = ({ data }) => {
      const msg = JSON.parse(data);
      if (msg.id && pending.has(msg.id)) {
        const { ok, fail } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? fail(new Error(msg.error.message)) : ok(msg.result);
      } else if (msg.method === 'Page.javascriptDialogOpening') {
        // Ningun dialogo del navegador debe congelar la captura.
        send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
      }
    };
    function send(method, params = {}) {
      return new Promise((ok, fail) => {
        pending.set(++id, { ok, fail });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }
    ws.onopen = () => resolve({ send, close: () => ws.close() });
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'pf-shots-'));
  const chrome = spawn(chromePath(), [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    const cdp = await client(await connect());
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    for (const shot of SHOTS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', SIZES[shot.form]);
      const loaded = cdp.send('Page.navigate', { url: TARGET });
      await loaded;
      await new Promise(r => setTimeout(r, 2500));  // fuentes y primer pintado
      const run = await cdp.send('Runtime.evaluate', {
        expression: `(async () => { ${HELPERS}\n${shot.setup}\nreturn 'ok'; })()`,
        awaitPromise: true,
        returnByValue: true,
      });
      if (run.exceptionDetails) throw new Error(`${shot.file}: ${run.exceptionDetails.text}`);
      await new Promise(r => setTimeout(r, 900));
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT, shot.file), Buffer.from(data, 'base64'));
      console.log(`  ${shot.file}`);
    }
    cdp.close();
  } finally {
    chrome.kill();
    // Windows tarda en soltar el perfil; que no se lleve por delante el trabajo.
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }

  // El manifest se escribe aqui mismo para que nunca hable de una captura que
  // no existe: la lista de SHOTS es la unica fuente.
  const manifestPath = join(ROOT, 'public', 'manifest.webmanifest');
  const manifest = JSON.parse(await import('node:fs/promises').then(fs => fs.readFile(manifestPath, 'utf8')));
  manifest.screenshots = SHOTS.map(shot => ({
    src: `/screenshots/${shot.file}`,
    sizes: `${SIZES[shot.form].width * SIZES[shot.form].deviceScaleFactor}x${SIZES[shot.form].height * SIZES[shot.form].deviceScaleFactor}`,
    type: 'image/png',
    form_factor: shot.form,
    label: shot.label.es,
  }));
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log('  manifest.webmanifest actualizado');
}

main().catch(err => { console.error(err.message); process.exit(1); });
