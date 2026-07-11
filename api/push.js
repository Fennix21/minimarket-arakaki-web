// Notificaciones push de la web (Web Push + VAPID).
//   GET  ?key                          -> { key } clave pública VAPID (el navegador la necesita para suscribirse)
//   POST { action:'subscribe', rol:'clientes', subscription }          (público: opt-in del visitante)
//   POST { action:'subscribe', rol:'duenos', subscription, pass }      (panel: requiere contraseña)
//   POST { action:'unsubscribe', rol, endpoint [, pass si duenos] }
//   POST { action:'send', pass, target, title, body, url }             (broadcast del panel)
//   POST { action:'test', pass }                                       (prueba: solo a los dueños)
//   POST { action:'count', pass }                                      (contadores para el panel)
// Suscripciones en HASH push:clientes / push:duenos (ver api/_push.js).

const { pushTo } = require('./_push.js');

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

const limpio = (s, n) => (s == null ? '' : String(s)).trim().slice(0, n);
const ROLES = { clientes: 1, duenos: 1 };

module.exports = async (req, res) => {
  // La clave pública no es secreta: el navegador la usa para crear la suscripción
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    return res.status(200).json({ key: process.env.VAPID_PUBLIC_KEY || null });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!REDIS_URL || !REDIS_TOKEN) return res.status(200).json({ ok: true }); // sin base aún: no romper la web

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};

  const esAdmin = !!process.env.ARAKAKI_ADMIN_PASS && (b.pass || '') === process.env.ARAKAKI_ADMIN_PASS;
  const rol = ROLES[b.rol] ? b.rol : 'clientes';

  try {
    if (b.action === 'subscribe') {
      if (rol === 'duenos' && !esAdmin) return res.status(401).json({ error: 'Contraseña incorrecta.' });
      const sub = b.subscription;
      if (!sub || typeof sub !== 'object' || !sub.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys) {
        return res.status(400).json({ error: 'Suscripción inválida.' });
      }
      const total = Number(await redis(['HLEN', 'push:' + rol])) || 0;
      const existe = await redis(['HEXISTS', 'push:' + rol, sub.endpoint]);
      if (!existe && total >= 5000) return res.status(429).json({ error: 'Límite de suscriptores alcanzado.' });
      await redis(['HSET', 'push:' + rol, sub.endpoint, JSON.stringify(sub)]);
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'unsubscribe') {
      if (rol === 'duenos' && !esAdmin) return res.status(401).json({ error: 'Contraseña incorrecta.' });
      const endpoint = limpio(b.endpoint, 500);
      if (endpoint) await redis(['HDEL', 'push:' + rol, endpoint]);
      return res.status(200).json({ ok: true });
    }

    // ---- Acciones del panel (requieren contraseña) ----
    if (!esAdmin) return res.status(401).json({ error: 'Contraseña incorrecta.' });

    if (b.action === 'count') {
      const clientes = Number(await redis(['HLEN', 'push:clientes'])) || 0;
      const duenos = Number(await redis(['HLEN', 'push:duenos'])) || 0;
      return res.status(200).json({ clientes, duenos, configurado: !!process.env.VAPID_PUBLIC_KEY });
    }

    if (b.action === 'test') {
      const r2 = await pushTo('duenos', {
        title: '🔔 Prueba del Minimarket Arakaki',
        body: 'Los avisos push funcionan en este dispositivo. ¡Todo listo!',
        url: '/panel', tag: 'arakaki-test',
      });
      return res.status(200).json({ ok: true, enviados: r2.enviados, podados: r2.podados });
    }

    if (b.action === 'send') {
      const target = ROLES[b.target] ? b.target : 'clientes';
      const title = limpio(b.title, 80);
      const body = limpio(b.body, 240);
      if (!title || !body) return res.status(400).json({ error: 'Falta el título o el texto.' });
      let url = limpio(b.url, 300) || '/';
      if (!/^(\/|https:\/\/)/.test(url)) url = '/';
      const r2 = await pushTo(target, { title, body, url, tag: 'arakaki-promo' });
      try { await redis(['INCRBY', 'stat:push_enviados', String(r2.enviados)]); } catch (e) {}
      return res.status(200).json({ ok: true, enviados: r2.enviados, podados: r2.podados });
    }

    return res.status(400).json({ error: 'Acción desconocida.' });
  } catch (e) {
    console.error('push error', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
