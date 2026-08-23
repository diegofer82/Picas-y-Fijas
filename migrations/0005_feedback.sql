PRAGMA foreign_keys = ON;

-- Buzon de sugerencias y errores. Se llena desde la pantalla de inicio, antes
-- de que exista una sesion, asi que el endpoint es publico: las barandillas
-- contra el abuso viven en `submitFeedback` y se apoyan en la columna `ip`.
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'idea',
  message TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT 'es',
  app_version TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX feedback_created ON feedback(created_at DESC);
CREATE INDEX feedback_status ON feedback(status, created_at DESC);
CREATE INDEX feedback_ip_created ON feedback(ip, created_at DESC);
