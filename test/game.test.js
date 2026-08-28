import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, expiredTurnChanges, validateCode, timerRemaining, sanitizeGame } from '../src/game.js';

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

test('an expired 30 second turn advances even with five repeated digits', () => {
  const game = {
    status:'active', turn:1, turn_seconds:30, turn_remaining:30, timer_paused:0,
    turn_started_at:'2026-01-01T00:00:00.000Z', lobby_paused_by:'', manual_paused_by:'',
    pending_winner:'', digits:5, allow_repeats:1, p1:'Ana', p2:'Luis', guesses:'[]', max_attempts:0,
  };
  const changes = expiredTurnChanges(game, Date.parse('2026-01-01T00:00:30.000Z'));
  assert.equal(changes.turn, 2);
  assert.equal(changes.turn_remaining, 30);
  assert.equal(changes.timer_paused, 0);
  assert.deepEqual(JSON.parse(changes.guesses), [{
    by:'Ana', missed:true, reason:'timeout', ts:'2026-01-01T00:00:30.000Z',
  }]);
});

test('a timed-out turn consumes the last attempt and can finish a draw', () => {
  const game = {
    status:'active', turn:1, turn_seconds:30, turn_remaining:30, timer_paused:0,
    turn_started_at:'2026-01-01T00:00:00.000Z', lobby_paused_by:'', manual_paused_by:'',
    pending_winner:'', digits:4, p1:'Ana', p2:'Luis', max_attempts:2,
    guesses:JSON.stringify([
      { by:'Ana', guess:'1234' },
      { by:'Luis', guess:'2345' },
      { by:'Luis', guess:'3456' },
    ]),
  };
  const changes = expiredTurnChanges(game, Date.parse('2026-01-01T00:00:30.000Z'));
  const guesses = JSON.parse(changes.guesses);
  assert.equal(changes.status, 'finished');
  assert.equal(changes.winner, '');
  assert.equal(changes.timer_paused, 1);
  assert.equal(guesses.filter((entry) => entry.by === 'Ana').length, 2);
  assert.deepEqual(guesses.at(-1), {
    by:'Ana', missed:true, reason:'timeout', ts:'2026-01-01T00:00:30.000Z',
  });
});

test('sanitizeGame exposes a missed timed turn without inventing a guess', () => {
  const game = {
    game_id:'MISSED', status:'active', digits:4, p1:'Ana', secret1:'0123', p2:'Luis', secret2:'4567',
    turn:2, guesses:JSON.stringify([{by:'Ana',missed:true,reason:'timeout',ts:'x'}]), winner:'',
    created_at:'x', updated_at:'x', allow_repeats:0, is_public:1, mode:'numbers', num_colors:10,
    max_attempts:10, turn_seconds:30, turn_started_at:'x', rematch_id:'', pending_winner:'',
    country1:'co', country2:'fr', turn_remaining:30, timer_paused:0, manual_paused_by:'',
    manual_pause_until:'', lobby_paused_by:'', reveal_secrets:0, finish_reason:'', version:2,
  };
  const state = sanitizeGame(game, 'Ana');
  assert.equal(state.attemptsP1, 1);
  assert.deepEqual(state.guesses[0], {
    by:'Ana', missed:true, reason:'timeout', ts:'x', guess:'', fijas:0, picas:0, requestId:undefined,
  });
});

test('an active timed game never reports an expired turn as playable', () => {
  const game = {
    game_id:'ABCDE1', status:'active', digits:5, p1:'Ana', secret1:'11223', p2:'Luis', secret2:'33445',
    turn:1, guesses:'[]', winner:'', created_at:'x', updated_at:'x', allow_repeats:1, is_public:1,
    mode:'numbers', num_colors:10, max_attempts:0, turn_seconds:30,
    turn_started_at:'2020-01-01T00:00:00.000Z', rematch_id:'', pending_winner:'', country1:'co', country2:'fr',
    turn_remaining:30, timer_paused:0, manual_paused_by:'', manual_pause_until:'', lobby_paused_by:'',
    reveal_secrets:1, finish_reason:'', version:1,
  };
  assert.equal(sanitizeGame(game, 'Ana').yourTurn, false);
});

test('timer state includes the timestamp used to calculate remaining time', () => {
  const game = {
    game_id:'ABCDE2', status:'active', digits:4, p1:'Ana', secret1:'1234', p2:'Luis', secret2:'5678',
    turn:1, guesses:'[]', winner:'', created_at:'x', updated_at:'x', allow_repeats:0, is_public:1,
    mode:'numbers', num_colors:10, max_attempts:0, turn_seconds:30,
    turn_started_at:new Date(Date.now() - 10_000).toISOString(), rematch_id:'', pending_winner:'', country1:'co', country2:'fr',
    turn_remaining:30, timer_paused:0, manual_paused_by:'', manual_pause_until:'', lobby_paused_by:'',
    reveal_secrets:0, finish_reason:'', version:1,
  };
  const state = sanitizeGame(game, 'Ana');
  assert.ok(Number.isFinite(Date.parse(state.timerAsOf)));
  assert.ok(state.turnRemaining >= 19 && state.turnRemaining <= 20);
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
