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

export function freshTurnClock(game, at = Date.now()) {
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

export function expiredTurnChanges(game, at = Date.now()) {
  if (game.status !== 'active' || toInt(game.turn_seconds) <= 0 || truthy(game.timer_paused) || timerRemaining(game, at) > 0) return null;
  if (game.pending_winner) {
    return { status:'finished', winner:game.pending_winner, pending_winner:'', timer_paused:1 };
  }
  return { ...freshTurnClock(game, at), turn:game.turn === 1 ? 2 : 1 };
}

export function gameMeta(game) {
  return {
    gameId: game.game_id, p1: game.p1, p2: game.p2, digits: game.digits,
    allowRepeats: truthy(game.allow_repeats), isPublic: truthy(game.is_public),
    mode: game.mode === 'colors' ? 'colors' : 'numbers', numColors: toInt(game.num_colors, 10),
    maxAttempts: toInt(game.max_attempts), turnSeconds: toInt(game.turn_seconds),
    revealSecrets: truthy(game.reveal_secrets), country1: cleanCountry(game.country1),
    country2: cleanCountry(game.country2), updatedAt: game.updated_at,
  };
}

export function sanitizeGame(game, username) {
  const timerAsOf = Date.now();
  const player = cleanName(username);
  const youAre = game.p1 === player ? 1 : game.p2 === player ? 2 : 0;
  const secret1 = padCode(game.secret1, game.digits);
  const secret2 = padCode(game.secret2, game.digits);
  const guesses = parseJsonList(game.guesses).map((entry) => {
    const guess = padCode(entry.guess, game.digits);
    const target = entry.by === game.p1 ? secret2 : secret1;
    return { ...entry, guess, ...evaluate(target, guess), requestId: undefined };
  });
  const meta = gameMeta(game);
  return {
    ok: true, gameId: game.game_id, status: game.status, digits: game.digits,
    allowRepeats: meta.allowRepeats, isPublic: meta.isPublic, mode: meta.mode,
    numColors: meta.numColors, maxAttempts: meta.maxAttempts, turnSeconds: meta.turnSeconds,
    turnStartedAt: game.turn_started_at, turnRemaining: timerRemaining(game, timerAsOf),
    timerAsOf: new Date(timerAsOf).toISOString(),
    timerPaused: truthy(game.timer_paused), manualPausedBy: game.manual_paused_by || '',
    manualPauseUntil: game.manual_pause_until || '',
    lobbyPausedBy: parseJsonList(game.lobby_paused_by).join(' / '),
    p1: game.p1, p2: game.p2, country1: cleanCountry(game.country1), country2: cleanCountry(game.country2),
    turn: game.turn, whoseTurn: game.turn === 1 ? game.p1 : game.turn === 2 ? game.p2 : '',
    youAre, yourTurn: youAre !== 0 && game.turn === youAre && game.status === 'active'
      && (meta.turnSeconds <= 0 || truthy(game.timer_paused) || timerRemaining(game, timerAsOf) > 0), guesses,
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
