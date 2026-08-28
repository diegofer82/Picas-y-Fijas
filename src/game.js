export const LIMITS = Object.freeze({
  waitingTtlMs: 2 * 60 * 60 * 1000,
  activeTtlMs: 48 * 60 * 60 * 1000,
  maxOpenGames: 3,
  createCooldownMs: 10 * 1000,
  manualPauseMs: 5 * 60 * 1000,
  manualPauseCooldownMs: 60 * 1000,
  turnStartGraceMs: 5 * 1000,
  presenceMs: 2 * 60 * 1000,
});

export const nowIso = (clock = Date) => new clock().toISOString();
export const toInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
export const truthy = (value) => value === true || value === 1 || value === '1' || ['true', 'si'].includes(String(value).toLowerCase());
export const cleanName = (value) => String(value ?? '').trim().slice(0, 24);
export const usernameKey = (value) => cleanName(value).toLocaleLowerCase();
export const cleanCountry = (value) => /^[a-z]{2}$/.test(String(value ?? '').trim().toLowerCase()) ? String(value).trim().toLowerCase() : '';
export const padCode = (value, digits) => String(value ?? '').trim().padStart(toInt(digits), '0');
export const parseJsonList = (value) => {
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
};

export function maxSymbolFor(mode, numColors) {
  return mode === 'colors' ? toInt(numColors, 6) : 10;
}

export function validateCode(code, digits, allowRepeats, maxSymbol) {
  const normalized = String(code ?? '').trim();
  const length = toInt(digits);
  if (normalized.length !== length) return `El código debe tener ${length} posiciones.`;
  if (!/^[0-9]+$/.test(normalized)) return 'Código inválido.';
  if ([...normalized].some((symbol) => Number(symbol) >= maxSymbol)) return 'Símbolo fuera de rango.';
  if (!allowRepeats && new Set(normalized).size !== normalized.length) return 'No se permiten repetidos en esta partida.';
  return null;
}

export function evaluate(secretValue, guessValue) {
  const secret = String(secretValue);
  const guess = String(guessValue);
  let fijas = 0;
  const remainingSecret = new Map();
  const remainingGuess = new Map();
  for (let index = 0; index < secret.length; index++) {
    if (secret[index] === guess[index]) fijas++;
    else {
      remainingSecret.set(secret[index], (remainingSecret.get(secret[index]) || 0) + 1);
      remainingGuess.set(guess[index], (remainingGuess.get(guess[index]) || 0) + 1);
    }
  }
  let picas = 0;
  for (const [digit, count] of remainingGuess) picas += Math.min(count, remainingSecret.get(digit) || 0);
  return { fijas, picas };
}

export function timerRemaining(game, at = Date.now()) {
  const total = Math.max(0, toInt(game.turn_seconds));
  const base = Math.max(0, toInt(game.turn_remaining, total));
  const started = Date.parse(game.turn_started_at || '');
  if (truthy(game.timer_paused) || !Number.isFinite(started)) return Math.min(total, base);
  return Math.max(0, Math.min(total, base - Math.floor((at - started) / 1000)));
}

/* -------------------- la bolsa de tiempo --------------------
   Como el reloj de ajedrez: cada jugador tiene su propia bolsa, solo corre la
   de quien tiene el turno y quien la agota pierde la partida. La aritmetica es
   la misma de `timerRemaining`, con dos diferencias: la reserva es por jugador
   y `turn_started_at` significa "cuando arranco el reloj de quien juega".

   En este modo no hay pausas —ni la manual ni la del lobby—. No es un olvido:
   con una bolsa, detener el reloj al volver al lobby permitiria esquivar la
   caida de bandera para siempre. Y no hace falta, porque solo corre el reloj
   de quien tiene el turno: irte mientras no te toca no cuesta nada, e irte
   cuando te toca te cuesta tu propio tiempo. Las pausas ya estaban
   condicionadas a `turn_seconds > 0`, que aqui vale 0, asi que quedan fuera
   solas. */
export const isBankGame = (game) => String(game?.time_mode || 'turn') === 'bank' && toInt(game?.bank_seconds) > 0;
export const hasClock = (game) => toInt(game?.turn_seconds) > 0 || isBankGame(game);
const bankColumn = (side) => (side === 1 ? 'bank1_remaining' : 'bank2_remaining');

export function bankRemaining(game, side, at = Date.now()) {
  if (side !== 1 && side !== 2) return 0;
  const total = Math.max(0, toInt(game.bank_seconds));
  const stored = Math.max(0, toInt(game[bankColumn(side)], total));
  const started = Date.parse(game.turn_started_at || '');
  if (toInt(game.turn) !== side || truthy(game.timer_paused) || !Number.isFinite(started))
    return Math.min(total, stored);
  return Math.max(0, Math.min(total, stored - Math.floor((at - started) / 1000)));
}

export function freshTurnClock(game, at = Date.now()) {
  if (isBankGame(game)) {
    const side = toInt(game.turn);
    const changes = { timer_paused: 0, turn_started_at: new Date(at).toISOString() };
    if (side !== 1 && side !== 2) return changes;
    // El incremento estilo Fischer se abona al terminar la jugada, nunca por
    // encima de la bolsa inicial, y nunca a quien ya se quedo en cero.
    const left = bankRemaining(game, side, at);
    changes[bankColumn(side)] = left > 0
      ? Math.min(toInt(game.bank_seconds), left + Math.max(0, toInt(game.bank_increment)))
      : 0;
    return changes;
  }
  const seconds = Math.max(0, toInt(game.turn_seconds));
  if (!seconds) return { turn_started_at: new Date(at).toISOString(), turn_remaining: 0, timer_paused: 0 };
  const lobbyPaused = parseJsonList(game.lobby_paused_by).length > 0;
  const paused = Boolean(game.manual_paused_by) || lobbyPaused;
  return {
    turn_remaining: seconds,
    timer_paused: paused ? 1 : 0,
    turn_started_at: paused ? '' : new Date(at + LIMITS.turnStartGraceMs).toISOString(),
  };
}

// Al terminar una partida hay que materializar el tiempo consumido antes de
// detener el reloj. De lo contrario, `sanitizeGame` muestra la reserva que
// estaba guardada al comenzar el turno, aunque hayan pasado varios minutos.
export function finalClock(game, at = Date.now()) {
  if (isBankGame(game)) {
    const changes = freshTurnClock(game, at);
    changes.timer_paused = 1;
    changes.turn_started_at = '';
    return changes;
  }
  const changes = { timer_paused: 1, turn_started_at: '' };
  if (toInt(game.turn_seconds) > 0)
    changes.turn_remaining = timerRemaining(game, at);
  return changes;
}

export function expiredTurnChanges(game, at = Date.now()) {
  if (game.status !== 'active' || truthy(game.timer_paused)) return null;
  if (isBankGame(game)) {
    const side = toInt(game.turn);
    if ((side !== 1 && side !== 2) || bankRemaining(game, side, at) > 0) return null;
    // Cae la bandera: pierde quien la agoto. Si habia un ganador pendiente era
    // el rival, asi que el resultado es el mismo por los dos caminos.
    return {
      status: 'finished',
      winner: side === 1 ? game.p2 : game.p1,
      pending_winner: '',
      timer_paused: 1,
      finish_reason: 'timeout',
      turn_started_at: '',
      [bankColumn(side)]: 0,
    };
  }
  if (toInt(game.turn_seconds) <= 0 || timerRemaining(game, at) > 0) return null;
  const side = toInt(game.turn);
  const expiredPlayer = side === 1 ? game.p1 : side === 2 ? game.p2 : '';
  if (!expiredPlayer) return null;
  const guesses = parseJsonList(game.guesses);
  guesses.push({
    by: expiredPlayer,
    missed: true,
    reason: 'timeout',
    ts: new Date(at).toISOString(),
  });
  const timeoutAttempt = { guesses: JSON.stringify(guesses) };
  if (game.pending_winner) {
    return {
      ...timeoutAttempt,
      status:'finished',
      winner:game.pending_winner,
      pending_winner:'',
      timer_paused:1,
      turn_started_at:'',
      turn_remaining:0,
    };
  }
  const maxAttempts = Math.max(0, toInt(game.max_attempts));
  const p1Attempts = guesses.filter((entry) => entry.by === game.p1).length;
  const p2Attempts = guesses.filter((entry) => entry.by === game.p2).length;
  if (maxAttempts > 0 && p1Attempts >= maxAttempts && p2Attempts >= maxAttempts) {
    return {
      ...timeoutAttempt,
      status:'finished',
      winner:'',
      timer_paused:1,
      turn_started_at:'',
      turn_remaining:0,
    };
  }
  return {
    ...timeoutAttempt,
    ...freshTurnClock(game, at),
    turn:side === 1 ? 2 : 1,
  };
}

export function gameMeta(game) {
  return {
    gameId: game.game_id, p1: game.p1, p2: game.p2, digits: game.digits,
    allowRepeats: truthy(game.allow_repeats), isPublic: truthy(game.is_public),
    mode: game.mode === 'colors' ? 'colors' : 'numbers', numColors: toInt(game.num_colors, 10),
    maxAttempts: toInt(game.max_attempts), turnSeconds: toInt(game.turn_seconds),
    timeMode: isBankGame(game) ? 'bank' : 'turn',
    bankSeconds: isBankGame(game) ? toInt(game.bank_seconds) : 0,
    bankIncrement: isBankGame(game) ? Math.max(0, toInt(game.bank_increment)) : 0,
    revealSecrets: truthy(game.reveal_secrets), country1: cleanCountry(game.country1),
    country2: cleanCountry(game.country2), updatedAt: game.updated_at,
  };
}

export function sanitizeGame(game, username) {
  const timerAsOf = Date.now();
  const bank = isBankGame(game);
  const player = cleanName(username);
  const youAre = game.p1 === player ? 1 : game.p2 === player ? 2 : 0;
  const secret1 = padCode(game.secret1, game.digits);
  const secret2 = padCode(game.secret2, game.digits);
  const guesses = parseJsonList(game.guesses).map((entry) => {
    if (truthy(entry.missed)) {
      return { ...entry, guess:'', fijas:0, picas:0, missed:true, requestId:undefined };
    }
    const guess = padCode(entry.guess, game.digits);
    const target = entry.by === game.p1 ? secret2 : secret1;
    return { ...entry, guess, ...evaluate(target, guess), requestId: undefined };
  });
  const meta = gameMeta(game);
  return {
    ok: true, gameId: game.game_id, status: game.status, digits: game.digits,
    allowRepeats: meta.allowRepeats, isPublic: meta.isPublic, mode: meta.mode,
    numColors: meta.numColors, maxAttempts: meta.maxAttempts, turnSeconds: meta.turnSeconds,
    timeMode: meta.timeMode, bankSeconds: meta.bankSeconds, bankIncrement: meta.bankIncrement,
    bank1Remaining: bank ? bankRemaining(game, 1, timerAsOf) : 0,
    bank2Remaining: bank ? bankRemaining(game, 2, timerAsOf) : 0,
    turnStartedAt: game.turn_started_at, turnRemaining: timerRemaining(game, timerAsOf),
    timerAsOf: new Date(timerAsOf).toISOString(),
    timerPaused: truthy(game.timer_paused), manualPausedBy: game.manual_paused_by || '',
    manualPauseUntil: game.manual_pause_until || '',
    lobbyPausedBy: parseJsonList(game.lobby_paused_by).join(' / '),
    p1: game.p1, p2: game.p2, country1: cleanCountry(game.country1), country2: cleanCountry(game.country2),
    turn: game.turn, whoseTurn: game.turn === 1 ? game.p1 : game.turn === 2 ? game.p2 : '',
    youAre, yourTurn: youAre !== 0 && game.turn === youAre && game.status === 'active'
      && (bank
        ? bankRemaining(game, youAre, timerAsOf) > 0
        : meta.turnSeconds <= 0 || truthy(game.timer_paused) || timerRemaining(game, timerAsOf) > 0), guesses,
    attemptsP1: guesses.filter((entry) => entry.by === game.p1).length,
    attemptsP2: guesses.filter((entry) => entry.by === game.p2).length,
    winner: game.winner, isDraw: game.status === 'finished' && !game.winner,
    finishReason: game.finish_reason || '', revealSecrets: meta.revealSecrets,
    opponentSecret: game.status === 'finished' && meta.revealSecrets && youAre ? (youAre === 1 ? secret2 : secret1) : '',
    yourSecret: youAre === 1 ? secret1 : youAre === 2 ? secret2 : '',
    pendingWinner: game.pending_winner || '', rematchId: game.rematch_id || '',
    createdAt: game.created_at, updatedAt: game.updated_at, version: game.version,
  };
}
