// Cuenta del cliente (Club Arakaki): login por celular + PIN, favoritos, puntos, promos y sorteos.
// Cada función se prende/apaga desde el panel (👥 Club → config:club). El PIN se guarda SOLO
// como hash (scrypt + salt por cliente); la sesión es un token aleatorio en Redis (sess:<token>).
//   GET  sin token      -> { on, funciones }                (caché CDN 60s; site.js decide si muestra "Mi cuenta")
//   GET  ?token=<sess>  -> { on, conocido, ...perfil }      (no-store: puntos, favs, habitual, promos, sorteos)
//   POST { action: 'crear'|'entrar'|'salir'|'fav'|'sorteo'|'visita', ... }

const crypto = require('crypto');
const { PRODUCTOS } = require('./_catalogo');
const { pushDuenos } = require('./_push.js');

const GRAPH = 'https://graph.facebook.com/v21.0';
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

const limpio = (s, n) => (s == null ? '' : String(s)).trim().slice(0, n);

// Teléfono → llave de identidad normalizada (Perú por defecto: 9 dígitos → 51+num). '' si inválido.
function normTel(raw) {
  const t = String(raw || '').replace(/\D/g, '');
  if (t.length < 9) return '';
  return t.length === 9 ? '51' + t : t;
}

function normalizar(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }

// Índice nombre normalizado → producto del catálogo (para validar favoritos y precio vigente)
const PORNOMBRE = {};
PRODUCTOS.forEach((pr) => { PORNOMBRE[normalizar(pr.n)] = pr; });

// Precio vigente: override en vivo (config:precios) > catálogo. null si no hay precio publicado.
function precioVivo(pr, vivos) {
  const v = vivos[pr.c + '|' + pr.n];
  const p = (v == null || v === '') ? pr.p : v;
  return (p && Number(p) > 0) ? Number(p) : null;
}

async function getPreciosVivos() {
  const raw = await redis(['GET', 'config:precios']);
  if (raw) { try { return JSON.parse(raw); } catch (e) {} }
  return {};
}

// Interruptores del Club (panel → 👥 Club). Sin config guardada, todo prendido.
const CLUB_DEF = { login: true, favoritos: true, puntos: true, promos: true, sorteos: true, puntosPorSol: 1 };
async function getClub() {
  let c = {};
  const raw = await redis(['GET', 'config:club']);
  if (raw) { try { c = JSON.parse(raw) || {}; } catch (e) {} }
  const out = {};
  Object.keys(CLUB_DEF).forEach((k) => { out[k] = (c[k] === undefined) ? CLUB_DEF[k] : c[k]; });
  return out;
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

// ---------- PIN (hash scrypt, nunca en claro) y sesiones ----------

function hashPin(pin, salt) { return crypto.scryptSync(String(pin), salt, 32).toString('hex'); }

function pinCorrecto(pin, cli) {
  if (!cli || !cli.pinHash || !cli.pinSalt) return false;
  const a = Buffer.from(hashPin(pin, cli.pinSalt), 'hex');
  const b = Buffer.from(cli.pinHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Crea la sesión (token → tel, 180 días) y la anota en el cliente para poder
// cerrarlas todas si el dueño resetea el PIN (crm.js resetpin). Máx 5 por cliente.
async function crearSesion(cli, tel, uid) {
  const token = 's' + crypto.randomBytes(16).toString('hex');
  await redis(['SET', 'sess:' + token, tel, 'EX', String(180 * 86400)]);
  cli.sess = Array.isArray(cli.sess) ? cli.sess : [];
  cli.sess.unshift(token);
  if (cli.sess.length > 5) {
    for (const t of cli.sess.slice(5)) await redis(['DEL', 'sess:' + t]);
    cli.sess = cli.sess.slice(0, 5);
  }
  if (uid) {
    cli.uids = Array.isArray(cli.uids) ? cli.uids : [];
    if (cli.uids.indexOf(uid) < 0) { cli.uids.unshift(uid); cli.uids = cli.uids.slice(0, 8); }
    await redis(['SET', 'uid:' + uid, tel, 'EX', String(400 * 86400)]);
  }
  return token;
}

async function telDeSesion(token) {
  if (!token) return '';
  return (await redis(['GET', 'sess:' + token])) || '';
}

// Freno anti fuerza bruta del PIN: 5 intentos/h por teléfono y 20/h por IP.
async function frenoPin(req, tel) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  const hora = Math.floor(Date.now() / 3600000);
  const nT = await redis(['INCR', 'pinrl:t:' + hora + ':' + tel]);
  const nI = await redis(['INCR', 'pinrl:i:' + hora + ':' + ip]);
  if (nT === 1) await redis(['EXPIRE', 'pinrl:t:' + hora + ':' + tel, '7200']);
  if (nI === 1) await redis(['EXPIRE', 'pinrl:i:' + hora + ':' + ip, '7200']);
  return Number(nT) > 5 || Number(nI) > 20;
}

// ---------- Perfil completo del logueado (lo pinta /mi-cuenta) ----------

async function cargarCliente(tel) {
  const raw = await redis(['GET', 'cliente:' + tel]);
  if (raw) { try { return JSON.parse(raw); } catch (e) {} }
  return null;
}

async function guardarCliente(tel, cli) {
  cli.actualizado = Date.now();
  await redis(['SET', 'cliente:' + tel, JSON.stringify(cli)]);
  await redis(['ZADD', 'clientes', String(Date.now()), tel]);
}

function vigente(x) { return !x.hasta || Date.now() <= Number(x.hasta); }

async function perfilCompleto(tel, cli, club) {
  const vivos = await getPreciosVivos();

  // Favoritos marcados a mano (⭐), con precio vigente
  const favs = (Array.isArray(cli.favs) ? cli.favs : []).map((name) => {
    const pr = PORNOMBRE[normalizar(name)];
    return { name, price: pr ? precioVivo(pr, vivos) : null, pagina: pr ? '/' + pr.c : '' };
  });

  // "Lo de siempre" = top del archivo de consumo (mismo criterio que api/perfil.js)
  const consumo = (cli.consumo && typeof cli.consumo === 'object') ? cli.consumo : {};
  const claves = Object.keys(consumo).sort((a, b) =>
    (consumo[b].veces - consumo[a].veces) || ((consumo[b].ultima || 0) - (consumo[a].ultima || 0)));
  const habitual = claves.slice(0, 12).map((name) => {
    const c = consumo[name];
    const pr = PORNOMBRE[normalizar(name)];
    const price = pr ? precioVivo(pr, vivos) : (c.price != null ? Number(c.price) : null);
    return { name, price, img: c.img || '', qty: 1, veces: c.veces };
  });

  // Promos exclusivas del Club (vigentes)
  let promos = [];
  if (club.promos) {
    const raw = await redis(['GET', 'config:clubpromos']);
    if (raw) { try { promos = (JSON.parse(raw) || []).filter(vigente); } catch (e) {} }
  }

  // Sorteos activos + si este cliente ya participa
  let sorteos = [];
  if (club.sorteos) {
    const raw = await redis(['GET', 'config:sorteos']);
    let lista = [];
    if (raw) { try { lista = (JSON.parse(raw) || []).filter((s) => s.activo !== false && vigente(s)); } catch (e) {} }
    for (const s of lista) {
      const ya = await redis(['ZSCORE', 'sorteo:' + s.id, tel]);
      sorteos.push({ id: s.id, titulo: s.titulo, premio: s.premio, hasta: s.hasta || null, participando: ya != null });
    }
  }

  return {
    conocido: true,
    nombre: cli.nombre || '',
    telefono: tel,
    pedidos: Number(cli.pedidos) || 0,
    puntos: Number(cli.puntos) || 0,
    favs,
    habitual,
    promos,
    sorteos,
  };
}

function funcionesDe(club) {
  return { favoritos: !!club.favoritos, puntos: !!club.puntos, promos: !!club.promos, sorteos: !!club.sorteos };
}

// Día calendario de Lima (UTC-5), para contar 1 visita por día como máximo.
function diaLima(ts) { return new Date(ts - 5 * 3600000).toISOString().slice(0, 10); }

module.exports = async (req, res) => {
  try {
    // ----- GET: flags públicos (sin token) o perfil completo (con token) -----
    if (req.method === 'GET') {
      const token = String((req.query && req.query.token) || '').replace(/[^a-z0-9]/gi, '').slice(0, 40);
      if (!HAS_REDIS) {
        res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=300');
        return res.status(200).json({ on: false });
      }
      const club = await getClub();
      if (!club.login) {
        res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=300');
        return res.status(200).json({ on: false });
      }
      if (!token) {
        res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=300');
        return res.status(200).json({ on: true, funciones: funcionesDe(club) });
      }
      res.setHeader('cache-control', 'no-store');
      const tel = await telDeSesion(token);
      const cli = tel ? await cargarCliente(tel) : null;
      if (!tel || !cli) return res.status(200).json({ on: true, conocido: false });
      const perfil = await perfilCompleto(tel, cli, club);
      perfil.on = true;
      perfil.funciones = funcionesDe(club);
      return res.status(200).json(perfil);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('cache-control', 'no-store');
    if (!HAS_REDIS) return res.status(200).json({ on: false, error: 'El Club estará disponible muy pronto 🙏' });

    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    b = b || {};

    const club = await getClub();
    if (!club.login) return res.status(200).json({ on: false, error: 'El Club está en pausa por ahora 🙏' });

    const uid = limpio(b.uid, 40).replace(/[^a-z0-9]/gi, '');
    const token = limpio(b.token, 40).replace(/[^a-z0-9]/gi, '');

    // ----- Crear cuenta (celular + PIN elegido por el cliente) -----
    if (b.action === 'crear') {
      const nombre = limpio(b.nombre, 60);
      const tel = normTel(b.telefono);
      const pin = limpio(b.pin, 6);
      if (!nombre || nombre.length < 2) return res.status(400).json({ error: 'Cuéntanos tu nombre 🙂' });
      if (!tel) return res.status(400).json({ error: 'Revisa tu número de celular (9 dígitos).' });
      if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'El PIN debe tener de 4 a 6 números.' });
      if (await frenoPin(req, tel)) return res.status(429).json({ error: 'Demasiados intentos. Espera un rato y vuelve a probar 🙏' });
      let cli = await cargarCliente(tel);
      const eraCliente = !!cli;
      if (cli && cli.pinHash) return res.status(400).json({ error: 'Este número ya tiene una cuenta. Inicia sesión con tu PIN (o pídenos ayuda por WhatsApp).' });
      if (!cli) cli = { telefono: tel, creado: Date.now() };
      cli.telefono = tel;
      cli.nombre = nombre;
      cli.club = true;
      cli.pinSalt = crypto.randomBytes(8).toString('hex');
      cli.pinHash = hashPin(pin, cli.pinSalt);
      const nuevoToken = await crearSesion(cli, tel, uid);
      await guardarCliente(tel, cli);
      await redis(['INCR', 'stat:club_cuenta']);
      await notifyOwner('🔑 *Nueva cuenta del Club (web)*\n👤 ' + nombre + ' (+' + tel + ')' +
        (eraCliente ? '\n♻️ Era un cliente ya registrado: activó su cuenta con PIN.' : '') +
        '\n\nSi no lo reconoces, puedes resetear su PIN en el panel 👉 /panel (👥 Club)');
      const perfil = await perfilCompleto(tel, cli, club);
      perfil.on = true;
      perfil.funciones = funcionesDe(club);
      return res.status(200).json({ ok: true, token: nuevoToken, perfil });
    }

    // ----- Iniciar sesión -----
    if (b.action === 'entrar') {
      const tel = normTel(b.telefono);
      const pin = limpio(b.pin, 6);
      if (!tel || !/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'Número o PIN incorrecto.' });
      if (await frenoPin(req, tel)) return res.status(429).json({ error: 'Demasiados intentos. Espera un rato y vuelve a probar 🙏' });
      const cli = await cargarCliente(tel);
      // Mensaje genérico a propósito: no revela si el número tiene cuenta o no
      if (!cli || !pinCorrecto(pin, cli)) return res.status(400).json({ error: 'Número o PIN incorrecto.' });
      const nuevoToken = await crearSesion(cli, tel, uid);
      await guardarCliente(tel, cli);
      const perfil = await perfilCompleto(tel, cli, club);
      perfil.on = true;
      perfil.funciones = funcionesDe(club);
      return res.status(200).json({ ok: true, token: nuevoToken, perfil });
    }

    // ----- Cerrar sesión -----
    if (b.action === 'salir') {
      if (token) {
        const tel = await telDeSesion(token);
        await redis(['DEL', 'sess:' + token]);
        if (tel) {
          const cli = await cargarCliente(tel);
          if (cli && Array.isArray(cli.sess)) {
            cli.sess = cli.sess.filter((t) => t !== token);
            await guardarCliente(tel, cli);
          }
        }
      }
      return res.status(200).json({ ok: true });
    }

    // Lo que sigue requiere sesión válida
    const tel = await telDeSesion(token);
    const cli = tel ? await cargarCliente(tel) : null;
    if (!tel || !cli) {
      // 'visita' también funciona solo con el uid (cliente reconocido sin login)
      if (b.action === 'visita' && uid) {
        const telU = await redis(['GET', 'uid:' + uid]);
        const cliU = telU ? await cargarCliente(telU) : null;
        if (cliU) {
          if (!cliU.ultimaVisita || diaLima(cliU.ultimaVisita) !== diaLima(Date.now())) cliU.visitas = (Number(cliU.visitas) || 0) + 1;
          cliU.ultimaVisita = Date.now();
          await guardarCliente(telU, cliU);
        }
        return res.status(200).json({ ok: true });
      }
      return res.status(401).json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión 🙏', conocido: false });
    }

    // ----- Marcar/desmarcar favorito (⭐ en las páginas de categoría) -----
    if (b.action === 'fav') {
      if (!club.favoritos) return res.status(400).json({ error: 'Los favoritos están en pausa por ahora.' });
      const nombre = limpio(b.producto, 120);
      if (!PORNOMBRE[normalizar(nombre)]) return res.status(400).json({ error: 'Producto no encontrado.' });
      let favs = Array.isArray(cli.favs) ? cli.favs : [];
      favs = favs.filter((n) => normalizar(n) !== normalizar(nombre));
      if (b.on) favs.unshift(nombre);
      cli.favs = favs.slice(0, 60);
      await guardarCliente(tel, cli);
      return res.status(200).json({ ok: true, favs: cli.favs });
    }

    // ----- Participar en un sorteo (1 vez por cliente) -----
    if (b.action === 'sorteo') {
      if (!club.sorteos) return res.status(400).json({ error: 'Los sorteos están en pausa por ahora.' });
      const id = limpio(b.id, 20).replace(/[^a-z0-9]/gi, '');
      let lista = [];
      const raw = await redis(['GET', 'config:sorteos']);
      if (raw) { try { lista = JSON.parse(raw) || []; } catch (e) {} }
      const s = lista.find((x) => x.id === id);
      if (!s || s.activo === false || !vigente(s)) return res.status(400).json({ error: 'Este sorteo ya no está disponible 🙏' });
      await redis(['ZADD', 'sorteo:' + id, 'NX', String(Date.now()), tel]);
      await redis(['INCR', 'stat:club_sorteo']);
      return res.status(200).json({ ok: true, participando: true });
    }

    // ----- Visita del día (recurrencia; el navegador la manda 1 vez por día) -----
    if (b.action === 'visita') {
      if (!cli.ultimaVisita || diaLima(cli.ultimaVisita) !== diaLima(Date.now())) cli.visitas = (Number(cli.visitas) || 0) + 1;
      cli.ultimaVisita = Date.now();
      await guardarCliente(tel, cli);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Acción desconocida.' });
  } catch (e) {
    console.error('cuenta error', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
