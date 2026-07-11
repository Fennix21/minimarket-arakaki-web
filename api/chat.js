// Chat vendedor DENTRO de la web (widget flotante de assets/site.js).
//   GET  -> { on: true|false }   ¿el widget debe mostrarse? (hay API key y no está apagado en /panel)
//   POST { sid, mensajes:[{role,text}] } -> { reply }
// Usa el MISMO cerebro que el bot de WhatsApp (Redis config:prompt) más dos herramientas:
// buscar_productos (catálogo + precios en vivo de config:precios) y registrar_pedido
// (guarda en la lista `pedidos` como /api/pedido y avisa al dueño por WhatsApp).
// Así el bot CIERRA la venta sin que el cliente salga de la página.
// La conversación vive en el navegador (sessionStorage): aquí no se guarda el historial.

const MODEL = process.env.ARAKAKI_BOT_MODEL || 'claude-haiku-4-5-20251001';
const GRAPH = 'https://graph.facebook.com/v21.0';

const { DEFAULT_PROMPT } = require('./_prompt');
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

function normalizar(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

async function getPreciosVivos() {
  const raw = await redis(['GET', 'config:precios']);
  if (raw) { try { return JSON.parse(raw); } catch (e) {} }
  return {};
}

// Mismo cerebro que el bot de WhatsApp: editable en /panel → ⚙️ Bot.
async function getPrompt() {
  if (HAS_REDIS) {
    const custom = await redis(['GET', 'config:prompt']);
    if (custom) return custom;
  }
  return process.env.ARAKAKI_BOT_PROMPT || DEFAULT_PROMPT;
}

// Capa extra SOLO para el chat web: aquí el bot vende y registra el pedido él mismo.
const SUFIJO_WEB = `

# IMPORTANTE: ahora estás en el CHAT DE LA PÁGINA WEB (no en WhatsApp)
El cliente te escribe desde www.minimarketarakaki.com y tu objetivo es CERRAR su pedido aquí mismo.
- buscar_productos: úsala SIEMPRE antes de dar un precio o confirmar que algo hay. Sus precios son los vigentes; NUNCA inventes precios ni productos. Si un producto sale sin precio, di que ese se cotiza en tienda o por WhatsApp.
- registrar_pedido: cuando el cliente CONFIRME qué lleva, pídele nombre y dirección de entrega (y su celular si te lo quiere dejar) y registra el pedido. Nunca lo uses sin confirmación del cliente. En items usa el nombre EXACTO que devolvió buscar_productos, y SOLO de los productos que el cliente confirmó en ESTE pedido (no otros mencionados antes en la conversación).
- El resultado de registrar_pedido te dice qué productos y total quedaron registrados: VERIFÍCALOS antes de confirmar al cliente. Si registraste algo distinto a lo pedido, llama registrar_pedido de nuevo con los items correctos: en la misma conversación el nuevo registro REEMPLAZA al anterior (no se duplica). Lo mismo si el cliente cambia de opinión o agrega algo después de registrar.
- Tras registrar (y verificar), confirma así: "✅ ¡Listo <nombre>! Tu pedido quedó registrado. Te contactamos al toque para coordinar la entrega y el pago (Yape, Plin o efectivo contra entrega) 🙌".
- Sugiere máximo 3-4 productos por mensaje, con su precio.
- Las categorías tienen página propia: escribe la ruta tal cual (ej. /pisco, /whisky, /helados) y el chat la convierte en link.
- Mensajes CORTOS (2-6 líneas). *Negrita* con asteriscos simples; sin títulos ni listas largas.`;

// ---------- Herramientas del vendedor ----------

async function buscarProductos(texto) {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const vivos = HAS_REDIS ? await getPreciosVivos() : {};
  return PRODUCTOS
    .filter((pr) => { const n = normalizar(pr.n); return palabras.every((w) => n.indexOf(w) >= 0); })
    .slice(0, 10)
    .map((pr) => {
      const precio = vivos[pr.c + '|' + pr.n] || pr.p;
      return { nombre: pr.n, pagina: '/' + pr.c, precio: precio ? 'S/ ' + precio : null };
    });
}

// Resuelve cada item contra el catálogo (precio del servidor, no del modelo).
async function resolverItems(items) {
  const vivos = HAS_REDIS ? await getPreciosVivos() : {};
  const ok = [], noEncontrados = [];
  for (const it of (Array.isArray(items) ? items.slice(0, 30) : [])) {
    const nombre = normalizar(it && it.producto);
    if (!nombre) continue;
    let prod = PRODUCTOS.find((pr) => normalizar(pr.n) === nombre);
    if (!prod) {
      const palabras = nombre.split(/\s+/).filter(Boolean);
      const matches = PRODUCTOS.filter((pr) => { const n = normalizar(pr.n); return palabras.every((w) => n.indexOf(w) >= 0); });
      if (matches.length === 1) prod = matches[0];
    }
    if (!prod) { noEncontrados.push(it.producto); continue; }
    const precio = vivos[prod.c + '|' + prod.n] || prod.p;
    ok.push({ name: prod.n, price: precio ? Number(precio) : null, qty: Math.max(1, Math.min(99, Number(it.cantidad) || 1)) });
  }
  return { ok, noEncontrados };
}

const limpio = (s, n) => (s == null ? '' : String(s)).trim().slice(0, n);

function listaDuenos(raw) {
  return String(raw || '').split(/[,;\n]+/)
    .map((s) => s.replace(/\D/g, ''))
    .filter((n) => n.length >= 9);
}

async function notifyOwner(text) {
  try {
    if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) return;
    if ((await redis(['GET', 'config:notify'])) === '0') return;
    const duenos = listaDuenos((await redis(['GET', 'config:ownerphone'])) || process.env.ARAKAKI_OWNER_PHONE || '');
    for (const d of duenos) {
      await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: d, type: 'text', text: { body: text } }),
      });
    }
  } catch (e) { console.error('notifyOwner error', e); }
}

// Si esta misma conversación ya registró un pedido pendiente hace poco, el nuevo
// lo REEMPLAZA (corrección o cambio de opinión) en vez de duplicar el aviso al dueño.
async function reemplazarPedidoDeSesion(sid, nuevo) {
  if (!sid) return false;
  const raw = await redis(['LRANGE', 'pedidos', '0', '49']);
  if (!Array.isArray(raw)) return false;
  for (let i = 0; i < raw.length; i++) {
    let p;
    try { p = JSON.parse(raw[i]); } catch (e) { continue; }
    if (p.sid === sid && p.estado === 'nuevo' && Date.now() - p.ts < 2 * 3600 * 1000) {
      nuevo.id = p.id; // mismo pedido, corregido
      await redis(['LSET', 'pedidos', String(i), JSON.stringify(nuevo)]);
      return true;
    }
  }
  return false;
}

async function registrarPedido(input, sid) {
  const nombre = limpio(input.nombre, 60);
  const { ok: items, noEncontrados } = await resolverItems(input.items);
  if (!nombre || nombre.length < 2) return { error: 'Falta el nombre del cliente.' };
  if (!items.length) return { error: 'Ningún producto coincide con el catálogo. Usa buscar_productos y pasa los nombres exactos.', no_encontrados: noEncontrados };
  let total = 0, sinPrecio = false;
  items.forEach((i) => { if (i.price) total += i.price * i.qty; else sinPrecio = true; });
  total = Math.round(total * 100) / 100;
  const pedido = {
    id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    nombre,
    direccion: limpio(input.direccion, 200),
    telefono: limpio(input.telefono, 20).replace(/[^\d+]/g, ''),
    items,
    total,
    pagina: 'chat-web',
    sid: sid || '',
    ts: Date.now(),
    estado: 'nuevo',
  };
  const corregido = await reemplazarPedidoDeSesion(sid, pedido);
  if (!corregido) {
    await redis(['LPUSH', 'pedidos', JSON.stringify(pedido)]);
    await redis(['LTRIM', 'pedidos', '0', '499']);
    await redis(['INCR', 'stat:chatweb_pedido']);
  }
  const lineas = items.map((i) => '• ' + i.qty + ' x ' + i.name).join('\n');
  await notifyOwner((corregido
    ? '🔁 *Pedido CORREGIDO desde el CHAT de la web* (reemplaza el aviso anterior)\n👤 '
    : '🤖🛒 *Pedido cerrado por el CHAT de la web*\n👤 ') + nombre +
    (pedido.telefono ? ' (' + pedido.telefono + ')' : '') +
    (pedido.direccion ? '\n📍 ' + pedido.direccion : '') +
    '\n\n' + lineas + '\n\n💰 Total aprox: S/ ' + total + (sinPrecio ? ' + productos por cotizar' : '') +
    '\n\nMíralo en el panel 👉 /panel');
  return {
    ok: true,
    id: pedido.id,
    corregido: corregido || undefined,
    productos_registrados: items.map((i) => i.qty + ' x ' + i.name + (i.price ? ' — S/ ' + i.price : ' (por cotizar)')),
    total: 'S/ ' + total + (sinPrecio ? ' (hay productos por cotizar)' : ''),
    no_encontrados: noEncontrados,
  };
}

const HERRAMIENTAS = [
  {
    name: 'buscar_productos',
    description: 'Busca productos del catálogo por palabras del nombre (sin importar tildes/mayúsculas). Devuelve nombre exacto, página de su categoría y precio vigente (null = se cotiza en tienda).',
    input_schema: { type: 'object', properties: { texto: { type: 'string', description: 'Palabras del producto, ej. "pisco porton"' } }, required: ['texto'] },
  },
  {
    name: 'registrar_pedido',
    description: 'Registra el pedido confirmado por el cliente: llega al panel del dueño y se le avisa por WhatsApp. Usa los nombres EXACTOS que devolvió buscar_productos.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre del cliente' },
        direccion: { type: 'string', description: 'Dirección de entrega (calle, distrito, referencia)' },
        telefono: { type: 'string', description: 'Celular del cliente si lo dio (opcional)' },
        items: {
          type: 'array',
          items: { type: 'object', properties: { producto: { type: 'string' }, cantidad: { type: 'number' } }, required: ['producto'] },
        },
      },
      required: ['nombre', 'items'],
    },
  },
];

async function ejecutarHerramienta(nombre, input, sid) {
  if (nombre === 'buscar_productos') return { resultados: await buscarProductos(input.texto) };
  if (nombre === 'registrar_pedido') return registrarPedido(input || {}, sid);
  return { error: 'Herramienta desconocida: ' + nombre };
}

// Conversación con Claude + herramientas (loop tool_use → tool_result, como el asistente admin).
async function venderConClaude(messages, systemPrompt, sid) {
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, system: systemPrompt, tools: HERRAMIENTAS, messages }),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('Chat Claude error', JSON.stringify(data));
      return 'Disculpa, tuve un problemita técnico 🙏 Escríbenos por WhatsApp al 977 737 199 y te atendemos al toque 📲';
    }
    messages.push({ role: 'assistant', content: data.content });
    if (data.stop_reason !== 'tool_use') {
      const block = (data.content || []).find((b) => b.type === 'text');
      return (block && block.text) || '¿Me repites porfa? 🙏';
    }
    const results = [];
    for (const b of data.content) {
      if (b.type !== 'tool_use') continue;
      let out;
      try { out = await ejecutarHerramienta(b.name, b.input || {}, sid); }
      catch (e) { out = { error: String((e && e.message) || e) }; }
      results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out) });
    }
    messages.push({ role: 'user', content: results });
  }
  return 'Tu pedido quedó en proceso 🙌 Si algo no cuadra, escríbenos por WhatsApp al 977 737 199 📲';
}

// Historial que manda el navegador → mensajes válidos para la API (alternados, con tope).
function sanearMensajes(lista) {
  const msgs = [];
  for (const m of (Array.isArray(lista) ? lista.slice(-14) : [])) {
    const text = limpio(m && m.text, 800);
    if (!text) continue;
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += '\n' + text;
    else msgs.push({ role, content: text });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs;
}

module.exports = async (req, res) => {
  // GET: ¿el widget se muestra? (hay IA y el dueño no lo apagó en /panel → ⚙️ Bot)
  if (req.method === 'GET') {
    let on = !!process.env.ANTHROPIC_API_KEY;
    if (on && HAS_REDIS && (await redis(['GET', 'config:webchat'])) === '0') on = false;
    res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ on });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const APAGADO = 'Ahorita no estoy disponible por aquí 🙏 Escríbenos por WhatsApp al 977 737 199 y te atendemos al toque 📲';
  try {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(200).json({ reply: APAGADO });
    if (HAS_REDIS && (await redis(['GET', 'config:webchat'])) === '0') return res.status(200).json({ reply: APAGADO });

    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    b = b || {};
    const sid = String(b.sid || '').replace(/[^a-z0-9]/gi, '').slice(0, 40) || 'anon';

    // Freno anti-abuso: tope por sesión y por IP cada hora (el endpoint es público).
    if (HAS_REDIS) {
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
      const hora = Math.floor(Date.now() / 3600000);
      const nSid = await redis(['INCR', 'chatrl:s:' + hora + ':' + sid]);
      const nIp = await redis(['INCR', 'chatrl:i:' + hora + ':' + ip]);
      if (nSid === 1) await redis(['EXPIRE', 'chatrl:s:' + hora + ':' + sid, '7200']);
      if (nIp === 1) await redis(['EXPIRE', 'chatrl:i:' + hora + ':' + ip, '7200']);
      if (Number(nSid) > 40 || Number(nIp) > 120) {
        return res.status(429).json({ reply: '¡Conversamos bastante! 😅 Mejor sigamos por WhatsApp al 977 737 199 para cerrar tu pedido 📲' });
      }
      await redis(['INCR', 'stat:chatweb_msg']);
    }

    const messages = sanearMensajes(b.mensajes);
    if (!messages.length) return res.status(400).json({ error: 'Sin mensaje.' });

    const reply = await venderConClaude(messages, (await getPrompt()) + SUFIJO_WEB, sid);
    return res.status(200).json({ reply });
  } catch (e) {
    console.error('chat error', e);
    return res.status(200).json({ reply: APAGADO });
  }
};

// Para pruebas locales (node): no afecta al handler de Vercel.
module.exports.buscarProductos = buscarProductos;
module.exports.resolverItems = resolverItems;
module.exports.sanearMensajes = sanearMensajes;
