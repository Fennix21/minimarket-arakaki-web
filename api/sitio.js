// Textos y fondos editables del sitio, guardados en Redis (config:sitio + config:fondos).
// Se editan desde /panel → 📝 Sitio. assets/site.js los aplica sobre sus valores por defecto.
//   GET -> { s: { lema, horarioTit, horario, redesTit, facebook, instagram, youtube, copy, … },
//            f: { pagina, vino, roja, premium, card },   // CSS del fondo → variable --bg-<clave>
//            k: { txt, tam, fx, toqueBg, toqueTitCol, btnSumar, btnSumarTxt }, // apariencia del carrito
//            co: { naranja, dorado, doradoClaro, rojo } } // paleta de marca (colores → variables CSS)
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
  let k = {};
  let t = {};
  let p = {};
  let l = {};
  let co = {};
  try {
    if (REDIS_URL && REDIS_TOKEN) {
      const [raw, rawF, rawK, rawT, rawP, rawL, rawCo] = (await redis(['MGET', 'config:sitio', 'config:fondos', 'config:carrito', 'config:tipo', 'config:popup', 'config:logos', 'config:colores'])) || [];
      // config:colores (paleta de marca): {clave:'#hex'} validado al guardar (crm.js setcolores); site.js re-valida al aplicar
      if (rawCo) { try { co = JSON.parse(rawCo) || {}; } catch (e) {} }
      // config:tipo (tipografía global): validada al guardar (crm.js settipo); site.js re-valida al aplicar
      if (rawT) { try { t = JSON.parse(rawT) || {}; } catch (e) {} }
      // config:popup (popup principal del inicio): validado al guardar (crm.js setpopup)
      if (rawP) { try { p = JSON.parse(rawP) || {}; } catch (e) {} }
      // config:logos (favicon / push / preloader / panel): validados al guardar (crm.js setlogos)
      if (rawL) { try { l = JSON.parse(rawL) || {}; } catch (e) {} }
      if (raw) s = JSON.parse(raw);
      // config:fondos guarda el modelo del panel ({t,c1,c2,…}); al sitio solo le sirve el css armado
      if (rawF) {
        const mod = JSON.parse(rawF) || {};
        Object.keys(mod).forEach((z) => { if (mod[z] && mod[z].css) f[z] = mod[z].css; });
      }
      // config:carrito: los colores guardan modelo+css; al sitio le mandamos solo el css (como los fondos)
      if (rawK) {
        const c = JSON.parse(rawK) || {};
        k = {
          txt: c.txt || {}, tam: c.tam || {}, fx: c.fx || {},
          toqueTitCol: c.toqueTitCol || '', btnSumarTxt: c.btnSumarTxt || '',
          toqueBg: c.toqueBg && c.toqueBg.css ? c.toqueBg.css : '',
          btnSumar: c.btnSumar && c.btnSumar.css ? c.btnSumar.css : '',
        };
      }
    }
  } catch (e) { console.error('sitio error', e); }
  return res.status(200).json({ s, f, k, t, p, l, co });
};
