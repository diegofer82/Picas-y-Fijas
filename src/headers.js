// Las cabeceras de seguridad de las respuestas del Worker. Viven en su propio
// modulo y no en `index.js` porque el runtime de Workers solo admite funciones
// y objetos entre las exportaciones del modulo de entrada: una cadena
// exportada desde alli (`HSTS`) impide arrancar el Worker, aunque las pruebas
// de Node pasen.
//
// Lo que el navegador debe saber de cualquier respuesta del Worker, sea una
// pagina, el API o una redireccion. Nadie enmarca el juego (ni `/admin`, donde
// un clic robado borra una cuenta), el tipo declarado es el que vale y un
// `<base>` o un formulario inyectados no pueden llevarse nada fuera. No hay
// `script-src`: la interfaz es un solo documento con script y estilo en linea,
// y una lista que los permita no detiene nada. Los archivos estaticos que no
// pasan por aqui llevan las suyas en `public/_headers`.
export const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "content-security-policy":
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
};
// Doce meses, sin `includeSubDomains` ni `preload`: las dos son promesas
// sobre subdominios que el repositorio no conoce, y la segunda no se deshace.
export const HSTS = "max-age=31536000";

export function secure(response, url) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  // Un navegador la ignora si llega por HTTP, y `wrangler dev` no la manda.
  if (url.protocol === "https:") headers.set("strict-transport-security", HSTS);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
