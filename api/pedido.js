// Captura de datos de clientes desde la web (SIN contraseña: solo escribe, nunca lee).
//   POST { action:'pedido',  nombre, direccion, items:[{name,price,qty}], total, pagina }
//   POST { action:'registro', nombre, telefono, interes }   (Club Arakaki)
// Guarda en Redis y avisa al dueño por WhatsApp.

const { pushDuenos } = require('./_push.js');

const GRAPH = 'https://graph.facebook.com/v21.0';
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

async function notifyOwner(text) {
  try {
    if ((await redis(['GET', 'config:notify'])) === '0') return;
    // Además del WhatsApp, push a los dispositivos del negocio (gratis; ver api/_push.js)
    try {
      const lin = text.replace(/\*/g, '').split('\n');
      await pushDuenos(lin[0], lin.slice(1).join('\n').trim());
    } catch (e) {}
    if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) return;
    // config:ownerphone puede traer VARIOS números separados por coma: se avisa a todos
    const duenos = ((await redis(['GET', 'config:ownerphone'])) || process.env.ARAKAKI_OWNER_PHONE || '')
      .split(/[,;\n]+/).map((s) => s.replace(/\D/g, '')).filter((n) => n.length >= 9);
    for (const d of duenos) {
      await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: d, type: 'text', text: { body: text } }),
      });
    }
  } catch (e) { console.error('notifyOwner error', e); }
}

const limpio = (s, n) => (s == null ? '' : String(s)).trim().slice(0, n);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!REDIS_URL || !REDIS_TOKEN) return res.status(200).json({ ok: true }); // sin base aún: no romper la web

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};

  try {
    if (b.action === 'registro') {
      const nombre = limpio(b.nombre, 60);
      const telefono = limpio(b.telefono, 15).replace(/\D/g, '');
      if (!nombre || telefono.length < 9) return res.status(400).json({ error: 'Datos incompletos.' });
      const full = telefono.length === 9 ? '51' + telefono : telefono; // Perú por defecto
      const raw = await redis(['GET', 'cliente:' + full]);
      let cli = null;
      if (raw) { try { cli = JSON.parse(raw); } catch (e) {} }
      if (!cli) cli = { telefono: full, creado: Date.now() };
      cli.nombre = nombre;
      if (b.interes) cli.interes = limpio(b.interes, 40);
      cli.club = true;
      cli.actualizado = Date.now();
      await redis(['SET', 'cliente:' + full, JSON.stringify(cli)]);
      await redis(['ZADD', 'clientes', String(Date.now()), full]);
      await notifyOwner('🎁 *Nuevo registro en el Club Arakaki*\n👤 ' + nombre + ' (+' + full + ')' + (cli.interes ? '\n❤️ Le interesa: ' + cli.interes : ''));
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'pedido') {
      const nombre = limpio(b.nombre, 60);
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 60).map((i) => ({
        name: limpio(i.name, 120), price: i.price ? Number(i.price) : null, qty: Math.max(1, Math.min(99, Number(i.qty) || 1)),
      })).filter((i) => i.name);
      if (!nombre || !items.length) return res.status(400).json({ error: 'Pedido vacío.' });
      const pedido = {
        id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        nombre,
        direccion: limpio(b.direccion, 200),
        items,
        total: Math.max(0, Number(b.total) || 0),
        pagina: limpio(b.pagina, 60),
        ts: Date.now(),
        estado: 'nuevo',
      };
      await redis(['LPUSH', 'pedidos', JSON.stringify(pedido)]);
      await redis(['LTRIM', 'pedidos', '0', '499']);
      const lineas = items.map((i) => '• ' + i.qty + ' x ' + i.name).join('\n');
      await notifyOwner('🛒 *Pedido desde la web*\n👤 ' + nombre + (pedido.direccion ? '\n📍 ' + pedido.direccion : '') +
        '\n\n' + lineas + '\n\n💰 Total aprox: S/ ' + pedido.total +
        '\n\nEl cliente te está escribiendo por WhatsApp ahora mismo.');
      return res.status(200).json({ ok: true, id: pedido.id });
    }

    return res.status(400).json({ error: 'Acción desconocida.' });
  } catch (e) {
    console.error('pedido error', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
