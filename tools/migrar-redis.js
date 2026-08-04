// Respaldo y mudanza de la base Upstash Redis.
// Es la ÚNICA parte del sistema que NO vive en git: clientes del Club (con sus PINs y
// sesiones), pedidos, chats de WhatsApp, toda la configuración del panel, las fotos de los
// productos subidos, los videos y las suscripciones de avisos push. Si se pierde, se pierde.
//
// Uso:
//   node tools/migrar-redis.js respaldo                 -> guarda TODO en respaldos/redis-<fecha>.ndjson
//   node tools/migrar-redis.js copiar                   -> copia origen -> destino (respalda de paso)
//   node tools/migrar-redis.js restaurar <archivo>      -> vuelca un respaldo en el DESTINO
//   node tools/migrar-redis.js verificar                -> compara origen y destino, clave por clave
//
// Variables de entorno:
//   Origen : UPSTASH_REDIS_REST_URL   / UPSTASH_REDIS_REST_TOKEN   (o KV_REST_API_URL / _TOKEN)
//   Destino: UPSTASH_DESTINO_REST_URL / UPSTASH_DESTINO_REST_TOKEN (la base nueva, la del dueño)
//
// Opciones:
//   --solo-config     SOLO lo que el dueño configuró en el panel: cero datos de clientes
//   --patron a,b,c    solo las claves que casen con esos patrones (por defecto *)
//   --sobrescribir    permite escribir aunque el destino ya tenga claves
//   --sin-respaldo    en 'copiar', no dejar el archivo de respaldo
//   --salida <ruta>   archivo del respaldo
//
// Si la base de clientes y pedidos arranca de cero en el destino (son datos de prueba),
// la mudanza es:  node tools/migrar-redis.js copiar --solo-config
//
// Conserva el TIPO y el VENCIMIENTO (TTL) de cada clave: sin eso los clientes del Club
// quedarían deslogueados (sess:*) y el sitio dejaría de reconocer sus dispositivos (uid:*).
// NO borra nada del origen. En el destino reemplaza clave por clave (DEL + escritura).
const fs = require('fs');
const path = require('path');
require('./_env').cargarEnv(path.join(__dirname, '..')); // llaves del .env de la raíz (si existe)

const LIMITE_BYTES = 700000; // tope por request de Upstash (1MB); dejamos aire
const MAX_CMDS = 60;         // comandos por pipeline
const LOTE_LECTURA = 20;     // claves leídas por vuelta

// --solo-config: lo que el DUEÑO armó desde el panel, SIN un solo dato de cliente.
// Textos, fondos, colores, precios, stock, promos, cupones, sorteos, cerebro de los bots,
// + las fotos de productos subidos, los banners de avisos y los videos.
// Es lo único que hay que mudar cuando la base de clientes y pedidos arranca de cero.
const PRESET_CONFIG = ['config:*', 'prodimg:*', 'pushimg:*', 'pushimgs', 'vidext:*'];

// ---------- cliente REST ----------
function cliente(url, token, nombre) {
  const base = String(url || '').replace(/\/$/, '');
  async function llamar(ruta, cuerpo) {
    const r = await fetch(base + ruta, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    if (!r.ok) throw new Error(nombre + ': HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return r.json();
  }
  async function redis(cmd) {
    const data = await llamar('', cmd);
    if (data && data.error) throw new Error(nombre + ': ' + cmd[0] + ' -> ' + data.error);
    return data ? data.result : null;
  }
  async function pipe(cmds) {
    if (!cmds.length) return [];
    const data = await llamar('/pipeline', cmds);
    if (!Array.isArray(data)) throw new Error(nombre + ': respuesta rara -> ' + JSON.stringify(data).slice(0, 200));
    return data.map((x, i) => {
      if (x && x.error) throw new Error(nombre + ': ' + cmds[i][0] + ' ' + cmds[i][1] + ' -> ' + x.error);
      return x ? x.result : null;
    });
  }
  // Si un lote falla (tamaño, una clave rara), reintenta comando por comando para no perder el resto.
  async function pipeSeguro(cmds) {
    try { return await pipe(cmds); } catch (e) {
      const salida = [];
      for (const c of cmds) {
        try { salida.push(await redis(c)); } catch (e2) {
          console.warn('  ⚠ ' + c[0] + ' ' + c[1] + ': ' + e2.message);
          salida.push(null);
        }
      }
      return salida;
    }
  }
  return { nombre, base, redis, pipe, pipeSeguro };
}

function env(a, b) { return process.env[a] || process.env[b] || ''; }

function abrirOrigen() {
  const u = env('UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL');
  const t = env('UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN');
  if (!u || !t) fallar('Faltan UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (la base de HOY).');
  return cliente(u, t, 'origen');
}
function abrirDestino() {
  const u = env('UPSTASH_DESTINO_REST_URL', 'UPSTASH_DEST_REST_URL');
  const t = env('UPSTASH_DESTINO_REST_TOKEN', 'UPSTASH_DEST_REST_TOKEN');
  if (!u || !t) fallar('Faltan UPSTASH_DESTINO_REST_URL / UPSTASH_DESTINO_REST_TOKEN (la base NUEVA, la del dueño).');
  return cliente(u, t, 'destino');
}
// Corta la ejecución con un mensaje claro. Se lanza como error (no process.exit) porque en
// Windows salir en medio de un fetch dispara una aserción de libuv y enmascara el código de salida.
function fallar(msg) { const e = new Error(msg); e.avisado = true; throw e; }

// ---------- lectura ----------
// Acepta uno o varios patrones (config:*, prodimg:*, …) y devuelve la unión, sin repetidos.
async function todasLasClaves(cli, patrones) {
  const lista = Array.isArray(patrones) ? patrones : [patrones];
  const claves = [];
  for (const patron of lista) {
    let cursor = '0', vueltas = 0;
    do {
      const out = await cli.redis(['SCAN', cursor, 'MATCH', patron, 'COUNT', 500]);
      cursor = (out && out[0]) || '0';
      for (const k of (out && out[1]) || []) claves.push(k);
      vueltas++;
      if (vueltas % 20 === 0) process.stdout.write('\r  leyendo índice… ' + claves.length + ' claves');
    } while (cursor !== '0' && vueltas < 5000);
  }
  // SCAN puede repetir claves entre vueltas: dejamos una sola de cada una.
  const unicas = Array.from(new Set(claves));
  process.stdout.write('\r  índice: ' + unicas.length + ' claves' + ' '.repeat(20) + '\n');
  return unicas;
}

// Los mismos patrones, para filtrar un archivo de respaldo al restaurar.
function comoRegex(p) {
  return new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
}
function casaCon(patrones, k) {
  return patrones.some((p) => p === '*' || comoRegex(p).test(k));
}

const LECTURA = {
  string: (k) => ['GET', k],
  list: (k) => ['LRANGE', k, 0, -1],
  hash: (k) => ['HGETALL', k],
  set: (k) => ['SMEMBERS', k],
  zset: (k) => ['ZRANGE', k, 0, -1, 'WITHSCORES'],
};

// Upstash devuelve los hash como objeto o como lista plana [campo,valor,...]: normalizamos a lista plana.
function aplanarHash(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    const out = [];
    for (const f of Object.keys(v)) { out.push(f, v[f]); }
    return out;
  }
  return [];
}

// Lee un lote de claves completo: {k, t, ttl, v}
async function leerLote(cli, claves) {
  const meta = await cli.pipeSeguro([].concat(
    claves.map((k) => ['TYPE', k]),
    claves.map((k) => ['PTTL', k])
  ));
  const n = claves.length;
  const registros = [];
  const pendientes = [];
  for (let i = 0; i < n; i++) {
    let t = meta[i];
    if (t && typeof t === 'object' && t.result) t = t.result; // por si viene envuelto
    const ttl = Number(meta[n + i]);
    if (!t || t === 'none') continue; // venció mientras leíamos
    if (!LECTURA[t]) { console.warn('  ⚠ tipo no soportado (' + t + ') en ' + claves[i]); continue; }
    pendientes.push({ k: claves[i], t: t, ttl: ttl > 0 ? ttl : -1 });
  }
  if (!pendientes.length) return registros;
  const valores = await cli.pipeSeguro(pendientes.map((p) => LECTURA[p.t](p.k)));
  for (let i = 0; i < pendientes.length; i++) {
    const p = pendientes[i];
    let v = valores[i];
    if (p.t === 'hash') v = aplanarHash(v);
    if (v === null || v === undefined) continue;
    registros.push({ k: p.k, t: p.t, ttl: p.ttl, v: v });
  }
  return registros;
}

// ---------- escritura ----------
// Convierte un registro en su lista de comandos (DEL + carga + vencimiento).
function comandosDe(reg) {
  const k = reg.k, cmds = [['DEL', k]];
  if (reg.t === 'string') {
    cmds.push(['SET', k, reg.v]);
  } else if (reg.t === 'list') {
    for (let i = 0; i < reg.v.length; i += 200) cmds.push(['RPUSH', k].concat(reg.v.slice(i, i + 200)));
  } else if (reg.t === 'set') {
    for (let i = 0; i < reg.v.length; i += 200) cmds.push(['SADD', k].concat(reg.v.slice(i, i + 200)));
  } else if (reg.t === 'hash') {
    for (let i = 0; i < reg.v.length; i += 200) cmds.push(['HSET', k].concat(reg.v.slice(i, i + 200)));
  } else if (reg.t === 'zset') {
    // ZRANGE WITHSCORES devuelve [miembro, puntaje, ...] y ZADD pide [puntaje, miembro]: se invierte.
    for (let i = 0; i < reg.v.length; i += 200) {
      const par = reg.v.slice(i, i + 200), args = [];
      for (let j = 0; j + 1 < par.length; j += 2) args.push(par[j + 1], par[j]);
      if (args.length) cmds.push(['ZADD', k].concat(args));
    }
  }
  if (reg.ttl > 0) cmds.push(['PEXPIRE', k, reg.ttl]);
  return cmds;
}

// Escribe registros respetando el tope de tamaño de Upstash.
async function escribir(cli, registros) {
  let cola = [], bytes = 0, escritas = 0;
  async function vaciar() {
    if (!cola.length) return;
    await cli.pipeSeguro(cola);
    cola = []; bytes = 0;
  }
  for (const reg of registros) {
    for (const c of comandosDe(reg)) {
      const tam = JSON.stringify(c).length;
      if (tam > LIMITE_BYTES) { await vaciar(); await cli.pipeSeguro([c]); continue; } // gigante: va solo
      if (bytes + tam > LIMITE_BYTES || cola.length >= MAX_CMDS) await vaciar();
      cola.push(c); bytes += tam;
    }
    escritas++;
  }
  await vaciar();
  return escritas;
}

// ---------- informe ----------
function grupo(k) {
  const i = k.indexOf(':');
  return i > 0 ? k.slice(0, i) + ':*' : k;
}
function contar(mapa, k) { mapa[grupo(k)] = (mapa[grupo(k)] || 0) + 1; }
function tabla(mapa, titulo) {
  const filas = Object.keys(mapa).sort((a, b) => mapa[b] - mapa[a]);
  console.log('\n' + titulo);
  for (const f of filas) console.log('  ' + f.padEnd(24) + String(mapa[f]).padStart(7));
}

function rutaRespaldo(salida) {
  if (salida) return path.resolve(salida);
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const nombre = 'redis-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.ndjson';
  const dir = path.join(__dirname, '../respaldos');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, nombre);
}

// ---------- modos ----------
function mostrarFiltro(opts) {
  if (opts.patrones.join(',') === '*') return;
  const esPreset = opts.patrones.join(',') === PRESET_CONFIG.join(',');
  console.log('  filtro : ' + opts.patrones.join('  ') + (esPreset ? '\n           (solo la configuración del panel: ni un dato de cliente ni un pedido)' : '') + '\n');
}

async function modoRespaldo(opts, cli, destinoTambien) {
  mostrarFiltro(opts);
  const claves = await todasLasClaves(cli, opts.patrones);
  if (!claves.length) { console.log('  (no hay claves que casen con ' + opts.patrones.join(' ') + ')'); return { total: 0 }; }

  const archivo = opts.sinRespaldo ? null : rutaRespaldo(opts.salida);
  let fd = null;
  if (archivo) {
    fd = fs.openSync(archivo, 'w');
    fs.writeSync(fd, JSON.stringify({ __meta: { fecha: new Date().toISOString(), origen: cli.base, claves: claves.length, patron: opts.patrones.join(',') } }) + '\n');
  }

  const cuenta = {}, porTipo = {};
  let leidas = 0, bytes = 0, copiadas = 0;
  for (let i = 0; i < claves.length; i += LOTE_LECTURA) {
    const registros = await leerLote(cli, claves.slice(i, i + LOTE_LECTURA));
    for (const reg of registros) {
      contar(cuenta, reg.k);
      porTipo[reg.t] = (porTipo[reg.t] || 0) + 1;
      leidas++;
      if (fd) { const linea = JSON.stringify(reg) + '\n'; fs.writeSync(fd, linea); bytes += linea.length; }
    }
    if (destinoTambien && registros.length) copiadas += await escribir(destinoTambien, registros);
    process.stdout.write('\r  ' + (destinoTambien ? 'copiando' : 'guardando') + '… ' + leidas + '/' + claves.length);
  }
  if (fd) fs.closeSync(fd);
  process.stdout.write('\n');

  tabla(cuenta, 'Claves por familia:');
  console.log('\n  tipos: ' + Object.keys(porTipo).map((t) => t + '=' + porTipo[t]).join('  '));
  if (archivo) console.log('  respaldo: ' + archivo + '  (' + (bytes / 1048576).toFixed(2) + ' MB)');
  if (destinoTambien) console.log('  escritas en destino: ' + copiadas);
  return { total: leidas, archivo: archivo };
}

async function modoCopiar(opts) {
  const origen = abrirOrigen(), destino = abrirDestino();
  if (origen.base === destino.base) fallar('El origen y el destino son la MISMA base. Revisa las variables.');
  console.log('  origen : ' + origen.base);
  console.log('  destino: ' + destino.base + '\n');

  const yaHay = await todasLasClaves(destino, '*');
  if (yaHay.length && !opts.sobrescribir) {
    fallar('El destino ya tiene ' + yaHay.length + ' claves. Si es lo esperado, repite con --sobrescribir.');
  }
  const r = await modoRespaldo(opts, origen, destino);
  console.log('\n✓ Copia terminada: ' + r.total + ' claves. Ahora corre "verificar".');
}

async function modoRestaurar(opts, archivo) {
  if (!archivo || !fs.existsSync(archivo)) fallar('No encuentro el archivo de respaldo: ' + archivo);
  const destino = abrirDestino();
  console.log('  destino: ' + destino.base);
  mostrarFiltro(opts);

  const yaHay = await todasLasClaves(destino, '*');
  if (yaHay.length && !opts.sobrescribir) {
    fallar('El destino ya tiene ' + yaHay.length + ' claves. Si es lo esperado, repite con --sobrescribir.');
  }

  const lineas = fs.readFileSync(archivo, 'utf8').split('\n');
  const cuenta = {};
  let lote = [], total = 0, saltadas = 0;
  for (const linea of lineas) {
    if (!linea.trim()) continue;
    const reg = JSON.parse(linea);
    if (reg.__meta) { console.log('  respaldo del ' + reg.__meta.fecha + ' · ' + reg.__meta.claves + ' claves'); continue; }
    // Permite tomar un respaldo COMPLETO y restaurar solo una parte (ej. --solo-config).
    if (!casaCon(opts.patrones, reg.k)) { saltadas++; continue; }
    contar(cuenta, reg.k);
    lote.push(reg);
    if (lote.length >= LOTE_LECTURA) { total += await escribir(destino, lote); lote = []; process.stdout.write('\r  restaurando… ' + total); }
  }
  if (lote.length) total += await escribir(destino, lote);
  process.stdout.write('\n');
  tabla(cuenta, 'Claves restauradas por familia:');
  if (saltadas) console.log('\n  (' + saltadas + ' claves del archivo quedaron fuera por el filtro ' + opts.patrones.join(' ') + ')');
  console.log('\n✓ Restauradas ' + total + ' claves. Ahora corre "verificar".');
}

async function modoVerificar(opts) {
  const origen = abrirOrigen(), destino = abrirDestino();
  console.log('  origen : ' + origen.base);
  console.log('  destino: ' + destino.base + '\n');
  mostrarFiltro(opts);
  const a = await todasLasClaves(origen, opts.patrones);
  const b = new Set(await todasLasClaves(destino, opts.patrones));

  const faltan = a.filter((k) => !b.has(k));
  const ca = {}, cb = {};
  a.forEach((k) => contar(ca, k));
  Array.from(b).forEach((k) => contar(cb, k));

  const familias = Array.from(new Set(Object.keys(ca).concat(Object.keys(cb)))).sort();
  console.log('\nFamilia                    origen  destino');
  for (const f of familias) {
    const x = ca[f] || 0, y = cb[f] || 0;
    console.log('  ' + f.padEnd(24) + String(x).padStart(6) + String(y).padStart(9) + (x === y ? '' : '   <-- distinto'));
  }

  // Cotejo al detalle sobre una muestra: mismo tipo, mismo contenido y mismo vencimiento.
  const muestra = a.filter((k, i) => i % Math.max(1, Math.floor(a.length / 40)) === 0).slice(0, 40);
  let malos = 0;
  for (let i = 0; i < muestra.length; i += LOTE_LECTURA) {
    const trozo = muestra.slice(i, i + LOTE_LECTURA);
    const ra = await leerLote(origen, trozo), rb = await leerLote(destino, trozo);
    const mapa = {};
    rb.forEach((r) => { mapa[r.k] = r; });
    for (const r of ra) {
      const o = mapa[r.k];
      if (!o || o.t !== r.t || JSON.stringify(o.v) !== JSON.stringify(r.v)) { malos++; console.log('  ✗ contenido distinto: ' + r.k); continue; }
      // El TTL no tiene por qué ser idéntico al milisegundo (corre el reloj entre una lectura y otra),
      // pero sí tiene que existir en ambos lados y no haberse desviado más de un día.
      const sinVenc = (x) => x <= 0;
      if (sinVenc(r.ttl) !== sinVenc(o.ttl) || (!sinVenc(r.ttl) && Math.abs(r.ttl - o.ttl) > 86400000)) {
        malos++;
        console.log('  ✗ vencimiento distinto: ' + r.k + ' (origen ' + r.ttl + ' ms, destino ' + o.ttl + ' ms)');
      }
    }
  }

  console.log('\n  claves en origen: ' + a.length + '  ·  en destino: ' + b.size);
  if (faltan.length) {
    console.log('  ✗ faltan ' + faltan.length + ' en el destino. Primeras: ' + faltan.slice(0, 15).join(', '));
  }
  if (!faltan.length && !malos) console.log('\n✓ Todo cuadra (muestra de ' + muestra.length + ' claves cotejada al detalle, con sus vencimientos).');
  else fallar('La copia NO está completa. No cambies las variables de Vercel todavía.');
}

// ---------- arranque ----------
(async function () {
  const args = process.argv.slice(2);
  const modo = args[0];
  const opts = {
    patrones: ['*'],
    sobrescribir: args.includes('--sobrescribir'),
    sinRespaldo: args.includes('--sin-respaldo'),
    salida: '',
  };
  const iP = args.indexOf('--patron');
  if (iP >= 0) opts.patrones = String(args[iP + 1] || '*').split(',').map((s) => s.trim()).filter(Boolean);
  if (args.includes('--solo-config')) opts.patrones = PRESET_CONFIG;
  const iS = args.indexOf('--salida'); if (iS >= 0) opts.salida = args[iS + 1] || '';

  if (modo === 'respaldo') {
    console.log('\n== Respaldo de la base de HOY ==');
    const cli = abrirOrigen();
    console.log('  origen: ' + cli.base + '\n');
    const r = await modoRespaldo(opts, cli, null);
    console.log('\n✓ Listo. Guarda ese archivo FUERA de la computadora (contiene datos de clientes).');
  } else if (modo === 'copiar') {
    console.log('\n== Mudanza origen -> destino ==');
    await modoCopiar(opts);
  } else if (modo === 'restaurar') {
    console.log('\n== Restaurar respaldo en el destino ==');
    await modoRestaurar(opts, args[1] && !args[1].startsWith('--') ? path.resolve(args[1]) : '');
  } else if (modo === 'verificar') {
    console.log('\n== Cotejo origen vs destino ==');
    await modoVerificar(opts);
  } else {
    console.log([
      '',
      'Respaldo y mudanza de la base Upstash Redis del Minimarket.',
      '',
      '  node tools/migrar-redis.js respaldo               guarda TODO en respaldos/',
      '  node tools/migrar-redis.js copiar                 origen -> destino (respalda de paso)',
      '  node tools/migrar-redis.js copiar --solo-config   igual, pero SIN clientes ni pedidos',
      '  node tools/migrar-redis.js restaurar <archivo>    vuelca un respaldo en el destino',
      '  node tools/migrar-redis.js verificar              compara origen y destino',
      '',
      'Variables:  UPSTASH_REDIS_REST_URL/_TOKEN (origen)  ·  UPSTASH_DESTINO_REST_URL/_TOKEN (destino)',
      'Opciones :  --solo-config  --patron a,b,c  --sobrescribir  --sin-respaldo  --salida <ruta>',
      '',
      '--solo-config = ' + PRESET_CONFIG.join('  '),
      '',
    ].join('\n'));
  }
})().catch((e) => {
  console.error('\n✗ ' + (e && e.avisado ? e.message : 'FALLÓ: ' + (e && e.message ? e.message : e)) + '\n');
  process.exitCode = 1;
});
