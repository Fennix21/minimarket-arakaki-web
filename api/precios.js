// Catálogo "en vivo" de la web: overrides guardados en Redis que pisan/completan data/catalog.js.
// Se editan desde /panel → 💰 Precios (o por WhatsApp del dueño, api/whatsapp.js).
//   GET -> { p: { "<slug>|<nombre>": "85" },        precios en vivo (config:precios)
//            s: { "<slug>|<nombre>": "agotado"|"oculto" },  stock en vivo (config:stock)
//            x: [ {id,cat,sec,nombre,precio,img,ts} ] }     productos nuevos del panel (config:prodextra)
//   GET ?img=<id> -> foto de un producto subida desde el panel (Redis prodimg:<id>, caché inmutable)
// Sin env vars de Redis devuelve { p:{}, s:{}, x:[] }: el sitio funciona igual con el catálogo base.

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

  // El CDN de Vercel cachea 60s: aunque entren cientos de personas, Redis recibe ~1 consulta/min.
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  let p = {}, s = {}, x = [];
  try {
    if (REDIS_URL && REDIS_TOKEN) {
      const vals = (await redis(['MGET', 'config:precios', 'config:stock', 'config:prodextra'])) || [];
      if (vals[0]) p = JSON.parse(vals[0]);
      if (vals[1]) s = JSON.parse(vals[1]);
      if (vals[2]) { const arr = JSON.parse(vals[2]); if (Array.isArray(arr)) x = arr; }
    }
  } catch (e) { console.error('precios error', e); }
  return res.status(200).json({ p, s, x });
};
