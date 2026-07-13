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

// Teléfono → llave de identidad normalizada (Perú por defecto: 9 dígitos → 51+num). '' si inválido.
function normTel(raw) {
  const t = String(raw || '').replace(/\D/g, '');
  if (t.length < 9) return '';
  return t.length === 9 ? '51' + t : t;
}

// Coordenadas GPS validadas ({lat,lng}) o null. El cliente solo las manda si aceptó el permiso.
function normGeo(g) {
  if (!g || typeof g !== 'object') return null;
  const lat = Number(g.lat), lng = Number(g.lng);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

// Archivo de consumo del cliente (llave = teléfono). Reutiliza cliente:<tel> + ZSET clientes:
// suma cada producto comprado a `consumo` para deducir favoritos/recurrentes, y enlaza el
// dispositivo (uid) para reconocerlo al volver sin pedirle de nuevo el celular.
async function upsertPerfil(full, datos) {
  if (!full) return;
  let cli = null;
  const raw = await redis(['GET', 'cliente:' + full]);
  if (raw) { try { cli = JSON.parse(raw); } catch (e) {} }
  if (!cli) cli = { telefono: full, creado: Date.now() };
  cli.telefono = full;
  if (datos.nombre) cli.nombre = datos.nombre;
  if (datos.direccion) cli.direccion = datos.direccion;
  cli.pedidos = (Number(cli.pedidos) || 0) + 1;
  cli.ultimoPedido = Date.now();
  cli.gastoTotal = Math.round(((Number(cli.gastoTotal) || 0) + (Number(datos.total) || 0)) * 100) / 100;
  if (datos.uid) {
    cli.uids = Array.isArray(cli.uids) ? cli.uids : [];
    if (cli.uids.indexOf(datos.uid) < 0) { cli.uids.unshift(datos.uid); cli.uids = cli.uids.slice(0, 8); }
    await redis(['SET', 'uid:' + datos.uid, full, 'EX', String(400 * 86400)]);
  }
  // Foto exacta del último pedido (con cantidades): la usa /mi-cuenta para "Repetir mi último pedido"
  const itemsPedido = (datos.items || []).filter((it) => it && it.name);
  if (itemsPedido.length) {
    cli.ultimoItems = itemsPedido.slice(0, 30).map((it) => ({
      name: it.name, qty: Number(it.qty) || 1,
      price: it.price != null ? it.price : null, img: it.img || '',
    }));
  }
  const consumo = (cli.consumo && typeof cli.consumo === 'object') ? cli.consumo : {};
  (datos.items || []).forEach((it) => {
    if (!it.name) return;
    const c = consumo[it.name] || { veces: 0, cant: 0 };
    c.veces += 1;
    c.cant += it.qty;
    c.ultima = Date.now();
    if (it.img) c.img = it.img;
    if (it.price != null) c.price = it.price;
    consumo[it.name] = c;
  });
  // Podar a los 60 productos más comprados (por frecuencia; desempate por recencia)
  const claves = Object.keys(consumo);
  if (claves.length > 60) {
    claves.sort((a, b) => (consumo[b].veces - consumo[a].veces) || ((consumo[b].ultima || 0) - (consumo[a].ultima || 0)));
    const podado = {};
    claves.slice(0, 60).forEach((k) => { podado[k] = consumo[k]; });
    cli.consumo = podado;
  } else {
    cli.consumo = consumo;
  }
  cli.actualizado = Date.now();
  await redis(['SET', 'cliente:' + full, JSON.stringify(cli)]);
  await redis(['ZADD', 'clientes', String(Date.now()), full]);
}

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
      // Enlaza el dispositivo (uid) al cliente para reconocerlo cuando vuelva a la web
      const uidReg = limpio(b.uid, 40).replace(/[^a-z0-9]/gi, '');
      if (uidReg) {
        cli.uids = Array.isArray(cli.uids) ? cli.uids : [];
        if (cli.uids.indexOf(uidReg) < 0) { cli.uids.unshift(uidReg); cli.uids = cli.uids.slice(0, 8); }
        await redis(['SET', 'uid:' + uidReg, full, 'EX', String(400 * 86400)]);
      }
      cli.actualizado = Date.now();
      await redis(['SET', 'cliente:' + full, JSON.stringify(cli)]);
      await redis(['ZADD', 'clientes', String(Date.now()), full]);
      await notifyOwner('🎁 *Nuevo registro en el Club Arakaki*\n👤 ' + nombre + ' (+' + full + ')' + (cli.interes ? '\n❤️ Le interesa: ' + cli.interes : ''));
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'pedido') {
      const nombre = limpio(b.nombre, 60);
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 60).map((i) => ({
        name: limpio(i.name, 120), price: i.price ? Number(i.price) : null,
        qty: Math.max(1, Math.min(99, Number(i.qty) || 1)), img: limpio(i.img, 300),
      })).filter((i) => i.name);
      if (!nombre || !items.length) return res.status(400).json({ error: 'Pedido vacío.' });
      const full = normTel(b.telefono);
      const uid = limpio(b.uid, 40).replace(/[^a-z0-9]/gi, '');
      const geo = normGeo(b.geo);
      const direccion = limpio(b.direccion, 200);
      const total = Math.max(0, Number(b.total) || 0);
      const pedido = {
        id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        nombre,
        telefono: full,
        direccion,
        geo,
        items,
        total,
        pagina: limpio(b.pagina, 60),
        ts: Date.now(),
        estado: 'nuevo',
      };
      await redis(['LPUSH', 'pedidos', JSON.stringify(pedido)]);
      await redis(['LTRIM', 'pedidos', '0', '499']);
      // Archivo de consumo del cliente (solo si dejó celular): favoritos/recurrentes + reconocerlo al volver
      try { await upsertPerfil(full, { nombre, direccion, uid, items, total }); } catch (e) { console.error('perfil error', e); }
      const lineas = items.map((i) => '• ' + i.qty + ' x ' + i.name).join('\n');
      await notifyOwner('🛒 *Pedido desde la web*\n👤 ' + nombre + (full ? ' (+' + full + ')' : '') +
        (direccion ? '\n📍 ' + direccion : '') +
        (geo ? '\n🗺️ Ubicación: https://maps.google.com/?q=' + geo.lat + ',' + geo.lng : '') +
        '\n\n' + lineas + '\n\n💰 Total aprox: S/ ' + total +
        '\n\nEl cliente te está escribiendo por WhatsApp ahora mismo.');
      return res.status(200).json({ ok: true, id: pedido.id });
    }

    return res.status(400).json({ error: 'Acción desconocida.' });
  } catch (e) {
    console.error('pedido error', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
