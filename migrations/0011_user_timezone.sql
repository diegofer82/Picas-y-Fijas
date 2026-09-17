-- La zona horaria IANA de cada cuenta (p. ej. «Pacific/Noumea»), para que la
-- ficha de administracion ensene la hora local de la persona. Se guarda el
-- nombre de la zona y nunca un desfase fijo, que cambiaria con el horario de
-- verano. Nulo por omision: el Worker anterior la ignora.
ALTER TABLE users ADD COLUMN timezone TEXT;
