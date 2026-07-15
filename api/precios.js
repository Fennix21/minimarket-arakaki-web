// Catálogo "en vivo" de la web: overrides guardados en Redis que pisan/completan data/catalog.js.
// Se editan desde /panel → 💰 Precios (o por WhatsApp del dueño, api/whatsapp.js).
//   GET -> { p: { "<slug>|<nombre>": "85" },        precios en vivo (config:precios)
//            s: { "<slug>|<nombre>": "agotado"|"oculto" },  stock en vivo (config:stock)
//            x: [ {id,cat,sec,nombre,precio,img,ts} ],      productos nuevos del panel (config:prodextra)
//            v: { "<slug>": {v,t,s} } }                     video/título/subtítulo del hero por categoría (config:videos)
//   GET ?img=<id> -> foto de un producto subida desde el panel (Redis prodimg:<id>, caché inmutable)
//   GET ?vid=<id> -> video subido desde el panel (trozos base64 en vidext:<id>:<i>, índice en
//                    config:vidsubidos), con caché inmutable y soporte de Range (iPhone lo exige)
// Sin env vars de Redis devuelve { p:{}, s:{}, x:[], v:{} }: el sitio funciona igual con el catálogo base.

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
  // GET ?img=<id> → sirve la foto de un producto subido desde el panel (Redis prodimg:<id>)
  if (req.method === 'GET' && req.query && req.query.img) {
    const id = String(req.query.img).replace(/[^a-z0-9]/gi, '').slice(0, 24);
    const dataUrl = id && REDIS_URL ? await redis(['GET', 'prodimg:' + id]) : null;
    const m = dataUrl && dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return res.status(404).json({ error: 'Imagen no encontrada.' });
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // el id es único: cachear para siempre
    return res.status(200).end(Buffer.from(m[2], 'base64'));
  }

  // GET ?vid=<id> → sirve un video subido desde el panel (ensambla los trozos base64 de Redis).
  // Safari/iPhone solo reproduce si el servidor responde 206 a los Range (manda "bytes=0-1" de sondeo).
  if (req.method === 'GET' && req.query && req.query.vid) {
    const id = String(req.query.vid).replace(/[^a-z0-9]/gi, '').slice(0, 24);
    let meta = null;
    if (id && REDIS_URL) {
      const raw = await redis(['GET', 'config:vidsubidos']);
      if (raw) { try { meta = (JSON.parse(raw) || []).find((s) => s && s.id === id) || null; } catch (e) {} }
    }
    if (!meta || !meta.n) return res.status(404).json({ error: 'Video no encontrado.' });
    const keys = [];
    for (let i = 0; i < meta.n; i++) keys.push('vidext:' + id + ':' + i);
    const partes = (await redis(['MGET', ...keys])) || [];
    if (partes.some((p) => !p)) return res.status(404).json({ error: 'Video incompleto.' });
    const buf = Buffer.concat(partes.map((p) => Buffer.from(p, 'base64')));
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // el id es único: cachear para siempre
    const rango = /^bytes=(\d*)-(\d*)$/.exec((req.headers && req.headers.range) || '');
    if (rango && (rango[1] || rango[2])) {
      const ini = rango[1] ? parseInt(rango[1], 10) : Math.max(0, buf.length - parseInt(rango[2], 10));
      const fin = (rango[1] && rango[2]) ? Math.min(parseInt(rango[2], 10), buf.length - 1) : buf.length - 1;
      if (ini >= buf.length || ini > fin) {
        res.setHeader('Content-Range', 'bytes */' + buf.length);
        return res.status(416).end();
      }
      res.statusCode = 206;
      res.setHeader('Content-Range', 'bytes ' + ini + '-' + fin + '/' + buf.length);
      return res.end(buf.subarray(ini, fin + 1));
    }
    return res.status(200).end(buf);
  }

  // El CDN de Vercel cachea 60s: aunque entren cientos de personas, Redis recibe ~1 consulta/min.
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  let p = {}, s = {}, x = [], v = {};
  try {
    if (REDIS_URL && REDIS_TOKEN) {
      const vals = (await redis(['MGET', 'config:precios', 'config:stock', 'config:prodextra', 'config:videos'])) || [];
      if (vals[0]) p = JSON.parse(vals[0]);
      if (vals[1]) s = JSON.parse(vals[1]);
      if (vals[2]) { const arr = JSON.parse(vals[2]); if (Array.isArray(arr)) x = arr; }
      if (vals[3]) v = JSON.parse(vals[3]);
    }
  } catch (e) { console.error('precios error', e); }
  return res.status(200).json({ p, s, x, v });
};
