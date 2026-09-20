-- La arena (E6-T3): de 3 a 8 jugadores contra el mismo código, a la vez.
--
-- `games` no sirve para esto: es una tabla de dos, con `p1` y `p2`, dos
-- secretos y un turno. La arena no tiene turnos ni rival: tiene un código que
-- genera el servidor y una lista de gente intentándolo al mismo tiempo. Por eso
-- lleva tablas propias y no toca ni una columna de las partidas clásicas.

PRAGMA foreign_keys = ON;

CREATE TABLE arenas (
  arena_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','active','finished','expired')),
  host TEXT NOT NULL,
  host_key TEXT NOT NULL,
  -- El código lo sortea el servidor: en la arena nadie lo elige, así que nadie
  -- juega con ventaja y no hace falta un secreto por persona.
  secret TEXT NOT NULL,
  digits INTEGER NOT NULL,
  mode TEXT NOT NULL DEFAULT 'numbers' CHECK (mode IN ('numbers','colors')),
  num_colors INTEGER NOT NULL DEFAULT 10,
  allow_repeats INTEGER NOT NULL DEFAULT 0,
  -- Siempre hay límite de intentos: es lo que garantiza que una arena termine
  -- aunque nadie acierte y aunque alguien cierre la pestaña.
  max_attempts INTEGER NOT NULL DEFAULT 10,
  created_at TEXT NOT NULL,
  started_at TEXT,
  updated_at TEXT NOT NULL,
  finish_reason TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX arenas_status ON arenas(status, updated_at DESC);

CREATE TABLE arena_players (
  arena_id TEXT NOT NULL REFERENCES arenas(arena_id) ON DELETE CASCADE,
  username_key TEXT NOT NULL,
  username TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  joined_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  best_fijas INTEGER NOT NULL DEFAULT 0,
  solved_at TEXT,
  gave_up INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (arena_id, username_key)
);
CREATE INDEX arena_players_user ON arena_players(username_key, arena_id);

CREATE TABLE arena_guesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  arena_id TEXT NOT NULL REFERENCES arenas(arena_id) ON DELETE CASCADE,
  username_key TEXT NOT NULL,
  username TEXT NOT NULL,
  guess TEXT NOT NULL,
  fijas INTEGER NOT NULL DEFAULT 0,
  picas INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  request_id TEXT
);
CREATE INDEX arena_guesses_mine ON arena_guesses(arena_id, username_key, id);
-- La idempotencia de siempre: el mismo intento enviado dos veces por una red
-- que va y viene se guarda una sola vez.
CREATE UNIQUE INDEX arena_guesses_request ON arena_guesses(arena_id, username_key, request_id) WHERE request_id IS NOT NULL;
