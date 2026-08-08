PRAGMA foreign_keys = ON;

CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_type TEXT NOT NULL CHECK (room_type IN ('lobby','game')),
  game_id TEXT REFERENCES games(game_id) ON DELETE CASCADE,
  sender TEXT NOT NULL DEFAULT '',
  sender_key TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'user' CHECK (kind IN ('user','system','nudge')),
  body TEXT NOT NULL DEFAULT '',
  event_key TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by TEXT
);
CREATE INDEX chat_messages_lobby ON chat_messages(room_type,id DESC);
CREATE INDEX chat_messages_game ON chat_messages(game_id,id DESC);
CREATE INDEX chat_messages_sender ON chat_messages(sender_key,id DESC);
CREATE UNIQUE INDEX chat_messages_event ON chat_messages(event_key) WHERE event_key IS NOT NULL;

CREATE TABLE chat_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  reporter TEXT NOT NULL,
  reporter_key TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam','harassment','inappropriate')),
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  UNIQUE(message_id,reporter_key)
);
CREATE INDEX chat_reports_status ON chat_reports(status,id DESC);

CREATE TABLE chat_mutes (
  username_key TEXT PRIMARY KEY,
  muted_until TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
