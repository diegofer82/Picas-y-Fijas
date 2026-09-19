PRAGMA foreign_keys = ON;

-- El código del día no necesita una partida: el secreto se deriva del día con
-- HMAC y un secreto del Worker, así que aquí solo vive el resultado de cada
-- persona. La clave primaria es la regla «un intento diario»: nadie puede
-- tener dos filas del mismo día, y la fila se cierra en cuanto acierta o
-- agota los intentos.
CREATE TABLE daily_results (
  day TEXT NOT NULL,
  username_key TEXT NOT NULL,
  username TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  guesses_json TEXT NOT NULL DEFAULT '[]',
  attempts INTEGER NOT NULL DEFAULT 0,
  solved INTEGER NOT NULL DEFAULT 0,
  finished INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT,
  PRIMARY KEY (day, username_key)
);

-- La clasificación del día solo mira a quien resolvió, y siempre en el mismo
-- orden: menos intentos primero, y a igualdad de intentos, menos tiempo. El
-- índice es parcial para no indexar las partidas en curso ni las perdidas.
CREATE INDEX daily_results_board
  ON daily_results(day, attempts, duration_ms)
  WHERE solved = 1;
