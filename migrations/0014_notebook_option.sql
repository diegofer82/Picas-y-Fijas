PRAGMA foreign_keys = ON;

-- El cuaderno (E4-T3) no es una preferencia de quien juega sino una regla de
-- la partida: si uno puede marcar símbolos descartados y recibir un aviso
-- cuando su intento contradice sus propias pistas, el otro también. Por eso
-- viaja en `games`, se elige al crearla, la valida el servidor y la revancha
-- la hereda, igual que `reveal_secrets`. Apagada, la pantalla es la de
-- siempre, y ese es el valor por defecto de todas las partidas que ya existen.
ALTER TABLE games ADD COLUMN notebook INTEGER NOT NULL DEFAULT 0;
