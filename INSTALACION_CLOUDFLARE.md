# Instalación paso a paso en Cloudflare

Esta guía se ejecutará por bloques. No se debe retirar la aplicación de Google hasta completar la validación final.

## 1. Preparación de las cuentas

1. Inicia sesión en GitHub con `diegofer82`.
2. Comprueba que `Picas-y-Fijas` sigue público.
3. Inicia sesión en Cloudflare.
4. Confirma el correo y activa autenticación de dos factores.
5. No crees manualmente un Worker ni una base D1 si Codex va a completar la configuración por terminal.

Nunca compartas contraseñas, PIN, tokens personales ni claves API por chat.

## 2. Autorizar la terminal de Cloudflare

Desde la carpeta del proyecto se ejecutará:

```text
wrangler login
```

Cloudflare abrirá una página oficial en el navegador. Revisa que la cuenta sea la correcta y pulsa **Allow**. La credencial se guarda localmente; no se copia al repositorio.

Comprobación:

```text
wrangler whoami
```

## 3. Crear la base D1

Se ejecutará una sola vez:

```text
wrangler d1 create picas-y-fijas-db
```

Cloudflare devolverá un `database_id`. Ese identificador, que no es una contraseña, sustituirá `REPLACE_AFTER_D1_CREATION` en `wrangler.jsonc`.

Después se aplicará el esquema:

```text
wrangler d1 migrations apply picas-y-fijas-db --remote
```

## 4. Primera publicación de prueba

La publicación manual inicial se realizará con:

```text
wrangler deploy
```

Cloudflare propondrá o utilizará un subdominio `workers.dev`. Intentaremos usar `picas-y-fijas`, sujeto a disponibilidad. La versión de Google continuará activa.

Direcciones esperadas:

- Juego: `https://picas-y-fijas.<subdominio>.workers.dev/`
- Administración: `https://picas-y-fijas.<subdominio>.workers.dev/admin`

## 5. Migrar una copia de datos

1. Descarga una copia reciente de Google Sheets como `Picas y Fijas.xlsx`.
2. Déjala solamente en la carpeta local del proyecto.
3. Genera el SQL privado de importación.
4. Comprueba los conteos y que `Diego` tenga rol `admin`.
5. Importa primero en D1 de prueba y ejecuta las pruebas.

El Excel y el SQL generado están excluidos de GitHub. Para la migración definitiva se descargará una nueva copia justo antes del cambio, evitando perder partidas recientes.

## 6. Conectar GitHub con Cloudflare

Después de aprobar el primer bloque en GitHub:

1. Abre **Workers & Pages** en Cloudflare.
2. Selecciona el Worker `picas-y-fijas`.
3. Abre **Settings → Builds/Deployments**.
4. Conecta GitHub.
5. Autoriza la aplicación oficial de Cloudflare únicamente para `Picas-y-Fijas`.
6. Selecciona la rama `main`.
7. Configura despliegue de producción solo desde `main`.

No se necesita un token personal de GitHub para esta conexión.

## 7. Pruebas antes del cambio

- Inicio de sesión de usuarios existentes con su PIN actual.
- Acceso de `Diego` a `/admin`.
- Creación y unión a partidas públicas y privadas.
- Números y colores; 3, 4, 5 y 6 posiciones.
- Repeticiones permitidas y prohibidas.
- Límites de intentos y cronómetro.
- Pausa, salida, abandono y revancha.
- Ranking, historial y tres idiomas.
- Recarga y pérdida temporal de conexión.
- Varias partidas y jugadores simultáneos.
- Navegadores móviles y equipos en países diferentes.

## 8. Cambio definitivo

1. Anunciar una breve pausa para no crear nuevas partidas en Google.
2. Descargar la copia final de Sheets.
3. Crear una copia de seguridad D1 previa.
4. Importar los datos finales.
5. Verificar usuarios, partidas y administrador.
6. Ejecutar pruebas rápidas en producción.
7. Compartir la nueva dirección.
8. Mantener Google disponible como reversión durante un periodo acordado.

## 9. Recuperación

Si la versión nueva presenta un problema grave, se vuelve a compartir temporalmente la dirección de Google. No se elimina la hoja original ni el despliegue Apps Script durante la fase de convivencia.
