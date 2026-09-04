import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const practiceSource = html.slice(
  html.indexOf('/* -------------------- practica local Solo / Contra el computador'),
  html.indexOf('function syncRepeatAvailability'),
);

test('v2.3 exposes both practice modes and keeps them outside the server API', () => {
  assert.match(html, /id="s-practice"/);
  assert.match(html, /id="s-practice-game"/);
  assert.match(html, /onclick="startPractice\(true\)"/);
  assert.match(html, /data-type="solo"/);
  assert.match(html, /data-type="computer"/);
  assert.match(html, /computer-ai\.js/);
  assert.match(practiceSource, /localStorage\.setItem\('pf_practice_stats'/);
  assert.match(practiceSource, /localStorage\.setItem\('pf_computer_stats'/);
  assert.doesNotMatch(practiceSource, /\bapi\s*\(/);
});

test('computer practice exposes difficulty, both logs, turn state and local thinking feedback', () => {
  for(const level of ['easy','normal','expert']) assert.match(html,new RegExp(`data-level="${level}"`));
  for(const id of ['practice-log','practice-computer-log','practice-turn','practice-attempts','practice-computer-attempts']) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(practiceSource,/computer_thinking/);
  assert.match(practiceSource,/finishComputerPractice\('draw'\)/);
  assert.match(practiceSource,/practice\.missedTurns\+\+/);
  assert.match(practiceSource,/computer_both_codes/);
});

test('the computer attempt indicator refreshes after recording the final guess', () => {
  assert.match(practiceSource,/computerGuesses\.push\(\{guess,\.\.\.score\}\);renderComputerLog\(\);renderPracticeStatus\(\);/);
  assert.match(practiceSource,/renderPracticeStatus\(\);\s*if\(score\.fijas===practiceCfg\.digits\)/);
});

test('unfinished practice is saved locally and can be resumed from the lobby', () => {
  assert.match(html,/id="practice-resume-card"/);
  assert.match(html,/onclick="resumePractice\(\)"/);
  assert.match(html,/onclick="discardSavedPractice\(\)"/);
  assert.match(practiceSource,/PRACTICE_SAVE_KEY/);
  assert.match(practiceSource,/localStorage\.setItem\(PRACTICE_SAVE_KEY/);
  assert.match(practiceSource,/state\.computerGuesses\|\|\[\]\)solver\.record/);
  assert.match(practiceSource,/function leavePracticeToLobby\(\)[\s\S]*pauseActivePractice\(\)[\s\S]*enterLobby\(\)/);
  assert.match(practiceSource,/visibilitychange/);
  assert.match(practiceSource,/clearSavedPractice\(\);[\s\S]*computerStats/);
});

test('active practice can be cancelled without a result or surrendered for review', () => {
  for(const id of ['practice-active-actions','practice-logs']) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/onclick="cancelPractice\(\)"/);
  assert.match(html,/onclick="surrenderPractice\(\)"/);
  assert.match(practiceSource,/function cancelPractice\(\)[\s\S]*clearSavedPractice\(\);practice=null;enterLobby\(\)/);
  const cancelSource=practiceSource.slice(practiceSource.indexOf('function cancelPractice()'),practiceSource.indexOf('function surrenderPractice()'));
  assert.doesNotMatch(cancelSource,/practiceStats\(|computerStats\(|finishPractice|finishComputerPractice/);
  assert.match(practiceSource,/function surrenderPractice\(\)[\s\S]*finishComputerPractice\('loss','surrender'\)[\s\S]*finishPractice\(false,'surrender'\)/);
  assert.match(practiceSource,/reason==='surrender'/);
  assert.match(practiceSource,/practice-active-actions'\)\.classList\.add\('hidden'\)/);
});

test('practice resume labels exist in the three languages and the shown version follows package.json', async () => {
  assert.equal((html.match(/practice_resume_title:/g)||[]).length,3);
  assert.equal((html.match(/practice_save_lobby:/g)||[]).length,3);
  assert.equal((html.match(/practice_cancel_confirm:/g)||[]).length,3);
  assert.equal((html.match(/practice_surrender_confirm:/g)||[]).length,3);
  // La version que se muestra en la app debe seguir a la de package.json.
  // Antes esto fijaba '2.3' literal, asi que fallaba en cada version nueva en
  // vez de detectar lo que de verdad importa: que las dos se desincronicen.
  // Desde 2.6.0 las dos llevan el semantico completo MAYOR.MENOR.PARCHE, asi
  // que la comparacion es exacta y ademas se comprueba la forma del numero.
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const shown = html.match(/const APP_VERSION = '([^']+)'/);
  assert.ok(shown, 'no se encontro APP_VERSION en public/index.html');
  assert.match(shown[1], /^\d+\.\d+\.\d+$/, 'APP_VERSION debe ser MAYOR.MENOR.PARCHE');
  assert.equal(
    shown[1],
    pkg.version,
    `la app muestra v${shown[1]} pero package.json dice ${pkg.version}`,
  );
});

test('practice secrets and suggestions use cryptographic randomness', () => {
  assert.match(html, /function randomSecret\(meta\)/);
  assert.match(html, /crypto\.getRandomValues\(bytes\)/);
  assert.doesNotMatch(practiceSource, /Math\.random\(/);
  for (const context of ['c', 'j', 'r']) {
    assert.match(html, new RegExp(`suggestSecret\\('${context}'\\)`));
  }
});

test('Solo practice supports every approved rule family and reveals at the end', () => {
  for (const id of ['p-seg-mode', 'p-seg-colors', 'p-seg-digits', 'p-seg-repeat', 'p-seg-attempts', 'p-seg-time']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(practiceSource, /practice-secret.*codeViewHTML\(practice\.secret/s);
  assert.match(practiceSource, /practice_reveal/);
});

test('starting from practice settings uses the rules that are visibly selected', () => {
  assert.match(practiceSource, /function readPracticeControls\(\)/);
  assert.match(practiceSource, /practiceCfg\.allowRepeats=selected\('p-seg-repeat','r'\)==='1'/);
  assert.match(practiceSource, /else if\(currentView==='practice'\) readPracticeControls\(\)/);
});

test('classic game creation also offers a random game', () => {
  assert.match(html, /id="btn-create-random" onclick="prepareRandomGame\(\)"/);
  assert.equal((html.match(/create_random:/g)||[]).length, 3);
  assert.match(html, /function selectCreateRandomRules\(\)/);
  const prepareSource=html.slice(html.indexOf('function prepareRandomGame()'),html.indexOf('/* -------------------- sala de espera'));
  assert.match(prepareSource, /selectCreateRandomRules\(\)/);
  assert.match(prepareSource, /target\.focus\(\)/);
  assert.doesNotMatch(prepareSource, /suggestSecret\(|createGame\(|\bapi\s*\(/);
});
