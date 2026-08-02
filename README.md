# Picas y Fijas

Juego multijugador de Picas y Fijas para amigos y familia.

## Nueva arquitectura

- Cloudflare Worker: API y alojamiento web.
- Cloudflare D1: usuarios, sesiones, partidas, presencia y auditoría.
- GitHub: código fuente e historial.
- Google Apps Script: versión anterior, mantenida durante la migración.

## Desarrollo local

Requisitos: Node.js 20 o posterior.

```text
pnpm install
pnpm run db:local
pnpm run dev
```

La aplicación local queda disponible normalmente en `http://localhost:8787` y el panel reservado en `http://localhost:8787/admin`.

## Seguridad

Nunca se publican hojas Excel, CSV, copias de seguridad, `.dev.vars`, `.env` ni el archivo privado de importación. Los PIN se guardan como hashes SHA-256 con una sal individual, compatibles con la versión de Google para permitir la migración sin cambiar los PIN.

La guía completa está en `INSTALACION_CLOUDFLARE.md` y el seguimiento en `PLAN_MIGRACION.md`.
