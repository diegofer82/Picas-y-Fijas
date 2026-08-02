PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
  blocked_at TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX sessions_user_id ON sessions(user_id);
CREATE INDEX sessions_expires_at ON sessions(expires_at);

CREATE TABLE login_attempts (
  throttle_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE games (
  game_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  digits INTEGER NOT NULL,
  p1 TEXT NOT NULL,
  secret1 TEXT NOT NULL,
  p2 TEXT NOT NULL DEFAULT '',
  secret2 TEXT NOT NULL DEFAULT '',
  turn INTEGER NOT NULL DEFAULT 0,
  guesses TEXT NOT NULL DEFAULT '[]',
  winner TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  allow_repeats INTEGER NOT NULL DEFAULT 0,
  is_public INTEGER NOT NULL DEFAULT 1,
  mode TEXT NOT NULL DEFAULT 'numbers',
  num_colors INTEGER NOT NULL DEFAULT 10,
  max_attempts INTEGER NOT NULL DEFAULT 0,
  turn_seconds INTEGER NOT NULL DEFAULT 0,
  turn_started_at TEXT NOT NULL DEFAULT '',
  rematch_id TEXT NOT NULL DEFAULT '',
  pending_winner TEXT NOT NULL DEFAULT '',
  country1 TEXT NOT NULL DEFAULT '',
  country2 TEXT NOT NULL DEFAULT '',
  turn_remaining INTEGER NOT NULL DEFAULT 0,
  timer_paused INTEGER NOT NULL DEFAULT 0,
  manual_paused_by TEXT NOT NULL DEFAULT '',
  manual_pause_until TEXT NOT NULL DEFAULT '',
  last_manual_pause_at TEXT NOT NULL DEFAULT '',
  lobby_paused_by TEXT NOT NULL DEFAULT '',
  reveal_secrets INTEGER NOT NULL DEFAULT 0,
  timer_ready_by TEXT NOT NULL DEFAULT '',
  timer_activated INTEGER NOT NULL DEFAULT 0,
  finish_reason TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX games_status_public_created ON games(status, is_public, created_at DESC);
CREATE INDEX games_p1_updated ON games(p1, updated_at DESC);
CREATE INDEX games_p2_updated ON games(p2, updated_at DESC);

CREATE TABLE presence (
  username_key TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  game_id TEXT,
  location TEXT NOT NULL DEFAULT 'lobby',
  last_seen_at TEXT NOT NULL
);
CREATE INDEX presence_last_seen ON presence(last_seen_at);

CREATE TABLE request_receipts (
  request_id TEXT NOT NULL,
  username_key TEXT NOT NULL,
  game_id TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (request_id, username_key)
);
CREATE INDEX request_receipts_created ON request_receipts(created_at);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX audit_log_created ON audit_log(created_at DESC);
