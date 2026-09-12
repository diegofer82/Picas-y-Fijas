import test from 'node:test';
import assert from 'node:assert/strict';
import { requestPinReset, sendEmailVerification } from '../src/recovery.js';

// Un D1 de mentira: estas dos funciones solo consultan y escriben en lote, y lo
// que se mira aqui es el correo que sale, no la base. Cada `first()` devuelve la
// siguiente respuesta preparada.
function fakeDb(answers) {
  const queue = [...answers];
  return {
    prepare: () => ({ bind: () => ({ first: async () => queue.shift() ?? null, run: async () => ({}) }) }),
    batch: async () => [],
  };
}

// El buzon de pruebas: guarda el ultimo mensaje en vez de mandarlo.
function fakeMail() {
  const sent = [];
  return { sent, env: { EMAIL: { send: async (message) => { sent.push(message); } } } };
}

const activation = { id:7 };

test('el correo de verificación sale en el idioma de la pantalla, con botón y con enlace de repuesto', async () => {
  const esperado = {
    es: { subject:'Verifica tu correo de Picas y Fijas', label:'Verificar mi correo', duration:'3 días' },
    en: { subject:'Verify your Picas y Fijas email', label:'Verify my email', duration:'3 days' },
    fr: { subject:'Vérifie ton adresse e-mail Picas y Fijas', label:'Vérifier mon adresse', duration:'3 jours' },
  };
  for (const [lang, copy] of Object.entries(esperado)) {
    const buzon = fakeMail();
    const result = await sendEmailVerification(fakeDb([null]), buzon.env, activation, 'jugador@ejemplo.test', 'https://picasyfijas.fans', true, lang);
    assert.equal(result.ok, true);
    const [message] = buzon.sent;
    assert.equal(message.subject, copy.subject, `asunto en ${lang}`);
    assert.ok(message.text.includes(copy.duration), `el plazo va traducido en ${lang}`);
    // El boton es lo que evita el copia y pega, y el enlace suelto es su red.
    assert.ok(message.html.includes(`>${copy.label}</a>`), `el botón lleva su texto en ${lang}`);
    const enlace = message.html.match(/href="([^"]+verify_email[^"]*)"/g) || [];
    assert.equal(enlace.length, 2, 'el enlace va en el botón y también escrito debajo');
    assert.ok(message.text.includes('/?verify_email='), 'la versión sin formato conserva el enlace entero');
  }
});

test('el correo de contraseña nueva sigue el mismo idioma', async () => {
  const esperado = {
    es: 'Restablece tu contraseña de Picas y Fijas',
    en: 'Reset your Picas y Fijas password',
    fr: 'Réinitialise ton mot de passe Picas y Fijas',
  };
  for (const [lang, subject] of Object.entries(esperado)) {
    const buzon = fakeMail();
    const db = fakeDb([{ total:0 }, { id:7, email:'jugador@ejemplo.test' }]);
    await requestPinReset(db, buzon.env, { email:'jugador@ejemplo.test', lang }, 'https://picasyfijas.fans/api', { ip:'1.2.3.4' });
    assert.equal(buzon.sent.length, 1, `hay correo en ${lang}`);
    assert.equal(buzon.sent[0].subject, subject);
    assert.ok(buzon.sent[0].html.includes('reset_pin='), 'el botón apunta al enlace de la contraseña');
  }
});

test('un idioma que no existe no deja el correo en blanco: se cae al español', async () => {
  const buzon = fakeMail();
  await sendEmailVerification(fakeDb([null]), buzon.env, activation, 'jugador@ejemplo.test', 'https://picasyfijas.fans', false, 'de');
  assert.equal(buzon.sent[0].subject, 'Verifica tu correo de Picas y Fijas');
  assert.ok(buzon.sent[0].text.includes('15 minutos'), 'y el plazo corto también');
});
