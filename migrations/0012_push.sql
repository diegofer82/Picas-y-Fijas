PRAGMA foreign_keys = ON;

-- La langue de la derniere connexion sert au courrier de secours lorsqu'un
-- joueur n'a aucun abonnement push. Elle se met a jour pendant la connexion,
-- jamais dans le polling.
ALTER TABLE users ADD COLUMN notification_lang TEXT NOT NULL DEFAULT 'es';

CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'es',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX push_subscriptions_user_updated
  ON push_subscriptions(user_id, updated_at DESC);

-- La version de la partie change au moment exact ou le tour change. Cette cle
-- unique permet a guess, passTurn et au Cron de courir sans envoyer deux fois
-- le meme avis au meme joueur.
CREATE TABLE turn_notifications (
  game_id TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  game_version INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, game_version, user_id)
);
CREATE INDEX turn_notifications_created ON turn_notifications(created_at);

-- Le Cron ne relit que les correspondances dont le plus petit delai possible
-- (un jour) peut etre ecoule.
CREATE INDEX games_correspondence_deadline
  ON games(turn_started_at)
  WHERE status = 'active' AND time_mode = 'correspondence' AND timer_paused = 0;
