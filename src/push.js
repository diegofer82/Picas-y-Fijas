import { cleanName, isCorrespondenceGame } from "./game.js";
import { mailLang } from "./recovery.js";

const textEncoder = new TextEncoder();
const PUSH_TTL_SECONDS = 3 * 24 * 60 * 60;

const COPY = {
  es: {
    title: "Es tu turno · Picas y Fijas",
    body: (opponent) => `Te toca jugar contra ${opponent}.`,
    emailBody: (opponent) => `Te toca jugar contra ${opponent}. La partida sigue esperándote.`,
    button: "Abrir la partida",
    fallback: "Si el botón no funciona, copia y pega esta dirección en tu navegador:",
  },
  en: {
    title: "Your turn · Picas y Fijas",
    body: (opponent) => `It is your turn against ${opponent}.`,
    emailBody: (opponent) => `It is your turn against ${opponent}. Your game is waiting for you.`,
    button: "Open the game",
    fallback: "If the button does not work, copy and paste this address into your browser:",
  },
  fr: {
    title: "À toi de jouer · Picas y Fijas",
    body: (opponent) => `C’est à toi de jouer contre ${opponent}.`,
    emailBody: (opponent) => `C’est à toi de jouer contre ${opponent}. La partie t’attend.`,
    button: "Ouvrir la partie",
    fallback: "Si le bouton ne fonctionne pas, copie-colle cette adresse dans ton navigateur :",
  },
};

const copyFor = (lang) => COPY[mailLang(lang)];
const escapeHtml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const concat = (...arrays) => {
  const size = arrays.reduce((total, item) => total + item.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const item of arrays) { out.set(item, offset); offset += item.byteLength; }
  return out;
};
const base64UrlToBytes = (value) => {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};
const bytesToBase64Url = (value) => {
  let binary = "";
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};
const uint32 = (value) => new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);

async function hkdf(secret, salt, info, length) {
  const key = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

export function validPushSubscription(value) {
  try {
    const endpointValue = String(value?.endpoint || "");
    const p256dhValue = String(value?.keys?.p256dh || "");
    const authValue = String(value?.keys?.auth || "");
    if (endpointValue.length > 2048 || p256dhValue.length > 256 || authValue.length > 256) return false;
    const endpoint = new URL(endpointValue);
    const p256dh = base64UrlToBytes(p256dhValue);
    const auth = base64UrlToBytes(authValue);
    return endpoint.protocol === "https:" && !endpoint.username && !endpoint.password
      && !endpoint.port && p256dh.length === 65 && auth.length >= 16 && auth.length <= 32;
  } catch {
    return false;
  }
}

export async function savePushSubscription(db, user, value, lang) {
  if (!validPushSubscription(value)) return { ok: false, error: "Suscripción push inválida." };
  const at = new Date().toISOString();
  const language = mailLang(lang);
  await db.prepare(
    `INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,lang,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,
       auth=excluded.auth,lang=excluded.lang,updated_at=excluded.updated_at`,
  ).bind(user.id, value.endpoint, value.keys.p256dh, value.keys.auth, language, at, at).run();
  await db.prepare("UPDATE users SET notification_lang=? WHERE id=? AND notification_lang<>?")
    .bind(language, user.id, language).run();
  return { ok: true };
}

export async function deletePushSubscription(db, user, endpoint) {
  await db.prepare("DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?")
    .bind(user.id, String(endpoint || "").slice(0, 2048)).run();
  return { ok: true };
}

async function vapidAuthorization(endpoint, publicKey, privateKey) {
  const publicBytes = base64UrlToBytes(publicKey);
  const privateBytes = base64UrlToBytes(privateKey);
  if (publicBytes.length !== 65 || privateBytes.length !== 32) throw new Error("invalid-vapid-key");
  const signingKey = await crypto.subtle.importKey("jwk", {
    kty: "EC", crv: "P-256", ext: true,
    x: bytesToBase64Url(publicBytes.slice(1, 33)),
    y: bytesToBase64Url(publicBytes.slice(33, 65)),
    d: bytesToBase64Url(privateBytes),
  }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = bytesToBase64Url(textEncoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToBase64Url(textEncoder.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: "https://picasyfijas.fans",
  })));
  const unsigned = `${header}.${payload}`;
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signingKey, textEncoder.encode(unsigned));
  return `vapid t=${unsigned}.${bytesToBase64Url(signature)}, k=${publicKey}`;
}

async function encryptPayload(subscription, payload) {
  const clientPublic = base64UrlToBytes(subscription.p256dh);
  const authSecret = base64UrlToBytes(subscription.auth);
  const clientKey = await crypto.subtle.importKey("raw", clientPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const serverPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey("raw", serverPair.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, serverPair.privateKey, 256));
  const ikm = await hkdf(shared, authSecret, concat(textEncoder.encode("WebPush: info\0"), clientPublic, serverPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, textEncoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, salt, textEncoder.encode("Content-Encoding: nonce\0"), 12);
  const plaintext = concat(textEncoder.encode(JSON.stringify(payload)), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext));
  return concat(salt, uint32(4096), new Uint8Array([serverPublic.length]), serverPublic, ciphertext);
}

async function sendPush(env, subscription, payload) {
  if (!env?.VAPID_PUBLIC || !env?.VAPID_PRIVATE) return { ok: false, permanent: false };
  const body = await encryptPayload(subscription, payload);
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(subscription.endpoint, env.VAPID_PUBLIC, env.VAPID_PRIVATE),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(PUSH_TTL_SECONDS),
      Urgency: "normal",
    },
    body,
  });
  return { ok: response.ok, permanent: response.status === 404 || response.status === 410 };
}

async function sendFallbackEmail(env, user, copy, opponent, url) {
  if (!env?.EMAIL || !user.email) return false;
  const body = copy.emailBody(opponent);
  try {
    await env.EMAIL.send({
      to: user.email,
      from: { email: "noreply@mail.picasyfijas.fans", name: "Picas y Fijas" },
      subject: copy.title,
      text: `${body}\n${url}\n\n${copy.fallback}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;"><p style="font-size:16px;line-height:1.5;color:#1f2933;">${escapeHtml(body)}</p><p><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 28px;border-radius:8px;background:#2563eb;color:#fff;font-weight:bold;text-decoration:none;">${escapeHtml(copy.button)}</a></p><p style="font-size:13px;color:#6b7280;">${escapeHtml(copy.fallback)}<br><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p></div>`,
    });
    return true;
  } catch (cause) {
    console.error(JSON.stringify({ message: "turn-email", detail: String(cause?.message || cause) }));
    return false;
  }
}

export async function sendTurnNotification(db, env, game) {
  if (!game || game.status !== "active" || ![1, 2].includes(Number(game.turn))) return { ok: false, skipped: true };
  const recipient = Number(game.turn) === 1 ? game.p1 : game.p2;
  const opponent = cleanName(Number(game.turn) === 1 ? game.p2 : game.p1) || "Picas y Fijas";
  const user = await db.prepare("SELECT id,email,notification_lang FROM users WHERE username=?").bind(recipient).first();
  if (!user) return { ok: false, skipped: true };
  const claimed = await db.prepare(
    "INSERT OR IGNORE INTO turn_notifications(game_id,game_version,user_id,created_at) VALUES(?,?,?,?)",
  ).bind(game.game_id, Number(game.version), user.id, new Date().toISOString()).run();
  if (Number(claimed.meta?.changes) !== 1) return { ok: true, deduped: true };

  const subscription = await db.prepare(
    "SELECT id,endpoint,p256dh,auth,lang FROM push_subscriptions WHERE user_id=? ORDER BY updated_at DESC LIMIT 1",
  ).bind(user.id).first();
  const language = mailLang(subscription?.lang || user.notification_lang);
  const copy = copyFor(language);
  const url = `https://picasyfijas.fans/?game=${encodeURIComponent(game.game_id)}`;
  let delivered = false;
  let channel = "";
  if (subscription) {
    try {
      const pushed = await sendPush(env, subscription, { title: copy.title, body: copy.body(opponent), tag: `pf-turn-${game.game_id}`, url });
      delivered = pushed.ok;
      if (pushed.permanent)
        await db.prepare("DELETE FROM push_subscriptions WHERE id=?").bind(subscription.id).run();
      if (delivered) channel = "push";
    } catch (cause) {
      console.error(JSON.stringify({ message: "turn-push", detail: String(cause?.message || cause) }));
    }
  }
  // Un correo no sirve de nada en una partida de 30 segundos. El recurso de
  // respaldo por email queda para la cadencia asincrona que puede esperar.
  if (!delivered && isCorrespondenceGame(game)) {
    delivered = await sendFallbackEmail(env, user, copy, opponent, url);
    if (delivered) channel = "email";
  }
  if (delivered) {
    await db.prepare("UPDATE turn_notifications SET channel=? WHERE game_id=? AND game_version=? AND user_id=?")
      .bind(channel, game.game_id, Number(game.version), user.id).run();
    return { ok: true, channel };
  }
  await db.prepare("DELETE FROM turn_notifications WHERE game_id=? AND game_version=? AND user_id=?")
    .bind(game.game_id, Number(game.version), user.id).run();
  return { ok: false };
}
