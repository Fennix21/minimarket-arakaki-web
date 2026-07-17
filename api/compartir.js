// Compartir un producto: página con Open Graph (foto + nombre + precio) para que
// WhatsApp/Facebook pinten la tarjeta de preview al pegar el enlace en un chat,
// y redirección inmediata al producto dentro de su categoría (?p= lo hace brillar).
//   GET /api/compartir?p=<nombre exacto del producto>
// Funciona SIN env vars (usa el catálogo del repo); con Redis además resuelve los
// productos subidos desde el panel (config:prodextra) y el precio en vivo (config:precios).

const { PRODUCTOS } = require('./_catalogo');

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

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = async (req, res) => {
  const nombre = ((req.query && req.query.p) || '').toString().slice(0, 120);
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'minimarket-arakaki-web.vercel.app';
  const base = 'https://' + host;

  const prod = nombre ? PRODUCTOS.find((x) => x.n === nombre) : null;
  let cat = prod && prod.c;
  let precio = prod && prod.p;
  let img = prod && prod.i;

  // Con Redis: precio en vivo del panel y productos nuevos subidos sin deploy
  if (nombre && REDIS_URL) {
    try {
      const r = await redis(['MGET', 'config:precios', 'config:prodextra']);
      const precios = JSON.parse((r && r[0]) || '{}');
      const extras = JSON.parse((r && r[1]) || '[]');
      if (!cat) {
        const e = extras.find((x) => x && x.nombre === nombre);
        if (e) { cat = e.cat; precio = e.precio || null; img = e.img || null; }
      }
      if (cat && precios[cat + '|' + nombre] !== undefined) precio = precios[cat + '|' + nombre];
    } catch (e) { /* sin Redis o caído: se queda el catálogo del repo */ }
  }

  const dest = cat ? base + '/' + cat + '?p=' + encodeURIComponent(nombre) : base + '/';
  const imgAbs = img ? (img.indexOf('http') === 0 ? img : base + img) : base + '/img/icon-512.png';
  const titulo = cat ? nombre + (precio ? ' — S/ ' + precio : '') : 'Minimarket Arakaki';
  const desc = cat
    ? '🛵 Pídelo por WhatsApp y te lo llevamos. Minimarket Arakaki, tu bodega premium.'
    : 'Tu bodega premium: licores, chocolates y más. Pide por WhatsApp y te lo llevamos.';

  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=300');
  return res.status(200).end('<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<title>' + esc(titulo) + '</title>' +
    '<meta name="robots" content="noindex">' +
    '<meta property="og:type" content="product">' +
    '<meta property="og:site_name" content="Minimarket Arakaki">' +
    '<meta property="og:locale" content="es_PE">' +
    '<meta property="og:title" content="' + esc(titulo) + '">' +
    '<meta property="og:description" content="' + esc(desc) + '">' +
    '<meta property="og:image" content="' + esc(imgAbs) + '">' +
    '<meta property="og:image:alt" content="' + esc(nombre || 'Minimarket Arakaki') + '">' +
    '<meta property="og:url" content="' + esc(dest) + '">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta http-equiv="refresh" content="0;url=' + esc(dest) + '">' +
    '</head><body style="background:#181310;color:#e9c877;font-family:Georgia,serif;text-align:center;padding:60px 20px">' +
    '<p>Llevándote al producto…</p><a style="color:#e9c877" href="' + esc(dest) + '">' + esc(titulo) + '</a>' +
    '<script>location.replace(' + JSON.stringify(dest) + ');</script>' +
    '</body></html>');
};
