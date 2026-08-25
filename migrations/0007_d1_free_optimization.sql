-- D1 cobra cada fila de indice modificada como otra fila escrita. Presencia
-- es una tabla efimera y diminuta (ademas se limpia cada hora), por lo que un
-- escaneo para COUNT resulta mucho mas barato que duplicar cada heartbeat.
DROP INDEX IF EXISTS presence_last_seen;

-- El chat privado se consulta por thread_id desde la migracion 0003. El indice
-- por game_id ya no tiene lectores y el indice de lobby no debe incluir todos
-- los mensajes privados.
DROP INDEX IF EXISTS chat_messages_game;
DROP INDEX IF EXISTS chat_messages_lobby;
CREATE INDEX chat_messages_lobby ON chat_messages(id DESC)
  WHERE room_type='lobby' AND thread_id IS NULL;
