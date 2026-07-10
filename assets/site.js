// Minimarket Arakaki — JS compartido: preloader, header/menú/footer, carrito → WhatsApp.
(function () {
  var WA = '51977737199'; // WhatsApp del minimarket
  var TELS = ['012218582', '977737199', '960725996', '964295436', '933477179'];
  var LOGO = '/img/logo-arakaki.webp';
  var LOGO_BLANCO = '/img/logo-gato.png'; // logo horizontal blanco del header (gato de la suerte)
  var REDES = {
    facebook: { url: 'https://www.facebook.com/minimarketarakaki1', img: '/img/redes/facebook.png' },
    instagram: { url: 'https://www.instagram.com/arakakiminimarket', img: '/img/redes/instagram.png' },
    youtube: { url: 'https://www.youtube.com/@arakakiminimarket', img: '/img/redes/youtube.png' },
  };
  var MENU = [
    { grupo: 'Inicio', items: [{ href: '/', txt: '🏠 Página principal' }] },
    { grupo: 'Licores', items: [
      { href: '/pisco', txt: '🥃 Piscos' }, { href: '/vinos', txt: '🇪🇸 Vinos Españoles' },
      { href: '/vinos-peruanos', txt: '🇵🇪 Vinos Peruanos' }, { href: '/vinos-argentinos', txt: '🇦🇷 Vinos Argentinos' },
      { href: '/vinos-chilenos', txt: '🇨🇱 Vinos Chilenos' }, { href: '/whisky', txt: '🥃 Whisky' },
      { href: '/ron', txt: '🍹 Ron' }, { href: '/licor-frances', txt: '🇫🇷 Licores Franceses' },
      { href: '/licor-italiano', txt: '🇮🇹 Licores Italianos' }, { href: '/vodka', txt: '🍸 Vodka' },
      { href: '/tequila', txt: '🌵 Tequila' }, { href: '/anisado', txt: '🥂 Anisado' },
      { href: '/licores-variados', txt: '🍾 Más Licores' },
    ] },
    { grupo: 'Para engreírte', items: [
      { href: '/helados', txt: '🍦 Helados' }, { href: '/chocolates-importados', txt: '🍫 Chocolates' },
      { href: '/dulces', txt: '🍬 Dulces' }, { href: '/galletas', txt: '🍪 Galletas, Snacks y más' },
      { href: '/refrescos', txt: '🥤 Gaseosa en Lata' }, { href: '/aguas-importadas', txt: '💧 Aguas Importadas' },
    ] },
    { grupo: 'Para tu día a día', items: [
      { href: '/backtoschool', txt: '🎒 Desayuno Escolar' }, { href: '/frutas-y-vegetales', txt: '🥦 Frutas y Vegetales' },
    ] },
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------- Header, menú, footer, carrito (se inyectan en cada página) ----------
  function armarBase() {
    var cab = document.createElement('header');
    cab.className = 'cab';
    cab.innerHTML =
      '<a href="/"><img class="logo" src="' + LOGO_BLANCO + '" alt="Minimarket Arakaki"></a>' +
      '<div class="esp"></div>' +
      '<div class="lema-cab">Lo que necesitas, cuando lo necesitas</div>' +
      '<button class="btn-menu" id="btn-menu" aria-label="Abrir menú">☰ Menú</button>';
    document.body.insertBefore(cab, document.body.firstChild);

    var fondo = document.createElement('div');
    fondo.id = 'menu-fondo';
    var panel = document.createElement('nav');
    panel.id = 'menu-panel';
    var html = '<button class="menu-cerrar" aria-label="Cerrar">✕</button>';
    MENU.forEach(function (g) {
      html += '<div class="menu-grupo">' + g.grupo + '</div>';
      g.items.forEach(function (it) {
        var activo = location.pathname === it.href || location.pathname === it.href + '.html' ? ' class="activo"' : '';
        html += '<a href="' + it.href + '"' + activo + '>' + it.txt + '</a>';
      });
    });
    panel.innerHTML = html;
    document.body.appendChild(fondo);
    document.body.appendChild(panel);
    document.getElementById('btn-menu').onclick = function () { document.body.classList.add('menu-abierto'); };
    fondo.onclick = cerrarMenu;
    panel.querySelector('.menu-cerrar').onclick = cerrarMenu;
    function cerrarMenu() { document.body.classList.remove('menu-abierto'); }

    // Footer
    var pie = document.createElement('footer');
    pie.className = 'pie';
    var telsHtml = TELS.map(function (t, i) { return '<a class="tel" href="tel:' + t + '">📞 Línea ' + (i + 1) + ': ' + t + '</a>'; }).join('');
    var redesHtml = Object.keys(REDES).map(function (k) {
      return '<a href="' + REDES[k].url + '" target="_blank" rel="noopener" aria-label="' + k + '"><img src="' + REDES[k].img + '" alt="' + k + '"></a>';
    }).join('');
    pie.innerHTML =
      '<div class="interior">' +
        '<div><h4>Visítanos</h4><p>Av. Belén 265, San Isidro<br>(A solo 2 cuadras del Golf)</p>' +
          '<p style="margin-top:10px"><a href="https://www.google.com/maps/search/?api=1&amp;query=ARAKAKI+Minimarket+Av+Belen+265+San+Isidro" target="_blank" rel="noopener" style="text-decoration:underline">Ver ubicación en mapa</a></p></div>' +
        '<div class="horario"><h4>Horario de atención</h4>' +
          '<p>Lun – Sáb: 7:00 am – 9:00 pm</p><p>Domingos: 8:00 am – 8:00 pm</p>' +
          '<p>Atendemos todos los días, incluso feriados</p></div>' +
        '<div><h4>Contáctanos</h4>' + telsHtml + '</div>' +
        '<div><h4>Síguenos en nuestras redes</h4><div class="redes">' + redesHtml + '</div></div>' +
      '</div>' +
      '<p class="copy">Minimarket Arakaki ' + new Date().getFullYear() + ' — Todos los derechos reservados</p>';
    document.body.appendChild(pie);

    // Carrito flotante + modal
    var btn = document.createElement('button');
    btn.id = 'carrito-btn';
    btn.innerHTML = '🛒 Ver mi pedido <span class="badge">0</span>';
    btn.onclick = abrirCarrito;
    document.body.appendChild(btn);

    var modalFondo = document.createElement('div');
    modalFondo.id = 'carrito-modal-fondo';
    modalFondo.innerHTML =
      '<div id="carrito-modal">' +
        '<button class="car-cerrar" aria-label="Cerrar">✕</button>' +
        '<h3>🛒 Tu pedido</h3>' +
        '<p class="car-nota">Delivery gratis llegando a un monto mínimo · Pago contra entrega o Yape/Plin</p>' +
        '<div id="car-lista"></div>' +
        '<div class="car-total"><span>Total</span><span id="car-total-monto">S/ 0</span></div>' +
        '<label for="car-nombre">Tu nombre</label>' +
        '<input id="car-nombre" placeholder="¿Cómo te llamas?" maxlength="60">' +
        '<label for="car-dir">Dirección de entrega (opcional)</label>' +
        '<textarea id="car-dir" rows="2" placeholder="Calle, número, distrito y referencia" maxlength="200"></textarea>' +
        '<button class="btn-wa-grande" id="car-enviar">Enviar pedido por WhatsApp 📲</button>' +
        '<button class="car-vaciar" id="car-vaciar">Vaciar pedido</button>' +
      '</div>';
    document.body.appendChild(modalFondo);
    modalFondo.onclick = function (e) { if (e.target === modalFondo) cerrarCarrito(); };
    modalFondo.querySelector('.car-cerrar').onclick = cerrarCarrito;
    document.getElementById('car-vaciar').onclick = function () { guardarCarrito([]); pintarCarrito(); pintarBadge(); marcarProds(); };
    document.getElementById('car-enviar').onclick = enviarPedido;
    pintarBadge();
  }

  // ---------- Carrito (localStorage) ----------
  function leerCarrito() {
    try { return JSON.parse(localStorage.getItem('arakaki_carrito') || '[]'); } catch (e) { return []; }
  }
  function guardarCarrito(c) { localStorage.setItem('arakaki_carrito', JSON.stringify(c)); }

  function alternarProducto(p) {
    var c = leerCarrito();
    var i = -1;
    for (var j = 0; j < c.length; j++) if (c[j].name === p.name) { i = j; break; }
    if (i >= 0) c.splice(i, 1);
    else c.push({ name: p.name, price: p.price, img: p.img, qty: 1 });
    guardarCarrito(c);
    pintarBadge();
    marcarProds();
  }
  function cambiarCant(nombre, delta) {
    var c = leerCarrito();
    for (var j = 0; j < c.length; j++) {
      if (c[j].name === nombre) {
        c[j].qty += delta;
        if (c[j].qty <= 0) c.splice(j, 1);
        break;
      }
    }
    guardarCarrito(c);
    pintarCarrito();
    pintarBadge();
    marcarProds();
  }
  function pintarBadge() {
    var c = leerCarrito();
    var btn = document.getElementById('carrito-btn');
    if (!btn) return;
    var n = 0;
    c.forEach(function (p) { n += p.qty; });
    btn.querySelector('.badge').textContent = n;
    btn.classList.toggle('visible', n > 0);
  }
  function marcarProds() {
    var c = leerCarrito();
    var nombres = {};
    c.forEach(function (p) { nombres[p.name] = 1; });
    var cards = document.querySelectorAll('.prod');
    for (var i = 0; i < cards.length; i++) {
      var nom = cards[i].getAttribute('data-nombre');
      cards[i].classList.toggle('en-carrito', !!nombres[nom]);
      var b = cards[i].querySelector('.btn-elegir');
      if (b) b.textContent = nombres[nom] ? 'Quitar del pedido' : 'Elegir producto';
    }
  }
  function totalCarrito(c) {
    var total = 0, sinPrecio = false;
    c.forEach(function (p) {
      if (p.price) total += Number(p.price) * p.qty;
      else sinPrecio = true;
    });
    return { total: total, sinPrecio: sinPrecio };
  }
  function abrirCarrito() {
    pintarCarrito();
    document.getElementById('carrito-modal-fondo').classList.add('abierto');
  }
  function cerrarCarrito() { document.getElementById('carrito-modal-fondo').classList.remove('abierto'); }

  function pintarCarrito() {
    var c = leerCarrito();
    var lista = document.getElementById('car-lista');
    if (!c.length) { lista.innerHTML = '<p style="padding:14px 0;opacity:.7">Aún no eliges productos.</p>'; }
    else {
      lista.innerHTML = c.map(function (p) {
        return '<div class="car-item">' +
          '<img src="' + esc(p.img) + '" alt="">' +
          '<div class="car-nom">' + esc(p.name) + '</div>' +
          '<div class="car-cant">' +
            '<button data-n="' + esc(p.name) + '" data-d="-1">−</button><span>' + p.qty + '</span>' +
            '<button data-n="' + esc(p.name) + '" data-d="1">+</button>' +
          '</div>' +
          '<div class="car-precio">' + (p.price ? 'S/ ' + (Number(p.price) * p.qty).toFixed(2).replace(/\.00$/, '') : 'según tienda') + '</div>' +
        '</div>';
      }).join('');
      var botones = lista.querySelectorAll('button');
      for (var i = 0; i < botones.length; i++) {
        botones[i].onclick = function () { cambiarCant(this.getAttribute('data-n'), Number(this.getAttribute('data-d'))); };
      }
    }
    var t = totalCarrito(c);
    document.getElementById('car-total-monto').textContent =
      'S/ ' + t.total.toFixed(2).replace(/\.00$/, '') + (t.sinPrecio ? ' +' : '');
  }

  function enviarPedido() {
    var c = leerCarrito();
    if (!c.length) { alert('Elige al menos un producto 🙂'); return; }
    var nombre = (document.getElementById('car-nombre').value || '').trim();
    if (!nombre) { alert('Cuéntanos tu nombre para atenderte mejor 🙌'); document.getElementById('car-nombre').focus(); return; }
    var dir = (document.getElementById('car-dir').value || '').trim();
    var t = totalCarrito(c);

    var lineas = c.map(function (p) {
      return '• ' + p.qty + ' x ' + p.name + (p.price ? ' — S/ ' + (Number(p.price) * p.qty).toFixed(2).replace(/\.00$/, '') : '');
    });
    var msj = '¡Hola Minimarket Arakaki! 👋 Soy *' + nombre + '* y quiero hacer este pedido (web):\n\n' +
      lineas.join('\n') +
      '\n\n*Total aprox: S/ ' + t.total.toFixed(2).replace(/\.00$/, '') + (t.sinPrecio ? ' + productos por cotizar' : '') + '*' +
      (dir ? '\n📍 Entrega en: ' + dir : '');

    // Guarda el pedido en la base (no bloquea el envío a WhatsApp si falla)
    var btn = document.getElementById('car-enviar');
    btn.disabled = true;
    var datos = { action: 'pedido', nombre: nombre, direccion: dir, items: c, total: t.total, pagina: location.pathname };
    try {
      fetch('/api/pedido', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(datos), keepalive: true }).catch(function () {});
    } catch (e) {}

    if (window.arkTrack) window.arkTrack('pedido_enviado');
    setTimeout(function () {
      btn.disabled = false;
      guardarCarrito([]);
      pintarBadge(); marcarProds(); cerrarCarrito();
      window.open('https://wa.me/' + WA + '?text=' + encodeURIComponent(msj), '_blank');
    }, 250);
  }

  // ---------- Render de página de categoría ----------
  window.renderCategoria = function (slug) {
    var cat = (window.ARAKAKI_CATALOG && window.ARAKAKI_CATALOG.categories[slug]) || null;
    var cont = document.getElementById('contenido-categoria');
    if (!cat || !cont) return;

    var html = '<section class="hero"><h1>' + esc(cat.hero) + '</h1>' +
      '<p class="sub">Lo que necesitas, cuando lo necesitas</p>' +
      (cat.video ? '<video src="' + esc(cat.video) + '" autoplay muted loop playsinline></video>' : '') +
      '</section>';

    cat.sections.forEach(function (sec, si) {
      html += '<section class="seccion premium"><div class="interior">' +
        '<h2 class="titulo-seccion">' + esc(sec.title) + '</h2>' +
        '<div class="grilla-prods">' +
        sec.products.map(function (p, pi) {
          return '<div class="prod" data-nombre="' + esc(p.name) + '" data-sec="' + si + '" data-idx="' + pi + '">' +
            '<div class="prod-img"><img loading="lazy" src="' + esc(p.img) + '" alt="' + esc(p.name) + '">' +
              '<div class="prod-check" aria-hidden="true">✓</div>' +
              '<div class="prod-elegido"><span class="pe-check">✓</span>Producto elegido<small>toca para quitar</small></div></div>' +
            '<div class="prod-info">' +
              '<div class="prod-nombre">' + esc(p.name) + '</div>' +
              (p.price ? '<div class="prod-precio">S/ ' + esc(p.price) + '</div>' : '<div class="prod-precio" style="font-size:13px;opacity:.7">Precio en tienda / WhatsApp</div>') +
              '<button class="btn-elegir">Elegir producto</button>' +
            '</div></div>';
        }).join('') +
        '</div></div></section>';
    });
    cont.innerHTML = html;

    var cards = cont.querySelectorAll('.prod');
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        var sec = cat.sections[Number(card.getAttribute('data-sec'))];
        var p = sec.products[Number(card.getAttribute('data-idx'))];
        card.querySelector('.btn-elegir').onclick = function () { alternarProducto(p); };
        card.querySelector('.prod-img').onclick = function () { alternarProducto(p); };
      })(cards[i]);
    }
    marcarProds();
  };

  // ---------- Arranque ----------
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', armarBase);
  else armarBase();
})();
