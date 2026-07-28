// Analítica propia del Minimarket Arakaki (sin cookies, solo conteos agregados).
// Recibe eventos desde /track.js y los suma en Upstash.
//   POST { ev, p, r }  ev=evento, p=ruta de la página, r=referrer
// No usa contraseña: solo INCREMENTA contadores (no expone datos).

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

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  if (!REDIS_URL) return res.status(200).end();

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};

  const ev = (b.ev || '').toString().slice(0, 40).replace(/[^a-z0-9_]/gi, '');
  if (!ev) return res.status(200).end();
  const day = new Date().toISOString().slice(0, 10);
  const path = ((b.p || '/').toString().slice(0, 60).replace(/[^a-z0-9/_-]/gi, '')) || '/';

  // Latido de presencia: "esta persona sigue navegando la web ahora". NO suma contadores;
  // marca al visitante en un ZSET con TTL corto para el monitor "en vivo" del panel (crm.js envivo).
  if (ev === 'presencia') {
    const uid = (b.uid || '').toString().replace(/[^a-z0-9]/gi, '').slice(0, 40);
    if (uid) {
      try {
        const ahora = Date.now();
        await redis(['SET', 'pres:' + uid, JSON.stringify({ p: path, ts: ahora }), 'EX', '90']);
        await redis(['ZADD', 'presencia', String(ahora), uid]);
        // Poda ocasional de los que ya no están (evita que el ZSET crezca sin control)
        if (Math.random() < 0.1) await redis(['ZREMRANGEBYSCORE', 'presencia', '-inf', String(ahora - 90000)]);
      } catch (e) {}
    }
    return res.status(200).end();
  }

  try {
    await redis(['INCR', 'stat:' + ev]);
    await redis(['INCR', 'stat:' + ev + ':' + day]);
    await redis(['SADD', 'stat:events', ev]);

    // En qué página ocurrió el evento (sirve para saber qué botón/página convierte).
    await redis(['INCR', 'stat:evp:' + ev + ':' + path]);
    await redis(['SADD', 'stat:evpages:' + ev, path]);

    if (ev === 'pageview') {
      await redis(['INCR', 'stat:page:' + path]);
      await redis(['SADD', 'stat:pages', path]);

      // Referrer: de dónde llegó (host), o "directo".
      let host = 'directo';
      try {
        const r = (b.r || '').toString();
        if (r) { host = new URL(r).hostname.replace(/^www\./, '').slice(0, 40); }
      } catch (e) {}
      if (host.indexOf('minimarketarakaki') >= 0 || host.indexOf('vercel.app') >= 0) return res.status(200).end(); // navegación interna
      const safe = host.replace(/[^a-z0-9.-]/gi, '') || 'directo';
      await redis(['INCR', 'stat:ref:' + safe]);
      await redis(['SADD', 'stat:refs', safe]);
    }
  } catch (e) { console.error('track error', e); }

  return res.status(200).end();
};
