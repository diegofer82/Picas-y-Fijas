import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const publicHtml = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const adminHtml = await readFile(new URL('../public/admin.html', import.meta.url), 'utf8');

test('every typed game action can be submitted with Enter', () => {
  const bindings = [
    ['uname', 'btn-login'],
    ['upin', 'btn-login'],
    ['join-code-inp', 'btn-join-code'],
    ['secret-c', 'btn-create'],
    ['secret-j', 'btn-join'],
    ['secret-r', 'btn-rematch'],
    ['g-guess', 'g-guess-btn'],
  ];

  for (const [input, button] of bindings) {
    assert.match(publicHtml, new RegExp(`bindEnterToButton\\('${input}','${button}'\\)`));
  }
  assert.match(publicHtml, /event\.key!==['"]Enter['"]/);
  assert.match(publicHtml, /event\.isComposing/);
  assert.match(publicHtml, /event\.repeat/);
});

test('admin credentials can be submitted with Enter', () => {
  assert.match(adminHtml, /\$\('username'\)\.addEventListener\('keydown',submitLoginOnEnter\)/);
  assert.match(adminHtml, /\$\('pin'\)\.addEventListener\('keydown',submitLoginOnEnter\)/);
  assert.match(adminHtml, /e\.key!==['"]Enter['"]/);
});

test('the timer counts down from the received server snapshot only once', () => {
  assert.match(publicHtml, /data\.clientReceivedAt=clientReceivedAt/);
  assert.match(publicHtml, /const started=Number\(gState\.clientReceivedAt\)\|\|Date\.now\(\)/);
  assert.doesNotMatch(publicHtml, /new Date\(gState\.turnStartedAt\)\.getTime\(\)/);
});

test('impossible no-repeat color configurations are disabled in the creator', () => {
  assert.match(publicHtml, /const impossible=cfg\.mode==='colors'&&cfg\.digits>cfg\.numColors/);
  assert.match(publicHtml, /noRepeats\.disabled=impossible/);
});

test('guess idempotency identifiers always use cryptographic randomness', () => {
  assert.match(publicHtml, /crypto\.getRandomValues\(new Uint8Array\(16\)\)/);
  assert.doesNotMatch(publicHtml, /Math\.random\(\)/);
});

test('local chat mutes require confirmation and can be reversed by each user',()=>{
  assert.match(publicHtml,/if\(!confirm\(t\('chat_mute_confirm'/);
  assert.match(publicHtml,/id="chat-muted-btn"/);
  assert.match(publicHtml,/function unmuteChatUser\(/);
  assert.match(publicHtml,/function unmuteAllChatUsers\(/);
  assert.match(publicHtml,/localStorage\.removeItem\('pf_chat_muted'\)/);
});

test('notification permission is requested only from the explicit experience button',()=>{
  assert.match(publicHtml,/onclick="activateExperience\(\)"/);
  assert.match(publicHtml,/if\(permission==='default'\)permission=await Notification\.requestPermission\(\)/);
  assert.equal((publicHtml.match(/Notification\.requestPermission\(\)/g)||[]).length,1);
  assert.match(publicHtml,/document\.addEventListener\('pointerdown'.*unlockAudio/);
  assert.match(publicHtml,/navigator\.serviceWorker\.register\('\/sw\.js'\)/);
  assert.match(publicHtml,/registration\.showNotification/);
});

test('iOS audio is primed without the muted flag',()=>{
  assert.match(publicHtml,/a\.volume=0;const p=a\.play\(\)/);
  assert.doesNotMatch(publicHtml,/a\.muted=true/);
  assert.match(publicHtml,/audioCtx\.createBuffer\(1,1,22050\)/);
});

test('expired sessions and stale finished games recover without a hard refresh',()=>{
  assert.match(publicHtml,/if\(res\.status===401&&action!=='loginUser'\)/);
  assert.match(publicHtml,/function handleSessionExpired\(\)/);
  assert.match(publicHtml,/async function resumeStoredGame\(\)/);
  assert.match(publicHtml,/if\(!reviewingHistory\)localStorage\.removeItem\('pf_current_game'\)/);
  assert.doesNotMatch(publicHtml,/if\(resumeId&&!deepLinkPending\) goToRematch\(resumeId\)/);
});

test('restoring an active game restarts polling and its local clock',()=>{
  const start=publicHtml.indexOf('function enterGame(meta,initialState=null)');
  const end=publicHtml.indexOf('function terminalGameError',start);
  assert.ok(start>=0&&end>start,'no se encontro enterGame');
  const source=publicHtml.slice(start,end);
  assert.match(source,/if\(initialState\)renderGame\(initialState\)/);
  assert.match(source,/if\(!initialState\|\|initialState\.status==='active'\)\{[\s\S]*startPoll\(\(\)=>refreshGame\(epoch,game\.id\)\)[\s\S]*startTick\(\)/);
  assert.doesNotMatch(source,/if\(initialState\)renderGame\(initialState\);\s*else\{[^}]*startPoll/);
});

test('a received nudge plays its sound even while the chat panel is open',()=>{
  assert.match(publicHtml,/if\(nudge&&chatNudgesOn\).*playChatAudio\(wizzAudio\)/);
  assert.doesNotMatch(publicHtml,/if\(soundOn&&\$\('chat-panel'\)\.classList\.contains\('hidden'\)\)chord/);
});

test('each rules language links to its matching strategy PDF',()=>{
  assert.match(publicHtml,/href="\/guia-estrategias-picas-y-fijas-es\.pdf" download/);
  assert.match(publicHtml,/href="\/picas-y-fijas-strategy-guide-en\.pdf" download/);
  assert.match(publicHtml,/href="\/guide-strategies-picas-y-fijas-fr\.pdf" download/);
});

test('the brand returns to the lobby only from screens with nothing to lose', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

  // El logo tiene que ser un boton de verdad, no un div con onclick, para que
  // responda al teclado y lo anuncien los lectores de pantalla.
  assert.match(html, /<button type="button" class="logo" id="brand-home" onclick="brandHome\(\)"/);

  const safe = html.match(/const BRAND_HOME_FROM = new Set\(\[([^\]]*)\]\)/);
  assert.ok(safe, 'no se encontro BRAND_HOME_FROM');
  const screens = safe[1].split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);

  for (const s of ['history', 'rank', 'rules']) {
    assert.ok(screens.includes(s), `${s} deberia poder volver al lobby desde el logo`);
  }
  // Saltarse el flujo de salida de una partida o una practica en curso le
  // costaria el progreso al jugador.
  for (const s of ['game', 'practice-game', 'wait', 'rematch', 'lobby', 'login']) {
    assert.ok(!screens.includes(s), `${s} no debe volver al lobby desde el logo`);
  }
});
