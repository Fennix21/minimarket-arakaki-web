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
    // Stub del push: sin clave VAPID (el botón de ofertas muestra "muy pronto")
    if (url === '/api/push') return res.end(req.method === 'POST' ? '{"ok":true,"stub":true}' : '{"key":null}');
    // Stub de la cuenta del Club: permite ver /mi-cuenta y las estrellas ⭐ en local
    if (url === '/api/cuenta') {
      const funciones = { favoritos: true, puntos: true, promos: true, sorteos: true };
      const perfil = {
        on: true, conocido: true, funciones, nombre: 'Cliente de prueba', telefono: '51999999999',
        email: 'prueba@correo.com', foto: '',
        direccion: 'Av. Prueba 123, San Isidro (portón verde)',
        direcciones: ['Calle Los Pinos 456, Miraflores'],
        pedidos: 3, puntos: 120,
        favs: [{ name: 'Pisco Porton Mosto Verde Acholado x 750 ml', price: 105 }],
        habitual: [{ name: 'Pisco Porton Mosto Verde Acholado x 750 ml', price: 105, img: '', qty: 1, veces: 3 }],
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
          let accion = '';
          try { accion = JSON.parse(cuerpo).action || ''; } catch (e) {}
          if (accion === 'recuperar') return res.end('{"ok":true,"codigo":true}');
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
      return res.end(conToken ? JSON.stringify(perfil) : JSON.stringify({ on: true, funciones, correo: true }));
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
