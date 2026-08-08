# Auditoría funcional V2.0

Fecha: 3 de agosto de 2026

## Alcance

La auditoría ejecuta el Worker completo en un entorno local aislado con Cloudflare D1 y dos jugadores autenticados. No escribe usuarios ni partidas de prueba en producción.

La matriz cubre:

- modos numérico y colores;
- 3, 4, 5 y 6 posiciones;
- con y sin repetición;
- 4, 6 y 8 colores;
- sin límite, 6 y 10 intentos;
- sin cronómetro y turnos de 30, 60 y 120 segundos;
- partidas públicas y privadas;
- revelado de secretos activado y desactivado.

Esto produce 1.536 selecciones teóricas. De ellas, 1.440 son jugables y 96 son imposibles (5 o 6 posiciones, 4 colores y sin repetición). La interfaz y el servidor bloquean ahora esas 96 combinaciones.

## Flujos de dos jugadores verificados

- creación, unión y alternancia de turnos;
- números y colores, con y sin repetición;
- intentos válidos e inválidos;
- rechazo de intentos fuera de turno;
- idempotencia ante reintentos de red;
- vencimiento del cronómetro y rechazo del intento tardío;
- solicitudes simultáneas de vencimiento sin doble cambio de turno;
- intentos simultáneos sin consumir dos veces el mismo turno;
- pausa manual, bloqueo durante la pausa y reanudación por su propietario;
- límites de intentos y empate al agotarlos ambos jugadores;
- victoria, ganador pendiente y empate al resolver con igual número de intentos;
- ocultación de secretos durante la partida y revelado opcional al terminar;
- partidas públicas y privadas;
- abandono y cierre de partida;
- revancha inmediata conservando todas las reglas;
- envío con Enter en todos los campos de escritura;
- identificadores criptográficos para evitar duplicados de intentos.

## Fallos encontrados y corregidos

1. La revancha inmediata podía ser rechazada por el límite de creación de 10 segundos. La protección se mantiene para partidas nuevas, pero ya no bloquea una revancha legítima.
2. La interfaz permitía elegir 5 o 6 posiciones con 4 colores y sin repetición, una combinación sin solución posible. La opción se deshabilita automáticamente y el servidor también la rechaza explícitamente.
3. El identificador alternativo de los intentos usaba aleatoriedad no criptográfica en navegadores antiguos. Ahora usa Web Crypto en todos los casos.

## Resultado

- 24 pruebas automatizadas aprobadas.
- 0 pruebas fallidas.
- Tipos de bindings de Cloudflare actualizados.
- Validación de formato y sintaxis aprobada.

La suite permanente está en `test/audit-v2.test.js` y se ejecuta junto con `npm test`.
