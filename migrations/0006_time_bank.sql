PRAGMA foreign_keys = ON;

-- Bolsa de tiempo, como el reloj de ajedrez: cada jugador gasta de su propia
-- bolsa mientras le toca y pierde si se le acaba. Convive con el cronometro por
-- turno de siempre en vez de sustituirlo: `time_mode` decide cual manda, y
-- 'turn' por omision deja intactas las partidas que ya existen.
ALTER TABLE games ADD COLUMN time_mode TEXT NOT NULL DEFAULT 'turn';
ALTER TABLE games ADD COLUMN bank_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE games ADD COLUMN bank_increment INTEGER NOT NULL DEFAULT 0;
ALTER TABLE games ADD COLUMN bank1_remaining INTEGER NOT NULL DEFAULT 0;
ALTER TABLE games ADD COLUMN bank2_remaining INTEGER NOT NULL DEFAULT 0;
