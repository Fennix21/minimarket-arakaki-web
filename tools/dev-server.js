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
    res.writeHead(200, { 'content-type': 'application/json' });
    // Stub del chat web: permite ver el widget en local (el bot real corre en Vercel)
    if (url === '/api/chat') {
      return res.end(req.method === 'POST'
        ? JSON.stringify({
            reply: 'Respuesta de prueba del dev-server 🤖 (el bot real corre en Vercel con ANTHROPIC_API_KEY).\n\nCada párrafo sale como mensaje aparte, con su "escribiendo…" delante. Mira /pisco o /whisky.',
            sugerencias: ['Ver piscos', 'Quiero hacer un pedido', '¿Hacen delivery?'],
          })
        : '{"on":true}');
    }
    // Stub del push: sin clave VAPID (el botón de ofertas muestra "muy pronto")
    if (url === '/api/push') return res.end(req.method === 'POST' ? '{"ok":true,"stub":true}' : '{"key":null}');
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
