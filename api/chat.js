// Chat vendedor DENTRO de la web (widget flotante de assets/site.js).
//   GET  -> { on, saludo?, botones?, invitacion?, subtitulo? }  ¿se muestra? + textos editables
//   POST { sid, mensajes:[{role,text}] } -> { reply, sugerencias:[...] } (botones de respuesta rápida)
// Cerebro INDEPENDIENTE del de WhatsApp si el dueño escribió uno (Redis config:webprompt,
// panel → 💬 Chat de la web); si no, usa el de WhatsApp (config:prompt). Tres herramientas:
// buscar_productos (catálogo por texto y/o categoría + precios en vivo de config:precios),
// registrar_pedido (guarda en la lista `pedidos` como /api/pedido y avisa al dueño por
// WhatsApp) y registrar_consulta (preguntas que el bot no pudo responder → lista `consultas`
// + aviso al dueño, para que el equipo las revise).
// Así el bot CIERRA la venta sin que el cliente salga de la página.
// La conversación vive en el navegador (sessionStorage): aquí no se guarda el historial.

const MODEL = process.env.ARAKAKI_BOT_MODEL || 'claude-haiku-4-5-20251001';
const GRAPH = 'https://graph.facebook.com/v21.0';

const { DEFAULT_PROMPT } = require('./_prompt');
const { PRODUCTOS } = require('./_catalogo');
const { pushDuenos } = require('./_push.js');

// Categorías del catálogo (en orden de aparición), para que el bot conozca TODO el surtido.
const CATEGORIAS = [];
PRODUCTOS.forEach((pr) => { if (CATEGORIAS.indexOf(pr.c) < 0) CATEGORIAS.push(pr.c); });

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

// Cerebro del chat web, INDEPENDIENTE del de WhatsApp (panel → ⚙️ Bot → 💬 Chat de la web):
// si el dueño escribió un config:webprompt, ese texto manda el tono; si está vacío, usa la
// MISIÓN por defecto: captar suscriptores (avisos push + correo + WhatsApp), NO vender.
async function getPromptWeb() {
  let base = MISION_CAPTADOR;
  let extra = '';
  if (HAS_REDIS) {
    const propio = await redis(['GET', 'config:webprompt']);
    if (propio) base = propio;
    // Si el Club está activo (config:club, panel → 👥 Club), el bot conoce /mi-cuenta
    try {
      const raw = await redis(['GET', 'config:club']);
      const club = raw ? (JSON.parse(raw) || {}) : {};
      if (club.login !== false) extra = REGLA_CUENTA;
    } catch (e) {}
  }
  return base + REGLAS_WEB + extra;
}

// Se anexa al prompt SOLO cuando el Club está activo (interruptor en panel → 👥 Club).
const REGLA_CUENTA = `

## Cuenta del cliente (Club Arakaki)
- En /mi-cuenta el cliente crea GRATIS su cuenta (celular + PIN) y accede a: sus productos favoritos ⭐, puntos por sus compras 🪙, promos exclusivas 🎁 y sorteos 🎟️.
- Si pregunta por su cuenta, sus puntos, sus favoritos, las promos del club o los sorteos, mándalo a /mi-cuenta (escribe la ruta tal cual y se vuelve link).
- Menciónalo como beneficio cuando venga al caso: es otra buena razón para dejarte sus datos.`;

// Misión por defecto del chat web: orientar y PERSUADIR para suscribirse a los avisos.
// NO vende: si el dueño quiere otro comportamiento, lo escribe en config:webprompt (panel).
const MISION_CAPTADOR = `Eres el asistente virtual del *Minimarket Arakaki* (bodega en Lima, Perú) dentro de su página web.

# Tu ÚNICA misión
Orientar brevemente al visitante y, sobre todo, PERSUADIRLO con calidez para que:
1. Active las *notificaciones gratis* (avisos push) del navegador.
2. Te deje su *WhatsApp*.
3. Te deje su *correo electrónico*.
Así recibirá primero nuestras promociones, ofertas especiales, anuncios, sorteos y nuevos lanzamientos.

# NO vendes (casi absoluto)
- NO tomas pedidos NUEVOS desde cero, NO armas carritos a mano, NO negocias ni cotizas precios. Aquí NO se vende.
- ÚNICA excepción: un cliente que YA te conoce y quiere REPETIR su pedido ("lo de siempre") — mira "Recompra rápida" en las reglas.
- Si preguntan por un producto, un precio o si hay algo: NO lo cotices. Con gusto diles que pueden verlo con su precio en la página de su categoría y pásales la ruta (ej. /vinos, /piscos, /helados). Usa buscar_productos SOLO para saber a qué categoría mandarlos. Luego aprovecha para invitarlos a activar los avisos y dejar sus datos.

# Cómo persuades (cálido, nunca insistente ni pesado)
- Resalta el beneficio: enterarse *antes que nadie* de ofertas, descuentos y novedades; es *gratis* y sin spam.
- Ofrece activar las notificaciones con un toque (mira las reglas técnicas: marcador [[PUSH]]).
- Pide el WhatsApp y el correo de forma natural; cuando te los den, regístralos con registrar_suscriptor y agradéceles.
- Tono peruano, amable, cercano, con emojis. Mensajes cortos.`;

// Reglas técnicas del chat web: se cumplen SIEMPRE, sea cual sea la personalidad del cerebro.
const REGLAS_WEB = `

# Reglas del chat web (obligatorias, sea cual sea tu personalidad)
El cliente te escribe desde el chat de www.minimarketarakaki.com.

## Catálogo y categorías
- Categorías disponibles: ${CATEGORIAS.join(', ')}.
- buscar_productos: úsala para saber en qué categoría está lo que preguntan y mandarlos a la página correcta. NO la uses para cotizar ni cerrar ventas.
- Escribe la ruta de la categoría tal cual (ej. /pisco, /whisky, /helados) y el chat la convierte en link. Ahí el cliente ve los productos y sus precios.
- PROHIBIDO inventar precios, stock, ingredientes, tamaños o cualquier dato que no conozcas con certeza.

## Suscribir a los avisos push (con un toque)
- Cuando el cliente muestre interés en enterarse de ofertas, incluye en tu respuesta una línea con exactamente [[PUSH]] (sola, en su propio renglón). La web mostrará un botón "🔔 Activar avisos gratis" que lo suscribe al instante.
- No pongas [[PUSH]] en cada mensaje: úsalo cuando venga al caso (te dice que sí, o pregunta cómo enterarse de las ofertas).

## Dejar WhatsApp y correo
- registrar_suscriptor: cuando el cliente te dé su WhatsApp y/o su correo, regístralo (manda lo que tengas: whatsapp, email y nombre si lo dio). Confirma con un agradecimiento corto.
- Si te dio solo uno de los dos, invítalo con suavidad a dejar también el otro. Nunca inventes ni asumas un dato que no te dieron.

## Recompra rápida ("lo de siempre") — EXCEPCIÓN al "no vender"
- Si el cliente pide repetir su pedido, dice "lo de siempre", "mi lista", "lo de la otra vez" o similar: usa pedido_habitual para traer sus productos habituales y propóneselos claros y cortos (nombre y precio si lo hay).
- Si te confirma, cierra el pedido con registrar_pedido (usa el nombre, teléfono y dirección que trae el perfil). Confirma con un mensaje corto y cálido.
- Si pedido_habitual dice que NO lo reconoces o no tiene lista guardada: dile con amabilidad que aún no tiene una lista guardada, que arme su pedido en la página y que la próxima vez se la tendrás lista. Aprovecha para invitarlo a los avisos.
- Esto es lo ÚNICO que cierras por aquí: para pedidos nuevos desde cero sigue orientando a la página de la categoría.

## Si no sabes algo
- registrar_consulta: si te preguntan un dato que no tienes o un producto que no encuentras, regístralo y dile al cliente que por WhatsApp (977 737 199) le damos respuesta personalizada.

## Estilo
- Mensajes CORTOS (2-5 líneas). *Negrita* con asteriscos simples; sin listas largas ni títulos.
- Separa las ideas con una línea en blanco: la web muestra cada párrafo como un mensaje aparte (como en WhatsApp). Máximo 3 párrafos por respuesta.

## Botones de respuesta rápida (última línea de CADA respuesta)
- Termina SIEMPRE con una línea que empiece con >>> y 2-3 opciones separadas por |, escritas como las diría el CLIENTE (son botones que él toca y se envían como su mensaje). Ej: >>> Sí, quiero los avisos | Te dejo mi WhatsApp | Ver productos
- Las opciones deben EMPUJAR hacia suscribirse a los avisos o dejar sus datos, o resolver la duda que naturalmente sigue. Nada genérico ni repetido.
- ÚNICA excepción: cuando le pidas un dato (WhatsApp o correo), no pongas la línea >>>.`;

// ---------- Herramientas del vendedor ----------

// Precio vigente de un producto: override en vivo (config:precios) > catálogo.
// Devuelve null si NO hay precio publicado (incluye "0" o vacío): eso se cotiza por WhatsApp.
function precioDe(pr, vivos) {
  const v = vivos[pr.c + '|' + pr.n];
  const p = (v == null || v === '') ? pr.p : v;
  return (p && Number(p) > 0) ? p : null;
}

// ¿La palabra buscada aparece en el texto? Tolera plural simple ("helados" encuentra "helado").
function coincide(base, w) {
  if (base.indexOf(w) >= 0) return true;
  return w.length > 3 && w.charAt(w.length - 1) === 's' && base.indexOf(w.slice(0, -1)) >= 0;
}

// Busca por palabras del nombre/categoría y/o lista una categoría completa.
async function buscarProductos(texto, categoria) {
  let lista = PRODUCTOS;
  if (categoria) {
    const slug = normalizar(categoria).replace(/^\//, '').trim().replace(/\s+/g, '-');
    if (CATEGORIAS.indexOf(slug) < 0) return { error: 'La categoría "' + categoria + '" no existe.', categorias: CATEGORIAS };
    lista = lista.filter((pr) => pr.c === slug);
  }
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
  if (!categoria && !palabras.length) return { error: 'Manda texto (palabras del producto) o categoria.', categorias: CATEGORIAS };
  if (palabras.length) {
    lista = lista.filter((pr) => {
      const base = normalizar(pr.n + ' ' + pr.c.replace(/-/g, ' '));
      return palabras.every((w) => coincide(base, w));
    });
  }
  const vivos = HAS_REDIS ? await getPreciosVivos() : {};
  const tope = categoria ? 30 : 10;
  const out = {
    resultados: lista.slice(0, tope).map((pr) => {
      const precio = precioDe(pr, vivos);
      return { nombre: pr.n, pagina: '/' + pr.c, precio: precio ? 'S/ ' + precio : null };
    }),
  };
  if (lista.length > tope) out.nota = 'Hay ' + (lista.length - tope) + ' productos más en la página de la categoría.';
  if (!out.resultados.length) { out.sin_resultados = true; out.categorias = CATEGORIAS; }
  return out;
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
    const precio = precioDe(prod, vivos);
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
    if ((await redis(['GET', 'config:notify'])) === '0') return;
    // Además del WhatsApp, push a los dispositivos del negocio (gratis; ver api/_push.js)
    try {
      const lin = text.replace(/\*/g, '').split('\n');
      await pushDuenos(lin[0], lin.slice(1).join('\n').trim());
    } catch (e) {}
    if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) return;
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

// "Lo de siempre": productos más comprados del cliente RECONOCIDO por su token de dispositivo
// (uid → cliente:<tel>, ver upsertPerfil de api/pedido.js), con precio vigente, para que el bot
// se los proponga y cierre con registrar_pedido. Sin uid o sin historial: guía al cliente.
async function pedidoHabitual(uid) {
  if (!uid) return { conocido: false, mensaje: 'No reconozco a este cliente todavía; no tiene una lista guardada. Invítalo a armar su pedido en la página; la próxima vez se la tendrás lista.' };
  const tel = await redis(['GET', 'uid:' + uid]);
  if (!tel) return { conocido: false, mensaje: 'Cliente no reconocido: aún no tiene lista guardada. Invítalo con amabilidad a hacer su primer pedido.' };
  const raw = await redis(['GET', 'cliente:' + tel]);
  let cli = null;
  if (raw) { try { cli = JSON.parse(raw); } catch (e) {} }
  if (!cli) return { conocido: false };
  const consumo = (cli.consumo && typeof cli.consumo === 'object') ? cli.consumo : {};
  const claves = Object.keys(consumo).sort((a, b) =>
    (consumo[b].veces - consumo[a].veces) || ((consumo[b].ultima || 0) - (consumo[a].ultima || 0)));
  if (!claves.length) return { conocido: true, nombre: cli.nombre || '', habitual: [], mensaje: 'El cliente aún no tiene productos habituales guardados.' };
  const vivos = HAS_REDIS ? await getPreciosVivos() : {};
  const habitual = claves.slice(0, 12).map((name) => {
    const pr = PRODUCTOS.find((p) => normalizar(p.n) === normalizar(name));
    const precio = pr ? precioDe(pr, vivos) : null;
    return { producto: name, veces: consumo[name].veces, precio: precio ? 'S/ ' + precio : null };
  });
  return {
    conocido: true,
    nombre: cli.nombre || '',
    direccion: cli.direccion || '',
    telefono: cli.telefono || tel,
    habitual: habitual,
    mensaje: 'Propón estos productos como "lo de siempre" (cortito). Si el cliente confirma, ciérralo con registrar_pedido usando el nombre y teléfono del perfil.',
  };
}

// Deja registrada una pregunta que el bot no pudo responder (lista `consultas` en Redis)
// y avisa a los dueños, para que el equipo la revise y complete el catálogo o el prompt.
async function registrarConsulta(input, sid) {
  const pregunta = limpio(input.pregunta, 300);
  if (!pregunta) return { error: 'Falta la pregunta del cliente.' };
  const producto = limpio(input.producto, 120);
  const consulta = {
    id: 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    pregunta,
    producto,
    sid: sid || '',
    ts: Date.now(),
  };
  await redis(['LPUSH', 'consultas', JSON.stringify(consulta)]);
  await redis(['LTRIM', 'consultas', '0', '199']);
  await redis(['INCR', 'stat:chatweb_consulta']);
  // Máximo 3 avisos por sesión para no bombardear al dueño desde un endpoint público.
  const n = await redis(['INCR', 'chatrl:q:' + sid]);
  if (Number(n) === 1) await redis(['EXPIRE', 'chatrl:q:' + sid, '7200']);
  if (Number(n || 0) <= 3) {
    await notifyOwner('❓ *Consulta sin respuesta en el CHAT de la web*' +
      (producto ? '\n📦 ' + producto : '') +
      '\n💬 "' + pregunta + '"' +
      '\n\nSi el cliente escribe por WhatsApp, ya sabes qué busca 📲');
  }
  return { ok: true, registrada: true, mensaje: 'Consulta registrada para revisión del equipo. Dile al cliente que quedó registrada y que por WhatsApp le damos respuesta personalizada.' };
}

// Guarda un suscriptor que dejó su WhatsApp y/o correo para recibir promos y novedades.
// Va a la MISMA base del Club Arakaki (cliente:<key>/clientes ZSET) que el panel ya muestra,
// con la clave = WhatsApp (código país 51) si lo hay, o 'e:<correo>' si solo dejó el correo.
async function registrarSuscriptor(input) {
  const nombre = limpio(input.nombre, 60);
  let email = limpio(input.email, 120).toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) email = '';
  let tel = limpio(input.whatsapp, 20).replace(/\D/g, '');
  if (tel && tel.length < 9) tel = '';
  if (!email && !tel) return { error: 'Falta el correo o el WhatsApp del cliente (pídele al menos uno).' };
  const full = tel ? (tel.length === 9 ? '51' + tel : tel) : '';
  const key = full || ('e:' + email.replace(/[^a-z0-9]/g, '').slice(0, 60));
  let cli = null;
  const raw = await redis(['GET', 'cliente:' + key]);
  if (raw) { try { cli = JSON.parse(raw); } catch (e) {} }
  if (!cli) cli = { id: key, creado: Date.now() };
  cli.id = key;
  if (nombre) cli.nombre = nombre;
  if (full) cli.telefono = full;
  if (email) cli.email = email;
  cli.club = true;
  cli.origen = cli.origen || 'chat-web';
  cli.actualizado = Date.now();
  await redis(['SET', 'cliente:' + key, JSON.stringify(cli)]);
  await redis(['ZADD', 'clientes', String(Date.now()), key]);
  await redis(['INCR', 'stat:chatweb_suscriptor']);
  await notifyOwner('📩 *Nuevo suscriptor desde el CHAT de la web*\n👤 ' + (nombre || '(sin nombre)') +
    (full ? '\n📱 +' + full : '') + (email ? '\n✉️ ' + email : '') +
    '\n\nMíralo en el panel 👉 /panel (👥 Club)');
  return {
    ok: true,
    guardado: true,
    tiene_whatsapp: !!full,
    tiene_correo: !!email,
    mensaje: 'Suscriptor registrado. Agradécele corto. Si falta el correo o el WhatsApp, invítalo con suavidad a dejar también el otro.',
  };
}

const HERRAMIENTAS = [
  {
    name: 'buscar_productos',
    description: 'Busca en el catálogo por palabras (texto) y/o lista los productos de una categoría (categoria). Devuelve nombre exacto, página y precio vigente. precio null = SIN precio publicado en la web: se cotiza por WhatsApp, NUNCA inventes un monto.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Palabras del producto, ej. "pisco porton" (opcional si mandas categoria)' },
        categoria: { type: 'string', description: 'Slug de la categoría, ej. "helados" (opcional)' },
      },
    },
  },
  {
    name: 'pedido_habitual',
    description: 'Devuelve "lo de siempre" del cliente reconocido: sus productos más comprados con precio vigente. Úsala cuando el cliente pida repetir su pedido, diga "lo de siempre", "mi lista", "lo de la otra vez" o similar. No necesita parámetros.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'registrar_pedido',
    description: 'Registra el pedido del cliente y avisa al dueño. Úsala SOLO cuando el cliente confirme lo que quiere (por ejemplo tras aceptar "lo de siempre"). Pasa su nombre y los items con producto (nombre EXACTO del catálogo) y cantidad; incluye teléfono y dirección si los tienes del perfil.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre del cliente' },
        telefono: { type: 'string', description: 'WhatsApp del cliente (solo dígitos), si lo tienes' },
        direccion: { type: 'string', description: 'Dirección de entrega, si la tienes' },
        items: {
          type: 'array',
          description: 'Productos del pedido',
          items: { type: 'object', properties: { producto: { type: 'string' }, cantidad: { type: 'number' } }, required: ['producto'] },
        },
      },
      required: ['nombre', 'items'],
    },
  },
  {
    name: 'registrar_consulta',
    description: 'Registra una pregunta que NO pudiste responder con el catálogo (producto no encontrado o dato que desconoces) para que el equipo la revise. Úsala antes de responder que no tienes esa información.',
    input_schema: {
      type: 'object',
      properties: {
        pregunta: { type: 'string', description: 'La pregunta o pedido del cliente, tal cual la hizo' },
        producto: { type: 'string', description: 'Producto al que se refiere, si aplica (opcional)' },
      },
      required: ['pregunta'],
    },
  },
  {
    name: 'registrar_suscriptor',
    description: 'Registra al cliente que dejó su WhatsApp y/o correo para recibir promociones, ofertas y novedades. Manda lo que te haya dado (whatsapp, email, nombre). Necesita al menos el WhatsApp o el correo.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre del cliente si lo dio (opcional)' },
        whatsapp: { type: 'string', description: 'Número de WhatsApp del cliente (solo dígitos), si lo dio' },
        email: { type: 'string', description: 'Correo electrónico del cliente, si lo dio' },
      },
    },
  },
];

async function ejecutarHerramienta(nombre, input, sid, uid) {
  if (nombre === 'buscar_productos') return buscarProductos(input.texto, input.categoria);
  if (nombre === 'pedido_habitual') return pedidoHabitual(uid);
  if (nombre === 'registrar_pedido') return registrarPedido(input || {}, sid);
  if (nombre === 'registrar_suscriptor') return registrarSuscriptor(input || {});
  if (nombre === 'registrar_consulta') return registrarConsulta(input || {}, sid);
  return { error: 'Herramienta desconocida: ' + nombre };
}

// Conversación con Claude + herramientas (loop tool_use → tool_result, como el asistente admin).
async function venderConClaude(messages, systemPrompt, sid, uid) {
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
      try { out = await ejecutarHerramienta(b.name, b.input || {}, sid, uid); }
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

// La última línea ">>> op1 | op2 | op3" de la respuesta son los botones de respuesta
// rápida del widget: se separa del texto y viaja aparte como `sugerencias`.
function extraerSugerencias(texto) {
  const lineas = String(texto || '').split('\n');
  let sugerencias = [];
  while (lineas.length) {
    const l = lineas[lineas.length - 1].trim();
    if (!l) { lineas.pop(); continue; }
    if (l.indexOf('>>>') === 0) {
      sugerencias = l.slice(3).split('|').map((s) => s.trim()).filter(Boolean).slice(0, 3).map((s) => s.slice(0, 48));
      lineas.pop();
    }
    break;
  }
  return { reply: lineas.join('\n').trim(), sugerencias };
}

module.exports = async (req, res) => {
  // GET: ¿el widget se muestra? (hay IA y el dueño no lo apagó en /panel → ⚙️ Bot)
  // Además manda los textos editables del widget (config:webchatui, panel → 💬 Chat de la web):
  // saludo (bienvenida animada), botones (respuestas rápidas iniciales), invitacion (burbuja
  // del gato) y subtitulo (cabecera). Si falta alguno, site.js usa sus textos por defecto.
  if (req.method === 'GET') {
    let on = !!process.env.ANTHROPIC_API_KEY;
    if (on && HAS_REDIS && (await redis(['GET', 'config:webchat'])) === '0') on = false;
    const out = { on };
    if (on && HAS_REDIS) {
      const raw = await redis(['GET', 'config:webchatui']);
      if (raw) {
        try {
          const ui = JSON.parse(raw);
          if (ui.saludo) out.saludo = String(ui.saludo).slice(0, 500);
          if (Array.isArray(ui.botones) && ui.botones.length) {
            out.botones = ui.botones.map((s) => String(s).slice(0, 48)).filter(Boolean).slice(0, 4);
          }
          if (ui.invitacion) out.invitacion = String(ui.invitacion).slice(0, 60);
          if (ui.subtitulo) out.subtitulo = String(ui.subtitulo).slice(0, 60);
        } catch (e) {}
      }
    }
    res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(out);
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
    const uid = String(b.uid || '').replace(/[^a-z0-9]/gi, '').slice(0, 40); // token de dispositivo → reconoce al cliente para "lo de siempre"

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

    const texto = await venderConClaude(messages, await getPromptWeb(), sid, uid);
    // [[PUSH]] = el bot quiere ofrecer activar los avisos con un toque (botón en la web)
    const push = /\[\[PUSH\]\]/.test(texto);
    const { reply, sugerencias } = extraerSugerencias(texto.replace(/\[\[PUSH\]\]/g, '').trim());
    return res.status(200).json({ reply: reply || '¿Me repites porfa? 🙏', sugerencias, push });
  } catch (e) {
    console.error('chat error', e);
    return res.status(200).json({ reply: APAGADO });
  }
};

// Para pruebas locales (node): no afecta al handler de Vercel.
module.exports.buscarProductos = buscarProductos;
module.exports.resolverItems = resolverItems;
module.exports.sanearMensajes = sanearMensajes;
module.exports.registrarConsulta = registrarConsulta;
module.exports.extraerSugerencias = extraerSugerencias;
