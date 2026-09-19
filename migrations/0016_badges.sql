PRAGMA foreign_keys = ON;

-- Insignias (E5-T3).
--
-- La regla que decide la forma de estas dos tablas es una sola: abrir un
-- perfil no puede recorrer `games`. Las insignias se calculan cuando la
-- partida termina, con los datos que ya estan en la mano, y se guardan. Leer
-- el perfil de alguien es entonces una lectura por clave primaria, no una
-- pasada por su historial.
CREATE TABLE badges (
  username_key TEXT NOT NULL,
  code TEXT NOT NULL,
  earned_at TEXT NOT NULL,
  game_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (username_key, code)
);
CREATE INDEX badges_earned ON badges(username_key, earned_at DESC);

-- Lo que hace falta recordar entre partidas para saber si una insignia toca:
-- rachas de dias y de victorias. Va aparte de `player_scores` porque no
-- pertenece a ninguna temporada: una racha de siete dias no se parte porque
-- cambie el mes.
CREATE TABLE player_progress (
  username_key TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  last_play_day TEXT NOT NULL DEFAULT '',
  day_streak INTEGER NOT NULL DEFAULT 0,
  best_day_streak INTEGER NOT NULL DEFAULT 0,
  win_streak INTEGER NOT NULL DEFAULT 0,
  best_win_streak INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ''
);
