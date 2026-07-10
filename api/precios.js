// Precios "en vivo" del catálogo web: overrides guardados en Redis (config:precios)
// que pisan los precios de data/catalog.js. Se editan desde /panel → 💰 Precios
// o por WhatsApp del dueño (api/whatsapp.js).
//   GET -> { p: { "<slug>|<nombre exacto>": "85" } }   (público, solo lectura)
// Sin env vars de Redis devuelve { p: {} }: el sitio funciona igual con precios base.

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
  // El CDN de Vercel cachea 60s: aunque entren cientos de personas, Redis recibe ~1 consulta/min.
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  let p = {};
  try {
    if (REDIS_URL && REDIS_TOKEN) {
      const raw = await redis(['GET', 'config:precios']);
      if (raw) p = JSON.parse(raw);
    }
  } catch (e) { console.error('precios error', e); }
  return res.status(200).json({ p });
};
