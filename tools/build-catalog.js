// Construye data/catalog.js (el catálogo que leen las páginas) a partir de
// data/catalog-fuente.json (extraído del sitio original en Systeme.io).
// Correr con: node tools/build-catalog.js
const fs = require('fs');
const path = require('path');
const src = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/catalog-fuente.json'), 'utf8'));

// Metadatos por categoría: título del menú, emoji, hero y video (del sitio original).
const META = {
  'pisco':                 { title: 'Piscos',               emoji: '🥃', hero: 'Celebra a lo Grande' },
  'vinos':                 { title: 'Vinos Españoles',      emoji: '🇪🇸', hero: 'Celebra a lo Grande' },
  'vinos-peruanos':        { title: 'Vinos Peruanos',       emoji: '🇵🇪', hero: 'Celebra a lo Grande' },
  'vinos-argentinos':      { title: 'Vinos Argentinos',     emoji: '🇦🇷', hero: 'Celebra a lo Grande' },
  'vinos-chilenos':        { title: 'Vinos Chilenos',       emoji: '🇨🇱', hero: 'Celebra a lo Grande' },
  'whisky':                { title: 'Whisky',               emoji: '🥃', hero: 'Celebra a lo Grande' },
  'ron':                   { title: 'Ron',                  emoji: '🍹', hero: 'Celebra a lo Grande' },
  'licor-frances':         { title: 'Licores Franceses',    emoji: '🇫🇷', hero: 'Celebra a lo Grande' },
  'licor-italiano':        { title: 'Licores Italianos',    emoji: '🇮🇹', hero: 'Celebra a lo Grande' },
  'vodka':                 { title: 'Vodka',                emoji: '🍸', hero: 'Celebra a lo Grande' },
  'tequila':               { title: 'Tequila',              emoji: '🌵', hero: 'Celebra a lo Grande' },
  'anisado':               { title: 'Anisado',              emoji: '🥂', hero: 'Celebra a lo Grande' },
  'licores-variados':      { title: 'Más Licores',          emoji: '🍾', hero: 'Celebra a lo Grande' },
  'refrescos':             { title: 'Gaseosa en Lata',      emoji: '🥤', hero: 'Refréscate' },
  'aguas-importadas':      { title: 'Aguas Importadas',     emoji: '💧', hero: 'Refréscate con Estilo' },
  'helados':               { title: 'Helados',              emoji: '🍦', hero: 'Engríete' },
  'chocolates-importados': { title: 'Chocolates',           emoji: '🍫', hero: 'Disfruta de un Buen Chocolate sin Culpa' },
  'dulces':                { title: 'Dulces',               emoji: '🍬', hero: 'Endúlzate' },
  'galletas':              { title: 'Galletas, Snacks y más', emoji: '🍪', hero: 'Disfruta de una Buena Galleta o Snack sin Culpa' },
  'backtoschool':          { title: 'Desayuno Escolar',     emoji: '🎒', hero: 'Arma tu Lonchera y te la Llevamos a Casa' },
  'frutas-y-vegetales':    { title: 'Frutas y Vegetales',   emoji: '🥦', hero: 'Come Bien sin Perder Tiempo' },
};

// Textos que NO son productos ni secciones (hero, footer, menú...).
const SKIP = [
  /^lo que necesitas/i, /^delivery gratis/i, /^hay detalles/i, /^☰/, /menú$/i,
  /^sonríe/i, /^te lo ganaste/i, /^visítanos/i, /^tu navegador/i, /^pide por whatsapp/i,
  /^el tiempo vale oro/i, /^cereales importados/i,
];
function isSkip(t) { return SKIP.some((r) => r.test(t)); }

const catalog = { categories: {}, order: Object.keys(META) };

for (const slug of Object.keys(META)) {
  const page = src[slug];
  if (!page) { console.warn('SIN DATOS:', slug); continue; }
  const meta = META[slug];
  const cat = { slug, title: meta.title, emoji: meta.emoji, hero: meta.hero, video: null, sections: [] };

  // Video de la categoría (primero del stream)
  const vid = page.stream.find((i) => i.t === 'video');
  if (vid) cat.video = vid.v;

  if (page.products.length) {
    // Página con tarjetas (precio incluido): una sola sección.
    cat.sections.push({ title: meta.title, products: page.products.map((p) => ({ name: p.name, price: p.price || null, img: p.img })) });
  } else {
    // Página nativa: emparejar IMG seguida de TXT = producto; TXT solo = título de sección.
    let section = null;
    let pendingImg = null;
    const heroDone = new Set([meta.hero.toLowerCase()]);
    for (const it of page.stream) {
      if (it.t === 'video') continue;
      if (it.t === 'img') {
        // Logos del encabezado (aparecen antes de cualquier sección) se ignoran.
        pendingImg = it.v;
        continue;
      }
      const txt = it.v.trim();
      if (!txt || isSkip(txt) || heroDone.has(txt.toLowerCase())) { pendingImg = null; continue; }
      if (pendingImg && section) {
        section.products.push({ name: txt, price: null, img: pendingImg });
        pendingImg = null;
      } else {
        // Título de sección nuevo
        section = { title: txt, products: [] };
        cat.sections.push(section);
        pendingImg = null;
      }
    }
    cat.sections = cat.sections.filter((s) => s.products.length);
  }
  const total = cat.sections.reduce((n, s) => n + s.products.length, 0);
  console.log(slug.padEnd(24), total + ' productos en ' + cat.sections.length + ' sección(es)');
  catalog.categories[slug] = cat;
}

const out = '// GENERADO por tools/build-catalog.js — no editar a mano (edita catalog-fuente.json y regenera)\n'
  + 'window.ARAKAKI_CATALOG = ' + JSON.stringify(catalog, null, 1) + ';\n';
fs.writeFileSync(path.join(__dirname, '../data/catalog.js'), out);
console.log('\nOK -> data/catalog.js');

// Índice liviano del catálogo para las funciones serverless (api/whatsapp.js, api/crm.js y api/compartir.js):
// c = slug de la categoría, n = nombre exacto, p = precio base (o null), i = ruta de la foto (o null).
const productos = [];
for (const slug of catalog.order) {
  const cat = catalog.categories[slug];
  if (!cat) continue;
  cat.sections.forEach((s) => s.products.forEach((p) => productos.push({ c: slug, n: p.name, p: p.price || null, i: p.img || null })));
}
const outApi = '// GENERADO por tools/build-catalog.js — no editar a mano (edita catalog-fuente.json y regenera)\n'
  + 'module.exports.PRODUCTOS = ' + JSON.stringify(productos) + ';\n';
fs.writeFileSync(path.join(__dirname, '../api/_catalogo.js'), outApi);
console.log('OK -> api/_catalogo.js (' + productos.length + ' productos)');
