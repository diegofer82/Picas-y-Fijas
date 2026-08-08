PRAGMA foreign_keys = ON;

CREATE TABLE chat_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pair_key TEXT NOT NULL UNIQUE,
  user1 TEXT NOT NULL,
  user1_key TEXT NOT NULL,
  user2 TEXT NOT NULL,
  user2_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_message_at TEXT,
  last_game_at TEXT NOT NULL,
  latest_game_id TEXT
);
CREATE INDEX chat_threads_user1 ON chat_threads(user1_key,last_message_at,last_game_at);
CREATE INDEX chat_threads_user2 ON chat_threads(user2_key,last_message_at,last_game_at);

ALTER TABLE chat_messages ADD COLUMN thread_id INTEGER REFERENCES chat_threads(id) ON DELETE CASCADE;

INSERT OR IGNORE INTO chat_threads(pair_key,user1,user1_key,user2,user2_key,created_at,last_game_at,latest_game_id)
SELECT
  CASE WHEN u1.username_key<u2.username_key THEN u1.username_key||'|'||u2.username_key ELSE u2.username_key||'|'||u1.username_key END,
  CASE WHEN u1.username_key<u2.username_key THEN u1.username ELSE u2.username END,
  CASE WHEN u1.username_key<u2.username_key THEN u1.username_key ELSE u2.username_key END,
  CASE WHEN u1.username_key<u2.username_key THEN u2.username ELSE u1.username END,
  CASE WHEN u1.username_key<u2.username_key THEN u2.username_key ELSE u1.username_key END,
  MIN(g.created_at),MAX(g.updated_at),MAX(g.game_id)
FROM games g JOIN users u1 ON u1.username=g.p1 JOIN users u2 ON u2.username=g.p2
WHERE g.p2<>'' GROUP BY 1;

UPDATE chat_messages SET thread_id=(
  SELECT t.id FROM games g JOIN users u1 ON u1.username=g.p1 JOIN users u2 ON u2.username=g.p2
  JOIN chat_threads t ON t.pair_key=CASE WHEN u1.username_key<u2.username_key THEN u1.username_key||'|'||u2.username_key ELSE u2.username_key||'|'||u1.username_key END
  WHERE g.game_id=chat_messages.game_id
) WHERE room_type='game';

UPDATE chat_threads SET last_message_at=(SELECT MAX(created_at) FROM chat_messages m WHERE m.thread_id=chat_threads.id);
CREATE INDEX chat_messages_thread ON chat_messages(thread_id,id DESC);
