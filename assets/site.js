// Minimarket Arakaki — JS compartido: preloader, header/menú/footer, carrito → WhatsApp.
(function () {
  var WA = '51977737199'; // WhatsApp del minimarket
  var LOGO = '/img/logo-arakaki.webp';
  var LOGO_BLANCO = '/img/logo-gato.png'; // logo horizontal blanco del header (gato de la suerte)
  var REDES = {
    facebook: { url: 'https://www.facebook.com/minimarketarakaki1', img: '/img/redes/facebook.png' },
    instagram: { url: 'https://www.instagram.com/arakakiminimarket', img: '/img/redes/instagram.png' },
    youtube: { url: 'https://www.youtube.com/@arakakiminimarket', img: '/img/redes/youtube.png' },
  };
  // Menú de categorías. ico = emoji, txt = nombre limpio (se buscan por separado);
  // tag opcional ('top'/'new') pinta un badge de social proof. El dueño puede ajustar
  // los badges y los DESTACADOS aquí sin tocar nada más.
  var MENU = [
    { grupo: 'Inicio', items: [{ href: '/', ico: '🏠', txt: 'Página principal' }] },
    { grupo: 'Licores', items: [
      { href: '/pisco', ico: '🥃', txt: 'Piscos', tag: 'top' }, { href: '/vinos', ico: '🇪🇸', txt: 'Vinos Españoles', tag: 'top' },
      { href: '/vinos-peruanos', ico: '🇵🇪', txt: 'Vinos Peruanos' }, { href: '/vinos-argentinos', ico: '🇦🇷', txt: 'Vinos Argentinos' },
      { href: '/vinos-chilenos', ico: '🇨🇱', txt: 'Vinos Chilenos' }, { href: '/whisky', ico: '🥃', txt: 'Whisky', tag: 'top' },
      { href: '/ron', ico: '🍹', txt: 'Ron' }, { href: '/licor-frances', ico: '🇫🇷', txt: 'Licores Franceses' },
      { href: '/licor-italiano', ico: '🇮🇹', txt: 'Licores Italianos' }, { href: '/vodka', ico: '🍸', txt: 'Vodka' },
      { href: '/tequila', ico: '🌵', txt: 'Tequila' }, { href: '/anisado', ico: '🥂', txt: 'Anisado' },
      { href: '/licores-variados', ico: '🍾', txt: 'Más Licores' },
    ] },
    { grupo: 'Para engreírte', items: [
      { href: '/helados', ico: '🍦', txt: 'Helados' }, { href: '/chocolates-importados', ico: '🍫', txt: 'Chocolates', tag: 'new' },
      { href: '/dulces', ico: '🍬', txt: 'Dulces' }, { href: '/galletas', ico: '🍪', txt: 'Galletas, Snacks y más' },
      { href: '/refrescos', ico: '🥤', txt: 'Gaseosa en Lata' }, { href: '/aguas-importadas', ico: '💧', txt: 'Aguas Importadas' },
    ] },
    { grupo: 'Para tu día a día', items: [
      { href: '/backtoschool', ico: '🎒', txt: 'Desayuno Escolar' }, { href: '/frutas-y-vegetales', ico: '🥦', txt: 'Frutas y Vegetales' },
    ] },
  ];
  // Fila "Favoritos de la casa" al tope del menú (Von Restorff + prueba social).
  var DESTACADOS = [
    { href: '/pisco', ico: '🥃', txt: 'Piscos' }, { href: '/whisky', ico: '🥃', txt: 'Whisky' },
    { href: '/vinos', ico: '🍷', txt: 'Vinos' }, { href: '/chocolates-importados', ico: '🍫', txt: 'Chocolates' },
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // Normaliza para buscar: minúsculas y sin acentos ("Engreírte" → "engreirte").
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
      .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n');
  }

  // ---------- Textos editables del sitio (lema del header + footer) ----------
  // Valores por defecto: el sitio se ve bien sin backend. El dueño los edita en
  // /panel → 📝 Sitio (Redis config:sitio); /api/sitio los sirve y aquí se aplican.
  var MAP_URL = 'https://www.google.com/maps/search/?api=1&query=ARAKAKI+Minimarket+Av+Belen+265+San+Isidro';
  var SITIO_DEF = {
    lema: 'Lo que necesitas, cuando lo necesitas',
    visitanosTit: 'Visítanos',
    direccion: 'Av. Belén 265, San Isidro',
    referencia: 'A solo 2 cuadras del Golf',
    mapLabel: 'Ver ubicación en el mapa',
    horarioTit: 'Horario de atención',
    horario: 'Lun – Sáb · 7:00 am – 9:00 pm\nDomingos · 8:00 am – 8:00 pm\nAbierto todos los días, incluso feriados',
    contactoTit: 'Contáctanos',
    telefonos: '012218582\n977737199\n960725996\n964295436\n933477179',
    redesTit: 'Síguenos',
    facebook: REDES.facebook.url,
    instagram: REDES.instagram.url,
    youtube: REDES.youtube.url,
    copy: 'Minimarket Arakaki {año} — Todos los derechos reservados',
  };
  function lineas(t) {
    return String(t == null ? '' : t).split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  }
  function footerHTML(cfg) {
    var telsHtml = lineas(cfg.telefonos).map(function (t) {
      return '<a class="tel" href="tel:' + esc(t.replace(/[^\d+]/g, '')) + '"><span class="tel-ico">📞</span>' + esc(t) + '</a>';
    }).join('');
    var horarioHtml = lineas(cfg.horario).map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('');
    var redes = [['facebook', cfg.facebook], ['instagram', cfg.instagram], ['youtube', cfg.youtube]];
    var redesHtml = redes.filter(function (r) { return r[1]; }).map(function (r) {
      return '<a href="' + esc(r[1]) + '" target="_blank" rel="noopener" aria-label="' + r[0] + '"><img src="' + REDES[r[0]].img + '" alt="' + r[0] + '"></a>';
    }).join('');
    var copy = String(cfg.copy || '').replace(/\{a[nñ]o\}/gi, new Date().getFullYear());
    return '<div class="interior">' +
        '<div class="pie-col"><h4>' + esc(cfg.visitanosTit) + '</h4>' +
          '<p class="pie-dir">' + esc(cfg.direccion) + '</p>' +
          (cfg.referencia ? '<p class="pie-ref">' + esc(cfg.referencia) + '</p>' : '') +
          (cfg.mapLabel ? '<p class="pie-mapa"><a href="' + MAP_URL + '" target="_blank" rel="noopener">📍 ' + esc(cfg.mapLabel) + '</a></p>' : '') +
        '</div>' +
        '<div class="pie-col"><h4>' + esc(cfg.horarioTit) + '</h4><div class="pie-horario">' + horarioHtml + '</div></div>' +
        '<div class="pie-col"><h4>' + esc(cfg.contactoTit) + '</h4><div class="pie-tels">' + telsHtml + '</div></div>' +
        '<div class="pie-col"><h4>' + esc(cfg.redesTit) + '</h4><div class="redes">' + redesHtml + '</div></div>' +
      '</div>' +
      '<p class="copy">' + esc(copy) + '</p>';
  }
  function aplicarSitio(cfg) {
    var lema = document.querySelector('.cab .lema-cab');
    if (lema) lema.textContent = cfg.lema || '';
    var pie = document.querySelector('footer.pie');
    if (pie) pie.innerHTML = footerHTML(cfg);
  }
  function cargarSitio() {
    fetch('/api/sitio').then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.s || typeof j.s !== 'object') return;
      var m = {}; for (var k in SITIO_DEF) m[k] = SITIO_DEF[k];
      for (var k2 in j.s) if (j.s[k2]) m[k2] = j.s[k2];
      aplicarSitio(m);
    }).catch(function () {});
  }

  // ---------- Header, menú, footer, carrito (se inyectan en cada página) ----------
  function armarBase() {
    var cab = document.createElement('header');
    cab.className = 'cab';
    cab.innerHTML =
      '<a href="/"><img class="logo" src="' + LOGO_BLANCO + '" alt="Minimarket Arakaki"></a>' +
      '<div class="esp"></div>' +
      '<div class="lema-cab">' + esc(SITIO_DEF.lema) + '</div>' +
      '<button class="btn-menu" id="btn-menu" aria-label="Ver categorías" aria-haspopup="true">☰ Categorías</button>';
    document.body.insertBefore(cab, document.body.firstChild);

    var fondo = document.createElement('div');
    fondo.id = 'menu-fondo';
    var panel = document.createElement('nav');
    panel.id = 'menu-panel';
    panel.setAttribute('aria-label', 'Categorías de productos');
    var idx = 0; // índice global para la cascada de aparición
    var html = '<button class="menu-cerrar" aria-label="Cerrar">✕</button>' +
      '<div class="menu-cab"><div class="menu-titulo">Nuestras categorías</div>' +
      '<div class="menu-sub">Elige tu antojo y arma tu pedido 🛒</div></div>' +
      '<div class="menu-buscar"><span class="mb-ico">🔍</span>' +
      '<input type="search" id="menu-q" placeholder="Buscar producto o categoría…" autocomplete="off" aria-label="Buscar categoría"></div>';

    html += '<div class="menu-dest-tit">⭐ Favoritos de la casa</div><div class="menu-dest">';
    DESTACADOS.forEach(function (d) {
      html += '<a class="dest" href="' + d.href + '" style="--i:' + (idx++) + '">' +
        '<span class="d-ico">' + d.ico + '</span><span class="d-txt">' + esc(d.txt) + '</span></a>';
    });
    html += '</div>';

    html += '<div class="menu-lista">';
    MENU.forEach(function (g, gi) {
      html += '<div class="menu-grupo" data-g="' + gi + '">' + esc(g.grupo) + '</div>';
      g.items.forEach(function (it) {
        var here = location.pathname === it.href || location.pathname === it.href + '.html';
        var badge = it.tag === 'top' ? '<span class="mi-badge top">🔥 Top</span>' :
                    it.tag === 'new' ? '<span class="mi-badge new">✨ Nuevo</span>' : '';
        html += '<a class="menu-item' + (here ? ' activo' : '') + '" href="' + it.href + '"' +
          ' data-g="' + gi + '" data-nombre="' + esc(norm(it.txt)) + '" style="--i:' + (idx++) + '">' +
          '<span class="mi-coin">' + it.ico + '</span>' +
          '<span class="mi-txt">' + esc(it.txt) + '</span>' + badge +
          '<span class="mi-chevron">›</span></a>';
      });
    });
    html += '</div>';
    html += '<div class="menu-vacio">No encontramos esa categoría. Escríbenos y te ayudamos 💬</div>';
    html += '<div class="menu-pie"><a href="https://wa.me/' + WA + '" target="_blank" rel="noopener">💬 ¿No lo encuentras? Pídelo por WhatsApp</a></div>';

    panel.innerHTML = html;
    document.body.appendChild(fondo);
    document.body.appendChild(panel);

    var q = document.getElementById('menu-q');
    var vacio = panel.querySelector('.menu-vacio');
    var items = panel.querySelectorAll('.menu-item');
    var grupos = panel.querySelectorAll('.menu-grupo');
    if (q) q.addEventListener('input', function () {
      var term = norm(this.value.trim());
      panel.classList.toggle('buscando', term.length > 0);
      var vistosPorGrupo = {}, total = 0;
      items.forEach(function (a) {
        var ok = !term || a.getAttribute('data-nombre').indexOf(term) !== -1;
        a.style.display = ok ? '' : 'none';
        if (ok) { total++; vistosPorGrupo[a.getAttribute('data-g')] = 1; }
      });
      grupos.forEach(function (g) { g.style.display = vistosPorGrupo[g.getAttribute('data-g')] ? '' : 'none'; });
      vacio.style.display = total ? 'none' : 'block';
    });

    document.getElementById('btn-menu').onclick = function () { document.body.classList.add('menu-abierto'); };
    fondo.onclick = cerrarMenu;
    panel.querySelector('.menu-cerrar').onclick = cerrarMenu;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarMenu(); });
    function cerrarMenu() { document.body.classList.remove('menu-abierto'); }

    // Footer (contenido editable desde el panel → 📝 Sitio; ver footerHTML/aplicarSitio)
    var pie = document.createElement('footer');
    pie.className = 'pie';
    document.body.appendChild(pie);
    aplicarSitio(SITIO_DEF); // render inmediato con los textos por defecto (el lema y el pie)
    cargarSitio();           // y luego los del panel, si el dueño los editó

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
    iniciarChat();
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
    document.body.classList.toggle('hay-carrito', n > 0); // el chat flotante se corre hacia arriba
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

  // ---------- Chat vendedor flotante (→ /api/chat) ----------
  // Solo aparece si el backend confirma que el bot está activo (API key + no apagado en /panel).
  // Mecánica conversacional estilo WHAPE: "escribiendo…" antes de cada mensaje, párrafos
  // revelados uno a uno (el bot separa ideas con \n\n) y botones de respuesta rápida
  // (sugerencias que manda /api/chat) que se envían como si el cliente los escribiera.
  var CHAT_KEY = 'arakaki_chat';
  var CHAT_SALUDO = '¡Hola! 👋 Soy el asistente del *Minimarket Arakaki*. Dime qué buscas y te armo el pedido aquí mismo, sin salir de la página 🛒';
  var CHAT_SUG_INICIAL = ['🍷 ¿Qué vinos tienen?', '🛒 Quiero hacer un pedido', '🛵 ¿Hacen delivery?'];
  var CHAT_ERROR = 'Uy, no pude responder 🙏 Escríbenos por WhatsApp y te atendemos al toque 📲';

  function chatEstado() {
    try {
      var st = JSON.parse(sessionStorage.getItem(CHAT_KEY) || 'null');
      if (st && st.sid && st.msgs) return st;
    } catch (e) {}
    return { sid: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10), msgs: [] };
  }
  function chatGuardar(st) {
    if (st.msgs.length > 30) st.msgs = st.msgs.slice(-30);
    try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(st)); } catch (e) {}
  }
  // Texto del bot → HTML seguro: *negrita*, rutas /categoria como link y saltos de línea
  function chatHtml(t) {
    var s = esc(t);
    s = s.replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
    s = s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/(^|[\s(])(\/[a-z][a-z0-9-]+)(?=$|[\s).,;:!?])/gm, '$1<a href="$2">$2</a>');
    return s.replace(/\n/g, '<br>');
  }

  function iniciarChat() {
    fetch('/api/chat').then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.on === true) montarChat(d);
    }).catch(function () {});
  }

  // cfg = textos editables desde el panel (💬 Chat de la web); si faltan, defaults del código
  function montarChat(cfg) {
    cfg = cfg || {};
    var saludo = cfg.saludo || CHAT_SALUDO;
    var botonesIni = (cfg.botones && cfg.botones.length) ? cfg.botones : CHAT_SUG_INICIAL;

    var fab = document.createElement('button');
    fab.id = 'chat-fab';
    fab.setAttribute('aria-label', 'Chatear con el asistente');
    fab.innerHTML =
      '<span class="fab-burbuja">' + esc(cfg.invitacion || '¿Te ayudo con tu pedido?') + '</span>' +
      '<img class="fab-gato" src="/img/asistente-arakaki.png" alt="Asistente Arakaki">';
    document.body.appendChild(fab);

    var caja = document.createElement('div');
    caja.id = 'chat-caja';
    caja.innerHTML =
      '<div class="chat-cab">' +
        '<img class="chat-avatar" src="/img/asistente-arakaki.png" alt="">' +
        '<div class="chat-tit"><b>Asistente Arakaki</b><small>' + esc(cfg.subtitulo || 'Pide aquí mismo, sin salir de la web') + '</small></div>' +
        '<button class="chat-cerrar" aria-label="Cerrar">✕</button>' +
      '</div>' +
      '<div id="chat-msgs"></div>' +
      '<div id="chat-quick"></div>' +
      '<form id="chat-form" autocomplete="off">' +
        '<textarea id="chat-in" rows="1" placeholder="Escribe tu consulta o pedido…" maxlength="500"></textarea>' +
        '<button type="submit" id="chat-enviar" aria-label="Enviar">➤</button>' +
      '</form>';
    document.body.appendChild(caja);

    var st = chatEstado();
    var ocupado = false;
    var msgs = document.getElementById('chat-msgs');
    var quick = document.getElementById('chat-quick');
    var input = document.getElementById('chat-in');
    var sinAnim = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function bajar() { msgs.scrollTop = msgs.scrollHeight; }
    function fila(html) {
      var d = document.createElement('div');
      d.innerHTML = html;
      var f = d.firstChild;
      msgs.appendChild(f);
      bajar();
      return f;
    }
    // quieto = sin animación de entrada (para repintar historial ya visto)
    function burbujaBot(t, quieto) {
      fila('<div class="chat-fila bot' + (quieto ? ' quieto' : '') + '"><img class="chat-mini" src="/img/asistente-arakaki.png" alt="">' +
        '<div class="chat-msg bot">' + chatHtml(t) + '</div></div>');
    }
    function burbujaYo(t, quieto) {
      fila('<div class="chat-fila yo' + (quieto ? ' quieto' : '') + '"><div class="chat-msg yo">' + chatHtml(t) + '</div></div>');
    }
    function verEscribiendo() {
      fila('<div class="chat-fila bot" id="chat-typing"><img class="chat-mini" src="/img/asistente-arakaki.png" alt="">' +
        '<div class="chat-msg bot escribiendo"><span></span><span></span><span></span></div></div>');
    }
    function quitarEscribiendo() { var t = document.getElementById('chat-typing'); if (t) t.remove(); }

    function pintarQuick(labels) {
      quick.innerHTML = '';
      (labels || []).forEach(function (lbl, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'chat-opt';
        b.textContent = lbl;
        b.style.animationDelay = (i * 80) + 'ms'; // aparecen en cascada
        b.onclick = function () { enviar(lbl); };
        quick.appendChild(b);
      });
    }

    // Repinta el historial guardado sin animaciones (al abrir o tras cambiar de página).
    // Cada párrafo (\n\n) del bot es una burbuja aparte, como cuando llegó en vivo.
    function pintarHistorial() {
      msgs.innerHTML = '';
      st.msgs.forEach(function (m) {
        if (m.r === 'b') {
          m.t.split(/\n\n+/).forEach(function (p) { if (p.trim()) burbujaBot(p.trim(), true); });
        } else burbujaYo(m.t, true);
      });
      pintarQuick(st.sug);
    }

    // Revela la respuesta párrafo a párrafo, cada uno precedido por "escribiendo…"
    function revelarBot(texto, fin) {
      var partes = String(texto).split(/\n\n+/).filter(function (p) { return p.trim(); });
      if (!partes.length) partes = [String(texto)];
      var i = 0;
      function paso() {
        verEscribiendo();
        setTimeout(function () {
          quitarEscribiendo();
          burbujaBot(partes[i].trim());
          i++;
          if (i < partes.length) setTimeout(paso, sinAnim ? 0 : 300);
          else fin();
        }, sinAnim ? 0 : (i === 0 ? 500 : 550));
      }
      paso();
    }

    function abrir() {
      caja.classList.add('abierto');
      fab.classList.add('oculto');
      if (window.arkTrack) window.arkTrack('chatweb_abierto');
      // En móvil NUNCA se enfoca el campo automáticamente: abriría el teclado
      // y taparía/empujaría la bienvenida (el cliente toca el campo cuando quiere escribir)
      var esMovil = window.innerWidth <= 600;
      // Mientras el cliente no haya escrito nada, cada apertura repite la bienvenida animada
      var sinConversar = !st.msgs.length || (st.msgs.length === 1 && st.msgs[0].r === 'b');
      if (sinConversar) {
        // Bienvenida animada: "escribiendo…" → saludo → recién ahí los botones
        st.msgs = [{ r: 'b', t: saludo }];
        st.sug = botonesIni;
        chatGuardar(st);
        msgs.innerHTML = '';
        pintarQuick([]);
        ocupado = true;
        revelarBot(saludo, function () {
          ocupado = false;
          pintarQuick(botonesIni);
          if (!esMovil) input.focus();
        });
      } else {
        pintarHistorial();
        if (!esMovil) input.focus();
      }
    }
    function cerrar() {
      caja.classList.remove('abierto');
      fab.classList.remove('oculto');
    }
    fab.onclick = abrir;
    caja.querySelector('.chat-cerrar').onclick = cerrar;

    function enviar(txt) {
      txt = (txt || '').trim();
      if (!txt || ocupado) return;
      input.value = '';
      crecer();
      st.msgs.push({ r: 'u', t: txt });
      st.sug = [];
      chatGuardar(st);
      ocupado = true;
      pintarQuick([]);
      burbujaYo(txt);
      verEscribiendo();
      if (window.arkTrack) window.arkTrack('chatweb_msg');

      var hist = st.msgs.slice(-12).map(function (m) { return { role: m.r === 'b' ? 'assistant' : 'user', text: m.t }; });
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sid: st.sid, mensajes: hist }),
      }).then(function (r) { return r.json(); }).then(function (j) {
        recibir((j && j.reply) || CHAT_ERROR + '\nhttps://wa.me/' + WA, (j && j.sugerencias) || []);
      }).catch(function () {
        recibir(CHAT_ERROR + '\nhttps://wa.me/' + WA, []);
      });
    }

    function recibir(texto, sugerencias) {
      quitarEscribiendo();
      st.msgs.push({ r: 'b', t: texto });
      st.sug = sugerencias;
      chatGuardar(st);
      revelarBot(texto, function () {
        ocupado = false;
        pintarQuick(sugerencias);
        // En móvil no se devuelve el foco: abriría el teclado tapando la respuesta
        if (caja.classList.contains('abierto') && window.innerWidth > 600) input.focus();
      });
    }

    // Composer: crece con el texto; Enter envía, Shift+Enter salto de línea, Esc cierra
    function crecer() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 110) + 'px'; }
    input.addEventListener('input', crecer);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(input.value); }
    });
    document.getElementById('chat-form').onsubmit = function (e) { e.preventDefault(); enviar(input.value); };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && caja.classList.contains('abierto')) cerrar();
    });
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

    // Precios "en vivo": los overrides (panel 💰 / WhatsApp del dueño) pisan los del catálogo.
    // Si falla o responde el stub del dev-server, se quedan los precios base.
    fetch('/api/precios').then(function (r) { return r.json(); }).then(function (data) {
      if (!data || !data.p) return;
      cat.sections.forEach(function (sec, si) {
        sec.products.forEach(function (p, pi) {
          var nuevo = data.p[slug + '|' + p.name];
          if (nuevo === undefined || nuevo === p.price) return;
          p.price = nuevo; // el carrito captura este objeto al elegir
          var card = cont.querySelector('.prod[data-sec="' + si + '"][data-idx="' + pi + '"]');
          var el = card && card.querySelector('.prod-precio');
          if (el) { el.textContent = 'S/ ' + nuevo; el.removeAttribute('style'); }
        });
      });
    }).catch(function () {});
  };

  // ---------- Arranque ----------
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', armarBase);
  else armarBase();
})();
