PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN last_ip TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN last_country TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN signup_ip TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN signup_country TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN login_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE sessions ADD COLUMN ip TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN country TEXT NOT NULL DEFAULT '';

CREATE INDEX users_last_ip ON users(last_ip);

UPDATE users SET last_country=COALESCE((SELECT c FROM (SELECT country1 c,updated_at FROM games WHERE p1=users.username AND country1<>'' UNION ALL SELECT country2 c,updated_at FROM games WHERE p2=users.username AND country2<>'') ORDER BY updated_at DESC LIMIT 1),'') WHERE last_country='';
