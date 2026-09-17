-- El nombre que tenia la cuenta antes de su ultimo cambio, para la ficha de
-- administracion. Nulo por omision: el Worker anterior la ignora.
ALTER TABLE users ADD COLUMN previous_username TEXT;
