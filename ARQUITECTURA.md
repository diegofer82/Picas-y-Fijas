# Arquitectura Cloudflare

## Componentes

1. `public/index.html`: juego en español, inglés y francés.
2. `public/admin.html`: panel administrativo en la ruta separada `/admin`.
3. `src/index.js`: API compatible con las acciones de la versión Apps Script.
4. `src/game.js`: reglas puras, cálculo de picas/fijas, cronómetro y sanitización.
5. `src/security.js`: hash de PIN, sesiones, bloqueo de intentos y autenticación.
6. `migrations/`: esquema versionado de D1.

## Concurrencia

Cada partida posee una columna `version`. Toda modificación usa una actualización condicional equivalente a:

```sql
UPDATE games SET ..., version = version + 1
WHERE game_id = ? AND version = ?;
```

Si dos peticiones modifican la misma versión, solamente una puede terminar. La otra vuelve a leer y reintenta hasta tres veces. Las partidas distintas no comparten un bloqueo de aplicación.

Las jugadas también guardan un `requestId`. Si el navegador repite una petición porque perdió la respuesta, el servidor devuelve el resultado anterior sin insertar otra jugada.

## Datos

- `users`: identidad, hash del PIN, rol y bloqueo.
- `sessions`: sesiones temporales; el PIN no se reenvía en el polling.
- `games`: estado completo de cada partida y versión de concurrencia.
- `presence`: jugadores conectados y ubicación lobby/partida.
- `request_receipts`: idempotencia de jugadas.
- `audit_log`: acciones administrativas.

## Administración

El panel no está enlazado desde el juego. Requiere una cuenta con rol `admin` y permite consultar usuarios y partidas, bloquear usuarios, restablecer PIN, cerrar partidas y exportar una copia. La API incluye además cambio de rol y corrección auditada de resultados.

## Escalabilidad prevista

La primera versión está dimensionada para menos de 20 conexiones simultáneas y diseñada para 100. Antes de aumentar el uso se medirán peticiones diarias, filas D1 leídas/escritas y frecuencia de polling. Una evolución posterior puede sustituir polling por WebSockets sin cambiar el modelo principal.
