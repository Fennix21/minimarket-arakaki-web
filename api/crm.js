// Backend del panel/CRM del Minimarket Arakaki. Protegido con ARAKAKI_ADMIN_PASS.
// Acciones (POST JSON { pass, action, ... }):
//   list                      -> lista de leads de WhatsApp (recientes primero)
//   get    { phone }          -> conversación completa de un lead
//   send   { phone, text }    -> envías tú un mensaje (pausa el bot para ese lead)
//   status { phone, status }  -> cambias el estado (nuevo|interesado|pedido|entregado|descartado)
//   pause  { phone, paused }  -> activas/pausas el bot para ese lead
//   rename / note / tags / clearchat / delete
//   pedidos                   -> pedidos hechos desde la web  · pedidoestado { id, estado }
//   consultas                 -> preguntas que el chat web no pudo responder · consultadel { id }
//   preguntas                 -> preguntas del Club (/mi-cuenta) · pregresp { id, respuesta } · pregdel { id }
//   clientes                  -> registros del Club Arakaki   · clientedel { telefono }
//   stats                     -> analítica del sitio
//   getprompt / setprompt / resetprompt / setnotify / getwebchat / setwebchat
//   gettemplates / settemplates -> respuestas rápidas
//   getprecios / setprecio { clave, precio } -> precios en vivo (overrides sobre el catálogo)
//   getsitio / setsitio        -> textos editables del sitio (lema + footer; los lee /api/sitio)
//   getclub / setclub          -> interruptores + promos exclusivas + sorteos del Club (los lee /api/cuenta)
//   resetpin { telefono }      -> borra el PIN del cliente y cierra sus sesiones
//   setpuntos { telefono, puntos } -> ajuste manual de puntos (canjes)
//   sorteoinfo { id } / sorteoganador { id } -> participantes / ganador al azar
//   zonas                      -> calles agrupadas (clientes, pedidos y gasto por calle)

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

// Teléfono → llave de identidad normalizada (Perú por defecto: 9 dígitos → 51+num). '' si inválido.
function normTel(raw) {
  const t = String(raw || '').replace(/\D/g, '');
  if (t.length < 9) return '';
  return t.length === 9 ? '51' + t : t;
}

// Interruptores del Club (config:club; los lee también /api/cuenta). Sin config, todo prendido.
const CLUB_DEF = { login: true, favoritos: true, puntos: true, promos: true, sorteos: true, puntosPorSol: 1 };
async function getClubCfg() {
  let c = {};
  const raw = await redis(['GET', 'config:club']);
  if (raw) { try { c = JSON.parse(raw) || {}; } catch (e) {} }
  const out = {};
  Object.keys(CLUB_DEF).forEach((k) => { out[k] = (c[k] === undefined) ? CLUB_DEF[k] : c[k]; });
  return out;
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
          // Puntos del Club: se acreditan UNA sola vez, al marcar el pedido como ENTREGADO
          // (así los pedidos falsos o cancelados nunca suman). flag puntosOk = ya acreditado.
          if (p.estado === 'entregado' && !p.puntosOk) {
            try {
              const club = await getClubCfg();
              const telP = normTel(p.telefono);
              if (club.puntos && telP && Number(p.total) > 0) {
                const rawC = await redis(['GET', 'cliente:' + telP]);
                let cli = null;
                if (rawC) { try { cli = JSON.parse(rawC); } catch (e) {} }
                if (!cli) cli = { telefono: telP, creado: Date.now() };
                const ganados = Math.floor(Number(p.total) * (Number(club.puntosPorSol) || 1));
                if (ganados > 0) {
                  cli.puntos = (Number(cli.puntos) || 0) + ganados;
                  cli.actualizado = Date.now();
                  await redis(['SET', 'cliente:' + telP, JSON.stringify(cli)]);
                  await redis(['ZADD', 'clientes', String(Date.now()), telP]);
                  p.puntosOk = true;
                  p.puntosGanados = ganados;
                }
              }
            } catch (e) { console.error('puntos error', e); }
          }
          await redis(['LSET', 'pedidos', String(i), JSON.stringify(p)]);
          return res.status(200).json({ ok: true, puntos: p.puntosGanados || 0 });
        }
      }
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }

    // --- Consultas que el chat de la web no pudo responder (las registra api/chat.js) ---
    if (b.action === 'consultas') {
      const raws = (await redis(['LRANGE', 'consultas', '0', '199'])) || [];
      const consultas = [];
      for (const r of raws) { try { consultas.push(JSON.parse(r)); } catch (e) {} }
      return res.status(200).json({ consultas });
    }
    if (b.action === 'consultadel') {
      const raws = (await redis(['LRANGE', 'consultas', '0', '199'])) || [];
      for (const r of raws) {
        let c; try { c = JSON.parse(r); } catch (e) { continue; }
        if (c.id === b.id) {
          await redis(['LREM', 'consultas', '1', r]);
          return res.status(200).json({ ok: true });
        }
      }
      return res.status(404).json({ error: 'Consulta no encontrada.' });
    }

    // --- Preguntas del Club (las deja el cliente logueado en /mi-cuenta; la respuesta la ve en su panel) ---
    if (b.action === 'preguntas') {
      const raws = (await redis(['LRANGE', 'preguntas', '0', '199'])) || [];
      const preguntas = [];
      for (const r of raws) { try { preguntas.push(JSON.parse(r)); } catch (e) {} }
      return res.status(200).json({ preguntas });
    }
    if (b.action === 'pregresp') {
      const raws = (await redis(['LRANGE', 'preguntas', '0', '199'])) || [];
      for (let i = 0; i < raws.length; i++) {
        let q; try { q = JSON.parse(raws[i]); } catch (e) { continue; }
        if (q.id === b.id) {
          q.respuesta = String(b.respuesta || '').trim().slice(0, 500);
          q.respTs = q.respuesta ? Date.now() : null;
          await redis(['LSET', 'preguntas', String(i), JSON.stringify(q)]);
          return res.status(200).json({ ok: true });
        }
      }
      return res.status(404).json({ error: 'Pregunta no encontrada.' });
    }
    if (b.action === 'pregdel') {
      const raws = (await redis(['LRANGE', 'preguntas', '0', '199'])) || [];
      for (const r of raws) {
        let q; try { q = JSON.parse(r); } catch (e) { continue; }
        if (q.id === b.id) {
          await redis(['LREM', 'preguntas', '1', r]);
          return res.status(200).json({ ok: true });
        }
      }
      return res.status(404).json({ error: 'Pregunta no encontrada.' });
    }

    // --- Clientes del Club Arakaki ---
    if (b.action === 'clientes') {
      const tels = (await redis(['ZREVRANGE', 'clientes', '0', '499'])) || [];
      const clientes = [];
      for (const t of tels) {
        const raw = await redis(['GET', 'cliente:' + t]);
        if (!raw) continue;
        let c; try { c = JSON.parse(raw); } catch (e) { continue; }
        // Favoritos/recurrentes = top del archivo de consumo (por frecuencia). Se calcula aquí y
        // se manda solo el resumen (no el consumo completo) para un payload liviano en el panel.
        const consumo = (c.consumo && typeof c.consumo === 'object') ? c.consumo : {};
        c.top = Object.keys(consumo)
          .sort((x, y) => (consumo[y].veces - consumo[x].veces) || ((consumo[y].ultima || 0) - (consumo[x].ultima || 0)))
          .slice(0, 5)
          .map((n) => ({ nombre: n, veces: consumo[n].veces }));
        c.tienePin = !!c.pinHash; // tiene cuenta del Club con PIN
        delete c.consumo; delete c.uids; delete c.pinHash; delete c.pinSalt; delete c.sess;
        clientes.push(c);
      }
      return res.status(200).json({ clientes });
    }
    if (b.action === 'clientedel') {
      await redis(['DEL', 'cliente:' + b.telefono]);
      await redis(['ZREM', 'clientes', b.telefono]);
      return res.status(200).json({ ok: true });
    }

    // --- Club Arakaki: interruptores, promos exclusivas y sorteos (los lee /api/cuenta) ---
    if (b.action === 'getclub') {
      const club = await getClubCfg();
      let promos = [], sorteos = [];
      const rp = await redis(['GET', 'config:clubpromos']);
      if (rp) { try { promos = JSON.parse(rp) || []; } catch (e) {} }
      const rs = await redis(['GET', 'config:sorteos']);
      if (rs) { try { sorteos = JSON.parse(rs) || []; } catch (e) {} }
      for (const s of sorteos) s.participantes = Number(await redis(['ZCARD', 'sorteo:' + s.id])) || 0;
      return res.status(200).json({ club, promos, sorteos });
    }
    if (b.action === 'setclub') {
      const txt = (v, n) => (v == null ? '' : String(v)).trim().slice(0, n);
      const nuevoId = (pre) => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const cIn = b.club || {};
      const club = {};
      ['login', 'favoritos', 'puntos', 'promos', 'sorteos'].forEach((k) => { club[k] = cIn[k] !== false; });
      const pps = Number(cIn.puntosPorSol);
      club.puntosPorSol = (isFinite(pps) && pps > 0 && pps <= 100) ? pps : 1;
      await redis(['SET', 'config:club', JSON.stringify(club)]);
      const promos = (Array.isArray(b.promos) ? b.promos : []).map((p) => ({
        id: txt(p.id, 20).replace(/[^a-z0-9]/gi, '') || nuevoId('cp'),
        titulo: txt(p.titulo, 80), texto: txt(p.texto, 400), hasta: Number(p.hasta) || null,
      })).filter((p) => p.titulo).slice(0, 20);
      await redis(['SET', 'config:clubpromos', JSON.stringify(promos)]);
      // Sorteos: si el dueño borra uno de la lista, se limpia también su ZSET de participantes
      let viejos = [];
      const rs = await redis(['GET', 'config:sorteos']);
      if (rs) { try { viejos = JSON.parse(rs) || []; } catch (e) {} }
      const sorteos = (Array.isArray(b.sorteos) ? b.sorteos : []).map((s) => ({
        id: txt(s.id, 20).replace(/[^a-z0-9]/gi, '') || nuevoId('so'),
        titulo: txt(s.titulo, 80), premio: txt(s.premio, 120), hasta: Number(s.hasta) || null, activo: s.activo !== false,
      })).filter((s) => s.titulo).slice(0, 10);
      const quedan = {};
      sorteos.forEach((s) => { quedan[s.id] = 1; });
      for (const v of viejos) if (v.id && !quedan[v.id]) await redis(['DEL', 'sorteo:' + v.id]);
      await redis(['SET', 'config:sorteos', JSON.stringify(sorteos)]);
      return res.status(200).json({ ok: true, club, promos, sorteos });
    }
    if (b.action === 'resetpin') { // borra el PIN del cliente y cierra TODAS sus sesiones
      const tel = String(b.telefono || '').replace(/\D/g, '');
      const raw = await redis(['GET', 'cliente:' + tel]);
      if (!raw) return res.status(404).json({ error: 'Cliente no encontrado.' });
      let cli; try { cli = JSON.parse(raw); } catch (e) { return res.status(500).json({ error: 'Registro dañado.' }); }
      delete cli.pinHash; delete cli.pinSalt;
      for (const t of (Array.isArray(cli.sess) ? cli.sess : [])) await redis(['DEL', 'sess:' + t]);
      delete cli.sess;
      await redis(['SET', 'cliente:' + tel, JSON.stringify(cli)]);
      return res.status(200).json({ ok: true });
    }
    if (b.action === 'setpuntos') { // ajuste manual (canjes): fija el saldo de puntos
      const tel = String(b.telefono || '').replace(/\D/g, '');
      const raw = await redis(['GET', 'cliente:' + tel]);
      if (!raw) return res.status(404).json({ error: 'Cliente no encontrado.' });
      let cli; try { cli = JSON.parse(raw); } catch (e) { return res.status(500).json({ error: 'Registro dañado.' }); }
      cli.puntos = Math.max(0, Math.floor(Number(b.puntos) || 0));
      cli.actualizado = Date.now();
      await redis(['SET', 'cliente:' + tel, JSON.stringify(cli)]);
      return res.status(200).json({ ok: true, puntos: cli.puntos });
    }
    if (b.action === 'sorteoinfo') { // participantes de un sorteo (con nombre si se conoce)
      const id = String(b.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 20);
      const raw = (await redis(['ZRANGE', 'sorteo:' + id, '0', '-1', 'WITHSCORES'])) || [];
      const participantes = [];
      for (let i = 0; i < raw.length; i += 2) {
        const t = raw[i];
        let nombre = '';
        const rc = await redis(['GET', 'cliente:' + t]);
        if (rc) { try { nombre = JSON.parse(rc).nombre || ''; } catch (e) {} }
        participantes.push({ telefono: t, nombre, ts: Number(raw[i + 1]) || 0 });
      }
      return res.status(200).json({ participantes });
    }
    if (b.action === 'sorteoganador') { // elige un participante al azar
      const id = String(b.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 20);
      const t = await redis(['ZRANDMEMBER', 'sorteo:' + id]);
      if (!t) return res.status(400).json({ error: 'Este sorteo no tiene participantes aún.' });
      let nombre = '';
      const rc = await redis(['GET', 'cliente:' + t]);
      if (rc) { try { nombre = JSON.parse(rc).nombre || ''; } catch (e) {} }
      return res.status(200).json({ telefono: t, nombre });
    }

    // --- Zonas: clientes y pedidos agrupados por calle (dirección hasta el primer número) ---
    if (b.action === 'zonas') {
      const calleDe = (dir) => {
        let s = String(dir || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        s = s.split(/\d/)[0]; // "av. belen 265, san isidro" → "av. belen"
        s = s.replace(/[.,;#-]+/g, ' ').replace(/\s+/g, ' ').trim();
        return s.length >= 4 ? s : '';
      };
      const zonas = {}; // calle → { clientes:{tel:1}, pedidos, gasto }
      const zonaDe = (c) => (zonas[c] = zonas[c] || { clientes: {}, pedidos: 0, gasto: 0 });
      const tels = (await redis(['ZREVRANGE', 'clientes', '0', '499'])) || [];
      for (const t of tels) {
        const raw = await redis(['GET', 'cliente:' + t]);
        if (!raw) continue;
        let c; try { c = JSON.parse(raw); } catch (e) { continue; }
        const calle = calleDe(c.direccion);
        if (calle) zonaDe(calle).clientes[t] = 1;
      }
      const raws = (await redis(['LRANGE', 'pedidos', '0', '499'])) || [];
      for (const r of raws) {
        let p; try { p = JSON.parse(r); } catch (e) { continue; }
        const calle = calleDe(p.direccion);
        if (!calle) continue;
        const z = zonaDe(calle);
        z.pedidos += 1;
        z.gasto += Number(p.total) || 0;
        if (p.telefono) z.clientes[p.telefono] = 1;
      }
      const lista = Object.keys(zonas).map((c) => ({
        calle: c,
        clientes: Object.keys(zonas[c].clientes).length,
        pedidos: zonas[c].pedidos,
        gasto: Math.round(zonas[c].gasto * 100) / 100,
      })).sort((a, b) => (b.pedidos - a.pedidos) || (b.clientes - a.clientes)).slice(0, 100);
      return res.status(200).json({ zonas: lista });
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
    // --- Chat de la web: textos del widget (config:webchatui) y cerebro PROPIO
    // (config:webprompt; vacío = el chat web usa el cerebro de WhatsApp) ---
    if (b.action === 'getwebchat') {
      const raw = await redis(['GET', 'config:webchatui']);
      let ui = {};
      if (raw) { try { ui = JSON.parse(raw) || {}; } catch (e) {} }
      const webprompt = await redis(['GET', 'config:webprompt']);
      const webchat = await redis(['GET', 'config:webchat']);
      return res.status(200).json({
        on: webchat !== '0',
        saludo: ui.saludo || '',
        botones: Array.isArray(ui.botones) ? ui.botones : [],
        invitacion: ui.invitacion || '',
        subtitulo: ui.subtitulo || '',
        prompt: webprompt || '',
      });
    }
    if (b.action === 'setwebchat') {
      const txt = (s, n) => (s == null ? '' : String(s)).trim().slice(0, n);
      const ui = {};
      const saludo = txt(b.saludo, 500);
      const invitacion = txt(b.invitacion, 60);
      const subtitulo = txt(b.subtitulo, 60);
      const botones = (Array.isArray(b.botones) ? b.botones : []).map((s) => txt(s, 48)).filter(Boolean).slice(0, 4);
      if (saludo) ui.saludo = saludo;
      if (botones.length) ui.botones = botones;
      if (invitacion) ui.invitacion = invitacion;
      if (subtitulo) ui.subtitulo = subtitulo;
      // Campo vacío = la web vuelve a su texto por defecto (nada queda guardado de más)
      if (Object.keys(ui).length) await redis(['SET', 'config:webchatui', JSON.stringify(ui)]);
      else await redis(['DEL', 'config:webchatui']);
      const webprompt = txt(b.prompt, 20000);
      if (webprompt) await redis(['SET', 'config:webprompt', webprompt]);
      else await redis(['DEL', 'config:webprompt']);
      // El interruptor on/off del chat web ahora vive aquí (antes en setnotify)
      const on = b.on !== false;
      await redis(['SET', 'config:webchat', on ? '1' : '0']);
      return res.status(200).json({ ok: true, on, usaWhatsapp: !webprompt });
    }

    // --- Textos editables del sitio (lema del header + footer): config:sitio ---
    // Los lee /api/sitio (público) y los aplica assets/site.js sobre sus defaults.
    if (b.action === 'getsitio') {
      const raw = await redis(['GET', 'config:sitio']);
      let s = {};
      if (raw) { try { s = JSON.parse(raw) || {}; } catch (e) {} }
      return res.status(200).json({ s });
    }
    if (b.action === 'setsitio') {
      const txt = (v, n) => (v == null ? '' : String(v)).trim().slice(0, n);
      const url = (v) => { const u = txt(v, 300); return /^https?:\/\//i.test(u) ? u : ''; };
      const s = {};
      const campos = {
        lema: 80, visitanosTit: 40, direccion: 160, referencia: 120, mapLabel: 60,
        horarioTit: 40, horario: 300, contactoTit: 40, telefonos: 300, redesTit: 60, copy: 200,
      };
      Object.keys(campos).forEach((k) => { const v = txt(b[k], campos[k]); if (v) s[k] = v; });
      ['facebook', 'instagram', 'youtube'].forEach((k) => { const v = url(b[k]); if (v) s[k] = v; });
      // Campo vacío = vuelve al texto por defecto de site.js (no se guarda nada de más)
      if (Object.keys(s).length) await redis(['SET', 'config:sitio', JSON.stringify(s)]);
      else await redis(['DEL', 'config:sitio']);
      return res.status(200).json({ ok: true, s });
    }

    if (b.action === 'setnotify') {
      // Hasta 6 números (dueño + encargados) separados por coma: TODOS reciben avisos
      // y TODOS pueden usar el asistente de precios por WhatsApp.
      const nums = (b.ownerPhone || '').toString().split(/[,;\n]+/)
        .map((s) => s.replace(/\D/g, '').slice(0, 15)).filter((n) => n.length >= 9).slice(0, 6);
      const ownerPhone = Array.from(new Set(nums)).join(',');
      await redis(['SET', 'config:ownerphone', ownerPhone]);
      await redis(['SET', 'config:notify', b.notify ? '1' : '0']);
      // El on/off del chat web se maneja en setwebchat (panel → 💬 Chat de la web), no aquí.
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
