import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const loginSection = html.slice(html.indexOf('<section id="s-login"'), html.indexOf('<!-- BUZON DE SUGERENCIAS -->'));
const practiceGameSection = html.slice(html.indexOf('<section id="s-practice-game"'), html.indexOf('<section id="s-rank"'));
// Todo lo que el invitado puede tocar: la practica local y las cuatro funciones
// que lo dejan entrar y salir. Nada de esto puede llamar al servidor.
const guestSource = html.slice(
  html.indexOf('/* -------------------- practica local Solo / Contra el computador'),
  html.indexOf('function syncRepeatAvailability'),
);

test('la portada ofrece jugar antes de registrarse, y el texto existe en los tres idiomas', () => {
  assert.match(loginSection, /onclick="startGuestPractice\(\)"/);
  assert.match(loginSection, /data-i18n="guest_try_cta"/);
  assert.match(loginSection, /data-i18n="guest_try_hint"/);
  // Continuar una practica guardada solo aparece si la hay.
  assert.match(loginSection, /id="guest-resume"[^>]*class|class="[^"]*hidden[^"]*"[^>]*id="guest-resume"/);
  assert.match(html, /const resume = \$\('guest-resume'\); if\(resume\) resume\.classList\.toggle\('hidden', !readSavedPractice\(\)\)/);
  for (const key of ['guest_try_cta', 'guest_try_hint', 'guest_or', 'guest_back', 'guest_invite_title', 'guest_invite_text', 'guest_invite_cta', 'guest_saved_toast']) {
    for (const lang of ['es', 'en', 'fr']) {
      const block = html.slice(html.indexOf(`Object.assign(I18N.${lang},{guest_try_cta`));
      assert.match(block.slice(0, block.indexOf('});') + 3), new RegExp(`${key}:`), `falta ${key} en ${lang}`);
    }
  }
});

test('la practica del invitado no habla con el servidor: ni una llamada al API', () => {
  assert.doesNotMatch(guestSource, /\bapi\s*\(/);
  for (const fn of ['startGuestPractice', 'resumeGuestPractice', 'exitGuest', 'guestRegister', 'practiceExitChrome']) {
    assert.match(guestSource, new RegExp(`function ${fn}\\(`), `falta ${fn}`);
  }
  // Las reglas de bienvenida: tres cifras, sin repetir y sin reloj.
  assert.match(guestSource, /type:'solo',mode:'numbers',digits:3,allowRepeats:false,maxAttempts:0,turnSeconds:0/);
});

test('sin sesion solo existen las pantallas publicas', () => {
  assert.match(html, /const GUEST_VIEWS = new Set\(\['login','practice','practice-game','puzzles','rules','feedback'\]\)/);
  assert.match(html, /if\(!sessionToken && !GUEST_VIEWS\.has\(name\)\) name = 'login';/);
  // El vestibulo, la cuenta, el ranking y la partida quedan fuera de esa lista.
  for (const view of ['lobby', 'account', 'rank', 'history', 'create', 'wait', 'join', 'rematch', 'game', 'verify']) {
    assert.doesNotMatch(html, new RegExp(`GUEST_VIEWS = new Set\\(\\[[^\\]]*'${view}'`), `${view} no puede ser publica`);
  }
  assert.match(html, /function enterLobby\(\)\{ if\(!sessionToken\) return exitGuest\(\);/);
  assert.match(html, /function guestActive\(\)\{ return guestMode && !sessionToken; \}/);
});

test('el invitado sale por donde entro y el engranaje no le ofrece cuenta', () => {
  assert.match(html, /function menuLogout\(\)\{ closeSettingsMenu\(\); if\(guestActive\(\)\) return exitGuest\(\); logout\(\); \}/);
  assert.match(html, /if\(guest\) exitGuest\(\); else enterLobby\(\);/);
  assert.match(html, /account\.classList\.toggle\('hidden', currentView==='verify'\|\|guestActive\(\)\)/);
  assert.match(html, /guestActive\(\)\?'guest_back':'menu_logout'/);
});

test('la cuenta se ofrece al terminar la practica, no antes', () => {
  assert.match(practiceGameSection, /id="guest-invite" class="[^"]*hidden|class="guest-invite hidden" id="guest-invite"/);
  assert.match(practiceGameSection, /onclick="guestRegister\(\)"/);
  assert.match(practiceGameSection, /id="practice-credits"/);
  // La invitacion solo se enseña cuando hay invitado y la partida ha terminado.
  assert.match(guestSource, /invite\.classList\.toggle\('hidden',!\(guest&&ended\)\)/);
  assert.match(guestSource, /practiceExitChrome\('practice_save_lobby',false\)/);
  assert.match(guestSource, /practiceExitChrome\('result_lobby',true\)/);
});
