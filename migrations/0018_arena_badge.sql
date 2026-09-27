-- La insignia de la arena (5.2.0).
--
-- No hay tabla nueva: `badges` ya guarda una fila por cuenta y código. Lo que
-- hace esta migración es lo retroactivo: quien ya ganó una arena antes de que
-- existiera la insignia la recibe ahora, con la fecha en que descifró el
-- código y el identificador de esa arena. El ganador se calcula como lo hace
-- `rankPlayers`: entre quienes acertaron, el de menos intentos, y a igual
-- número, el que acertó antes. Las arenas terminadas se guardan siete días
-- (`cleanupArenas`), así que solo las de esa ventana pueden apuntarse aquí.
-- Las anteriores ya no existen y no hay de dónde sacarlas. Ningún comentario
-- de este archivo lleva punto y coma: las pruebas parten el archivo por ahí.
--
-- El ORDER BY importa: la clave primaria (username_key, code) solo deja
-- entrar una fila por persona, y con INSERT OR IGNORE se queda la primera que
-- llega, que es la arena más antigua que ganó.
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO badges(username_key,code,earned_at,game_id,detail)
SELECT p.username_key, 'arena_win', p.solved_at, p.arena_id, CAST(p.attempts AS TEXT)
FROM arena_players p
JOIN arenas a ON a.arena_id = p.arena_id
WHERE a.status = 'finished'
  AND p.solved_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM arena_players q
    WHERE q.arena_id = p.arena_id AND q.solved_at IS NOT NULL
      AND (q.attempts < p.attempts OR (q.attempts = p.attempts AND q.solved_at < p.solved_at))
  )
ORDER BY p.solved_at;
