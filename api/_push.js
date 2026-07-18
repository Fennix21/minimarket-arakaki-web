// Motor de envío Web Push (compartido, no es endpoint). Lo usan api/push.js (broadcast
// del panel) y pedido.js / chat.js / whatsapp.js (aviso automático a los dueños).
// Suscripciones en Redis: HASH push:clientes y push:duenos {endpoint -> subscriptionJSON}.
// Requiere env VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (npx web-push generate-vapid-keys);
// sin ellas no envía nada y no rompe.

const webpush = require('web-push');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(cmd) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const data = await r.json();
  return data.result;
}

let vapidListo = false;
function configurarVapid() {
  if (vapidListo) return true;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:hola@minimarketarakaki.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  vapidListo = true;
  return true;
}

// Icono de las notificaciones: el logo oficial, o el que el dueño eligió en
// panel → 📝 Sitio → 🖼️ Logos (config:logos.push). Nunca lanza.
async function iconoPush() {
  try {
    const raw = await redis(['GET', 'config:logos']);
    if (raw) { const l = JSON.parse(raw); if (l && l.push) return l.push; }
  } catch (e) {}
  return '/img/logo-oficial-192.png';
}

// Envía payload {title,body,url,icon,tag} a TODAS las suscripciones de un rol
// ('clientes' | 'duenos'). Poda las muertas (404/410 = navegador la revocó).
async function pushTo(rol, payload) {
  if (!configurarVapid() || !REDIS_URL || !REDIS_TOKEN) return { enviados: 0, podados: 0 };
  if (payload && !payload.icon) payload.icon = await iconoPush(); // identidad visual SIEMPRE
  const plano = (await redis(['HGETALL', 'push:' + rol])) || []; // Upstash: [campo, valor, campo, valor...]
  const subs = [];
  for (let i = 0; i + 1 < plano.length; i += 2) subs.push({ endpoint: plano[i], json: plano[i + 1] });
  if (!subs.length) return { enviados: 0, podados: 0 };

  const cuerpo = JSON.stringify(payload);
  let enviados = 0, podados = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(JSON.parse(s.json), cuerpo, { TTL: 86400 });
      enviados++;
    } catch (e) {
      const code = e && e.statusCode;
      if (code === 404 || code === 410) { // suscripción muerta: fuera del hash
        try { await redis(['HDEL', 'push:' + rol, s.endpoint]); podados++; } catch (e2) {}
      } else {
        console.error('pushTo error', rol, code || e);
      }
    }
  }));
  return { enviados, podados };
}

// Aviso corto a los dueños (para pedido.js/chat.js/whatsapp.js): nunca lanza.
async function pushDuenos(title, body, url) {
  try { return await pushTo('duenos', { title, body, url: url || '/panel', tag: 'arakaki-panel' }); }
  catch (e) { console.error('pushDuenos error', e); return { enviados: 0, podados: 0 }; }
}

module.exports = { pushTo, pushDuenos };
