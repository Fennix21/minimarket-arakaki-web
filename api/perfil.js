// Perfil público del cliente (SOLO lectura). Reconoce al visitante por su token de dispositivo
// (uid), guardado únicamente en SU navegador — funciona como bearer — y devuelve su archivo de
// consumo para prellenar el carrito y armarle "lo de siempre".
//   GET /api/perfil?uid=<token>  ->  { conocido, nombre?, direccion?, telefono?, pedidos?, favoritos?, habitual? }
// NUNCA acepta lookup por teléfono (sería adivinable). El archivo lo construye upsertPerfil de
// api/pedido.js dentro de cliente:<tel>; el mapa uid:<token>→<tel> lo escribe ese mismo flujo.

const { PRODUCTOS } = require('./_catalogo');

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

function normalizar(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }

// Índice nombre normalizado → producto del catálogo (para hallar categoría y precio vigente)
const PORNOMBRE = {};
PRODUCTOS.forEach((pr) => { PORNOMBRE[normalizar(pr.n)] = pr; });

// Precio vigente: override en vivo (config:precios) > catálogo. null si no hay precio publicado.
function precioVivo(pr, vivos) {
  const v = vivos[pr.c + '|' + pr.n];
  const p = (v == null || v === '') ? pr.p : v;
  return (p && Number(p) > 0) ? Number(p) : null;
}

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!HAS_REDIS) return res.status(200).json({ conocido: false });

  const uid = String((req.query && req.query.uid) || '').replace(/[^a-z0-9]/gi, '').slice(0, 40);
  if (!uid) return res.status(200).json({ conocido: false });

  try {
    const tel = await redis(['GET', 'uid:' + uid]);
    if (!tel) return res.status(200).json({ conocido: false });
    const raw = await redis(['GET', 'cliente:' + tel]);
    if (!raw) return res.status(200).json({ conocido: false });
    let cli;
    try { cli = JSON.parse(raw); } catch (e) { return res.status(200).json({ conocido: false }); }

    let vivos = {};
    const rawP = await redis(['GET', 'config:precios']);
    if (rawP) { try { vivos = JSON.parse(rawP); } catch (e) {} }

    // Favoritos/recurrentes = se DERIVAN del consumo, ordenando por frecuencia (desempate: recencia)
    const consumo = (cli.consumo && typeof cli.consumo === 'object') ? cli.consumo : {};
    const claves = Object.keys(consumo).sort((a, b) =>
      (consumo[b].veces - consumo[a].veces) || ((consumo[b].ultima || 0) - (consumo[a].ultima || 0)));

    const habitual = claves.slice(0, 12).map((name) => {
      const c = consumo[name];
      const pr = PORNOMBRE[normalizar(name)];
      const price = pr ? precioVivo(pr, vivos) : (c.price != null ? Number(c.price) : null);
      return { name: name, price: price, img: c.img || '', qty: 1, veces: c.veces };
    });

    return res.status(200).json({
      conocido: true,
      nombre: cli.nombre || '',
      direccion: cli.direccion || '',
      telefono: cli.telefono || tel,
      pedidos: Number(cli.pedidos) || 0,
      favoritos: claves.slice(0, 5),
      habitual: habitual,
    });
  } catch (e) {
    console.error('perfil error', e);
    return res.status(200).json({ conocido: false });
  }
};
