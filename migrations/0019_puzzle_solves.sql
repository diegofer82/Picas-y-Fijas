-- Los enigmas resueltos viajan con la cuenta (5.3.0).
--
-- Hasta la 5.2.1 lo resuelto vivía solo en el navegador, en `localStorage`:
-- cambiar de aparato o de navegador era empezar de cero. Esta tabla guarda una
-- fila por cuenta y enigma, y nada más: ni la respuesta, que el servidor
-- comprueba contra las pistas antes de escribir, ni los intentos fallidos.
--
-- La clave primaria es la regla entera: un enigma se resuelve una vez, y dos
-- aparatos que lo envían a la vez dejan una sola fila (`INSERT OR IGNORE`).
-- Leer lo resuelto por una cuenta es recorrer su prefijo de la clave, 72 filas
-- como mucho. No hay clave foránea hacia `users`, como en `badges`: cambiar de
-- nombre arrastra estas filas y borrar la cuenta las borra, las dos a mano.
-- Ningún comentario de este archivo lleva punto y coma: las pruebas parten el
-- archivo por ahí.
PRAGMA foreign_keys = ON;

CREATE TABLE puzzle_solves (
  username_key TEXT NOT NULL,
  puzzle_id TEXT NOT NULL,
  solved_at TEXT NOT NULL,
  PRIMARY KEY (username_key, puzzle_id)
);
