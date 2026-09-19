PRAGMA foreign_keys = ON;

-- Puntos y temporadas (E5-T1).
--
-- El ranking se calculaba a la carta, recorriendo todas las partidas
-- terminadas en cada visita: barato con cien partidas y caro con diez mil, y
-- sobre todo incapaz de contar nada que no estuviera ya en una columna de
-- `games`. Los puntos dependen de los intentos, que viven dentro del JSON de
-- la partida, asi que la suma se hace una sola vez —cuando la partida
-- termina— y se guarda aqui. Leer el ranking pasa a ser una lectura indexada.
--
-- Hay una fila por jugador y temporada, mas una fila 'all' con el total de
-- siempre: el mes se reinicia sin que nadie pierda su historia.
CREATE TABLE player_scores (
  season TEXT NOT NULL,
  username_key TEXT NOT NULL,
  username TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  points INTEGER NOT NULL DEFAULT 0,
  played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  best_attempts INTEGER NOT NULL DEFAULT 0,
  best_game_id TEXT NOT NULL DEFAULT '',
  rules_json TEXT NOT NULL DEFAULT '{}',
  first_played_at TEXT NOT NULL DEFAULT '',
  last_played_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (season, username_key)
);
CREATE INDEX player_scores_board ON player_scores(season, points DESC, wins DESC);

-- El recibo de cada partida contada. Es lo que hace que sumar dos veces sea
-- imposible: una partida puede cerrarse por el intento ganador, por el reloj,
-- por abandono o por el Cron, y los cuatro caminos pasan por aqui.
CREATE TABLE game_scores (
  game_id TEXT PRIMARY KEY,
  season TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

-- Las partidas que ya estaban terminadas el dia del cambio entran con lo que
-- se puede saber de ellas sin abrir el JSON de intentos: victorias, derrotas,
-- empates y la base de puntos (10 / 4 / 1). La dificultad y la economia de
-- intentos solo cuentan desde que la formula existe, y esto queda escrito
-- aqui a proposito: preferimos un historico honesto y algo mas pobre que
-- inventar puntos que nadie jugo. La temporada de cada una es el mes en que
-- termino, asi que el ranking del mes en curso nace practicamente limpio.
INSERT INTO player_scores(season,username_key,username,country,points,played,wins,losses,draws,first_played_at,last_played_at)
SELECT season,username_key,username,country,points,played,wins,losses,draws,first_played_at,last_played_at FROM (
  SELECT
    CASE WHEN s.season_key='all' THEN 'all' ELSE substr(s.updated_at,1,7) END season,
    lower(trim(s.user)) username_key,
    MAX(s.user) username,
    MAX(s.country) country,
    SUM(CASE WHEN s.winner=s.user THEN 10 WHEN s.winner='' THEN 4 ELSE 1 END) points,
    COUNT(*) played,
    SUM(CASE WHEN s.winner=s.user THEN 1 ELSE 0 END) wins,
    SUM(CASE WHEN s.winner<>'' AND s.winner<>s.user THEN 1 ELSE 0 END) losses,
    SUM(CASE WHEN s.winner='' THEN 1 ELSE 0 END) draws,
    MIN(s.created_at) first_played_at,
    MAX(s.updated_at) last_played_at
  FROM (
    SELECT g.p1 user,g.country1 country,g.winner,g.created_at,g.updated_at,k.season_key
      FROM games g, (SELECT 'all' season_key UNION ALL SELECT 'month') k
      WHERE g.status='finished' AND g.p2<>''
    UNION ALL
    SELECT g.p2,g.country2,g.winner,g.created_at,g.updated_at,k.season_key
      FROM games g, (SELECT 'all' season_key UNION ALL SELECT 'month') k
      WHERE g.status='finished' AND g.p2<>''
  ) s
  WHERE trim(s.user)<>''
  GROUP BY season,username_key
);

-- Y el recibo de esas partidas viejas, para que nadie las vuelva a contar el
-- dia que un administrador corrija un resultado.
INSERT INTO game_scores(game_id,season,detail_json,created_at)
SELECT game_id,substr(updated_at,1,7),'{"backfill":true}',updated_at
  FROM games WHERE status='finished' AND p2<>'';
