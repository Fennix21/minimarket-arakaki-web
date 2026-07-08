// Genera las 20 páginas de categoría (HTML delgados que usan data/catalog.js).
// Correr con: node tools/build-pages.js
const fs = require('fs');
const path = require('path');

// Los títulos/emoji viven en data/catalog.js; aquí solo la lista de slugs y <title>.
const PAGES = {
  'pisco': 'Piscos', 'vinos': 'Vinos Españoles', 'vinos-peruanos': 'Vinos Peruanos',
  'vinos-argentinos': 'Vinos Argentinos', 'vinos-chilenos': 'Vinos Chilenos', 'whisky': 'Whisky',
  'ron': 'Ron', 'licor-frances': 'Licores Franceses', 'licor-italiano': 'Licores Italianos',
  'vodka': 'Vodka', 'tequila': 'Tequila', 'anisado': 'Anisado', 'licores-variados': 'Más Licores',
  'refrescos': 'Gaseosas en Lata Importadas', 'helados': 'Helados', 'chocolates-importados': 'Chocolates',
  'dulces': 'Dulces', 'galletas': 'Galletas, Snacks y más', 'backtoschool': 'Desayuno Escolar',
  'frutas-y-vegetales': 'Frutas y Vegetales',
};

const LOGO = 'https://d1yei2z3i6k35z.cloudfront.net/13036429/686355140e0a3_SitioWebLogoColorArakaki.png';

function plantilla(slug, titulo) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titulo} | Minimarket Arakaki</title>
<meta name="description" content="${titulo} con delivery en San Isidro. Pide por WhatsApp al Minimarket Arakaki: lo que necesitas, cuando lo necesitas.">
<link rel="icon" href="${LOGO}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&family=Poppins:wght@500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<div id="preloader">
  <img src="${LOGO}" alt="Minimarket Arakaki">
  <div class="pre-barra"><span></span></div>
  <div class="pre-texto">SONRÍE Y DATE EL GUSTO</div>
</div>

<main id="contenido-categoria"></main>

<script src="/data/catalog.js"></script>
<script src="/assets/site.js"></script>
<script>renderCategoria('${slug}');</script>
<script src="/track.js" defer></script>
</body>
</html>
`;
}

for (const slug of Object.keys(PAGES)) {
  fs.writeFileSync(path.join(__dirname, '..', slug + '.html'), plantilla(slug, PAGES[slug]));
  console.log('OK', slug + '.html');
}
