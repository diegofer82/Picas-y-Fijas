-- Cambio de nombre de usuario desde «Mi cuenta». Guarda cuando se cambio
-- por ultima vez para limitarlo a uno cada 90 dias. Columna nueva con valor
-- nulo por omision: el Worker anterior la ignora.
ALTER TABLE users ADD COLUMN username_changed_at TEXT;
