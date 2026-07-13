// Baja de correos promocionales (enlace "Ya no quiero recibir promociones" de cada correo).
// GET /api/correo?baja=<token> → marca cliente.correoBaja y muestra una página simple.
// El token es aleatorio por cliente (cliente.bajaTok, lo genera crm.js al enviar la campaña)
// y se resuelve con Redis baja:<token> → key del cliente. Solo apaga las promos: los correos
// de la cuenta (recuperación de PIN, avisos de seguridad) siguen llegando.

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const HAS_REDIS = !!(REDIS_URL && REDIS_TOKEN);

async function redis(cmd) {
  if (!HAS_REDIS) return null;
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const data = await r.json();
  return data.result;
}

function pagina(titulo, texto) {
  return '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">' +
    '<title>' + titulo + ' | Minimarket Arakaki</title></head>' +
    '<body style="margin:0;background:#262626;color:#f4ebd6;font-family:Georgia,\'Times New Roman\',serif;text-align:center;padding:60px 20px">' +
    '<img src="/img/logo-gato.png" width="72" alt="" style="display:block;margin:0 auto 6px">' +
    '<h2 style="color:#d4a941;margin:10px 0 14px">' + titulo + '</h2>' +
    '<p style="max-width:430px;margin:0 auto 22px;line-height:1.65;font-size:15px">' + texto + '</p>' +
    '<a href="/" style="color:#d4a941;font-weight:bold">← Volver a la tienda</a></body></html>';
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('cache-control', 'no-store');
    res.setHeader('content-type', 'text/html; charset=utf-8');
    const tok = String((req.query && req.query.baja) || '').replace(/[^a-f0-9]/gi, '').slice(0, 40);
    if (!HAS_REDIS || !tok) {
      return res.status(400).end(pagina('Enlace no válido', 'Este enlace de baja no es válido o ya venció. Si quieres dejar de recibir promociones, escríbenos por WhatsApp y lo hacemos por ti 🙏'));
    }
    const key = await redis(['GET', 'baja:' + tok]);
    const raw = key ? await redis(['GET', 'cliente:' + key]) : null;
    let cli = null;
    if (raw) { try { cli = JSON.parse(raw); } catch (e) {} }
    if (!cli) {
      return res.status(404).end(pagina('Enlace no válido', 'Este enlace de baja no es válido o ya venció. Si quieres dejar de recibir promociones, escríbenos por WhatsApp y lo hacemos por ti 🙏'));
    }
    cli.correoBaja = true;
    cli.actualizado = Date.now();
    await redis(['SET', 'cliente:' + key, JSON.stringify(cli)]);
    return res.status(200).end(pagina('Listo 💛', 'Ya no te enviaremos promociones por correo. Los correos de tu cuenta (como la recuperación de tu PIN) sí seguirán llegando, y las promos exclusivas siempre estarán en tu cuenta del Club.'));
  } catch (e) {
    console.error('correo baja error', e);
    return res.status(500).end(pagina('Ups', 'Algo salió mal. Prueba de nuevo en un ratito 🙏'));
  }
};
