// Cuenta del cliente (Club Arakaki): login por celular + PIN, favoritos, puntos, promos y sorteos.
// Cada función se prende/apaga desde el panel (👥 Club → config:club). El PIN se guarda SOLO
// como hash (scrypt + salt por cliente); la sesión es un token aleatorio en Redis (sess:<token>).
//   GET  sin token      -> { on, funciones }                (caché CDN 60s; site.js decide si muestra "Mi cuenta")
//   GET  ?token=<sess>  -> { on, conocido, ...perfil }      (no-store: puntos, favs, habitual, promos, sorteos,
//                                                            email, foto, direcciones y preguntas con respuesta)
//   POST { action: 'crear'|'entrar'|'salir'|'recuperar'|'reccode'                (sin sesión)
//                 |'fav'|'sorteo'|'visita'                                       (beneficios)
//                 |'perfil'|'foto'|'dirs'|'pin'|'pregunta', ... }                (editar mi cuenta)
//   Recuperación: con Resend (RESEND_API_KEY) 'recuperar' manda un código al correo y 'reccode'
//   lo canjea por el PIN nuevo; sin Resend 'recuperar' valida celular+correo y cambia directo.

const crypto = require('crypto');
const { PRODUCTOS } = require('./_catalogo');
const { pushDuenos } = require('./_push.js');
const { HAS_CORREO, enviarCorreo, htmlCodigo, htmlAvisoPin } = require('./_correo.js');

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

// Preguntas de ESTE cliente (lista global `preguntas`; el dueño responde en el panel → ❓ Consultas)
async function preguntasDe(tel) {
  const raws = (await redis(['LRANGE', 'preguntas', '0', '199'])) || [];
  const out = [];
  for (const r of raws) {
    let q; try { q = JSON.parse(r); } catch (e) { continue; }
    if (q.tel !== tel) continue;
    out.push({ id: q.id, pregunta: q.pregunta, ts: q.ts, respuesta: q.respuesta || '', respTs: q.respTs || null });
    if (out.length >= 10) break;
  }
  return out;
}

async function perfilCompleto(tel, cli, club) {
  const vivos = await getPreciosVivos();

  // Favoritos marcados a mano (⭐), con precio vigente
  const favs = (Array.isArray(cli.favs) ? cli.favs : []).map((name) => {
    const pr = PORNOMBRE[normalizar(name)];
    return { name, price: pr ? precioVivo(pr, vivos) : null, pagina: pr ? '/' + pr.c : '' };
  });

  // "Mi último pedido" = la foto exacta que guarda pedido.js (ultimoItems, con cantidades).
  // Clientes de antes de guardarla: se deduce del consumo (lo comprado en la última tanda).
  const consumo = (cli.consumo && typeof cli.consumo === 'object') ? cli.consumo : {};
  let ultimos = (Array.isArray(cli.ultimoItems) ? cli.ultimoItems : []).filter((it) => it && it.name);
  if (!ultimos.length) {
    const tope = Object.keys(consumo).reduce((m, k) => Math.max(m, Number(consumo[k].ultima) || 0), 0);
    ultimos = Object.keys(consumo)
      .filter((k) => tope && (Number(consumo[k].ultima) || 0) >= tope - 60000)
      .map((name) => ({ name, qty: 1, price: consumo[name].price, img: consumo[name].img || '' }));
  }
  const habitual = ultimos.slice(0, 12).map((it) => {
    const pr = PORNOMBRE[normalizar(it.name)];
    const price = pr ? precioVivo(pr, vivos) : (it.price != null ? Number(it.price) : null);
    return { name: it.name, price, img: it.img || '', qty: Number(it.qty) || 1 };
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
    email: cli.email || '',
    foto: cli.foto || '',
    direccion: cli.direccion || '',
    direcciones: Array.isArray(cli.direcciones) ? cli.direcciones : [],
    pedidos: Number(cli.pedidos) || 0,
    puntos: Number(cli.puntos) || 0,
    favs,
    habitual,
    promos,
    sorteos,
    preguntas: await preguntasDe(tel),
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
        // correo:true = hay sistema de correos (Resend) → la recuperación usa código al correo
        return res.status(200).json({ on: true, funciones: funcionesDe(club), correo: HAS_CORREO });
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

    // ----- Recuperar cuenta con el correo registrado -----
    // Con Resend activo (HAS_CORREO): paso 1 = enviar código de 6 dígitos al correo (vence 15 min).
    // Sin Resend: modo directo = celular + correo + PIN nuevo (valida que coincidan y entra).
    if (b.action === 'recuperar') {
      const telR = normTel(b.telefono);
      const email = limpio(b.email, 80).toLowerCase();
      const pin = limpio(b.pin, 6);
      if (!telR || !email) return res.status(400).json({ error: 'Ingresa tu celular y el correo que registraste en tu cuenta.' });
      if (!HAS_CORREO && !/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'El PIN nuevo debe tener de 4 a 6 números.' });
      if (await frenoPin(req, telR)) return res.status(429).json({ error: 'Demasiados intentos. Espera un rato y vuelve a probar 🙏' });
      const cliR = await cargarCliente(telR);
      // Mensaje genérico a propósito: no revela qué dato falló
      if (!cliR || !cliR.pinHash || !cliR.email || String(cliR.email).toLowerCase() !== email) {
        return res.status(400).json({ error: 'Los datos no coinciden. Revisa tu celular y el correo que registraste (o pídenos ayuda por WhatsApp).' });
      }
      if (HAS_CORREO) {
        const codigo = String(crypto.randomInt(100000, 1000000));
        await redis(['SET', 'reccode:' + telR, codigo, 'EX', '900']);
        await redis(['DEL', 'reccodetry:' + telR]);
        const env = await enviarCorreo(cliR.email, '🔑 Tu código para recuperar tu cuenta', htmlCodigo(cliR.nombre || '', codigo));
        if (!env.ok) {
          console.error('correo recuperacion error', env.error);
          return res.status(500).json({ error: 'No pudimos enviarte el correo ahora mismo. Prueba en un ratito o pídenos ayuda por WhatsApp 🙏' });
        }
        return res.status(200).json({ ok: true, codigo: true });
      }
      cliR.pinSalt = crypto.randomBytes(8).toString('hex');
      cliR.pinHash = hashPin(pin, cliR.pinSalt);
      // Se cierran TODAS las sesiones anteriores (por si alguien más tenía la cuenta abierta)
      for (const t of (Array.isArray(cliR.sess) ? cliR.sess : [])) await redis(['DEL', 'sess:' + t]);
      cliR.sess = [];
      const nuevoToken = await crearSesion(cliR, telR, uid);
      await guardarCliente(telR, cliR);
      await notifyOwner('🔓 *Cuenta recuperada con correo (web)*\n👤 ' + (cliR.nombre || 'Cliente') + ' (+' + telR + ')' +
        '\nCambió su PIN usando su correo registrado. Si no lo reconoces, resetea su PIN en el panel 👉 /panel (👥 Club)');
      const perfil = await perfilCompleto(telR, cliR, club);
      perfil.on = true;
      perfil.funciones = funcionesDe(club);
      return res.status(200).json({ ok: true, token: nuevoToken, perfil });
    }

    // ----- Paso 2 de la recuperación: verificar el código del correo y estrenar PIN -----
    if (b.action === 'reccode') {
      const telR = normTel(b.telefono);
      const codigo = limpio(b.codigo, 6).replace(/\D/g, '');
      const pin = limpio(b.pin, 6);
      if (!telR || codigo.length !== 6) return res.status(400).json({ error: 'Revisa el código de 6 números que te llegó al correo.' });
      if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'El PIN nuevo debe tener de 4 a 6 números.' });
      if (await frenoPin(req, telR)) return res.status(429).json({ error: 'Demasiados intentos. Espera un rato y vuelve a probar 🙏' });
      // Máx. 5 intentos por código: al sexto se invalida y hay que pedir otro
      const nTry = await redis(['INCR', 'reccodetry:' + telR]);
      if (Number(nTry) === 1) await redis(['EXPIRE', 'reccodetry:' + telR, '900']);
      if (Number(nTry) > 5) {
        await redis(['DEL', 'reccode:' + telR]);
        return res.status(429).json({ error: 'Demasiados intentos con este código. Pide uno nuevo 🙏' });
      }
      const guardado = await redis(['GET', 'reccode:' + telR]);
      const cliR = (guardado && guardado === codigo) ? await cargarCliente(telR) : null;
      if (!cliR) return res.status(400).json({ error: 'Código incorrecto o vencido. Revisa tu correo o pide uno nuevo 🙏' });
      await redis(['DEL', 'reccode:' + telR]);
      await redis(['DEL', 'reccodetry:' + telR]);
      cliR.pinSalt = crypto.randomBytes(8).toString('hex');
      cliR.pinHash = hashPin(pin, cliR.pinSalt);
      for (const t of (Array.isArray(cliR.sess) ? cliR.sess : [])) await redis(['DEL', 'sess:' + t]);
      cliR.sess = [];
      const nuevoToken = await crearSesion(cliR, telR, uid);
      await guardarCliente(telR, cliR);
      try { if (cliR.email) await enviarCorreo(cliR.email, '🔐 Tu PIN fue cambiado', htmlAvisoPin(cliR.nombre || '')); } catch (e) {}
      await notifyOwner('🔓 *Cuenta recuperada con código al correo (web)*\n👤 ' + (cliR.nombre || 'Cliente') + ' (+' + telR + ')' +
        '\nSi no lo reconoces, resetea su PIN en el panel 👉 /panel (👥 Club)');
      const perfil = await perfilCompleto(telR, cliR, club);
      perfil.on = true;
      perfil.funciones = funcionesDe(club);
      return res.status(200).json({ ok: true, token: nuevoToken, perfil });
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

    // ----- Editar mis datos (nombre y correo; el correo habilita la recuperación) -----
    if (b.action === 'perfil') {
      const nombre = limpio(b.nombre, 60);
      const email = limpio(b.email, 80).toLowerCase();
      if (!nombre || nombre.length < 2) return res.status(400).json({ error: 'Cuéntanos tu nombre 🙂' });
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'Revisa tu correo: parece incompleto.' });
      cli.nombre = nombre;
      cli.email = email; // vacío = lo quita (pierde la recuperación por correo)
      await guardarCliente(tel, cli);
      return res.status(200).json({ ok: true, nombre, email });
    }

    // ----- Foto de perfil (dataURL chiquito, ya comprimido por el navegador a 144px) -----
    if (b.action === 'foto') {
      const foto = String(b.foto || '');
      if (foto && (!/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(foto) || foto.length > 90000)) {
        return res.status(400).json({ error: 'No pudimos leer esa foto. Prueba con otra imagen 🙏' });
      }
      if (foto) cli.foto = foto; else delete cli.foto;
      await guardarCliente(tel, cli);
      return res.status(200).json({ ok: true });
    }

    // ----- Direcciones de entrega (principal + hasta 5 adicionales; las usa el carrito) -----
    if (b.action === 'dirs') {
      const principal = limpio(b.direccion, 200);
      const otras = (Array.isArray(b.direcciones) ? b.direcciones : [])
        .map((d) => limpio(d, 200)).filter(Boolean).slice(0, 5);
      cli.direccion = principal;
      cli.direcciones = otras;
      await guardarCliente(tel, cli);
      return res.status(200).json({ ok: true, direccion: principal, direcciones: otras });
    }

    // ----- Cambiar mi PIN (pide el actual; cierra las demás sesiones por seguridad) -----
    if (b.action === 'pin') {
      const nuevo = limpio(b.pinNuevo, 6);
      if (!/^\d{4,6}$/.test(nuevo)) return res.status(400).json({ error: 'El PIN nuevo debe tener de 4 a 6 números.' });
      if (await frenoPin(req, tel)) return res.status(429).json({ error: 'Demasiados intentos. Espera un rato y vuelve a probar 🙏' });
      if (!pinCorrecto(limpio(b.pinActual, 6), cli)) return res.status(400).json({ error: 'Tu PIN actual no coincide.' });
      cli.pinSalt = crypto.randomBytes(8).toString('hex');
      cli.pinHash = hashPin(nuevo, cli.pinSalt);
      const vivas = Array.isArray(cli.sess) ? cli.sess : [];
      for (const t of vivas) if (t !== token) await redis(['DEL', 'sess:' + t]);
      cli.sess = vivas.indexOf(token) >= 0 ? [token] : [];
      await guardarCliente(tel, cli);
      // Aviso de seguridad al correo registrado (si hay sistema de correos)
      try { if (HAS_CORREO && cli.email) await enviarCorreo(cli.email, '🔐 Tu PIN fue cambiado', htmlAvisoPin(cli.nombre || '')); } catch (e) {}
      return res.status(200).json({ ok: true });
    }

    // ----- Pregunta al negocio (el dueño responde desde el panel → ❓ Consultas) -----
    if (b.action === 'pregunta') {
      const texto = limpio(b.texto, 400);
      if (!texto || texto.length < 5) return res.status(400).json({ error: 'Cuéntanos tu pregunta con un poquito más de detalle 🙂' });
      const kDia = 'pregrl:' + diaLima(Date.now()) + ':' + tel; // máx 5 por día por cliente
      const n = await redis(['INCR', kDia]);
      if (Number(n) === 1) await redis(['EXPIRE', kDia, '90000']);
      if (Number(n) > 5) return res.status(429).json({ error: 'Ya nos dejaste 5 preguntas hoy 🙌 Te respondemos pronto; mañana puedes hacer más.' });
      const q = {
        id: 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        tel, nombre: cli.nombre || '', pregunta: texto, ts: Date.now(),
      };
      await redis(['LPUSH', 'preguntas', JSON.stringify(q)]);
      await redis(['LTRIM', 'preguntas', '0', '199']);
      await redis(['INCR', 'stat:club_pregunta']);
      await notifyOwner('❓ *Pregunta del Club (web)*\n👤 ' + (cli.nombre || 'Cliente') + ' (+' + tel + ')\n💬 ' + texto +
        '\n\nRespóndele en el panel 👉 /panel (❓ Consultas): la verá en su cuenta.');
      return res.status(200).json({ ok: true, pregunta: { id: q.id, pregunta: q.pregunta, ts: q.ts, respuesta: '', respTs: null } });
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
