import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, validateCode, timerRemaining, sanitizeGame } from '../src/game.js';

test('evaluate handles exact and misplaced symbols with repeats', () => {
  assert.deepEqual(evaluate('1123', '1214'), { fijas: 1, picas: 2 });
  assert.deepEqual(evaluate('0123', '0123'), { fijas: 4, picas: 0 });
});

test('validateCode preserves all existing game constraints', () => {
  assert.equal(validateCode('012', 3, false, 10), null);
  assert.match(validateCode('011', 3, false, 10), /repetidos/);
  assert.match(validateCode('067', 3, true, 6), /rango/);
});

test('timerRemaining uses server timestamps', () => {
  assert.equal(timerRemaining({ turn_seconds: 60, turn_remaining: 60, timer_paused: 0, turn_started_at: '2026-01-01T00:00:00.000Z' }, Date.parse('2026-01-01T00:00:15.000Z')), 45);
});

test('sanitizeGame never reveals the opponent secret during an active game', () => {
  const state = sanitizeGame({
    game_id:'ABCD', status:'active', digits:4, p1:'Diego', secret1:'0123', p2:'Ana', secret2:'4567',
    turn:1, guesses:'[]', winner:'', created_at:'x', updated_at:'x', allow_repeats:0, is_public:1,
    mode:'numbers', num_colors:10, max_attempts:0, turn_seconds:0, turn_started_at:'', rematch_id:'',
    pending_winner:'', country1:'co', country2:'fr', turn_remaining:0, timer_paused:0,
    manual_paused_by:'', manual_pause_until:'', lobby_paused_by:'', reveal_secrets:1, finish_reason:'', version:1,
  }, 'Diego');
  assert.equal(state.yourSecret, '0123');
  assert.equal(state.opponentSecret, '');
  assert.equal(JSON.stringify(state).includes('4567'), false);
});
