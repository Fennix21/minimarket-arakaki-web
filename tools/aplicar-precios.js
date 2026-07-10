// Consolida los precios "en vivo" (Redis config:precios) dentro de data/catalog-fuente.json,
// para que la fuente en git no quede desactualizada frente a los overrides del panel/WhatsApp.
// Uso:  node tools/aplicar-precios.js [--borrar]
//   Necesita UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN en el entorno (las de Vercel).
//   --borrar: además elimina de Redis los overrides que se lograron aplicar a la fuente.
// Después de correrlo: node tools/build-catalog.js y commit.
const fs = require('fs');
const path = require('path');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
if (!REDIS_URL || !REDIS_TOKEN) {
  console.error('Faltan UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN en el entorno.');
  process.exit(1);
}

async function redis(cmd) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const data = await r.json();
  return data.result;
}

(async function () {
  const raw = await redis(['GET', 'config:precios']);
  const overrides = raw ? JSON.parse(raw) : {};
  const claves = Object.keys(overrides);
  if (!claves.length) { console.log('No hay precios especiales en Redis. Nada que consolidar.'); return; }

  const rutaFuente = path.join(__dirname, '../data/catalog-fuente.json');
  const fuente = JSON.parse(fs.readFileSync(rutaFuente, 'utf8'));

  const aplicados = [];
  const pendientes = [];
  for (const clave of claves) {
    const sep = clave.indexOf('|');
    const slug = clave.slice(0, sep), nombre = clave.slice(sep + 1);
    const page = fuente[slug];
    const prod = page && page.products && page.products.find((p) => p.name === nombre);
    if (prod) {
      console.log(slug + ' · ' + nombre + ': S/ ' + (prod.price || '—') + ' -> S/ ' + overrides[clave]);
      prod.price = overrides[clave];
      aplicados.push(clave);
    } else {
      // Categorías sin products[] (stream img+txt) no llevan precio en la fuente: el override se queda en Redis.
      console.warn('NO APLICADO (queda en Redis): ' + clave);
      pendientes.push(clave);
    }
  }

  if (aplicados.length) {
    fs.writeFileSync(rutaFuente, JSON.stringify(fuente, null, 1));
    console.log('\n' + aplicados.length + ' precio(s) consolidados en catalog-fuente.json.');
    console.log('Ahora corre: node tools/build-catalog.js  (y commit + push)');
  }

  if (process.argv.includes('--borrar') && aplicados.length) {
    const restantes = {};
    pendientes.forEach((k) => { restantes[k] = overrides[k]; });
    await redis(['SET', 'config:precios', JSON.stringify(restantes)]);
    console.log('Overrides aplicados eliminados de Redis (' + pendientes.length + ' quedan pendientes).');
  }
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
