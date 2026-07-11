// Textos editables del sitio (lema del header + footer) guardados en Redis (config:sitio).
// Se editan desde /panel → 📝 Sitio. assets/site.js los aplica sobre sus valores por defecto.
//   GET -> { s: { lema, visitanosTit, direccion, referencia, mapLabel, horarioTit,
//                 horario, contactoTit, telefonos, redesTit, facebook, instagram, youtube, copy } }
// Sin env vars de Redis (o sin config guardada) devuelve { s: {} }: el sitio usa sus defaults.

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
  // El CDN de Vercel cachea 60s: los textos casi nunca cambian y Redis recibe ~1 consulta/min.
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  let s = {};
  try {
    if (REDIS_URL && REDIS_TOKEN) {
      const raw = await redis(['GET', 'config:sitio']);
      if (raw) s = JSON.parse(raw);
    }
  } catch (e) { console.error('sitio error', e); }
  return res.status(200).json({ s });
};
