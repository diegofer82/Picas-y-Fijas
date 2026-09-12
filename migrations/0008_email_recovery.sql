-- L'adresse est facultative. Elle ne devient utilisable pour la récupération
-- qu'après vérification via un lien à usage unique.
ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
CREATE UNIQUE INDEX users_email_unique ON users(email) WHERE email<>'';

CREATE TABLE email_verifications (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX email_verifications_user ON email_verifications(user_id, created_at DESC);

CREATE TABLE pin_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  requested_ip TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX pin_resets_user ON pin_resets(user_id, created_at DESC);

CREATE TABLE feedback_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feedback_id INTEGER NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  admin_user_id INTEGER NOT NULL REFERENCES users(id),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX feedback_replies_feedback ON feedback_replies(feedback_id, created_at DESC);
