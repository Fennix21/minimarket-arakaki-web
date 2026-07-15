// Textos y fondos editables del sitio, guardados en Redis (config:sitio + config:fondos).
// Se editan desde /panel → 📝 Sitio. assets/site.js los aplica sobre sus valores por defecto.
//   GET -> { s: { lema, visitanosTit, direccion, referencia, mapLabel, horarioTit,
//                 horario, contactoTit, telefonos, redesTit, facebook, instagram, youtube, copy },
//            f: { pagina, vino, roja, premium, card } }  // CSS del fondo → variable --bg-<clave>
// Sin env vars de Redis (o sin config guardada) devuelve {}: el sitio usa sus defaults.

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
  const f = {};
  try {
    if (REDIS_URL && REDIS_TOKEN) {
      const [raw, rawF] = (await redis(['MGET', 'config:sitio', 'config:fondos'])) || [];
      if (raw) s = JSON.parse(raw);
      // config:fondos guarda el modelo del panel ({t,c1,c2,…}); al sitio solo le sirve el css armado
      if (rawF) {
        const mod = JSON.parse(rawF) || {};
        Object.keys(mod).forEach((k) => { if (mod[k] && mod[k].css) f[k] = mod[k].css; });
      }
    }
  } catch (e) { console.error('sitio error', e); }
  return res.status(200).json({ s, f });
};
