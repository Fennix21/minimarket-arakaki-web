// Servidor local para previsualizar el sitio (imita el cleanUrls de Vercel).
// Correr con: node tools/dev-server.js [puerto]  → http://localhost:3210
// Las rutas /api/* responden un stub {ok:true} (el backend real corre en Vercel).
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PUERTO = +process.argv[2] || 3210;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json',
};

http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url.startsWith('/api/')) {
    // Stub de la baja de correos promocionales (página HTML, no JSON)
    if (url === '/api/correo') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end('<body style="background:#262626;color:#f4ebd6;font-family:Georgia;text-align:center;padding:60px">Listo 💛 (stub de baja de correos)</body>');
    }
    // Stub de compartir producto: redirige a la categoría con ?p= (el OG real corre en Vercel)
    if (url === '/api/compartir') {
      const q = new URLSearchParams((req.url || '').split('?')[1] || '');
      const nom = q.get('p') || '';
      const pr = require('../api/_catalogo').PRODUCTOS.find((x) => x.n === nom);
      res.writeHead(302, { location: pr ? '/' + pr.c + '?p=' + encodeURIComponent(nom) : '/' });
      return res.end();
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    // Stub del chat web: permite ver el widget en local (el bot real corre en Vercel)
    if (url === '/api/chat') {
      return res.end(req.method === 'POST'
        ? JSON.stringify({
            reply: 'Respuesta de prueba del dev-server 🤖 (el bot real corre en Vercel con ANTHROPIC_API_KEY).\n\n¡Activa nuestros *avisos gratis* 🔔 y déjame tu WhatsApp o correo para enterarte primero de las ofertas!',
            sugerencias: ['Te dejo mi WhatsApp', 'Ver productos', '¿Qué ofertas hay?'],
            push: true,
          })
        : '{"on":true}');
    }
    // Stub del perfil: cliente reconocido de prueba (saludo de la portada + prefill del carrito)
    if (url === '/api/perfil') {
      return res.end(JSON.stringify({
        conocido: true, nombre: 'Cliente de prueba', telefono: '51999999999', pedidos: 3,
        habitual: [{ name: 'Pisco Porton Mosto Verde Acholado x 750 ml', price: 105, img: '', qty: 1, veces: 3 }],
      }));
    }
    // Stub de textos y fondos del sitio: sin overrides, como una instalación recién hecha
    // (el sitio pinta sus defaults: SITIO_DEF de site.js y las variables --bg-* de site.css).
    // `k` = apariencia del carrito con muestra para ver en local el toque final editado (máquina de
    // escribir + brillo + degradado dorado del botón Sumar + fondo crema); en producción viene de config:carrito.
    if (url === '/api/sitio') return res.end(JSON.stringify({
      s: {}, f: {}, t: {},
      k: {
        txt: {}, tam: { toqueTit: 1.1 }, fx: { typing: 1, brillo: 1 },
        toqueTitCol: '#7a5c14', btnSumarTxt: '#4a0c10',
        toqueBg: 'linear-gradient(180deg, #fdf8ec 0%, #f6ecd0 100%)',
        btnSumar: 'linear-gradient(180deg, #f7dc8f 0%, #d4a941 60%, #b8912f 100%)',
      },
    }));
    // Stub del push: sin clave VAPID (el botón de ofertas muestra "muy pronto")
    if (url === '/api/push') return res.end(req.method === 'POST' ? '{"ok":true,"stub":true}' : '{"key":null}');
    // Stub de precios/stock/productos nuevos/videos/combos: muestras para ver el diseño en /pisco en local
    // (combos: /pisco muestra uno personalizado; el resto de páginas usa el pareo automático COMPLE_AUTO)
    if (url === '/api/precios') {
      return res.end(JSON.stringify({
        p: {},
        s: { 'pisco|Pisco Ocucaje Acholado x 700 ml': 'agotado' },
        x: [{ id: 'xdemo', cat: 'pisco', sec: '', nombre: 'Producto nuevo de prueba (solo en local)', precio: '25', img: '/img/productos/pisco/02-pisco-biondi-acholado-x-500-ml.webp', ts: 0 }],
        v: { pisco: { v: '/img/videos/refrescos.mp4', t: 'Video cambiado desde el panel (dev)', s: 'Subtítulo de prueba (solo en local)' } },
        c: { cats: { pisco: { t: '🥂 Para tu chilcano (combo de prueba local)', prods: ['Ginger Ale Canada Dry x 355 ml', 'Chocolate Ferrero Rocher x 8 unidades'] } } },
      }));
    }
    // Stub de la cuenta del Club: permite ver /mi-cuenta y las estrellas ⭐ en local
    if (url === '/api/cuenta') {
      const funciones = { favoritos: true, puntos: true, promos: true, sorteos: true, cupones: true };
      const banners = [
        { id: 'b1', titulo: '🍷 Semana del vino', texto: 'Publicidad de prueba desde el panel (dev)', imagen: '/img/fachada-principal.webp', url: '/vinos' },
        { id: 'b2', titulo: '🎁 Solo texto', texto: 'Banner sin imagen: tarjeta degradada', imagen: '', url: '' },
      ];
      const perfil = {
        on: true, conocido: true, funciones, banners, nombre: 'Cliente de prueba', telefono: '51999999999',
        email: 'prueba@correo.com', foto: '',
        direccion: 'Av. Prueba 123, San Isidro (portón verde)',
        direcciones: ['Calle Los Pinos 456, Miraflores'],
        pedidos: 3, puntos: 120,
        favs: [{ name: 'Pisco Porton Mosto Verde Acholado x 750 ml', price: 105 }],
        favCols: [
          { n: 'Mis Favoritos', p: ['Pisco Porton Mosto Verde Acholado x 750 ml'] },
          { n: 'Para reuniones', p: ['Pisco Porton Mosto Verde Acholado x 750 ml'] },
        ],
        habitual: [{ name: 'Pisco Porton Mosto Verde Acholado x 750 ml', price: 105, img: '', qty: 1, veces: 3 }],
        historial: [
          { id: 'h1', ts: Date.now() - 86400000, total: 129, estado: 'nuevo', items: [
            { name: 'Pisco Porton Mosto Verde Acholado x 750 ml', qty: 1, price: 105, img: '' },
            { name: 'Ginger Ale Canada Dry x 355 ml', qty: 4, price: 6, img: '' },
          ] },
          { id: 'h2', ts: Date.now() - 4 * 86400000, total: 48, estado: 'entregado', items: [
            { name: 'Cerveza Cusqueña Dorada x 620 ml', qty: 4, price: 12, img: '' },
          ] },
          { id: 'h3', ts: Date.now() - 40 * 86400000, total: 25, estado: 'entregado', items: [
            { name: 'Chocolate Ferrero Rocher x 8 unidades', qty: 1, price: 25, img: '' },
          ] },
        ],
        promos: [{ id: 'cp1', titulo: 'Promo de prueba', texto: '2x1 en helados solo para el Club (dev)' }],
        sorteos: [{ id: 'so1', titulo: 'Sorteo de prueba', premio: 'Canasta Arakaki', participando: false }],
        preguntas: [
          { id: 'q2', pregunta: '¿Hacen delivery los domingos?', ts: Date.now() - 3600000, respuesta: '', respTs: null },
          { id: 'q1', pregunta: '¿Tienen pisco quebranta?', ts: Date.now() - 86400000, respuesta: '¡Sí! Nos llega el viernes 🙌', respTs: Date.now() - 7200000 },
        ],
      };
      if (req.method === 'POST') {
        // Lee el body para responder según la acción (recuperar = manda "código" al correo)
        let cuerpo = '';
        req.on('data', (c) => { cuerpo += c; });
        req.on('end', () => {
          let b = {};
          try { b = JSON.parse(cuerpo) || {}; } catch (e) {}
          const accion = b.action || '';
          if (accion === 'recuperar') return res.end('{"ok":true,"codigo":true}');
          // Favoritos por listas: eco de las listas elegidas (stub de 1 producto)
          if (accion === 'fav') {
            const cols = Array.isArray(b.cols) ? b.cols : (b.on ? ['Mis Favoritos'] : []);
            const prod = b.producto || '';
            return res.end(JSON.stringify({
              ok: true,
              favs: (prod && cols.length) ? [prod] : [],
              favCols: cols.map((n) => ({ n: n, p: [prod] })),
            }));
          }
          res.end(JSON.stringify({
            ok: true, token: 'sdevtoken', perfil, favs: perfil.favs.map(f => f.name), participando: true,
            nombre: 'Cliente de prueba', email: 'prueba@correo.com',
            direccion: perfil.direccion, direcciones: perfil.direcciones,
            pregunta: { id: 'q' + Date.now().toString(36), pregunta: '(pregunta de prueba)', ts: Date.now(), respuesta: '', respTs: null },
          }));
        });
        return;
      }
      const conToken = (req.url || '').indexOf('token=') >= 0;
      // ui = apariencia editable de /mi-cuenta (config:clubui). Vacío = look por defecto (crema/vino/pie apagado).
      return res.end(conToken ? JSON.stringify(perfil) : JSON.stringify({ on: true, funciones, correo: true, banners, ui: {} }));
    }
    // Stub del CRM del panel: datos de MUESTRA para ver /panel en local con cualquier contraseña
    // (el CRM real corre en Vercel con Redis). Cubre las vistas con datos: pedidos, consultas,
    // clientes, club, precios y las analíticas con series diarias.
    if (url === '/api/crm' && req.method === 'POST') {
      let cuerpo = '';
      req.on('data', (c) => { cuerpo += c; });
      req.on('end', () => {
        let b = {};
        try { b = JSON.parse(cuerpo) || {}; } catch (e) {}
        const dia = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
        const serie = (arr) => arr.map((n, i) => ({ day: dia(arr.length - 1 - i), n }));
        const dias = [7, 14, 30].includes(Number(b.dias)) ? Number(b.dias) : 7;
        const pv = Array.from({ length: dias }, (_, i) => 18 + ((i * 7) % 23) + (i === dias - 1 ? 14 : 0));
        const pd = Array.from({ length: dias }, (_, i) => (i * 3) % 4 === 0 ? 2 : (i % 3 === 0 ? 1 : 0));
        const wa = pv.map((n) => Math.round(n / 4));
        const R = {
          stats: {
            dias,
            daily: serie(pv),
            series: { pageview: serie(pv), pedido_enviado: serie(pd), whatsapp_click: serie(wa), llamada_click: serie(pd), chatweb_abierto: serie(pd.map((n) => n + 1)) },
            prev: { pageview: Math.round(pv.reduce((a, c) => a + c, 0) * 0.8), pedido_enviado: 3, whatsapp_click: 30, llamada_click: 2, chatweb_abierto: 9 },
            events: { pageview: 999, pedido_enviado: 21, whatsapp_click: 140, llamada_click: 6, chatweb_abierto: 33, chatweb_msg: 88, chatweb_suscriptor: 7, chatweb_consulta: 4, compartir_chat: 12, compartir_estado: 5, compartir_link: 3, club_cuenta: 9, club_login: 25, club_sorteo: 11, comple_elegir: 8, comple_carrito: 5, push_enviados: 60, push_click: 14, evento_raro: 2 },
            pages: { '/': 320, '/pisco': 120, '/vinos': 95, '/cervezas': 70, '/mi-cuenta': 22 },
            refs: { directo: 220, 'instagram.com': 90, 'facebook.com': 45, 'google.com': 30, 'otroblog.pe': 4 },
          },
          pedidos: { pedidos: [
            { id: 'p1', nombre: 'Rosa Quispe', direccion: 'Av. Aviación 123', items: [{ qty: 2, name: 'Cerveza Cusqueña Dorada x 620 ml' }], total: 24, ts: Date.now() - 3600000, estado: 'nuevo' },
            { id: 'p2', nombre: 'Juan Pérez', direccion: 'Calle Los Pinos 456', items: [{ qty: 1, name: 'Pisco Porton Mosto Verde Acholado x 750 ml' }], total: 105, ts: Date.now() - 86400000, estado: 'preparando' },
            { id: 'p3', nombre: 'María Torres', direccion: 'Jr. Unión 789', items: [{ qty: 3, name: 'Ginger Ale Canada Dry x 355 ml' }], total: 15, ts: Date.now() - 2 * 86400000, estado: 'entregado' },
          ] },
          consultas: { consultas: [{ id: 'c1', producto: 'Whisky 18 años', pregunta: '¿Tienen whisky de 18 años?', ts: Date.now() - 7200000 }] },
          preguntas: { preguntas: [
            { id: 'q1', tel: '51999999999', nombre: 'Rosa Quispe', pregunta: '¿Hacen delivery los domingos?', ts: Date.now() - 3600000 },
            { id: 'q2', tel: '51988888888', nombre: 'Juan Pérez', pregunta: '¿Aceptan Yape?', ts: Date.now() - 86400000, respuesta: '¡Sí! Yape y Plin 🙌', respTs: Date.now() - 4000000 },
          ] },
          clientes: { clientes: [
            { id: '51999999999', telefono: '51999999999', nombre: 'Rosa Quispe', creado: Date.now() - 30 * 86400000, pedidos: 5, puntos: 120, gastoTotal: 260, ultimaVisita: Date.now() - 3600000, ultimoPedido: Date.now() - 3600000, tienePin: true, email: 'rosa@correo.com', top: [{ nombre: 'Cerveza Cusqueña Dorada x 620 ml', veces: 4 }] },
            { id: '51988888888', telefono: '51988888888', nombre: 'Juan Pérez', creado: Date.now() - 10 * 86400000, pedidos: 1, puntos: 0, gastoTotal: 105, ultimoPedido: Date.now() - 86400000, tienePin: false },
          ] },
          getclub: {
            club: { login: true, favoritos: true, puntos: true, promos: true, sorteos: true, cupones: true, puntosPorSol: 1 },
            promos: [{ id: 'pr1', titulo: '🍦 2x1 en helados para el Club', texto: 'Muestra tu cuenta en caja', hasta: null }],
            cupones: [],
            sorteos: [{ id: 'so1', titulo: '🎆 Sorteo Fiestas Patrias', premio: 'Canasta Arakaki', hasta: null, activo: true, participantes: 11 }],
            banners: [{ id: 'b1', titulo: '🍷 Semana del vino', texto: 'Banner de muestra (dev)', imagen: '/img/fachada-principal.webp', url: '/vinos', hasta: null }],
            ui: { cremaBg: '', bannerTxt: '', kpCol: '', footerOn: false, footerBg: '', footerLogo: '' },
          },
          getprecios: { p: { 'pisco|Pisco Ocucaje Acholado x 700 ml': '48' }, s: { 'pisco|Pisco Ocucaje Acholado x 700 ml': 'agotado' }, x: [] },
          list: { leads: [{ phone: '51999999999', name: 'Rosa Quispe', status: 'interesado', lastText: '¿Tienen pisco quebranta?', lastRole: 'user', updatedAt: Date.now() - 1800000, lastUserTs: Date.now() - 1800000, tags: [] }] },
          reset: { ok: true, total: 137, detalle: { 'stat:*': 96, 'lead:*': 3, 'cliente:*': 5, 'sorteo:*': 2, listas: 6 } },
        };
        res.end(JSON.stringify(R[b.action] || { ok: true, stub: true }));
      });
      return;
    }
    return res.end('{"ok":true,"stub":true}');
  }
  let archivo = url === '/' ? '/index.html' : url;
  if (!path.extname(archivo)) archivo += '.html'; // cleanUrls: /vinos -> vinos.html
  const ruta = path.join(RAIZ, archivo);
  if (!ruta.startsWith(RAIZ) || !fs.existsSync(ruta)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('No encontrado: ' + url);
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(ruta)] || 'application/octet-stream' });
  fs.createReadStream(ruta).pipe(res);
}).listen(PUERTO, () => console.log('Sitio en http://localhost:' + PUERTO));
