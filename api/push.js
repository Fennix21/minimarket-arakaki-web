// Notificaciones push de la web (Web Push + VAPID).
//   GET  ?key                          -> { key } clave pública VAPID (el navegador la necesita para suscribirse)
//   POST { action:'subscribe', rol:'clientes', subscription }          (público: opt-in del visitante)
//   POST { action:'subscribe', rol:'duenos', subscription, pass }      (panel: requiere contraseña)
//   POST { action:'unsubscribe', rol, endpoint [, pass si duenos] }
//   POST { action:'send', pass, target, title, body, url, image }      (broadcast del panel; image = banner opcional;
//                                                                       registra la campaña en pushlog con id para contar clics)
//   POST { action:'test', pass [, title, body, url, image] }           (prueba SOLO a los dueños; sin campos usa un texto fijo,
//                                                                       con campos manda la promo tal cual para revisarla antes)
//   POST { action:'count', pass }                                      (todo lo del panel: contadores + promos guardadas + historial)
//   POST { action:'savepromo', pass, promo }                           (guarda/actualiza una promoción reutilizable, máx 20)
//   POST { action:'delpromo', pass, id }                               (borra una promoción guardada)
//   POST { action:'imgup', pass, data }                                (sube el banner como dataURL ya comprimido por el panel
//                                                                       → pushimg:<id> en Redis, máx 30, y devuelve su URL)
//   GET  ?img=<id>                                                     (sirve ese banner con caché larga; lo pide el navegador
//                                                                       del cliente al mostrar la notificación)
// Suscripciones en HASH push:clientes / push:duenos (ver api/_push.js).
// Promos guardadas en config:pushpromos (JSON array) · historial en LIST pushlog (≤50)
// · clics por campaña en stat:evp:push_click:/<id> (los suma sw.js vía /api/track).

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
  // GET ?img=<id> → sirve un banner subido desde el panel (Redis pushimg:<id>)
  if (req.method === 'GET' && req.query && req.query.img) {
    const id = String(req.query.img).replace(/[^a-z0-9]/gi, '').slice(0, 24);
    const dataUrl = id && REDIS_URL ? await redis(['GET', 'pushimg:' + id]) : null;
    const m = dataUrl && dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return res.status(404).json({ error: 'Imagen no encontrada.' });
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // el id es único: cachear para siempre
    return res.status(200).end(Buffer.from(m[2], 'base64'));
  }
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
      let promos = [];
      try { promos = JSON.parse((await redis(['GET', 'config:pushpromos'])) || '[]'); } catch (e) {}
      if (!Array.isArray(promos)) promos = [];
      const crudo = (await redis(['LRANGE', 'pushlog', '0', '19'])) || [];
      const historial = [];
      for (const c of crudo) { try { historial.push(JSON.parse(c)); } catch (e) {} }
      if (historial.length) { // clics por campaña (los suma sw.js en stat:evp:push_click:/<id>)
        const claves = historial.map((h) => 'stat:evp:push_click:/' + h.id);
        const clics = (await redis(['MGET', ...claves])) || [];
        historial.forEach((h, i) => { h.clicks = Number(clics[i]) || 0; });
      }
      return res.status(200).json({ clientes, duenos, configurado: !!process.env.VAPID_PUBLIC_KEY, promos, historial });
    }

    if (b.action === 'savepromo') {
      const p = b.promo || {};
      const promo = {
        id: limpio(p.id, 20) || 'pr' + Date.now().toString(36),
        nombre: limpio(p.nombre, 40),
        title: limpio(p.title, 80),
        body: limpio(p.body, 240),
        url: limpio(p.url, 300),
        image: limpio(p.image, 400),
        ts: Date.now(),
      };
      if (!promo.title || !promo.body) return res.status(400).json({ error: 'Falta el título o el texto.' });
      let promos = [];
      try { promos = JSON.parse((await redis(['GET', 'config:pushpromos'])) || '[]'); } catch (e) {}
      if (!Array.isArray(promos)) promos = [];
      const i = promos.findIndex((x) => x && x.id === promo.id);
      if (i >= 0) promos[i] = promo;
      else {
        if (promos.length >= 20) return res.status(400).json({ error: 'Máximo 20 promociones guardadas: borra alguna primero.' });
        promos.unshift(promo);
      }
      await redis(['SET', 'config:pushpromos', JSON.stringify(promos)]);
      return res.status(200).json({ ok: true, promos, id: promo.id });
    }

    if (b.action === 'delpromo') {
      let promos = [];
      try { promos = JSON.parse((await redis(['GET', 'config:pushpromos'])) || '[]'); } catch (e) {}
      if (!Array.isArray(promos)) promos = [];
      promos = promos.filter((x) => x && x.id !== b.id);
      await redis(['SET', 'config:pushpromos', JSON.stringify(promos)]);
      return res.status(200).json({ ok: true, promos });
    }

    if (b.action === 'imgup') {
      const data = String(b.data || '');
      if (data.length > 480000) return res.status(400).json({ error: 'Imagen demasiado pesada (máx ~350 KB ya comprimida).' });
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) {
        return res.status(400).json({ error: 'Formato de imagen inválido.' });
      }
      const id = 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      await redis(['SET', 'pushimg:' + id, data]);
      await redis(['ZADD', 'pushimgs', String(Date.now()), id]);
      // Tope de 30 banners guardados: las más viejas se van (sus URLs viven en el caché CDN un año)
      const total = Number(await redis(['ZCARD', 'pushimgs'])) || 0;
      if (total > 30) {
        const viejas = (await redis(['ZRANGE', 'pushimgs', '0', String(total - 31)])) || [];
        for (const v of viejas) { await redis(['DEL', 'pushimg:' + v]); await redis(['ZREM', 'pushimgs', v]); }
      }
      return res.status(200).json({ ok: true, url: '/api/push?img=' + id });
    }

    if (b.action === 'test') {
      // Sin campos = prueba de conexión; con campos = ensayo de la promo real antes del envío masivo
      const title = limpio(b.title, 80) || '🔔 Prueba del Minimarket Arakaki';
      const body = limpio(b.body, 240) || 'Los avisos push funcionan en este dispositivo. ¡Todo listo!';
      let url = limpio(b.url, 300) || '/panel';
      if (!/^(\/|https:\/\/)/.test(url)) url = '/panel';
      let image = limpio(b.image, 400);
      if (image && !/^(\/|https:\/\/)/.test(image)) image = '';
      const r2 = await pushTo('duenos', { title, body, url, image: image || undefined, tag: 'arakaki-test' });
      return res.status(200).json({ ok: true, enviados: r2.enviados, podados: r2.podados });
    }

    if (b.action === 'send') {
      const target = ROLES[b.target] ? b.target : 'clientes';
      const title = limpio(b.title, 80);
      const body = limpio(b.body, 240);
      if (!title || !body) return res.status(400).json({ error: 'Falta el título o el texto.' });
      let url = limpio(b.url, 300) || '/';
      if (!/^(\/|https:\/\/)/.test(url)) url = '/';
      let image = limpio(b.image, 400);
      if (image && !/^(\/|https:\/\/)/.test(image)) image = '';
      const cid = 'c' + Date.now().toString(36); // id de campaña: agrupa los clics en las stats
      const r2 = await pushTo(target, { title, body, url, image: image || undefined, tag: 'arakaki-promo', cid });
      try {
        await redis(['INCRBY', 'stat:push_enviados', String(r2.enviados)]);
        await redis(['LPUSH', 'pushlog', JSON.stringify({ id: cid, ts: Date.now(), title, enviados: r2.enviados, img: image ? 1 : 0 })]);
        await redis(['LTRIM', 'pushlog', '0', '49']);
      } catch (e) {}
      return res.status(200).json({ ok: true, enviados: r2.enviados, podados: r2.podados });
    }

    return res.status(400).json({ error: 'Acción desconocida.' });
  } catch (e) {
    console.error('push error', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
