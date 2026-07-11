// Backend del panel/CRM del Minimarket Arakaki. Protegido con ARAKAKI_ADMIN_PASS.
// Acciones (POST JSON { pass, action, ... }):
//   list                      -> lista de leads de WhatsApp (recientes primero)
//   get    { phone }          -> conversación completa de un lead
//   send   { phone, text }    -> envías tú un mensaje (pausa el bot para ese lead)
//   status { phone, status }  -> cambias el estado (nuevo|interesado|pedido|entregado|descartado)
//   pause  { phone, paused }  -> activas/pausas el bot para ese lead
//   rename / note / tags / clearchat / delete
//   pedidos                   -> pedidos hechos desde la web  · pedidoestado { id, estado }
//   clientes                  -> registros del Club Arakaki   · clientedel { telefono }
//   stats                     -> analítica del sitio
//   getprompt / setprompt / resetprompt / setnotify
//   gettemplates / settemplates -> respuestas rápidas
//   getprecios / setprecio { clave, precio } -> precios en vivo (overrides sobre el catálogo)

const { DEFAULT_PROMPT } = require('./_prompt');
const { PRODUCTOS } = require('./_catalogo');
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

async function sendWhatsApp(to, body) {
  const r = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  if (!r.ok) throw new Error(await r.text());
}

async function loadLead(phone) {
  const raw = await redis(['GET', 'lead:' + phone]);
  if (raw) { try { return JSON.parse(raw); } catch (e) {} }
  return { phone, name: '', status: 'nuevo', paused: false, messages: [] };
}

async function persist(lead) {
  lead.updatedAt = Date.now();
  if (lead.messages.length > 300) lead.messages = lead.messages.slice(-300);
  await redis(['SET', 'lead:' + lead.phone, JSON.stringify(lead)]);
  await redis(['ZADD', 'leads', String(lead.updatedAt), lead.phone]);
}

// Respuestas rápidas por defecto (editables desde el panel).
const DEFAULT_TEMPLATES = [
  { label: '👋 Saludo', text: '¡Hola! 👋 Bienvenido al Minimarket Arakaki. ¿Qué se te antoja hoy? Tenemos licores, helados, chocolates y mucho más 🛒' },
  { label: '🛵 Delivery', text: 'Hacemos delivery 🛵 ¡GRATIS llegando a un monto mínimo! Pásame tu dirección y te confirmo al toque. 🙌' },
  { label: '🕗 Horario', text: 'Atendemos de lunes a sábado de 7:00 am a 9:00 pm y los domingos de 8:00 am a 8:00 pm. ¡Incluso feriados! 🎉' },
  { label: '💳 Pagos', text: 'Puedes pagar en efectivo contra entrega, Yape o Plin. Como prefieras 🙌' },
  { label: '✅ Pedido confirmado', text: '¡Tu pedido está confirmado! ✅ En breve te aviso cuando salga el delivery. Gracias por tu compra 🙏' },
];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!REDIS_URL || !REDIS_TOKEN) return res.status(500).json({ error: 'Falta configurar Upstash (base de datos).' });

  const b = req.body || {};
  if (!process.env.ARAKAKI_ADMIN_PASS) return res.status(500).json({ error: 'Falta configurar ARAKAKI_ADMIN_PASS.' });
  if ((b.pass || '') !== process.env.ARAKAKI_ADMIN_PASS) return res.status(401).json({ error: 'Contraseña incorrecta.' });

  try {
    if (b.action === 'list') {
      const phones = (await redis(['ZREVRANGE', 'leads', '0', '300'])) || [];
      const leads = [];
      for (const p of phones) {
        const raw = await redis(['GET', 'lead:' + p]);
        if (!raw) continue;
        let l; try { l = JSON.parse(raw); } catch (e) { continue; }
        const msgs = l.messages || [];
        const last = msgs.length ? msgs[msgs.length - 1] : null;
        let lastUserTs = 0; // último mensaje DEL CLIENTE (define la ventana de 24h)
        for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].role === 'user') { lastUserTs = msgs[i].ts || 0; break; } }
        leads.push({
          phone: l.phone, name: l.name || '', status: l.status || 'nuevo', paused: !!l.paused,
          updatedAt: l.updatedAt || 0, lastText: last ? last.text : '', count: msgs.length,
          lastRole: last ? (last.human ? 'human' : last.role) : '', lastUserTs,
          hasNote: !!(l.note && l.note.trim()), tags: l.tags || [],
        });
      }
      return res.status(200).json({ leads });
    }

    if (b.action === 'get') {
      const raw = await redis(['GET', 'lead:' + b.phone]);
      return res.status(200).json({ lead: raw ? JSON.parse(raw) : null });
    }

    if (b.action === 'send') {
      if (!b.text || !b.phone) return res.status(400).json({ error: 'Falta texto o número.' });
      try {
        await sendWhatsApp(b.phone, b.text);
      } catch (e) {
        const msg = String((e && e.message) || e || '');
        // 131047 = fuera de la ventana de 24h
        if (/131047|24\s*hours|re-?engagement|outside.*window/i.test(msg)) {
          return res.status(400).json({ error: 'No se entregó: este contacto está FUERA de las 24h (WhatsApp solo permite responder hasta 24h después del último mensaje del cliente).' });
        }
        return res.status(400).json({ error: 'WhatsApp rechazó el envío.' });
      }
      const l = await loadLead(b.phone);
      l.messages.push({ role: 'assistant', text: b.text, ts: Date.now(), human: true });
      l.paused = true; // tomaste el control
      await persist(l);
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'status') {
      const l = await loadLead(b.phone);
      l.status = b.status;
      await redis(['SET', 'lead:' + l.phone, JSON.stringify(l)]);
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'rename') {
      const l = await loadLead(b.phone);
      l.name = (b.name || '').slice(0, 60);
      await redis(['SET', 'lead:' + l.phone, JSON.stringify(l)]);
      return res.status(200).json({ ok: true, name: l.name });
    }

    if (b.action === 'note') {
      const l = await loadLead(b.phone);
      l.note = (b.note || '').toString().slice(0, 1000);
      await redis(['SET', 'lead:' + l.phone, JSON.stringify(l)]);
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'tags') {
      const l = await loadLead(b.phone);
      const tags = (Array.isArray(b.tags) ? b.tags : [])
        .map((t) => (t || '').toString().trim().slice(0, 24)).filter(Boolean).slice(0, 12);
      l.tags = Array.from(new Set(tags));
      await redis(['SET', 'lead:' + l.phone, JSON.stringify(l)]);
      return res.status(200).json({ ok: true, tags: l.tags });
    }

    if (b.action === 'pause') {
      const l = await loadLead(b.phone);
      l.paused = !!b.paused;
      await redis(['SET', 'lead:' + l.phone, JSON.stringify(l)]);
      return res.status(200).json({ ok: true, paused: l.paused });
    }

    if (b.action === 'clearchat') {
      const l = await loadLead(b.phone);
      l.messages = [];
      l.status = 'nuevo';
      l.paused = false;
      await persist(l);
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'delete') {
      await redis(['DEL', 'lead:' + b.phone]);
      await redis(['ZREM', 'leads', b.phone]);
      return res.status(200).json({ ok: true });
    }

    // --- Pedidos hechos desde la web ---
    if (b.action === 'pedidos') {
      const raws = (await redis(['LRANGE', 'pedidos', '0', '199'])) || [];
      const pedidos = [];
      for (const r of raws) { try { pedidos.push(JSON.parse(r)); } catch (e) {} }
      return res.status(200).json({ pedidos });
    }
    if (b.action === 'pedidoestado') {
      const raws = (await redis(['LRANGE', 'pedidos', '0', '499'])) || [];
      for (let i = 0; i < raws.length; i++) {
        let p; try { p = JSON.parse(raws[i]); } catch (e) { continue; }
        if (p.id === b.id) {
          p.estado = (b.estado || 'nuevo').toString().slice(0, 20);
          await redis(['LSET', 'pedidos', String(i), JSON.stringify(p)]);
          return res.status(200).json({ ok: true });
        }
      }
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }

    // --- Clientes del Club Arakaki ---
    if (b.action === 'clientes') {
      const tels = (await redis(['ZREVRANGE', 'clientes', '0', '499'])) || [];
      const clientes = [];
      for (const t of tels) {
        const raw = await redis(['GET', 'cliente:' + t]);
        if (!raw) continue;
        try { clientes.push(JSON.parse(raw)); } catch (e) {}
      }
      return res.status(200).json({ clientes });
    }
    if (b.action === 'clientedel') {
      await redis(['DEL', 'cliente:' + b.telefono]);
      await redis(['ZREM', 'clientes', b.telefono]);
      return res.status(200).json({ ok: true });
    }

    // --- Respuestas rápidas ---
    if (b.action === 'gettemplates') {
      const raw = await redis(['GET', 'config:templates']);
      let tpl = [];
      if (raw) { try { tpl = JSON.parse(raw); } catch (e) {} }
      if (!tpl.length) tpl = DEFAULT_TEMPLATES;
      return res.status(200).json({ templates: tpl });
    }
    if (b.action === 'settemplates') {
      const tpl = (Array.isArray(b.templates) ? b.templates : [])
        .map((t) => ({ label: (t.label || '').toString().slice(0, 30), text: (t.text || '').toString().slice(0, 1000) }))
        .filter((t) => t.label && t.text).slice(0, 12);
      await redis(['SET', 'config:templates', JSON.stringify(tpl)]);
      return res.status(200).json({ ok: true, templates: tpl });
    }

    // --- "Cerebro" del bot (system prompt) editable desde el panel ---
    if (b.action === 'getprompt') {
      const custom = await redis(['GET', 'config:prompt']);
      const ownerPhone = await redis(['GET', 'config:ownerphone']);
      const notify = await redis(['GET', 'config:notify']);
      const webchat = await redis(['GET', 'config:webchat']);
      return res.status(200).json({
        prompt: custom || DEFAULT_PROMPT,
        isCustom: !!custom,
        default: DEFAULT_PROMPT,
        ownerPhone: ownerPhone || '',
        notify: notify !== '0',
        webchat: webchat !== '0',
      });
    }
    if (b.action === 'setprompt') {
      const p = (b.prompt || '').toString();
      if (p.trim().length < 20) return res.status(400).json({ error: 'El prompt es muy corto. Escribe las instrucciones del bot.' });
      await redis(['SET', 'config:prompt', p]);
      return res.status(200).json({ ok: true });
    }
    if (b.action === 'resetprompt') {
      await redis(['DEL', 'config:prompt']);
      return res.status(200).json({ ok: true, prompt: DEFAULT_PROMPT });
    }
    if (b.action === 'setnotify') {
      // Hasta 6 números (dueño + encargados) separados por coma: TODOS reciben avisos
      // y TODOS pueden usar el asistente de precios por WhatsApp.
      const nums = (b.ownerPhone || '').toString().split(/[,;\n]+/)
        .map((s) => s.replace(/\D/g, '').slice(0, 15)).filter((n) => n.length >= 9).slice(0, 6);
      const ownerPhone = Array.from(new Set(nums)).join(',');
      await redis(['SET', 'config:ownerphone', ownerPhone]);
      await redis(['SET', 'config:notify', b.notify ? '1' : '0']);
      await redis(['SET', 'config:webchat', b.webchat ? '1' : '0']); // chat vendedor de la web (/api/chat)
      return res.status(200).json({ ok: true, ownerPhone });
    }

    // --- Precios en vivo (overrides sobre data/catalog.js; los lee /api/precios) ---
    if (b.action === 'getprecios') {
      const raw = await redis(['GET', 'config:precios']);
      let p = {};
      if (raw) { try { p = JSON.parse(raw); } catch (e) {} }
      return res.status(200).json({ p });
    }
    if (b.action === 'setprecio') {
      const clave = (b.clave || '').toString().slice(0, 200);
      if (!PRODUCTOS.some((pr) => pr.c + '|' + pr.n === clave)) {
        return res.status(400).json({ error: 'Producto no encontrado en el catálogo.' });
      }
      const raw = await redis(['GET', 'config:precios']);
      let p = {};
      if (raw) { try { p = JSON.parse(raw); } catch (e) {} }
      const val = (b.precio === null || b.precio === undefined) ? '' : String(b.precio).replace(',', '.').trim();
      if (val === '') {
        delete p[clave]; // sin override -> vuelve el precio base del catálogo
      } else {
        if (!/^\d+(\.\d{1,2})?$/.test(val) || Number(val) <= 0) {
          return res.status(400).json({ error: 'Precio inválido. Ejemplos: 85 o 85.50' });
        }
        p[clave] = String(Number(val));
      }
      await redis(['SET', 'config:precios', JSON.stringify(p)]);
      return res.status(200).json({ ok: true, p });
    }

    // --- Analítica del sitio ---
    if (b.action === 'stats') {
      const events = (await redis(['SMEMBERS', 'stat:events'])) || [];
      const evTotals = {};
      if (events.length) {
        const vals = await redis(['MGET', ...events.map((e) => 'stat:' + e)]);
        events.forEach((e, i) => { evTotals[e] = Number((vals && vals[i]) || 0); });
      }
      const pages = (await redis(['SMEMBERS', 'stat:pages'])) || [];
      const pageCounts = {};
      if (pages.length) {
        const vals = await redis(['MGET', ...pages.map((p) => 'stat:page:' + p)]);
        pages.forEach((p, i) => { pageCounts[p] = Number((vals && vals[i]) || 0); });
      }
      const refs = (await redis(['SMEMBERS', 'stat:refs'])) || [];
      const refCounts = {};
      if (refs.length) {
        const vals = await redis(['MGET', ...refs.map((r) => 'stat:ref:' + r)]);
        refs.forEach((r, i) => { refCounts[r] = Number((vals && vals[i]) || 0); });
      }
      const days = [];
      for (let i = 6; i >= 0; i--) days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
      const pvVals = await redis(['MGET', ...days.map((d) => 'stat:pageview:' + d)]);
      const daily = days.map((d, i) => ({ day: d, n: Number((pvVals && pvVals[i]) || 0) }));
      return res.status(200).json({ events: evTotals, pages: pageCounts, refs: refCounts, daily });
    }

    return res.status(400).json({ error: 'Acción desconocida.' });
  } catch (e) {
    console.error('CRM error', e);
    return res.status(500).json({ error: e.message || 'Error interno.' });
  }
};
