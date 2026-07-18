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
//   correoinfo                -> miembros con correo + historial · correopromo { asunto, titulo?, texto, url? } (Resend)
//   clientes                  -> registros del Club Arakaki   · clientedel { telefono }
//   stats                     -> analítica del sitio
//   getprompt / setprompt / resetprompt / setnotify / getwebchat / setwebchat
//   gettemplates / settemplates -> respuestas rápidas
//   getprecios / setprecio { clave, precio } -> precios en vivo (overrides sobre el catálogo)
//   setstock { clave, estado }   -> stock en vivo (''=se vende | 'agotado' | 'oculto'; config:stock)
//   addprod { id?, cat, seccion?, nombre, precio?, img? } -> producto nuevo desde el panel (config:prodextra;
//                                  la foto dataURL se guarda en prodimg:<id> y la sirve /api/precios?img=)
//   delprod { id }               -> quita un producto subido desde el panel (y borra su foto)
//   getsitio / setsitio        -> textos editables del sitio (lema + footer; los lee /api/sitio)
//   getfondos / setfondos      -> fondos de las secciones y las tarjetas (color o degradado;
//                                  config:fondos, los lee /api/sitio y los aplica site.js)
//   getvideos / setvideos      -> video/título/subtítulo del hero por categoría (config:videos; los sirve /api/precios)
//   getcomple / setcomple      -> combos de venta cruzada por categoría + interruptor del carrito
//                                  (config:comple; los sirve /api/precios como c y los pinta site.js)
//   getcarrito / setcarrito    -> apariencia del modal "Tu pedido": textos, tamaños, colores/degradados,
//                                  máquina de escribir y brillo (config:carrito; lo sirve /api/sitio como k)
//   vidini / vidchunk / vidfin -> subir un video desde el panel en trozos base64 ≤512KB (vidext:<id>:<i>;
//                                  el panel lo comprime antes en el navegador; lo sirve /api/precios?vid=<id>)
//   viddel { id }              -> borra un video subido (chunks + índice config:vidsubidos + overrides que lo usaban)
//   getclub / setclub          -> interruptores + promos exclusivas + sorteos del Club (los lee /api/cuenta)
//   resetpin { telefono }      -> borra el PIN del cliente y cierra sus sesiones
//   setpuntos { telefono, puntos } -> ajuste manual de puntos (canjes)
//   sorteoinfo { id } / sorteoganador { id } -> participantes / ganador al azar
//   zonas                      -> calles agrupadas (clientes, pedidos y gasto por calle)
//   reset  { confirm:'REINICIAR' } -> borra métricas + actividad de prueba para estrenar el dominio
//                                  (stat:*, pedidos, leads, consultas, preguntas, clientes/Club,
//                                  sesiones, participantes de sorteos, historiales). NO toca productos
//                                  ni configuración. Doble barrera: pass + confirm==='REINICIAR'.

const crypto = require('crypto');
const { DEFAULT_PROMPT } = require('./_prompt');
const { PRODUCTOS } = require('./_catalogo');
const { HAS_CORREO, enviarLote, htmlPromo } = require('./_correo.js');
const { MISION_CAPTADOR, REGLAS_WEB } = require('./chat.js'); // misión por defecto + reglas fijas del chat web (para el panel)
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

// Enumera TODAS las claves que casan con un patrón (SCAN por lotes; Upstash REST no tiene KEYS).
// El resultado de SCAN es [cursor, [claves...]]; se repite hasta que el cursor vuelve a '0'.
async function scanKeys(match) {
  let cursor = '0';
  const keys = [];
  let vueltas = 0;
  do {
    const out = await redis(['SCAN', cursor, 'MATCH', match, 'COUNT', 500]);
    cursor = (out && out[0]) || '0';
    const parte = (out && out[1]) || [];
    for (const k of parte) keys.push(k);
    vueltas++;
  } while (cursor !== '0' && vueltas < 500); // tope de seguridad por si algo se descontrola
  return keys;
}
// Borra claves en lotes (evita un DEL gigantesco). Devuelve cuántas existían realmente.
async function delKeys(keys) {
  let n = 0;
  for (let i = 0; i < keys.length; i += 400) {
    const lote = keys.slice(i, i + 400);
    if (!lote.length) continue;
    const r = await redis(['DEL', ...lote]);
    n += Number(r) || 0;
  }
  return n;
}

async function sendWhatsApp(to, body) {
  const r = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  if (!r.ok) throw new Error(await r.text());
}

// Fondos editables (config:fondos): las 5 zonas que el dueño puede repintar desde el panel.
// Cada clave se aplica en el sitio como la variable CSS --bg-<clave> (ver :root de assets/site.css).
const FONDO_CLAVES = ['pagina', 'vino', 'roja', 'premium', 'card'];
// Modelo del panel → { t, c1, c2, c3, a, css } normalizado, o null = sin override (default del CSS).
// Solo acepta #rrggbb y un ángulo entero: el `css` resultante no puede contener nada inyectable.
function normFondo(f) {
  if (!f || typeof f !== 'object') return null;
  const hex = (v) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : '');
  const t = ['solido', 'lineal', 'radial'].includes(f.t) ? f.t : '';
  const c1 = hex(f.c1);
  if (!t || !c1) return null; // sin tipo o sin color base = "el de siempre"
  if (t === 'solido') return { t, c1, css: c1 };
  const c2 = hex(f.c2);
  if (!c2) return null; // un degradado necesita 2 colores como mínimo
  const c3 = hex(f.c3); // tercer color opcional (queda al 50%, como los degradados de la marca)
  const paradas = c3 ? `${c1} 0%, ${c2} 50%, ${c3} 100%` : `${c1} 0%, ${c2} 100%`;
  // El radial copia la forma de los fondos originales: foco arriba al centro, abriéndose hacia abajo
  if (t === 'radial') return { t, c1, c2, c3, css: `radial-gradient(120% 90% at 50% 0%, ${paradas})` };
  let a = Math.round(Number(f.a));
  if (!Number.isFinite(a)) a = 180; // 180deg = de arriba hacia abajo
  a = ((a % 360) + 360) % 360;
  return { t, c1, c2, c3, a, css: `linear-gradient(${a}deg, ${paradas})` };
}

// Teléfono → llave de identidad normalizada (Perú por defecto: 9 dígitos → 51+num). '' si inválido.
function normTel(raw) {
  const t = String(raw || '').replace(/\D/g, '');
  if (t.length < 9) return '';
  return t.length === 9 ? '51' + t : t;
}

// Precio en soles conservando los centavos que escribió el dueño.
// Devuelve: '' si viene vacío (sin precio) · null si es inválido (>0, hasta 2 decimales) · el texto normalizado.
// OJO: Number('8.50') es 8.5, así que NO usamos String(Number(...)) o perderíamos el centavo redondo.
// '8.50' → '8.50' · '8.5' → '8.50' · '85' → '85' · '08.5' → '8.50'.
function normPrecio(raw) {
  const v = (raw === null || raw === undefined) ? '' : String(raw).replace(',', '.').trim();
  if (v === '') return '';
  if (!/^\d+(\.\d{1,2})?$/.test(v) || Number(v) <= 0) return null;
  const par = v.split('.');
  const entero = String(Number(par[0])); // quita ceros a la izquierda (08 → 8)
  return par[1] === undefined ? entero : entero + '.' + (par[1] + '00').slice(0, 2);
}

// Interruptores del Club (config:club; los lee también /api/cuenta). Sin config, todo prendido.
const CLUB_DEF = { login: true, favoritos: true, puntos: true, promos: true, sorteos: true, cupones: true, puntosPorSol: 1 };
async function getClubCfg() {
  let c = {};
  const raw = await redis(['GET', 'config:club']);
  if (raw) { try { c = JSON.parse(raw) || {}; } catch (e) {} }
  const out = {};
  Object.keys(CLUB_DEF).forEach((k) => { out[k] = (c[k] === undefined) ? CLUB_DEF[k] : c[k]; });
  return out;
}

// Productos nuevos subidos desde el panel (config:prodextra; site.js los pinta en su categoría)
async function getExtras() {
  const raw = await redis(['GET', 'config:prodextra']);
  if (raw) { try { const x = JSON.parse(raw); if (Array.isArray(x)) return x; } catch (e) {} }
  return [];
}

// Videos subidos desde el panel: índice [{id,nombre,n,size,ts}] (los bytes viven en vidext:<id>:<i>)
async function getVidSubidos() {
  const raw = await redis(['GET', 'config:vidsubidos']);
  if (raw) { try { const x = JSON.parse(raw); if (Array.isArray(x)) return x; } catch (e) {} }
  return [];
}
// Topes de la subida de videos: 7 trozos de ≤512KB binario (≈700K chars base64) = 3.5MB máximo,
// porque Upstash acepta requests de ≤1MB y la respuesta de /api/precios?vid= debe caber en Vercel (≤4.5MB).
const VID_MAX_CHUNKS = 7;
const VID_MAX_B64 = 700000;
const VID_MAX_SUBIDOS = 10;

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

    // --- Promos por CORREO (Resend) a los miembros del Club con correo registrado ---
    if (b.action === 'correoinfo' || b.action === 'correopromo') {
      // Destinatarios: clientes con correo válido que no se dieron de baja (sin duplicar correos)
      const keys = (await redis(['ZREVRANGE', 'clientes', '0', '499'])) || [];
      const destinos = [];
      const porEmail = {};
      let bajas = 0;
      for (const k of keys) {
        const raw = await redis(['GET', 'cliente:' + k]);
        if (!raw) continue;
        let c; try { c = JSON.parse(raw); } catch (e) { continue; }
        const email = String(c.email || '').toLowerCase().trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) continue;
        if (c.correoBaja) { bajas++; continue; }
        if (porEmail[email]) continue;
        porEmail[email] = 1;
        destinos.push({ key: k, cli: c, email });
      }

      if (b.action === 'correoinfo') {
        const historial = [];
        for (const r of (await redis(['LRANGE', 'correolog', '0', '9'])) || []) {
          try { historial.push(JSON.parse(r)); } catch (e) {}
        }
        return res.status(200).json({ configurado: HAS_CORREO, total: destinos.length, bajas, historial });
      }

      // correopromo: enviar la campaña
      if (!HAS_CORREO) return res.status(400).json({ error: 'Falta configurar RESEND_API_KEY en Vercel.' });
      const asunto = String(b.asunto || '').trim().slice(0, 100);
      const titulo = String(b.titulo || '').trim().slice(0, 100);
      const texto = String(b.texto || '').trim().slice(0, 2000);
      const url = String(b.url || '').trim().slice(0, 300);
      if (!asunto || !texto) return res.status(400).json({ error: 'Escribe el asunto y el mensaje.' });
      if (!destinos.length) return res.status(400).json({ error: 'Ningún miembro del Club tiene correo registrado todavía.' });
      const items = [];
      for (const d of destinos) {
        // Token de baja por cliente: se crea 1 sola vez; su registro en Redis se refresca por campaña
        if (!d.cli.bajaTok) {
          d.cli.bajaTok = crypto.randomBytes(12).toString('hex');
          d.cli.actualizado = Date.now();
          await redis(['SET', 'cliente:' + d.key, JSON.stringify(d.cli)]);
        }
        await redis(['SET', 'baja:' + d.cli.bajaTok, d.key, 'EX', String(400 * 86400)]);
        items.push({
          para: d.email,
          asunto,
          html: htmlPromo({ titulo: titulo || asunto, texto, url, nombre: d.cli.nombre || '', bajaTok: d.cli.bajaTok }),
        });
      }
      const envio = await enviarLote(items);
      await redis(['LPUSH', 'correolog', JSON.stringify({ id: 'e' + Date.now().toString(36), ts: Date.now(), asunto, enviados: envio.enviados, total: destinos.length })]);
      await redis(['LTRIM', 'correolog', '0', '29']);
      if (envio.enviados) await redis(['INCRBY', 'stat:correo_enviados', String(envio.enviados)]);
      return res.status(200).json({ ok: true, enviados: envio.enviados, total: destinos.length, errores: envio.errores });
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
      let promos = [], sorteos = [], cupones = [], banners = [];
      const rp = await redis(['GET', 'config:clubpromos']);
      if (rp) { try { promos = JSON.parse(rp) || []; } catch (e) {} }
      const rs = await redis(['GET', 'config:sorteos']);
      if (rs) { try { sorteos = JSON.parse(rs) || []; } catch (e) {} }
      const rc = await redis(['GET', 'config:clubcupones']);
      if (rc) { try { cupones = JSON.parse(rc) || []; } catch (e) {} }
      const rb = await redis(['GET', 'config:clubbanners']);
      if (rb) { try { banners = JSON.parse(rb) || []; } catch (e) {} }
      for (const s of sorteos) s.participantes = Number(await redis(['ZCARD', 'sorteo:' + s.id])) || 0;
      return res.status(200).json({ club, promos, sorteos, cupones, banners });
    }
    if (b.action === 'setclub') {
      const txt = (v, n) => (v == null ? '' : String(v)).trim().slice(0, n);
      const nuevoId = (pre) => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const cIn = b.club || {};
      const club = {};
      ['login', 'favoritos', 'puntos', 'promos', 'sorteos', 'cupones'].forEach((k) => { club[k] = cIn[k] !== false; });
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
      // Cupones: imagen (URL) obligatoria; se guarda /api/push?img=<id> | /img/... | https://...
      const urlImg = (v) => {
        const s = txt(v, 200);
        return /^(\/api\/push\?img=[a-z0-9]+|\/img\/|https?:\/\/)/i.test(s) ? s : '';
      };
      const cupones = (Array.isArray(b.cupones) ? b.cupones : []).map((c) => ({
        id: txt(c.id, 20).replace(/[^a-z0-9]/gi, '') || nuevoId('cu'),
        titulo: txt(c.titulo, 80), codigo: txt(c.codigo, 40).toUpperCase(), imagen: urlImg(c.imagen), hasta: Number(c.hasta) || null,
      })).filter((c) => c.titulo && c.imagen).slice(0, 12);
      await redis(['SET', 'config:clubcupones', JSON.stringify(cupones)]);
      // Banners de publicidad del carrusel de /mi-cuenta (imagen opcional: sin ella la web
      // pinta una tarjeta degradada con el título). El enlace solo acepta /ruta interna o https.
      const urlDestino = (v) => {
        const s = txt(v, 200);
        return /^(\/[a-z0-9?=&_./-]*|https?:\/\/\S+)$/i.test(s) ? s : '';
      };
      const banners = (Array.isArray(b.banners) ? b.banners : []).map((bn) => ({
        id: txt(bn.id, 20).replace(/[^a-z0-9]/gi, '') || nuevoId('cb'),
        titulo: txt(bn.titulo, 80), texto: txt(bn.texto, 160), imagen: urlImg(bn.imagen),
        url: urlDestino(bn.url), hasta: Number(bn.hasta) || null,
      })).filter((bn) => bn.titulo || bn.imagen).slice(0, 8);
      await redis(['SET', 'config:clubbanners', JSON.stringify(banners)]);
      return res.status(200).json({ ok: true, club, promos, sorteos, cupones, banners });
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
      const datos = await redis(['GET', 'config:webdatos']);
      const traw = await redis(['GET', 'config:webtemporadas']);
      let temporadas = [];
      if (traw) { try { temporadas = JSON.parse(traw) || []; } catch (e) { temporadas = []; } }
      const temporada = await redis(['GET', 'config:webtemporada']);
      const fraw = await redis(['GET', 'config:webfaq']);
      let faq = [];
      if (fraw) { try { faq = JSON.parse(fraw) || []; } catch (e) { faq = []; } }
      return res.status(200).json({
        on: webchat !== '0',
        saludo: ui.saludo || '',
        botones: Array.isArray(ui.botones) ? ui.botones : [],
        invitacion: ui.invitacion || '',
        subtitulo: ui.subtitulo || '',
        prompt: webprompt || '',
        promptDefault: MISION_CAPTADOR,
        reglas: REGLAS_WEB,
        datos: datos || '',
        faq: Array.isArray(faq) ? faq : [],
        temporadas: Array.isArray(temporadas) ? temporadas : [],
        temporada: temporada || '',
        apagado: ui.apagado || '',
        limite: ui.limite || '',
        errtec: ui.errtec || '',
      });
    }
    if (b.action === 'setwebchat') {
      const txt = (s, n) => (s == null ? '' : String(s)).trim().slice(0, n);
      const mmdd = (s) => { const v = txt(s, 5); return /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v) ? v : ''; };
      const ui = {};
      const saludo = txt(b.saludo, 500);
      const invitacion = txt(b.invitacion, 60);
      const subtitulo = txt(b.subtitulo, 60);
      const botones = (Array.isArray(b.botones) ? b.botones : []).map((s) => txt(s, 48)).filter(Boolean).slice(0, 4);
      const apagado = txt(b.apagado, 200);
      const limite = txt(b.limite, 200);
      const errtec = txt(b.errtec, 200);
      if (saludo) ui.saludo = saludo;
      if (botones.length) ui.botones = botones;
      if (invitacion) ui.invitacion = invitacion;
      if (subtitulo) ui.subtitulo = subtitulo;
      if (apagado) ui.apagado = apagado;
      if (limite) ui.limite = limite;
      if (errtec) ui.errtec = errtec;
      // Campo vacío = la web vuelve a su texto por defecto (nada queda guardado de más)
      if (Object.keys(ui).length) await redis(['SET', 'config:webchatui', JSON.stringify(ui)]);
      else await redis(['DEL', 'config:webchatui']);
      const webprompt = txt(b.prompt, 20000);
      if (webprompt) await redis(['SET', 'config:webprompt', webprompt]);
      else await redis(['DEL', 'config:webprompt']);
      // Ficha de datos oficiales del negocio (verdad para el bot, anti-invención)
      const datos = txt(b.datos, 4000);
      if (datos) await redis(['SET', 'config:webdatos', datos]);
      else await redis(['DEL', 'config:webdatos']);
      // Respuestas oficiales a preguntas frecuentes (el bot responde con esa info, no improvisa)
      const faq = (Array.isArray(b.faq) ? b.faq : []).slice(0, 30).map((f) => {
        f = f || {};
        return { q: txt(f.q, 200), r: txt(f.r, 500) };
      }).filter((f) => f.q && f.r);
      if (faq.length) await redis(['SET', 'config:webfaq', JSON.stringify(faq)]);
      else await redis(['DEL', 'config:webfaq']);
      // Temporadas / campañas: cada una con sus textos + instrucciones + fechas (MM-DD)
      const temporadas = (Array.isArray(b.temporadas) ? b.temporadas : []).slice(0, 12).map((t) => {
        t = t || {};
        const tb = (Array.isArray(t.botones) ? t.botones : []).map((s) => txt(s, 48)).filter(Boolean).slice(0, 4);
        return {
          id: txt(t.id, 24) || ('t' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)),
          nombre: txt(t.nombre, 40),
          desde: mmdd(t.desde),
          hasta: mmdd(t.hasta),
          saludo: txt(t.saludo, 500),
          botones: tb,
          subtitulo: txt(t.subtitulo, 60),
          invitacion: txt(t.invitacion, 60),
          extra: txt(t.extra, 3000),
        };
      }).filter((t) => t.nombre);
      if (temporadas.length) await redis(['SET', 'config:webtemporadas', JSON.stringify(temporadas)]);
      else await redis(['DEL', 'config:webtemporadas']);
      // Temporada activa: '' ninguna · 'auto' por fechas · '<id>' forzada a mano
      let temporada = txt(b.temporada, 24);
      if (temporada && temporada !== 'auto' && !temporadas.some((t) => t.id === temporada)) temporada = '';
      if (temporada) await redis(['SET', 'config:webtemporada', temporada]);
      else await redis(['DEL', 'config:webtemporada']);
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
        carGeoNota: 220, carDirFalta: 200,
        // Copys de compartir producto (mensaje de chat, preview OG e imagen del estado)
        compChat: 160, compOg: 200, compLema: 60, compCintillo: 90, compCta: 60, compSinPrecio: 80,
      };
      Object.keys(campos).forEach((k) => { const v = txt(b[k], campos[k]); if (v) s[k] = v; });
      // ⏱ Parpadeo del producto compartido: segundos enteros 0–30 (0 = sin parpadeo); vacío = default
      const bseg = txt(b.compBrilloSeg, 6);
      if (bseg !== '' && Number.isFinite(Number(bseg))) s.compBrilloSeg = String(Math.max(0, Math.min(30, Math.round(Number(bseg)))));
      ['facebook', 'instagram', 'youtube'].forEach((k) => { const v = url(b[k]); if (v) s[k] = v; });
      // Campo vacío = vuelve al texto por defecto de site.js (no se guarda nada de más)
      if (Object.keys(s).length) await redis(['SET', 'config:sitio', JSON.stringify(s)]);
      else await redis(['DEL', 'config:sitio']);
      return res.status(200).json({ ok: true, s });
    }

    // --- 🎉 Popup principal del inicio: config:popup (lo sirve /api/sitio como p) ---
    // { on, titulo, sub, video, fecha, falta, despues, barra, desde, hasta, frec, botones[≤3] }.
    // Campo ausente = default de site.js (POPUP_DEF = campaña de Fiestas Patrias).
    if (b.action === 'getpopup') {
      const raw = await redis(['GET', 'config:popup']);
      let p = {};
      if (raw) { try { p = JSON.parse(raw) || {}; } catch (e) {} }
      return res.status(200).json({ p });
    }
    if (b.action === 'setpopup') {
      const txt = (v, n) => (v == null ? '' : String(v)).trim().slice(0, n);
      const ddmm = (v) => {
        const m = /^(\d{1,2})\/(\d{1,2})$/.exec(txt(v, 5));
        if (!m) return '';
        const d = +m[1], mes = +m[2];
        if (d < 1 || d > 31 || mes < 1 || mes > 12) return '';
        return (d < 10 ? '0' + d : '' + d) + '/' + (mes < 10 ? '0' + mes : '' + mes);
      };
      const ruta = (v) => { const u = txt(v, 300); return u === 'no' || u.startsWith('/') || /^https?:\/\//i.test(u) ? u : ''; };
      const p = {};
      if (b.on === '0') p.on = '0';
      const campos = { titulo: 80, sub: 160, falta: 80, despues: 80, barra: 200 };
      Object.keys(campos).forEach((k) => { const v = txt(b[k], campos[k]); if (v) p[k] = v; });
      const video = ruta(b.video); if (video) p.video = video;
      // 'no' = quitar (sin countdown / sin límite de fechas); vacío = el default de site.js
      ['fecha', 'desde', 'hasta'].forEach((k) => {
        if (txt(b[k], 5).toLowerCase() === 'no') { p[k] = 'no'; return; }
        const v = ddmm(b[k]); if (v) p[k] = v;
      });
      if (b.frec === 'siempre') p.frec = 'siempre';
      const botones = (Array.isArray(b.botones) ? b.botones : []).slice(0, 3)
        .map((bt) => {
          if (!bt || typeof bt !== 'object') return null;
          const t = txt(bt.txt, 60);
          const u = txt(bt.url, 200);
          if (!t || !u || (!u.startsWith('/') && !/^https?:\/\//i.test(u))) return null;
          return { txt: t, url: u, estilo: bt.estilo === 'blanco' ? 'blanco' : 'rojo' };
        }).filter(Boolean);
      if (botones.length) p.botones = botones;
      // Todo vacío = vuelve a la campaña por defecto de site.js
      if (Object.keys(p).length) await redis(['SET', 'config:popup', JSON.stringify(p)]);
      else await redis(['DEL', 'config:popup']);
      return res.status(200).json({ ok: true, p });
    }

    // --- 🔤 Tipografía global del sitio: config:tipo (la sirve /api/sitio como t) ---
    // { titulos, cuerpo, escala, pesoTit, interlineado, espaciado }. Campo ausente = default
    // de site.css. Fuentes solo de la lista blanca (site.js tiene la misma).
    if (b.action === 'gettipo') {
      const raw = await redis(['GET', 'config:tipo']);
      let t = {};
      if (raw) { try { t = JSON.parse(raw) || {}; } catch (e) {} }
      return res.status(200).json({ t });
    }
    if (b.action === 'settipo') {
      const FUENTES = ['Montserrat', 'Poppins', 'Lato', 'Playfair Display', 'Georgia'];
      const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
      const t = {};
      if (FUENTES.includes(b.titulos)) t.titulos = b.titulos;
      if (FUENTES.includes(b.cuerpo)) t.cuerpo = b.cuerpo;
      const esc = num(b.escala, 0.9, 1.2); if (esc !== null) t.escala = esc;
      const lh = num(b.interlineado, 1.3, 2); if (lh !== null) t.interlineado = lh;
      const ls = num(b.espaciado, 0.1, 3); if (ls !== null) t.espaciado = ls;
      const peso = num(b.pesoTit, 600, 800);
      if (peso === 600 || peso === 700 || peso === 800) t.pesoTit = peso;
      if (Object.keys(t).length) await redis(['SET', 'config:tipo', JSON.stringify(t)]);
      else await redis(['DEL', 'config:tipo']);
      return res.status(200).json({ ok: true, t });
    }

    // --- Fondos editables de las secciones y las tarjetas: config:fondos ---
    // { fondos: { "<clave>": { t:'solido'|'lineal'|'radial', c1, c2, c3?, a? } } }
    // Se guarda el modelo (lo repinta el panel) + el `css` ya armado (lo aplica site.js como
    // variable --bg-<clave>). El CSS se arma AQUÍ desde colores #rrggbb y un ángulo entero:
    // así el valor que llega al navegador es seguro por construcción (nada de url() ni inyección).
    if (b.action === 'getfondos') {
      const raw = await redis(['GET', 'config:fondos']);
      let f = {};
      if (raw) { try { f = JSON.parse(raw) || {}; } catch (e) {} }
      return res.status(200).json({ f });
    }
    if (b.action === 'setfondos') {
      const fondos = b.fondos && typeof b.fondos === 'object' ? b.fondos : {};
      const out = {};
      FONDO_CLAVES.forEach((k) => { const f = normFondo(fondos[k]); if (f) out[k] = f; });
      // Sin override (tipo "el de siempre") = se borra y manda el default de site.css
      if (Object.keys(out).length) await redis(['SET', 'config:fondos', JSON.stringify(out)]);
      else await redis(['DEL', 'config:fondos']);
      return res.status(200).json({ ok: true, f: out });
    }

    // --- Videos del hero de cada categoría: config:videos (los sirve /api/precios como v) ---
    // { videos: { "<slug>": { v:'no'|'/img/videos/x.mp4'|'https://…', t:'Título', s:'Subtítulo' } } }
    // Campo vacío = default del catálogo (no se guarda nada de más); sin overrides se borra la clave.
    if (b.action === 'getvideos') {
      const raw = await redis(['GET', 'config:videos']);
      let v = {};
      if (raw) { try { v = JSON.parse(raw) || {}; } catch (e) {} }
      return res.status(200).json({ v, subidos: await getVidSubidos() });
    }
    if (b.action === 'setvideos') {
      const entrada = b.videos && typeof b.videos === 'object' ? b.videos : {};
      const out = {};
      Object.keys(entrada).slice(0, 40).forEach((slug) => {
        if (!/^[a-z0-9-]{1,40}$/.test(slug)) return;
        const e = entrada[slug] || {};
        const o = {};
        const src = (e.v == null ? '' : String(e.v)).trim().slice(0, 300);
        if (src === 'no' || /^\/img\/videos\/[a-z0-9._-]+\.mp4$/i.test(src) ||
            /^\/api\/precios\?vid=[a-z0-9]+$/i.test(src) || /^https:\/\/\S+$/i.test(src)) o.v = src;
        const t = (e.t == null ? '' : String(e.t)).trim().slice(0, 60);
        const s = (e.s == null ? '' : String(e.s)).trim().slice(0, 90);
        if (t) o.t = t;
        if (s) o.s = s;
        if (Object.keys(o).length) out[slug] = o;
      });
      if (Object.keys(out).length) await redis(['SET', 'config:videos', JSON.stringify(out)]);
      else await redis(['DEL', 'config:videos']);
      return res.status(200).json({ ok: true, v: out });
    }

    // --- 🧩 Combos de venta cruzada: config:comple (lo sirve /api/precios como c, lo pinta site.js) ---
    // { on: true|false, car: true|false, cats: { "<slug>": {off:1} | {t?,s?,prods?:[nombres]} } }
    // Slug ausente = sección automática (pareo COMPLE_AUTO de site.js) · off = sin sección en esa página ·
    // prods = el combo que armó el dueño (nombres exactos del catálogo o de config:prodextra).
    // on:'0' = interruptor GENERAL apagado (ni secciones ni carrito, sin perder la configuración) ·
    // car:'0' apaga solo las sugerencias del carrito ("el toque final"); sin overrides se borra la clave.
    if (b.action === 'getcomple') {
      const raw = await redis(['GET', 'config:comple']);
      let c = {};
      if (raw) { try { c = JSON.parse(raw) || {}; } catch (e) {} }
      // extras = productos subidos desde el panel, para que el buscador del combo también los ofrezca
      return res.status(200).json({ c, extras: await getExtras() });
    }
    if (b.action === 'setcomple') {
      const validos = new Set(PRODUCTOS.map((p) => p.n));
      (await getExtras()).forEach((e) => { if (e && e.nombre) validos.add(e.nombre); });
      const entrada = b.cats && typeof b.cats === 'object' ? b.cats : {};
      const cats = {};
      Object.keys(entrada).slice(0, 40).forEach((slug) => {
        if (!/^[a-z0-9-]{1,40}$/.test(slug)) return;
        const e = entrada[slug] || {};
        if (e.off) { cats[slug] = { off: 1 }; return; }
        const o = {};
        const t = (e.t == null ? '' : String(e.t)).trim().slice(0, 80);
        const s = (e.s == null ? '' : String(e.s)).trim().slice(0, 140);
        if (t) o.t = t;
        if (s) o.s = s;
        const prods = Array.isArray(e.prods)
          ? e.prods.map((n) => String(n || '').trim()).filter((n) => n && validos.has(n))
          : [];
        if (prods.length) o.prods = [...new Set(prods)].slice(0, 8);
        if (Object.keys(o).length) cats[slug] = o; // personalizado sin nada = vuelve a automático
      });
      const out = {};
      if (b.on === false || b.on === 0 || b.on === '0') out.on = '0';
      if (b.car === false || b.car === 0 || b.car === '0') out.car = '0';
      if (Object.keys(cats).length) out.cats = cats;
      if (Object.keys(out).length) await redis(['SET', 'config:comple', JSON.stringify(out)]);
      else await redis(['DEL', 'config:comple']);
      return res.status(200).json({ ok: true, c: out });
    }

    // --- 🛒 Apariencia del carrito "Tu pedido": config:carrito (lo sirve /api/sitio como k) ---
    // { txt:{titulo,nota,toqueTit,sumar,enviar,ver}, tam:{titulo,nota,toqueTit,item,sumar,total,enviar},
    //   toqueBg:{t,c1,..,css}, toqueTitCol:'#rrggbb', btnSumar:{t,c1,..,css}, btnSumarTxt:'#rrggbb',
    //   fx:{typing:1|0, brillo:1|0} }
    // Campo ausente = default de site.js/site.css. Los colores los ARMA normFondo (seguro por construcción),
    // igual que los fondos; los tamaños son una escala 0.8–1.5 que site.css multiplica por el px base (se
    // adapta igual en móvil y escritorio porque el modal es una tarjeta de ancho fijo).
    if (b.action === 'getcarrito') {
      const raw = await redis(['GET', 'config:carrito']);
      let k = {};
      if (raw) { try { k = JSON.parse(raw) || {}; } catch (e) {} }
      return res.status(200).json({ k });
    }
    if (b.action === 'setcarrito') {
      const hex = (v) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : '');
      const txt = (v, n) => (v == null ? '' : String(v)).trim().slice(0, n);
      const esc = (v, n) => txt(v, n).replace(/[<>]/g, ''); // los textos van como textContent, pero limpiamos igual
      const out = {};
      // Textos (vacío = default)
      const T = b.txt && typeof b.txt === 'object' ? b.txt : {};
      const to = {};
      const tCampos = { titulo: 40, nota: 160, toqueTit: 60, sumar: 24, enviar: 50, ver: 40 };
      Object.keys(tCampos).forEach((c) => { const v = esc(T[c], tCampos[c]); if (v) to[c] = v; });
      if (Object.keys(to).length) out.txt = to;
      // Tamaños (escala; distinto de 1 = se guarda)
      const Z = b.tam && typeof b.tam === 'object' ? b.tam : {};
      const za = {};
      ['titulo', 'nota', 'toqueTit', 'item', 'sumar', 'total', 'enviar'].forEach((c) => {
        let n = Number(Z[c]);
        if (!Number.isFinite(n)) return;
        n = Math.min(1.5, Math.max(0.8, Math.round(n * 100) / 100));
        if (n !== 1) za[c] = n;
      });
      if (Object.keys(za).length) out.tam = za;
      // Colores / degradados (reutiliza normFondo: guarda modelo + css)
      const bgT = normFondo(b.toqueBg); if (bgT) out.toqueBg = bgT;
      const bgB = normFondo(b.btnSumar); if (bgB) out.btnSumar = bgB;
      const tc = hex(b.toqueTitCol); if (tc) out.toqueTitCol = tc;
      const bt = hex(b.btnSumarTxt); if (bt) out.btnSumarTxt = bt;
      // Efectos
      const fx = {};
      if (b.fx && typeof b.fx === 'object') {
        if (b.fx.typing) fx.typing = 1;
        if (b.fx.brillo) fx.brillo = 1;
        // Velocidad del brillo: segundos por vuelta (2–15; 5 = default, no se guarda)
        const bseg = Math.round(Number(b.fx.brilloSeg));
        if (Number.isFinite(bseg) && bseg >= 2 && bseg <= 15 && bseg !== 5) fx.brilloSeg = bseg;
        // Color del brillo (#rrggbb; el default dorado #d4a941 no se guarda)
        const bcol = hex(b.fx.brilloCol);
        if (bcol && bcol !== '#d4a941') fx.brilloCol = bcol;
      }
      if (Object.keys(fx).length) out.fx = fx;
      if (Object.keys(out).length) await redis(['SET', 'config:carrito', JSON.stringify(out)]);
      else await redis(['DEL', 'config:carrito']);
      return res.status(200).json({ ok: true, k: out });
    }

    // --- 📤 Subida de videos desde el panel, en trozos (el navegador los comprime antes) ---
    // Flujo: vidini (valida y reserva id) → vidchunk ×n (base64, TTL 1h por si se corta) →
    // vidfin (verifica que estén todos y que sea un MP4, los vuelve permanentes y los anota
    // en config:vidsubidos). Los sirve GET /api/precios?vid=<id> con caché inmutable y Range.
    if (b.action === 'vidini') {
      const chunks = Number(b.chunks);
      if (!Number.isInteger(chunks) || chunks < 1 || chunks > VID_MAX_CHUNKS) {
        return res.status(400).json({ error: 'El video pesa demasiado: máximo 3.5 MB ya comprimido.' });
      }
      if ((await getVidSubidos()).length >= VID_MAX_SUBIDOS) {
        return res.status(400).json({ error: 'Llegaste al tope de ' + VID_MAX_SUBIDOS + ' videos subidos: borra alguno primero.' });
      }
      const id = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      return res.status(200).json({ ok: true, id });
    }
    if (b.action === 'vidchunk') {
      const id = String(b.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 24);
      const i = Number(b.i);
      const data = String(b.data || '');
      if (!id || !Number.isInteger(i) || i < 0 || i >= VID_MAX_CHUNKS) return res.status(400).json({ error: 'Trozo inválido.' });
      if (!data || data.length > VID_MAX_B64 || !/^[A-Za-z0-9+/=]+$/.test(data)) {
        return res.status(400).json({ error: 'Trozo de video inválido o demasiado grande.' });
      }
      await redis(['SET', 'vidext:' + id + ':' + i, data, 'EX', '3600']); // si la subida se corta, se limpia solo
      return res.status(200).json({ ok: true });
    }
    if (b.action === 'vidfin') {
      const id = String(b.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 24);
      const chunks = Number(b.chunks);
      const nombre = String(b.nombre || '').trim().slice(0, 40) || 'video';
      if (!id || !Number.isInteger(chunks) || chunks < 1 || chunks > VID_MAX_CHUNKS) return res.status(400).json({ error: 'Subida inválida.' });
      const subidos = await getVidSubidos();
      if (subidos.length >= VID_MAX_SUBIDOS) return res.status(400).json({ error: 'Llegaste al tope de ' + VID_MAX_SUBIDOS + ' videos subidos.' });
      const keys = [];
      for (let i = 0; i < chunks; i++) keys.push('vidext:' + id + ':' + i);
      const partes = (await redis(['MGET', ...keys])) || [];
      if (partes.some((p) => !p)) return res.status(400).json({ error: 'La subida quedó incompleta: intenta de nuevo.' });
      // Debe ser un MP4 de verdad ('ftyp' en los bytes 4-8) para que se reproduzca también en iPhone
      const cabecera = Buffer.from(String(partes[0]).slice(0, 24), 'base64');
      if (cabecera.length < 12 || cabecera.toString('latin1', 4, 8) !== 'ftyp') {
        for (const k of keys) await redis(['DEL', k]);
        return res.status(400).json({ error: 'El archivo no es un video MP4: expórtalo o conviértelo a .mp4.' });
      }
      let size = 0;
      for (const p of partes) size += Math.floor(String(p).length * 3 / 4);
      for (const k of keys) await redis(['PERSIST', k]); // ya está completo: se queda para siempre
      subidos.push({ id, nombre, n: chunks, size, ts: Date.now() });
      await redis(['SET', 'config:vidsubidos', JSON.stringify(subidos)]);
      return res.status(200).json({ ok: true, url: '/api/precios?vid=' + id, subidos });
    }
    if (b.action === 'viddel') {
      const id = String(b.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 24);
      const subidos = await getVidSubidos();
      const idx = subidos.findIndex((s) => s.id === id);
      if (idx < 0) return res.status(400).json({ error: 'Ese video ya no existe.' });
      const [muerto] = subidos.splice(idx, 1);
      for (let i = 0; i < (muerto.n || VID_MAX_CHUNKS); i++) await redis(['DEL', 'vidext:' + id + ':' + i]);
      if (subidos.length) await redis(['SET', 'config:vidsubidos', JSON.stringify(subidos)]);
      else await redis(['DEL', 'config:vidsubidos']);
      // Las páginas que usaban este video vuelven a su video de siempre
      const rawV = await redis(['GET', 'config:videos']);
      if (rawV) {
        try {
          const v = JSON.parse(rawV) || {};
          let cambio = false;
          Object.keys(v).forEach((k) => {
            if ((v[k] || {}).v === '/api/precios?vid=' + id) {
              delete v[k].v;
              if (!Object.keys(v[k]).length) delete v[k];
              cambio = true;
            }
          });
          if (cambio) {
            if (Object.keys(v).length) await redis(['SET', 'config:videos', JSON.stringify(v)]);
            else await redis(['DEL', 'config:videos']);
          }
        } catch (e) {}
      }
      return res.status(200).json({ ok: true, subidos });
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

    // --- Precios, stock y productos nuevos en vivo (sobre data/catalog.js; los lee /api/precios) ---
    if (b.action === 'getprecios') {
      const vals = (await redis(['MGET', 'config:precios', 'config:stock', 'config:prodextra'])) || [];
      let p = {}, s = {}, x = [];
      try { if (vals[0]) p = JSON.parse(vals[0]); } catch (e) {}
      try { if (vals[1]) s = JSON.parse(vals[1]); } catch (e) {}
      try { if (vals[2]) { const arr = JSON.parse(vals[2]); if (Array.isArray(arr)) x = arr; } } catch (e) {}
      return res.status(200).json({ p, s, x });
    }
    if (b.action === 'setprecio') {
      const clave = (b.clave || '').toString().slice(0, 200);
      if (!PRODUCTOS.some((pr) => pr.c + '|' + pr.n === clave)) {
        return res.status(400).json({ error: 'Producto no encontrado en el catálogo.' });
      }
      const raw = await redis(['GET', 'config:precios']);
      let p = {};
      if (raw) { try { p = JSON.parse(raw); } catch (e) {} }
      const val = normPrecio(b.precio);
      if (val === null) return res.status(400).json({ error: 'Precio inválido. Ejemplos: 85 o 85.50' });
      if (val === '') {
        delete p[clave]; // sin override -> vuelve el precio base del catálogo
      } else {
        p[clave] = val; // conserva los centavos (8.50 no se aplasta a 8.5)
      }
      await redis(['SET', 'config:precios', JSON.stringify(p)]);
      return res.status(200).json({ ok: true, p });
    }
    if (b.action === 'setstock') {
      // Estado en vivo de un producto: '' = se vende · 'agotado' = visible con sello · 'oculto' = no se muestra
      const clave = (b.clave || '').toString().slice(0, 200);
      const extras = await getExtras();
      const existe = PRODUCTOS.some((pr) => pr.c + '|' + pr.n === clave) ||
        extras.some((e) => e.cat + '|' + e.nombre === clave);
      if (!existe) return res.status(400).json({ error: 'Producto no encontrado en el catálogo.' });
      const estado = (b.estado || '').toString();
      if (estado && estado !== 'agotado' && estado !== 'oculto') {
        return res.status(400).json({ error: 'Estado inválido (vacío, agotado u oculto).' });
      }
      const raw = await redis(['GET', 'config:stock']);
      let s = {};
      if (raw) { try { s = JSON.parse(raw); } catch (e) {} }
      if (estado) s[clave] = estado; else delete s[clave];
      await redis(['SET', 'config:stock', JSON.stringify(s)]);
      return res.status(200).json({ ok: true, s });
    }
    if (b.action === 'addprod') {
      // Producto nuevo (o edición si viene id) desde el panel: vive en Redis, sin tocar el catálogo del repo
      const cat = (b.cat || '').toString().slice(0, 60);
      if (!PRODUCTOS.some((pr) => pr.c === cat)) return res.status(400).json({ error: 'Categoría no encontrada.' });
      const nombre = (b.nombre || '').toString().trim().slice(0, 120);
      if (nombre.length < 3) return res.status(400).json({ error: 'Escribe el nombre del producto (mínimo 3 letras).' });
      const seccion = (b.seccion || '').toString().slice(0, 120);
      const precio = normPrecio(b.precio); // '' = precio en tienda · conserva los centavos (8.50 no se vuelve 8.5)
      if (precio === null) {
        return res.status(400).json({ error: 'Precio inválido. Ejemplos: 85 o 85.50 (o déjalo vacío).' });
      }
      const extras = await getExtras();
      const id = (b.id || '').toString().slice(0, 24);
      const idx = id ? extras.findIndex((e) => e.id === id) : -1;
      if (id && idx < 0) return res.status(400).json({ error: 'Ese producto ya no existe (recarga la página).' });
      // El nombre identifica al producto en el carrito y los favoritos: no puede repetirse
      const nlc = nombre.toLowerCase();
      const repetido = PRODUCTOS.some((pr) => pr.n.toLowerCase() === nlc) ||
        extras.some((e, i) => i !== idx && (e.nombre || '').toLowerCase() === nlc);
      if (repetido) return res.status(400).json({ error: 'Ya existe un producto con ese nombre exacto.' });
      if (idx < 0 && extras.length >= 80) {
        return res.status(400).json({ error: 'Llegaste al tope de 80 productos añadidos: consolídalos al catálogo o borra alguno.' });
      }
      // Foto: dataURL ya comprimida por el panel → prodimg:<id>, la sirve /api/precios?img=<id>
      let img = idx >= 0 ? extras[idx].img : '';
      if (b.img) {
        const data = String(b.img);
        if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data) || data.length > 470000) {
          return res.status(400).json({ error: 'Formato de imagen inválido.' });
        }
        const iid = 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        await redis(['SET', 'prodimg:' + iid, data]);
        const vieja = img.match(/^\/api\/precios\?img=([a-z0-9]+)$/i);
        if (vieja) await redis(['DEL', 'prodimg:' + vieja[1]]);
        img = '/api/precios?img=' + iid;
      }
      if (!img) return res.status(400).json({ error: 'Falta la foto del producto.' });
      const item = {
        id: idx >= 0 ? extras[idx].id : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        cat, sec: seccion, nombre, precio, img, ts: idx >= 0 ? extras[idx].ts : Date.now(),
      };
      if (idx >= 0) {
        // Si cambió el nombre, el estado de stock guardado sigue al producto
        if (extras[idx].nombre !== nombre || extras[idx].cat !== cat) {
          const rawS = await redis(['GET', 'config:stock']);
          let s = {};
          if (rawS) { try { s = JSON.parse(rawS); } catch (e) {} }
          const viejaClave = extras[idx].cat + '|' + extras[idx].nombre;
          if (s[viejaClave]) { s[cat + '|' + nombre] = s[viejaClave]; delete s[viejaClave]; await redis(['SET', 'config:stock', JSON.stringify(s)]); }
        }
        extras[idx] = item;
      } else {
        extras.push(item);
      }
      await redis(['SET', 'config:prodextra', JSON.stringify(extras)]);
      return res.status(200).json({ ok: true, x: extras });
    }
    if (b.action === 'delprod') {
      const id = (b.id || '').toString().slice(0, 24);
      const extras = await getExtras();
      const idx = extras.findIndex((e) => e.id === id);
      if (idx < 0) return res.status(400).json({ error: 'Ese producto ya no existe.' });
      const [e] = extras.splice(idx, 1);
      const m = (e.img || '').match(/^\/api\/precios\?img=([a-z0-9]+)$/i);
      if (m) await redis(['DEL', 'prodimg:' + m[1]]);
      // Limpia su estado de stock si lo tenía
      const rawS = await redis(['GET', 'config:stock']);
      if (rawS) {
        try {
          const s = JSON.parse(rawS);
          if (s[e.cat + '|' + e.nombre] !== undefined) { delete s[e.cat + '|' + e.nombre]; await redis(['SET', 'config:stock', JSON.stringify(s)]); }
        } catch (er) {}
      }
      await redis(['SET', 'config:prodextra', JSON.stringify(extras)]);
      return res.status(200).json({ ok: true, x: extras });
    }

    // --- Analítica del sitio ---
    // b.dias = 7 | 14 | 30 (default 7). Devuelve, además de los totales históricos
    // (events/pages/refs), las SERIES DIARIAS del período para los eventos clave
    // (stat:<ev>:<day>, los escribe /api/track) y el total del período ANTERIOR
    // de cada uno (prev) para que el panel muestre la variación ▲/▼.
    if (b.action === 'stats') {
      const dias = [7, 14, 30].indexOf(Number(b.dias)) >= 0 ? Number(b.dias) : 7;
      const SERIE_EVS = ['pageview', 'pedido_enviado', 'whatsapp_click', 'llamada_click',
        'chatweb_abierto', 'compartir_chat', 'compartir_estado', 'compartir_link',
        'comple_elegir', 'comple_carrito', 'club_login', 'club_cuenta', 'push_click'];
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
      // 2×dias días: la primera mitad es el período anterior (para comparar), la segunda el actual
      const days = [];
      for (let i = dias * 2 - 1; i >= 0; i--) days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
      const claves = [];
      SERIE_EVS.forEach((ev) => days.forEach((d) => claves.push('stat:' + ev + ':' + d)));
      const vals = (await redis(['MGET', ...claves])) || [];
      const series = {}, prev = {};
      SERIE_EVS.forEach((ev, i) => {
        const base = i * days.length;
        let ant = 0;
        const cur = [];
        days.forEach((d, j) => {
          const n = Number(vals[base + j] || 0);
          if (j < dias) ant += n; else cur.push({ day: d, n });
        });
        series[ev] = cur;
        prev[ev] = ant;
      });
      // daily = serie de pageviews del período (compatibilidad: la usa la tarjeta de Inicio)
      return res.status(200).json({ events: evTotals, pages: pageCounts, refs: refCounts, daily: series.pageview, dias, series, prev });
    }

    // --- Reiniciar los datos para estrenar el dominio oficial ---
    // Borra las MÉTRICAS y TODOS los datos de actividad de prueba, SIN tocar productos ni
    // configuración (precios, stock, textos, fondos, videos, combos, carrito, prompts del bot,
    // promos/sorteos DEFINIDOS, interruptores del Club, fotos/videos subidos, suscripciones push).
    // Segunda barrera además del pass: hay que mandar confirm === 'REINICIAR'.
    if (b.action === 'reset') {
      if (String(b.confirm || '') !== 'REINICIAR') {
        return res.status(400).json({ error: 'Para reiniciar, escribe REINICIAR tal cual.' });
      }
      // Claves de nombre variable → se enumeran con SCAN por patrón.
      const PATRONES = [
        'stat:*',        // TODA la analítica: visitas, eventos, páginas, orígenes y series diarias
        'lead:*',        // conversaciones de WhatsApp
        'cliente:*',     // cuentas del Club (PIN/puntos/favoritos/direcciones) + archivo de consumo
        'uid:*',         // token de dispositivo → teléfono (reconocer al cliente que vuelve)
        'sess:*',        // sesiones abiertas del Club
        'sorteo:*',      // participantes de cada sorteo (la definición vive en config:sorteos y se conserva)
        'baja:*',        // tokens de baja de correo (apuntan a clientes que se borran)
        'pinrl:*', 'pregrl:*', 'chatrl:*', 'reccode:*', 'reccodetry:*', // frenos/temporales
      ];
      // Claves fijas (LIST/ZSET): actividad e historiales, no configuración.
      const FIJAS = ['pedidos', 'leads', 'clientes', 'consultas', 'preguntas', 'pushlog', 'correolog'];
      const detalle = {};
      let total = 0;
      for (const pat of PATRONES) {
        const ks = await scanKeys(pat);
        const n = ks.length ? await delKeys(ks) : 0;
        if (n) { detalle[pat] = n; total += n; }
      }
      const nf = await delKeys(FIJAS);
      if (nf) { detalle.listas = nf; total += nf; }
      return res.status(200).json({ ok: true, total, detalle });
    }

    return res.status(400).json({ error: 'Acción desconocida.' });
  } catch (e) {
    console.error('CRM error', e);
    return res.status(500).json({ error: e.message || 'Error interno.' });
  }
};
