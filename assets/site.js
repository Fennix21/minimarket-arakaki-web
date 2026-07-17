// Minimarket Arakaki — JS compartido: preloader, header/menú/footer, carrito → WhatsApp.
(function () {
  var WA = '51977737199'; // WhatsApp del minimarket
  var LOGO = '/img/logo-arakaki.webp';
  var LOGO_BLANCO = '/img/logo-gato.png'; // logo horizontal blanco del header (gato de la suerte)
  // Cinta (marquee) reutilizable: en la portada va inline en index.html; en las páginas
  // de categoría la inyecta armarBase() junto al logo del pie (ver más abajo).
  var CINTA_ITEMS = '<span>📲 Pide por WhatsApp</span><span>🛵 Delivery disponible</span>' +
    '<span>🕗 Lun – Sáb 7:00 am – 9:00 pm</span><span>🕗 Domingos 8:00 am – 8:00 pm</span>' +
    '<span>🎉 Atendemos feriados</span>';
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
  // ¿el token del usuario coincide con alguna palabra del producto? Tolera erratas
  // leves por prefijo común ("johnny"→"johnnie", "coca"→"cocacola").
  function palabraCoincide(tok, palabras) {
    var pref = tok.slice(0, 4);
    for (var i = 0; i < palabras.length; i++) {
      var w = palabras[i];
      if (w.indexOf(tok) === 0) return true;                                       // la palabra empieza con lo tipeado
      if (w.length >= 3 && tok.indexOf(w) === 0) return true;                       // lo tipeado empieza con la palabra (w≥3 evita unidades "gr"/"ml")
      if (w.length >= 3 && pref.length >= 3 && w.indexOf(pref) === 0) return true;  // errata por prefijo común (johnny→johnnie)
    }
    return false;
  }
  // Un producto coincide si TODAS las palabras buscadas aciertan (orden libre).
  function productoCoincide(toks, palabras) {
    for (var i = 0; i < toks.length; i++) if (!palabraCoincide(toks[i], palabras)) return false;
    return true;
  }
  // Palabras "útiles" de un producto para el índice: fuera unidades, números y ruido.
  var STOP_BUSCA = { x: 1, ml: 1, gr: 1, g: 1, kg: 1, cc: 1, lt: 1, l: 1, un: 1, oz: 1, de: 1, con: 1, la: 1, el: 1, y: 1 };
  function palabrasProducto(name) {
    return norm(name).split(/[^a-z0-9]+/).filter(function (w) {
      return w && w.length >= 2 && !/^\d+$/.test(w) && !STOP_BUSCA[w];
    });
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
    // Carrito / entrega (editables desde panel → 📝 Sitio)
    carGeoNota: '📍 Compartir tu ubicación es opcional: solo hace la entrega más precisa. Escribir tu dirección arriba es lo obligatorio.',
    carDirFalta: 'Falta tu dirección de entrega ✍️ Escríbela arriba (calle, número y referencia) para llevarte tu pedido.',
    // Compartir producto (editables desde panel → 📝 Sitio → 📤 Compartir). La descripción
    // del preview del enlace (compOg) es del lado servidor: su default vive en api/compartir.js.
    compChat: '🏪 Minimarket Arakaki · pídelo por WhatsApp y te lo llevamos',
    compLema: 'Tu bodega premium',
    compCintillo: '✨ Disponible hoy · delivery a tu puerta ✨',
    compCta: '📲 Pídelo al 977 737 199',
    compSinPrecio: 'Pregunta el precio por WhatsApp',
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
    // Botón de notificaciones push (ofertas). Vive en el footer porque este se
    // re-renderiza (aplicarSitio): el click se maneja por delegación en initPush().
    var pushBtn = '<p class="pie-push"><button type="button" id="push-ofertas-btn">🔔 Avísame de las ofertas</button></p>';
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
      pushBtn +
      '<p class="copy">' + esc(copy) + '</p>' +
      '<div class="pie-marca"><a href="/"><img src="' + LOGO_BLANCO + '" alt="Minimarket Arakaki"></a></div>';
  }
  var sitioActual = SITIO_DEF; // último config aplicado (para textos del carrito en enviarPedido)
  function aplicarSitio(cfg) {
    sitioActual = cfg;
    var lema = document.querySelector('.cab .lema-cab');
    if (lema) lema.textContent = cfg.lema || '';
    var pie = document.querySelector('footer.pie');
    if (pie) pie.innerHTML = footerHTML(cfg);
    // Nota bajo el botón de ubicación del carrito (el modal puede no existir aún)
    var geoNota = document.getElementById('car-geo-nota');
    if (geoNota) geoNota.textContent = cfg.carGeoNota || '';
    pushPintarBtn(); // el innerHTML recrea el botón: repintar su estado
  }

  // ---------- Fondos editables (secciones y tarjetas) ----------
  // El dueño elige color sólido o degradado en /panel → 📝 Sitio → 🎨 Fondos. /api/sitio devuelve el
  // CSS ya armado y aquí se pisa la variable --bg-<clave> de site.css (sin override manda el default).
  // Se cachean en localStorage y se aplican al arrancar: si no, cada visita mostraría el fondo viejo
  // hasta que llegue el fetch.
  var FONDO_CLAVES = ['pagina', 'vino', 'roja', 'premium', 'card'];
  // El valor lo arma nuestra propia API con colores validados; el filtro es por si el caché
  // del navegador quedó tocado a mano.
  function fondoOk(v) { return typeof v === 'string' && v.length < 300 && !/url\s*\(|[<>{};]/.test(v); }
  function aplicarFondos(f) {
    var raiz = document.documentElement;
    for (var i = 0; i < FONDO_CLAVES.length; i++) {
      var k = FONDO_CLAVES[i], v = f && f[k];
      if (fondoOk(v)) raiz.style.setProperty('--bg-' + k, v);
      else raiz.style.removeProperty('--bg-' + k);
    }
  }
  function fondosCache() {
    try { return JSON.parse(localStorage.getItem('arakaki_fondos') || '{}'); } catch (e) { return {}; }
  }
  function cargarSitio() {
    fetch('/api/sitio').then(function (r) { return r.json(); }).then(function (j) {
      if (!j) return;
      if (j.f && typeof j.f === 'object') {
        aplicarFondos(j.f);
        try { localStorage.setItem('arakaki_fondos', JSON.stringify(j.f)); } catch (e) {}
      }
      if (j.k && typeof j.k === 'object') {
        aplicarCarrito(j.k);
        try { localStorage.setItem('arakaki_carrito_cfg', JSON.stringify(j.k)); } catch (e) {}
      }
      if (!j.s || typeof j.s !== 'object') return;
      var m = {}; for (var k in SITIO_DEF) m[k] = SITIO_DEF[k];
      for (var k2 in j.s) if (j.s[k2]) m[k2] = j.s[k2];
      aplicarSitio(m);
    }).catch(function () {});
  }

  // ---------- Apariencia editable del carrito "Tu pedido" ----------
  // El dueño la edita en /panel → 📝 Sitio → 🛒 Carrito (config:carrito). /api/sitio la trae en `k` y aquí
  // se pisan las variables CSS del modal (tamaños, colores, fondo dorado), los textos y los efectos
  // (máquina de escribir + brillo). Se cachea en localStorage y se aplica al crear el modal: así la primera
  // vez que el cliente abre el carrito ya se ve con la configuración del dueño, sin parpadeo.
  var CAR_DEF = {
    titulo: '🛒 Tu pedido',
    nota: 'Delivery gratis llegando a un monto mínimo · Pago contra entrega o Yape/Plin',
    toqueTit: '✨ El toque final para tu pedido',
    sumar: '➕ Sumar',
    enviar: 'Enviar pedido por WhatsApp 📲',
    ver: '🛒 Ver mi pedido',
  };
  var CAR_TXT = {}; for (var _ck in CAR_DEF) CAR_TXT[_ck] = CAR_DEF[_ck]; // textos vivos (arrancan en los defaults)
  var CAR_FX = { typing: false, brillo: false };
  function colorOk(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v); }
  // Barrido del brillo armado desde UN color (banda que sube su opacidad al centro): así el dueño
  // elige un color y sale un brillo visible sobre el fondo dorado. '' si el color no es válido.
  function brilloGrad(hex) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return '';
    var r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    var c = function (a) { return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; };
    return 'linear-gradient(100deg,' + c(0) + ' 0%,' + c(0.25) + ' 40%,' + c(0.7) + ' 50%,' + c(0.25) + ' 60%,' + c(0) + ' 100%)';
  }
  function carritoCfgCache() { try { return JSON.parse(localStorage.getItem('arakaki_carrito_cfg') || 'null'); } catch (e) { return null; } }
  function aplicarCarrito(k) {
    if (!k || typeof k !== 'object') k = {};
    var modal = document.getElementById('carrito-modal');
    var tam = k.tam || {};
    var mapEsc = { titulo: 'tit', nota: 'nota', toqueTit: 'toquetit', item: 'item', sumar: 'sumar', total: 'total', enviar: 'enviar' };
    if (modal) {
      for (var key in mapEsc) {
        var v = Number(tam[key]);
        if (v >= 0.8 && v <= 1.5) modal.style.setProperty('--car-esc-' + mapEsc[key], v);
        else modal.style.removeProperty('--car-esc-' + mapEsc[key]);
      }
      // fondoOk (definido para los fondos): valida el css armado por nuestra API antes de inyectarlo
      if (fondoOk(k.toqueBg)) modal.style.setProperty('--car-toque-bg', k.toqueBg); else modal.style.removeProperty('--car-toque-bg');
      if (colorOk(k.toqueTitCol)) modal.style.setProperty('--car-toque-titcol', k.toqueTitCol); else modal.style.removeProperty('--car-toque-titcol');
      if (fondoOk(k.btnSumar)) modal.style.setProperty('--car-btn-sumar', k.btnSumar); else modal.style.removeProperty('--car-btn-sumar');
      if (colorOk(k.btnSumarTxt)) modal.style.setProperty('--car-btn-sumar-txt', k.btnSumarTxt); else modal.style.removeProperty('--car-btn-sumar-txt');
      var bseg = Number(k.fx && k.fx.brilloSeg); // segundos por vuelta del brillo (default 5)
      if (bseg >= 2 && bseg <= 15) modal.style.setProperty('--car-brillo-dur', bseg + 's'); else modal.style.removeProperty('--car-brillo-dur');
      var bgrad = brilloGrad(k.fx && k.fx.brilloCol); // color del brillo (vacío = dorado por defecto)
      if (bgrad) modal.style.setProperty('--car-brillo-grad', bgrad); else modal.style.removeProperty('--car-brillo-grad');
    }
    // Textos (vacío = default)
    var t = k.txt || {};
    for (var kk in CAR_DEF) CAR_TXT[kk] = (t[kk] ? String(t[kk]) : CAR_DEF[kk]);
    var h3 = modal && modal.querySelector('h3'); if (h3) h3.textContent = CAR_TXT.titulo;
    var nota = modal && modal.querySelector('.car-nota'); if (nota) nota.textContent = CAR_TXT.nota;
    var env = document.getElementById('car-enviar'); if (env) env.textContent = CAR_TXT.enviar;
    var vb = document.getElementById('carrito-btn');
    if (vb) { var badge = vb.querySelector('.badge'); vb.textContent = CAR_TXT.ver + ' '; if (badge) vb.appendChild(badge); }
    // Efectos
    CAR_FX.typing = !!(k.fx && k.fx.typing);
    CAR_FX.brillo = !!(k.fx && k.fx.brillo);
    var cc = document.getElementById('car-comple');
    if (cc) cc.classList.toggle('brillo', CAR_FX.brillo);
    // Si el carrito ya está abierto (poco común al arrancar), repinta para reflejar textos nuevos
    var fondoM = document.getElementById('carrito-modal-fondo');
    if (fondoM && fondoM.classList.contains('abierto')) pintarCarrito();
  }
  // Máquina de escribir del título "El toque final": teclea una sola vez cuando aparece (no en cada
  // cambio de cantidad) y respeta la preferencia de menos movimiento del sistema.
  var carTypeTimer = null, ultimoToqueTit = '';
  function menosMovimiento() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function escribirTitulo(el, texto) {
    if (!el) return;
    if (ultimoToqueTit === texto || menosMovimiento()) { el.textContent = texto; return; }
    ultimoToqueTit = texto;
    el.textContent = ''; el.classList.add('escribiendo');
    var i = 0;
    if (carTypeTimer) clearInterval(carTypeTimer);
    carTypeTimer = setInterval(function () {
      i++; el.textContent = texto.slice(0, i);
      if (i >= texto.length) { clearInterval(carTypeTimer); carTypeTimer = null; el.classList.remove('escribiendo'); }
    }, 42);
  }

  // ---------- Notificaciones push (ofertas para clientes) ----------
  // Web Push estándar: sw.js + /api/push (VAPID). En iPhone SOLO funciona si el
  // usuario instala la web (Compartir → Agregar a inicio); ahí se le muestra la guía.
  var IOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPad moderno
  var PUSH_OK = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  function pushRegistrarSW() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function () {});
  }
  // La clave pública VAPID llega en base64url: el navegador la quiere como Uint8Array
  function b64aBytes(b64) {
    var pad = '='.repeat((4 - (b64.length % 4)) % 4);
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }
  function pushPintarBtn() {
    var btn = document.getElementById('push-ofertas-btn');
    if (!btn) return;
    if (!PUSH_OK && !IOS) { btn.parentNode.style.display = 'none'; return; } // navegador viejo: fuera
    if (PUSH_OK && Notification.permission === 'denied') {
      btn.textContent = '🔕 Avisos bloqueados en tu navegador';
      btn.disabled = true;
      return;
    }
    if (!PUSH_OK) { btn.textContent = '🔔 Avísame de las ofertas'; return; } // iOS sin instalar: guía al tocar
    navigator.serviceWorker.getRegistration().then(function (reg) {
      return reg ? reg.pushManager.getSubscription() : null;
    }).then(function (sub) {
      btn.textContent = sub ? '🔔 Avisos activados ✓' : '🔔 Avísame de las ofertas';
      btn.classList.toggle('activo', !!sub);
    }).catch(function () {});
  }
  function pushGuiaIOS() {
    var viejo = document.getElementById('push-guia-ios');
    if (viejo) viejo.parentNode.removeChild(viejo);
    var d = document.createElement('div');
    d.id = 'push-guia-ios';
    d.innerHTML = '<div class="pg-caja"><button class="pg-x" aria-label="Cerrar">✕</button>' +
      '<div class="pg-ico">📲</div><h4>Actívalo en tu iPhone</h4>' +
      '<p>Para recibir nuestras ofertas, primero agrega la web a tu pantalla de inicio:</p>' +
      '<ol><li>Toca <b>Compartir</b> <span class="pg-share">⎋</span> abajo en Safari</li>' +
      '<li>Elige <b>“Agregar a inicio”</b></li>' +
      '<li>Abre la web desde el nuevo ícono 🐱 y toca este botón otra vez</li></ol></div>';
    d.addEventListener('click', function (e) {
      if (e.target === d || e.target.className === 'pg-x') d.parentNode.removeChild(d);
    });
    document.body.appendChild(d);
  }
  function pushSuscribir(btn) {
    if (!PUSH_OK) { if (IOS) pushGuiaIOS(); return; }
    btn.disabled = true;
    fetch('/api/push?key').then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.key) throw new Error('sin-clave');
      return navigator.serviceWorker.register('/sw.js').then(function (reg) {
        return navigator.serviceWorker.ready.then(function () { return reg.pushManager.getSubscription().then(function (sub) {
          if (sub) { // ya estaba activado: tocar de nuevo lo apaga
            return sub.unsubscribe().then(function () {
              return fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'unsubscribe', rol: 'clientes', endpoint: sub.endpoint }) });
            }).then(function () { return 'off'; });
          }
          return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aBytes(j.key) })
            .then(function (nueva) {
              return fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'subscribe', rol: 'clientes', subscription: nueva.toJSON() }) });
            }).then(function () { return 'on'; });
        }); });
      });
    }).then(function (estado) {
      btn.disabled = false;
      pushPintarBtn();
      if (estado === 'on') btn.textContent = '🎉 ¡Listo! Te avisaremos de las ofertas';
    }).catch(function (e) {
      btn.disabled = false;
      pushPintarBtn();
      if (String(e && e.message) === 'sin-clave') btn.textContent = '🔔 Avisos disponibles muy pronto';
    });
  }
  // Delegación: el footer se re-renderiza y recrea el botón, el listener vive en document
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.id === 'push-ofertas-btn' ? e.target : null;
    if (btn && !btn.disabled) pushSuscribir(btn);
  });
  // Suscribe este navegador a los avisos (para el chat: SOLO activa, nunca apaga).
  // Devuelve una promesa que resuelve 'on' si quedó suscrito (o ya lo estaba).
  function pushActivar() {
    return fetch('/api/push?key').then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.key) throw new Error('sin-clave');
      return navigator.serviceWorker.register('/sw.js').then(function (reg) {
        return navigator.serviceWorker.ready.then(function () { return reg.pushManager.getSubscription().then(function (sub) {
          if (sub) return 'on';
          return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aBytes(j.key) })
            .then(function (nueva) {
              return fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'subscribe', rol: 'clientes', subscription: nueva.toJSON() }) });
            }).then(function () { return 'on'; });
        }); });
      });
    });
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
          '<span class="mi-main"><span class="mi-txt">' + esc(it.txt) + '</span>' +
          '<span class="mi-hint"></span></span>' + badge +
          '<span class="mi-chevron">›</span></a>';
      });
    });
    html += '</div>';
    html += '<div class="menu-vacio">No encontramos esa categoría. Escríbenos y te ayudamos 💬</div>';
    html += '<div class="menu-pie"><a href="https://wa.me/' + WA + '" target="_blank" rel="noopener">💬 ¿No lo encuentras? Pídelo por WhatsApp</a></div>';

    panel.innerHTML = html;
    document.body.appendChild(fondo);
    document.body.appendChild(panel);

    // Índice de PRODUCTOS por categoría (para buscar productos, no solo categorías).
    // Se arma desde el catálogo cargado en la página (window.ARAKAKI_CATALOG).
    var PROD_IDX = {};
    try {
      var cats = (window.ARAKAKI_CATALOG && window.ARAKAKI_CATALOG.categories) || {};
      Object.keys(cats).forEach(function (slug) {
        var lista = [];
        (cats[slug].sections || []).forEach(function (s) {
          (s.products || []).forEach(function (p) {
            if (p && p.name) lista.push({ w: palabrasProducto(p.name), d: p.name });
          });
        });
        PROD_IDX['/' + slug] = lista;
      });
    } catch (e) {}

    var q = document.getElementById('menu-q');
    var vacio = panel.querySelector('.menu-vacio');
    var items = panel.querySelectorAll('.menu-item');
    var grupos = panel.querySelectorAll('.menu-grupo');
    if (q) q.addEventListener('input', function () {
      var term = norm(this.value.trim());
      var toks = term ? term.split(/\s+/).filter(Boolean) : [];
      panel.classList.toggle('buscando', toks.length > 0);
      var vistosPorGrupo = {}, total = 0;
      items.forEach(function (a) {
        var porNombre = !toks.length || a.getAttribute('data-nombre').indexOf(term) !== -1;
        var hint = '';
        if (!porNombre && toks.length) { // no calzó la categoría: ¿algún producto suyo?
          var prods = PROD_IDX[a.getAttribute('href')] || [];
          for (var i = 0; i < prods.length; i++) {
            if (productoCoincide(toks, prods[i].w)) { hint = prods[i].d; break; }
          }
        }
        var ok = porNombre || !!hint;
        a.style.display = ok ? '' : 'none';
        var he = a.querySelector('.mi-hint');
        if (he) { he.textContent = hint; he.style.display = hint ? 'block' : 'none'; }
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

    // Footer: SOLO en la portada (home). El dueño lo pidió así: el resto de páginas
    // (categorías, mi-cuenta) no llevan pie. aplicarSitio/cargarSitio siguen corriendo
    // igual para aplicar el lema del header; footerHTML se salta solo si no hay footer.pie.
    var esHome = /^\/(index\.html)?$/.test(location.pathname);
    if (esHome) {
      // Footer (contenido editable desde el panel → 📝 Sitio; ver footerHTML/aplicarSitio)
      var pie = document.createElement('footer');
      pie.className = 'pie';
      document.body.appendChild(pie);
    } else {
      // Las páginas de categoría (y mi-cuenta) no llevan el footer completo: reciben un
      // pie compacto = cinta (marquee) + logo centrado. El rodillo se duplica para que
      // el desplazamiento sea continuo (igual que en la portada).
      var cinta = document.createElement('div');
      cinta.className = 'cinta';
      cinta.innerHTML = '<div class="cinta-rodillo">' + CINTA_ITEMS + CINTA_ITEMS + '</div>';
      document.body.appendChild(cinta);

      var pieMini = document.createElement('footer');
      pieMini.className = 'pie-mini';
      pieMini.innerHTML = '<div class="pie-marca"><a href="/"><img src="' + LOGO_BLANCO + '" alt="Minimarket Arakaki"></a></div>';
      document.body.appendChild(pieMini);
    }
    aplicarSitio(SITIO_DEF);      // render inmediato con los textos por defecto (el lema; y el pie si es home)
    aplicarFondos(fondosCache()); // fondos de la visita anterior: evita el parpadeo al fondo viejo
    cargarSitio();                // y luego los textos y fondos del panel, si el dueño los editó

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
        '<div id="car-comple" style="display:none"></div>' +
        '<div class="car-total"><span>Total</span><span id="car-total-monto">S/ 0</span></div>' +
        '<label for="car-nombre">Tu nombre</label>' +
        '<input id="car-nombre" placeholder="¿Cómo te llamas?" maxlength="60">' +
        '<label for="car-tel">Tu WhatsApp</label>' +
        '<input id="car-tel" inputmode="tel" placeholder="Ej. 999 999 999" maxlength="15">' +
        '<label for="car-dir">Dirección de entrega <span class="car-oblig">(obligatoria)</span></label>' +
        '<div id="car-dirs" style="display:none"></div>' +
        '<textarea id="car-dir" rows="2" placeholder="Calle, número, distrito y referencia" maxlength="200"></textarea>' +
        '<button class="car-geo" id="car-geo" type="button">📍 Usar mi ubicación</button>' +
        '<p class="car-geo-nota" id="car-geo-nota">' + esc(SITIO_DEF.carGeoNota) + '</p>' +
        '<div id="car-aviso" class="car-aviso" style="display:none" role="alert"></div>' +
        '<button class="btn-wa-grande" id="car-enviar">Enviar pedido por WhatsApp 📲</button>' +
        '<button class="car-vaciar" id="car-vaciar">Vaciar pedido</button>' +
        '<p class="car-privacidad">Guardamos tus datos solo para atender tus pedidos y agilizar tus recompras.</p>' +
      '</div>';
    document.body.appendChild(modalFondo);
    modalFondo.onclick = function (e) { if (e.target === modalFondo) cerrarCarrito(); };
    modalFondo.querySelector('.car-cerrar').onclick = cerrarCarrito;
    document.getElementById('car-vaciar').onclick = function () { guardarCarrito([]); pintarCarrito(); pintarBadge(); marcarProds(); };
    document.getElementById('car-enviar').onclick = enviarPedido;
    document.getElementById('car-geo').onclick = pedirUbicacion;
    document.getElementById('car-dir').oninput = function () { this.classList.remove('car-dir-falta'); };
    aplicarCarrito(carritoCfgCache()); // apariencia del dueño desde la visita anterior (sin parpadeo)
    pintarBadge();
    reconocerCliente(); // reconoce al cliente por su token de dispositivo (prefill + "lo de siempre")
    cuentaIniciar();    // Club Arakaki: ítem "Mi cuenta" en el menú + estrellas ⭐ si hay sesión
    iniciarChat();
  }

  // ---------- Carrito (localStorage) ----------
  function leerCarrito() {
    try { return JSON.parse(localStorage.getItem('arakaki_carrito') || '[]'); } catch (e) { return []; }
  }
  function guardarCarrito(c) { localStorage.setItem('arakaki_carrito', JSON.stringify(c)); }

  // Direcciones de entrega guardadas (en ESTE navegador): se guardan solas al enviar un
  // pedido y aparecen como chips sobre el campo de dirección para reusarlas en 1 toque.
  function leerDirs() {
    try { return JSON.parse(localStorage.getItem('arakaki_dirs') || '[]'); } catch (e) { return []; }
  }
  function guardarDirs(d) { try { localStorage.setItem('arakaki_dirs', JSON.stringify(d)); } catch (e) {} }
  function guardarDireccion(dir) {
    var d = leerDirs().filter(function (x) { return x.toLowerCase() !== dir.toLowerCase(); });
    d.unshift(dir);
    guardarDirs(d.slice(0, 5));
  }
  // Direcciones de la cuenta del Club (viajan con el cliente a cualquier dispositivo)
  function dirsDeCuenta() {
    var out = [];
    if (cuentaPerfil) {
      if (cuentaPerfil.direccion) out.push(cuentaPerfil.direccion);
      (cuentaPerfil.direcciones || []).forEach(function (d) { if (d) out.push(d); });
    }
    return out;
  }
  function pintarDirs() {
    var cont = document.getElementById('car-dirs');
    if (!cont) return;
    // Primero las de la cuenta (👤, se administran en /mi-cuenta); luego las de este navegador
    var deCuenta = dirsDeCuenta();
    var vistos = {};
    deCuenta.forEach(function (x) { vistos[x.toLowerCase()] = 1; });
    var locales = leerDirs().filter(function (x) { return !vistos[x.toLowerCase()]; });
    if (!deCuenta.length && !locales.length) { cont.innerHTML = ''; cont.style.display = 'none'; return; }
    cont.style.display = '';
    cont.innerHTML = '<span class="car-dirs-tit">💾 Tus direcciones guardadas — toca una para usarla:</span>' +
      deCuenta.map(function (x) {
        return '<div class="car-dir-chip cuenta">' +
          '<button type="button" class="cdc-usar" data-dir="' + esc(x) + '">👤 ' + esc(x) + '</button></div>';
      }).join('') +
      locales.map(function (x) {
        return '<div class="car-dir-chip">' +
          '<button type="button" class="cdc-usar" data-dir="' + esc(x) + '">📍 ' + esc(x) + '</button>' +
          '<button type="button" class="cdc-x" data-dir="' + esc(x) + '" aria-label="Borrar esta dirección">✕</button></div>';
      }).join('');
    var chips = cont.querySelectorAll('.car-dir-chip');
    for (var i = 0; i < chips.length; i++) {
      (function (chip) {
        chip.querySelector('.cdc-usar').onclick = function () {
          var ta = document.getElementById('car-dir');
          ta.value = this.getAttribute('data-dir') || '';
          ta.classList.remove('car-dir-falta');
          var todos = cont.querySelectorAll('.car-dir-chip');
          for (var j = 0; j < todos.length; j++) todos[j].classList.toggle('activo', todos[j] === chip);
        };
        var x = chip.querySelector('.cdc-x');
        if (x) x.onclick = function () {
          var val = this.getAttribute('data-dir');
          guardarDirs(leerDirs().filter(function (d) { return d !== val; }));
          pintarDirs();
        };
      })(chips[i]);
    }
  }

  // Aviso dentro del modal del carrito (reemplaza los alert(): visible, con estilo y animación)
  var avisoTimer = null;
  function avisoCarrito(html, tipo) {
    var av = document.getElementById('car-aviso');
    if (!av) { alert(html.replace(/<[^>]+>/g, '')); return; }
    av.className = 'car-aviso' + (tipo ? ' ' + tipo : '');
    av.innerHTML = html;
    av.style.display = '';
    av.classList.remove('pop');
    void av.offsetWidth; // reinicia la animación
    av.classList.add('pop');
    if (avisoTimer) clearTimeout(avisoTimer);
    avisoTimer = setTimeout(function () { av.style.display = 'none'; }, 10000);
    try { av.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
  }

  // ---------- Identidad del cliente (token de dispositivo + archivo de consumo) ----------
  // El cliente se identifica UNA vez (al pedir con su celular o unirse al Club) y desde ahí lo
  // reconocemos: el token vive solo en SU navegador; el perfil (nombre/dirección/"lo de siempre")
  // lo sirve /api/perfil. Es local: si el navegador no soporta storage, todo sigue funcionando.
  var perfilActual = null;   // perfil traído de /api/perfil (o cacheado)
  var geoActual = null;      // { lat, lng } si el cliente compartió su ubicación en esta sesión

  function miUid() {
    try {
      var u = localStorage.getItem('arakaki_uid');
      if (!u) {
        u = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
        localStorage.setItem('arakaki_uid', u);
      }
      return u;
    } catch (e) { return ''; }
  }
  function leerPerfilCache() {
    try { return JSON.parse(localStorage.getItem('arakaki_perfil') || 'null'); } catch (e) { return null; }
  }
  function guardarPerfilCache(p) {
    try { localStorage.setItem('arakaki_perfil', JSON.stringify(p)); } catch (e) {}
  }

  // Reconoce al cliente: primero pinta lo cacheado (instantáneo), luego refresca desde el servidor.
  function reconocerCliente() {
    var cache = leerPerfilCache();
    if (cache && cache.conocido) aplicarPerfil(cache);
    var uid = miUid();
    if (!uid) return;
    fetch('/api/perfil?uid=' + encodeURIComponent(uid))
      .then(function (r) { return r.json(); })
      .then(function (p) {
        if (p && p.conocido) {
          guardarPerfilCache(p); aplicarPerfil(p);
          // Recurrencia para el dueño: 1 visita por día (aunque no haya iniciado sesión)
          cuentaFlagsCargar(function (f) { if (f.on) pingVisita(); });
        }
      })
      .catch(function () {});
  }

  // Prefill de los campos del carrito + botón "lo de siempre" si el cliente tiene historial.
  function aplicarPerfil(p) {
    perfilActual = p;
    var n = document.getElementById('car-nombre');
    var tel = document.getElementById('car-tel');
    var dir = document.getElementById('car-dir');
    if (n && !n.value && p.nombre) n.value = p.nombre;
    if (tel && !tel.value && p.telefono) tel.value = String(p.telefono).replace(/^51/, '');
    if (dir && !dir.value && p.direccion) dir.value = p.direccion;
    // Saludo al cliente reconocido: texto sobre el video de la portada (solo el home lo tiene)
    var hola = document.getElementById('portada-hola');
    if (hola && p.nombre) {
      hola.style.display = '';
      escribirSaludo(hola, saludoHora(p.nombre)); // máquina de escribir + saludo por franja horaria
    }
  }

  // Saludo según la hora local del cliente: mañana / tarde / noche.
  function saludoHora(nombre) {
    var h = new Date().getHours();
    var franja = (h >= 5 && h < 12) ? '¡Bonito día' : (h < 19) ? '¡Bonita tarde' : '¡Bonita noche';
    return franja + ', ' + nombre + '!';
  }

  // Efecto máquina de escribir: revela el saludo letra por letra con cursor parpadeante.
  var twTimer = null;
  function escribirSaludo(el, texto) {
    if (el.getAttribute('data-tw') === texto) return; // ya escrito: no reiniciar (aplicarPerfil corre 2 veces)
    el.setAttribute('data-tw', texto);
    if (twTimer) { clearTimeout(twTimer); twTimer = null; }
    el.innerHTML = '<span class="tw-txt"></span><span class="tw-cursor" aria-hidden="true"></span>';
    var span = el.querySelector('.tw-txt');
    var i = 0;
    (function paso() {
      span.textContent = texto.slice(0, i);
      if (i < texto.length) { i++; twTimer = setTimeout(paso, 55); }
    })();
  }

  // Pide la ubicación GPS (solo si el cliente acepta el permiso del navegador). Adjunta las
  // coordenadas al pedido y a un link de mapa en el mensaje de WhatsApp; nunca es obligatorio.
  function pedirUbicacion() {
    var btn = document.getElementById('car-geo');
    if (!navigator.geolocation) { if (btn) btn.textContent = 'Tu navegador no comparte ubicación'; return; }
    if (btn) { btn.disabled = true; btn.textContent = '📍 Obteniendo ubicación…'; btn.classList.remove('geo-atencion'); }
    navigator.geolocation.getCurrentPosition(function (pos) {
      geoActual = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (btn) { btn.disabled = false; btn.textContent = '✅ Ubicación lista'; btn.classList.add('geo-ok'); }
    }, function (err) {
      if (btn) { btn.disabled = false; btn.textContent = '📍 Usar mi ubicación'; }
      if (err && err.code === 1) {
        // El cliente negó el permiso del navegador: no insistir, que escriba su dirección
        avisoCarrito('🙏 No nos diste permiso de ubicación. Escribe tu dirección de entrega arriba.', 'error');
      } else {
        // GPS recién encendido (el pedido original venció mientras Android lo activaba)
        avisoCarrito('✅ <b>¡Listo! Tu GPS ahora ya está encendido.</b><br>Vuelve a presionar <b>📍 Usar mi ubicación</b>.', 'exito');
        if (btn) btn.classList.add('geo-atencion');
      }
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  function alternarProducto(p) {
    var c = leerCarrito();
    var i = -1;
    for (var j = 0; j < c.length; j++) if (c[j].name === p.name) { i = j; break; }
    if (i >= 0) c.splice(i, 1);
    else if (p.agotado) return; // agotado (panel 💰): no se puede añadir, solo quitar
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
      if (b) {
        if (nombres[nom]) b.textContent = 'Quitar del pedido';
        else b.textContent = cards[i].classList.contains('agotado') ? 'Agotado 😕' : 'Elegir producto';
      }
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
    pintarDirs();
    document.getElementById('carrito-modal-fondo').classList.add('abierto');
  }
  function cerrarCarrito() {
    document.getElementById('carrito-modal-fondo').classList.remove('abierto');
    ultimoToqueTit = ''; // que el título vuelva a teclearse la próxima vez que se abra el carrito
  }

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
    pintarCompleCarrito(); // "el toque final": sugerencias que combinan, justo antes de enviar
  }

  function enviarPedido() {
    var c = leerCarrito();
    if (!c.length) { avisoCarrito('🛒 Elige al menos un producto 🙂', 'error'); return; }
    var nombre = (document.getElementById('car-nombre').value || '').trim();
    if (!nombre) { avisoCarrito('🙌 Cuéntanos tu nombre para atenderte mejor.', 'error'); document.getElementById('car-nombre').focus(); return; }
    var tel = (document.getElementById('car-tel').value || '').replace(/\D/g, '');
    var ta = document.getElementById('car-dir');
    var dir = (ta.value || '').trim();
    if (!dir) {
      avisoCarrito(esc(sitioActual.carDirFalta || SITIO_DEF.carDirFalta), 'error');
      ta.classList.add('car-dir-falta');
      ta.focus();
      return;
    }
    ta.classList.remove('car-dir-falta');
    guardarDireccion(dir); // queda guardada para reusarla en el próximo pedido
    var t = totalCarrito(c);

    var lineas = c.map(function (p) {
      return '• ' + p.qty + ' x ' + p.name + (p.price ? ' — S/ ' + (Number(p.price) * p.qty).toFixed(2).replace(/\.00$/, '') : '');
    });
    var msj = '¡Hola Minimarket Arakaki! 👋 Soy *' + nombre + '* y quiero hacer este pedido (web):\n\n' +
      lineas.join('\n') +
      '\n\n*Total aprox: S/ ' + t.total.toFixed(2).replace(/\.00$/, '') + (t.sinPrecio ? ' + productos por cotizar' : '') + '*' +
      (dir ? '\n📍 Entrega en: ' + dir : '') +
      (geoActual ? '\n🗺️ Mi ubicación: https://maps.google.com/?q=' + geoActual.lat + ',' + geoActual.lng : '');

    // Guarda el pedido en la base (no bloquea el envío a WhatsApp si falla)
    var btn = document.getElementById('car-enviar');
    btn.disabled = true;
    var datos = { action: 'pedido', nombre: nombre, telefono: tel, direccion: dir, geo: geoActual, uid: miUid(), items: c, total: t.total, pagina: location.pathname };
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

  // ---------- Cuenta del cliente (Club Arakaki: login por PIN + beneficios) ----------
  // Capa ACTIVA de identidad: sesión verificada con celular + PIN (token en localStorage
  // arakaki_sesion → sess:<token> en Redis, la maneja /api/cuenta). Convive con el
  // reconocimiento pasivo (arakaki_uid). Los interruptores del Club (login/favoritos/
  // puntos/promos/sorteos) los decide el dueño en /panel → 👥 Club.
  var cuentaFlags = null;   // { on, funciones } — qué funciones del Club están prendidas
  var cuentaPerfil = null;  // perfil del cliente logueado (GET /api/cuenta?token=...)

  // La sesión vive en localStorage (queda iniciada) o en sessionStorage (solo hasta cerrar el
  // navegador), según el check "Mantener mi sesión iniciada" del formulario de acceso.
  function leerSesion() {
    try { return localStorage.getItem('arakaki_sesion') || sessionStorage.getItem('arakaki_sesion') || ''; } catch (e) { return ''; }
  }
  function guardarSesion(t, recordar) {
    try {
      if (recordar === false) { sessionStorage.setItem('arakaki_sesion', t); localStorage.removeItem('arakaki_sesion'); }
      else { localStorage.setItem('arakaki_sesion', t); sessionStorage.removeItem('arakaki_sesion'); }
    } catch (e) {}
  }
  function borrarSesion() {
    cuentaPerfil = null;
    try { localStorage.removeItem('arakaki_sesion'); } catch (e) {}
    try { sessionStorage.removeItem('arakaki_sesion'); } catch (e) {}
  }

  // Flags del Club con caché de 5 min en sessionStorage (una sola consulta por ratito)
  function cuentaFlagsCargar(cb) {
    if (cuentaFlags) { cb(cuentaFlags); return; }
    try {
      var c = JSON.parse(sessionStorage.getItem('arakaki_club_flags') || 'null');
      if (c && c.ts && Date.now() - c.ts < 5 * 60000 && c.d) { cuentaFlags = c.d; cb(c.d); return; }
    } catch (e) {}
    fetch('/api/cuenta').then(function (r) { return r.json(); }).then(function (j) {
      if (!j || j.on !== true) j = { on: false };
      cuentaFlags = j;
      try { sessionStorage.setItem('arakaki_club_flags', JSON.stringify({ ts: Date.now(), d: j })); } catch (e) {}
      cb(j);
    }).catch(function () { cb({ on: false }); });
  }
  function fnClub(nombre) { // ¿esta función del Club está prendida?
    return !!(cuentaFlags && cuentaFlags.on && cuentaFlags.funciones && cuentaFlags.funciones[nombre]);
  }

  function cuentaPost(datos) {
    datos.token = leerSesion();
    datos.uid = miUid();
    return fetch('/api/cuenta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(datos) })
      .then(function (r) { return r.json(); });
  }

  // Al cargar cualquier página: si el Club está activo → ítem "Mi cuenta" en el menú;
  // y si hay sesión → trae el perfil (estrellas ⭐ en el catálogo + visita del día).
  function cuentaIniciar() {
    cuentaFlagsCargar(function (f) {
      if (!f.on) return;
      menuItemCuenta();
      var tk = leerSesion();
      if (!tk) return;
      fetch('/api/cuenta?token=' + encodeURIComponent(tk))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.on === true && j.conocido === false) { borrarSesion(); return; }
          if (!j || !j.conocido) return;
          cuentaPerfil = j;
          pintarFavStars();
          prefillDirCuenta();
          pingVisita();
        }).catch(function () {});
    });
  }

  function menuItemCuenta() {
    var lista = document.querySelector('#menu-panel .menu-lista');
    if (!lista || document.getElementById('menu-mi-cuenta')) return;
    var here = location.pathname === '/mi-cuenta' || location.pathname === '/mi-cuenta.html';
    var a = document.createElement('a');
    a.id = 'menu-mi-cuenta';
    a.className = 'menu-item' + (here ? ' activo' : '');
    a.href = '/mi-cuenta';
    a.setAttribute('data-g', '0');
    a.setAttribute('data-nombre', 'mi cuenta club arakaki favoritos puntos sorteos');
    a.innerHTML = '<span class="mi-coin">👤</span><span class="mi-main"><span class="mi-txt">Mi cuenta</span>' +
      '<span class="mi-hint"></span></span><span class="mi-badge new">🎁 Club</span><span class="mi-chevron">›</span>';
    var primero = lista.querySelector('.menu-item'); // "Página principal" (grupo Inicio)
    if (primero && primero.nextSibling) lista.insertBefore(a, primero.nextSibling);
    else lista.appendChild(a);
  }

  // La dirección principal de la cuenta se refleja en el carrito: prefill si el campo
  // está vacío y chips 👤 con todas las direcciones guardadas en /mi-cuenta.
  function prefillDirCuenta() {
    if (!cuentaPerfil) return;
    var dir = document.getElementById('car-dir');
    if (dir && !dir.value && cuentaPerfil.direccion) dir.value = cuentaPerfil.direccion;
    pintarDirs();
  }

  // Cuenta 1 visita por día (recurrencia que ve el dueño en el panel). El guard vive
  // en localStorage; el servidor igual descarta repetidas del mismo día.
  function pingVisita() {
    var hoy = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem('arakaki_visita') === hoy) return;
      localStorage.setItem('arakaki_visita', hoy);
    } catch (e) { return; }
    cuentaPost({ action: 'visita' }).catch(function () {});
  }

  // Estrellas ⭐ en las cards del catálogo: solo logueados y con la función activa.
  function pintarFavStars() {
    if (!cuentaPerfil || !fnClub('favoritos')) return;
    var favSet = {};
    (cuentaPerfil.favs || []).forEach(function (f) { favSet[f.name] = 1; });
    var cards = document.querySelectorAll('.prod');
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        if (card.querySelector('.prod-fav')) return;
        var img = card.querySelector('.prod-img');
        if (!img) return;
        var nom = card.getAttribute('data-nombre');
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'prod-fav' + (favSet[nom] ? ' activo' : '');
        b.setAttribute('aria-label', 'Guardar en mis favoritos');
        b.textContent = favSet[nom] ? '★' : '☆';
        b.onclick = function (e) {
          e.stopPropagation(); // la imagen también agrega/quita del carrito: no mezclar
          var on = !b.classList.contains('activo');
          b.classList.toggle('activo', on);
          b.textContent = on ? '★' : '☆';
          cuentaPost({ action: 'fav', producto: nom, on: on }).then(function (j) {
            if (!j || !j.ok) { b.classList.toggle('activo', !on); b.textContent = on ? '☆' : '★'; return; }
            if (cuentaPerfil) cuentaPerfil.favs = (j.favs || []).map(function (n) { return { name: n }; });
          }).catch(function () { b.classList.toggle('activo', !on); b.textContent = on ? '☆' : '★'; });
        };
        img.appendChild(b);
        img.classList.add('tiene-fav'); // el botón compartir se corre a la derecha (CSS)
      })(cards[i]);
    }
  }

  // ---------- Compartir producto: WhatsApp (chat) + estado (imagen 9:16) ----------
  // Botón en cada card para TODOS los visitantes (con o sin cuenta). Sin estrella ocupa
  // su lugar (arriba a la izquierda); si el cliente entra al Club y aparece la estrella,
  // se corre solo a su derecha (.tiene-fav). El enlace compartido pasa por /api/compartir
  // (preview con foto+precio en WhatsApp) y aterriza en la categoría con ?p= = brillo.
  var SHARE_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M13 5.2V8.9C6.9 9.8 3.8 13.6 3 19c2.6-3.3 5.9-4.9 10-4.9v3.7l8-6.3-8-6.3z"/></svg>';

  function linkCompartir(nombre) {
    return location.origin + '/api/compartir?p=' + encodeURIComponent(nombre);
  }
  // Copys de compartir: el dueño los edita en panel → 📝 Sitio → 📤 Compartir (config:sitio)
  function compTxt(k) { return sitioActual[k] || SITIO_DEF[k] || ''; }
  function msgCompartir(d) {
    return '🛒 *' + d.name + '*' +
      (d.price ? '\n💰 S/ ' + d.price : '') +
      '\n' + compTxt('compChat') +
      '\n\n👉 ' + linkCompartir(d.name);
  }

  // Los datos salen de la card ya pintada: sirve igual para catálogo, productos del panel y combos
  function datosCard(card) {
    var im = card.querySelector('.prod-img img');
    var pe = card.querySelector('.prod-precio');
    var precio = '';
    if (pe && pe.textContent.indexOf('S/') === 0) precio = pe.textContent.replace('S/', '').trim();
    return { name: card.getAttribute('data-nombre') || '', price: precio, img: im ? im.getAttribute('src') : '' };
  }

  function pintarShareBtns() {
    var cards = document.querySelectorAll('.prod');
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        if (card.querySelector('.prod-share')) return;
        var img = card.querySelector('.prod-img');
        if (!img || !card.getAttribute('data-nombre')) return;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'prod-share';
        b.setAttribute('aria-label', 'Compartir este producto');
        b.innerHTML = SHARE_SVG;
        b.onclick = function (e) {
          e.stopPropagation(); // la imagen también agrega/quita del carrito: no mezclar
          abrirShareMenu(b, datosCard(card));
        };
        img.appendChild(b);
        if (img.querySelector('.prod-fav')) img.classList.add('tiene-fav');
      })(cards[i]);
    }
  }

  // Menú popover (uno global que se reposiciona junto al botón tocado)
  var shareBtnAbierto = null;
  function shareMenuEl() {
    var m = document.getElementById('share-menu');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'share-menu';
    m.innerHTML =
      '<button type="button" data-acc="chat">💬 Enviar por WhatsApp</button>' +
      '<button type="button" data-acc="estado">📸 Imagen para tu estado</button>' +
      '<button type="button" data-acc="copiar">🔗 Copiar enlace</button>' +
      '<div class="sm-nota"></div>';
    document.body.appendChild(m);
    m.onclick = function (e) {
      e.stopPropagation();
      var b = e.target.closest ? e.target.closest('button[data-acc]') : null;
      if (b) accionCompartir(b.getAttribute('data-acc'));
    };
    document.addEventListener('click', cerrarShareMenu);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarShareMenu(); });
    window.addEventListener('scroll', cerrarShareMenu, { passive: true });
    window.addEventListener('resize', cerrarShareMenu);
    return m;
  }
  function cerrarShareMenu() {
    var m = document.getElementById('share-menu');
    if (m) m.classList.remove('abierto');
    shareBtnAbierto = null;
  }
  function shareNota(txt) {
    var n = shareMenuEl().querySelector('.sm-nota');
    n.textContent = txt;
    n.style.display = txt ? 'block' : 'none';
  }
  var shareDatos = null;
  function abrirShareMenu(btn, datos) {
    if (shareBtnAbierto === btn) { cerrarShareMenu(); return; } // segundo toque = cerrar
    var m = shareMenuEl();
    shareDatos = datos;
    shareNota('');
    m.classList.add('abierto');
    shareBtnAbierto = btn;
    var r = btn.getBoundingClientRect();
    var left = Math.max(8, Math.min(r.left, window.innerWidth - m.offsetWidth - 8));
    var top = r.bottom + 10;
    if (top + m.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - m.offsetHeight - 10);
    m.style.left = left + 'px';
    m.style.top = top + 'px';
  }

  function accionCompartir(acc) {
    var d = shareDatos;
    if (!d) return;
    if (acc === 'chat') {
      if (window.arkTrack) window.arkTrack('compartir_chat');
      window.open('https://wa.me/?text=' + encodeURIComponent(msgCompartir(d)), '_blank');
      cerrarShareMenu();
    } else if (acc === 'copiar') {
      if (window.arkTrack) window.arkTrack('compartir_link');
      copiarTexto(linkCompartir(d.name), function (ok) {
        shareNota(ok ? '✅ Enlace copiado: pégalo donde quieras' : '😕 No se pudo copiar');
      });
    } else if (acc === 'estado') {
      if (window.arkTrack) window.arkTrack('compartir_estado');
      shareNota('🎨 Preparando la imagen…');
      crearImagenEstado(d, function (blob) {
        if (!blob) { shareNota('😕 No se pudo armar la imagen'); return; }
        var nombreArchivo = 'arakaki-' + d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '.jpg';
        var file = null;
        try { file = new File([blob], nombreArchivo, { type: 'image/jpeg' }); } catch (e) {}
        if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], text: msgCompartir(d) })
            .then(cerrarShareMenu)
            .catch(function () { descargarBlob(blob, nombreArchivo); });
        } else {
          descargarBlob(blob, nombreArchivo);
        }
      });
    }
  }
  function descargarBlob(blob, nombre) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.parentNode.removeChild(a); }, 4000);
    shareNota('✅ Imagen descargada: ábrela en WhatsApp → Estados 📲');
  }
  function copiarTexto(txt, cb) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { cb(true); }, function () { cb(false); });
      return;
    }
    try {
      var t = document.createElement('textarea');
      t.value = txt; document.body.appendChild(t); t.select();
      var ok = document.execCommand('copy');
      t.parentNode.removeChild(t); cb(!!ok);
    } catch (e) { cb(false); }
  }

  // Imagen 9:16 (1080×1920) para el estado de WhatsApp: fondo dark-gold, foto del
  // producto COMPLETA a su ratio original (sin recorte), precio en medallón dorado y CTA.
  function crearImagenEstado(d, cb) {
    var listos = 0, foto = new Image(), logo = new Image(), logoOk = false;
    function paso() { listos++; if (listos >= 2) dibujar(); }
    foto.onload = paso;
    foto.onerror = function () { cb(null); };
    logo.onload = function () { logoOk = true; paso(); };
    logo.onerror = paso; // sin logo se dibuja el nombre en texto
    foto.src = d.img;
    logo.src = '/img/logo-gato.png';

    function rrect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function lineas(ctx, txt, maxW, maxLineas) {
      var palabras = txt.split(' '), out = [], linea = '';
      for (var i = 0; i < palabras.length; i++) {
        var prueba = linea ? linea + ' ' + palabras[i] : palabras[i];
        if (ctx.measureText(prueba).width > maxW && linea) {
          out.push(linea); linea = palabras[i];
          if (out.length === maxLineas - 1) {
            for (; i < palabras.length; i++) {
              if (ctx.measureText(linea + ' ' + palabras[i]).width > maxW) { linea += '…'; break; }
              linea += ' ' + palabras[i];
            }
            break;
          }
        } else linea = prueba;
      }
      out.push(linea);
      return out;
    }

    function dibujar() {
      try {
        var W = 1080, H = 1920;
        var c = document.createElement('canvas');
        c.width = W; c.height = H;
        var x = c.getContext('2d');

        // Fondo premium: degradado profundo + resplandor dorado tras el producto
        var bg = x.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#1c1510'); bg.addColorStop(0.5, '#120d09'); bg.addColorStop(1, '#0b0908');
        x.fillStyle = bg; x.fillRect(0, 0, W, H);
        var glow = x.createRadialGradient(540, 820, 80, 540, 820, 720);
        glow.addColorStop(0, 'rgba(212,169,65,0.30)'); glow.addColorStop(1, 'rgba(212,169,65,0)');
        x.fillStyle = glow; x.fillRect(0, 0, W, H);

        // Marco dorado fino (doble línea, como las cards premium)
        x.strokeStyle = 'rgba(212,169,65,0.65)'; x.lineWidth = 3;
        rrect(x, 34, 34, W - 68, H - 68, 34); x.stroke();
        x.strokeStyle = 'rgba(212,169,65,0.25)'; x.lineWidth = 1.5;
        rrect(x, 48, 48, W - 96, H - 96, 26); x.stroke();

        // Cabecera: gato de la suerte + lema
        if (logoOk) {
          var lw = 520, lh = lw * (logo.naturalHeight / logo.naturalWidth);
          x.drawImage(logo, (W - lw) / 2, 92, lw, lh);
        } else {
          x.fillStyle = '#f4ebd6'; x.textAlign = 'center';
          x.font = 'bold 64px Georgia, serif';
          x.fillText('MINIMARKET ARAKAKI', W / 2, 170);
        }
        // Un texto editado muy largo no debe salirse: baja el tamaño hasta que entre
        function encajar(prefijo, px, txt, maxW) {
          do { x.font = prefijo + ' ' + px + 'px Georgia, serif'; px -= 2; }
          while (px > 16 && x.measureText(txt).width > maxW);
        }
        x.textAlign = 'center';
        x.fillStyle = '#e9c877';
        var lema = compTxt('compLema').toUpperCase().split('').join(' ');
        encajar('600', 30, lema, 940);
        x.fillText(lema, W / 2, 320);

        // Cintillo de urgencia
        x.fillStyle = '#f6d98a';
        var cintillo = compTxt('compCintillo');
        encajar('bold', 34, cintillo, 940);
        x.fillText(cintillo, W / 2, 392);

        // Foto del producto completa (contain, nunca recortada) con marco dorado
        var bx = 120, by = 440, bw = 840, bh = 900;
        var esc2 = Math.min(bw / foto.naturalWidth, bh / foto.naturalHeight);
        var fw = foto.naturalWidth * esc2, fh = foto.naturalHeight * esc2;
        var fx2 = bx + (bw - fw) / 2, fy2 = by + (bh - fh) / 2;
        x.save();
        x.shadowColor = 'rgba(212,169,65,0.55)'; x.shadowBlur = 60;
        rrect(x, fx2, fy2, fw, fh, 26);
        x.fillStyle = '#0a0908'; x.fill();
        x.restore();
        x.save();
        rrect(x, fx2, fy2, fw, fh, 26); x.clip();
        x.drawImage(foto, fx2, fy2, fw, fh);
        x.restore();
        x.strokeStyle = '#d4a941'; x.lineWidth = 5;
        rrect(x, fx2, fy2, fw, fh, 26); x.stroke();

        // Medallón dorado con el precio (el freno de pulgar)
        var cyMed = fy2 + fh - 10, cxMed = Math.min(fx2 + fw + 20, W - 160);
        if (d.price) {
          var rad = 118;
          var med = x.createLinearGradient(cxMed, cyMed - rad, cxMed, cyMed + rad);
          med.addColorStop(0, '#f6d98a'); med.addColorStop(1, '#c9992f');
          x.save();
          x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 30;
          x.beginPath(); x.arc(cxMed, cyMed, rad, 0, Math.PI * 2);
          x.fillStyle = med; x.fill();
          x.restore();
          x.strokeStyle = '#7a5c17'; x.lineWidth = 4;
          x.beginPath(); x.arc(cxMed, cyMed, rad - 7, 0, Math.PI * 2); x.stroke();
          x.fillStyle = '#3a2708';
          x.font = 'bold 40px Georgia, serif';
          x.fillText('S/', cxMed, cyMed - 22);
          var precioTam = d.price.length > 5 ? 58 : 74;
          x.font = 'bold ' + precioTam + 'px Georgia, serif';
          x.fillText(d.price, cxMed, cyMed + 46);
        }

        // Nombre del producto (hasta 3 líneas)
        x.fillStyle = '#f4ebd6';
        x.font = 'bold 56px Georgia, serif';
        var ls = lineas(x, d.name, 880, 3);
        var yN = 1452;
        for (var i = 0; i < ls.length; i++) { x.fillText(ls[i], W / 2, yN); yN += 68; }
        if (!d.price) {
          x.fillStyle = '#e9c877';
          var sinPrecio = compTxt('compSinPrecio');
          encajar('600', 36, sinPrecio, 900);
          x.fillText(sinPrecio, W / 2, yN + 6); yN += 60;
        }

        // Separador y CTA verde WhatsApp (verde = solo WhatsApp)
        x.fillStyle = '#d4a941'; x.font = '32px Georgia, serif';
        x.fillText('✦ ──────── ✦ ──────── ✦', W / 2, yN + 26);
        var pw = 760, ph = 108, pxx = (W - pw) / 2, pyy = 1706;
        var cta = x.createLinearGradient(0, pyy, 0, pyy + ph);
        cta.addColorStop(0, '#2ee06f'); cta.addColorStop(1, '#1da851');
        x.save();
        x.shadowColor = 'rgba(37,211,102,0.45)'; x.shadowBlur = 34;
        rrect(x, pxx, pyy, pw, ph, ph / 2); x.fillStyle = cta; x.fill();
        x.restore();
        x.fillStyle = '#ffffff';
        var cta = compTxt('compCta');
        encajar('bold', 44, cta, pw - 60);
        x.fillText(cta, W / 2, pyy + 68);
        x.fillStyle = '#e9c877';
        x.font = '600 28px Georgia, serif';
        x.fillText(location.host, W / 2, 1876);

        if (c.toBlob) c.toBlob(function (blob) { cb(blob); }, 'image/jpeg', 0.9);
        else cb(null);
      } catch (e) { cb(null); }
    }
  }

  // Llegada desde un enlace compartido: ?p=<nombre> → llevar al producto y hacerlo brillar
  var compartidoHecho = false;
  function destacarCompartido(cont) {
    if (compartidoHecho) return;
    var m = /[?&]p=([^&]+)/.exec(location.search);
    if (!m) { compartidoHecho = true; return; }
    var nombre;
    try { nombre = decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { compartidoHecho = true; return; }
    var cards = cont.querySelectorAll('.prod');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].getAttribute('data-nombre') === nombre) {
        compartidoHecho = true;
        var card = cards[i];
        card.classList.add('prod-brillo');
        setTimeout(function () { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 600);
        setTimeout(function () { card.classList.remove('prod-brillo'); }, 6500);
        return;
      }
    }
  }

  // Índice nombre → producto del catálogo cargado en la página (para foto y precio)
  var IDX_CAT = null;
  function prodDelCatalogo(nombre) {
    if (!IDX_CAT) {
      IDX_CAT = {};
      try {
        var cats = (window.ARAKAKI_CATALOG && window.ARAKAKI_CATALOG.categories) || {};
        Object.keys(cats).forEach(function (slug) {
          (cats[slug].sections || []).forEach(function (s) {
            (s.products || []).forEach(function (p) { if (p && p.name) IDX_CAT[p.name] = p; });
          });
        });
      } catch (e) {}
    }
    return IDX_CAT[nombre] || null;
  }

  function favItemHtml(f, conQuitar) {
    var pr = prodDelCatalogo(f.name) || {};
    var img = f.img || pr.img || '';
    var precio = (f.price != null && f.price !== '') ? f.price : pr.price;
    return '<div class="cfav" data-nombre="' + esc(f.name) + '">' +
      (img ? '<img loading="lazy" src="' + esc(img) + '" alt="">' : '') +
      '<div class="cfav-info"><span class="cfav-nom">' + esc(f.name) + '</span>' +
      (precio ? '<span class="cfav-precio">S/ ' + esc(precio) + '</span>' : '') + '</div>' +
      (conQuitar ? '<button type="button" class="cfav-x" aria-label="Quitar de favoritos">✕</button>' : '') +
      '</div>';
  }

  // Suma una lista de productos al carrito (sin duplicar) y lo abre
  function agregarListaAlCarrito(items) {
    var c = leerCarrito();
    var existentes = {};
    c.forEach(function (x) { existentes[x.name] = 1; });
    items.forEach(function (f) {
      if (existentes[f.name]) return;
      var pr = prodDelCatalogo(f.name) || {};
      var precio = (f.price != null && f.price !== '') ? f.price : (pr.price || null);
      c.push({ name: f.name, price: precio, img: f.img || pr.img || '', qty: f.qty || 1 });
      existentes[f.name] = 1;
    });
    guardarCarrito(c);
    pintarBadge(); marcarProds();
    abrirCarrito();
  }

  // Página /mi-cuenta: login/registro o panel del cliente según haya sesión.
  window.renderCuenta = function () {
    var cont = document.getElementById('contenido-cuenta');
    if (!cont) return;
    cont.innerHTML = '<section class="hero cuenta-hero"><h1>Mi cuenta</h1><p class="sub">Club Arakaki · Beneficios exclusivos online 💛</p></section>' +
      '<section class="seccion premium"><div class="interior cuenta-int" id="cuenta-int"><p class="ct-vacio">Cargando…</p></div></section>';
    cuentaFlagsCargar(function (f) {
      var int = document.getElementById('cuenta-int');
      if (!int) return;
      if (!f.on) {
        int.innerHTML = '<div class="cuenta-card"><h3>🎁 Club Arakaki</h3>' +
          '<p>El Club estará disponible muy pronto. Mientras tanto, escríbenos por WhatsApp y te atendemos al toque 📲</p>' +
          '<a class="ct-enviar ct-link" href="https://wa.me/' + WA + '" target="_blank" rel="noopener">Ir a WhatsApp 💬</a></div>';
        return;
      }
      var tk = leerSesion();
      if (!tk) { pintarAcceso(int); return; }
      if (cuentaPerfil) { pintarPanelCliente(int, cuentaPerfil); return; }
      fetch('/api/cuenta?token=' + encodeURIComponent(tk))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.conocido) { cuentaPerfil = j; pintarPanelCliente(int, j); }
          else { borrarSesion(); pintarAcceso(int); }
        }).catch(function () { pintarAcceso(int); });
    });
  };

  // Formulario de acceso: pestañas "Ya tengo cuenta" / "Crear mi cuenta"
  function pintarAcceso(int) {
    int.innerHTML =
      '<div class="cuenta-card cuenta-acceso">' +
        '<div class="cuenta-tabs">' +
          '<button type="button" class="ct-tab activo" data-t="entrar">Ya tengo cuenta</button>' +
          '<button type="button" class="ct-tab" data-t="crear">Crear mi cuenta</button>' +
        '</div>' +
        '<form id="ct-form" autocomplete="off">' +
          '<div id="ct-solo-crear" style="display:none"><label for="ct-nombre">Tu nombre</label>' +
          '<input id="ct-nombre" maxlength="60" placeholder="¿Cómo te llamas?"></div>' +
          '<label for="ct-tel">Tu celular (WhatsApp)</label>' +
          '<input id="ct-tel" inputmode="tel" maxlength="15" placeholder="Ej. 999 999 999">' +
          '<label for="ct-pin">Tu PIN (4 a 6 números)</label>' +
          '<input id="ct-pin" type="password" inputmode="numeric" maxlength="6" placeholder="••••">' +
          '<label class="ct-check"><input type="checkbox" id="ct-recordar" checked> Mantener mi sesión iniciada en este dispositivo</label>' +
          '<p class="ct-error" id="ct-error"></p>' +
          '<button type="submit" class="ct-enviar" id="ct-enviar">Entrar</button>' +
        '</form>' +
        '<p class="ct-ayuda">¿Olvidaste tu PIN? <a href="#" id="ct-rec">Recupéralo con tu correo</a> o <a href="https://wa.me/' + WA + '?text=' +
          encodeURIComponent('Hola 👋 Olvidé el PIN de mi cuenta del Club Arakaki, ¿me ayudan a recuperarla?') +
          '" target="_blank" rel="noopener">escríbenos por WhatsApp</a></p>' +
      '</div>' +
      '<div class="cuenta-card cuenta-beneficios"><h3>¿Qué gano con mi cuenta?</h3><ul>' +
        (fnClub('favoritos') ? '<li>⭐ Guarda tus favoritos y pide en 2 toques</li>' : '') +
        (fnClub('puntos') ? '<li>🪙 Acumula puntos con cada compra entregada</li>' : '') +
        (fnClub('promos') ? '<li>🎁 Promos exclusivas solo para miembros</li>' : '') +
        (fnClub('sorteos') ? '<li>🎟️ Participa en sorteos con un toque</li>' : '') +
        '<li>🔁 Tu último pedido listo para repetir</li>' +
      '</ul></div>';

    var modo = 'entrar';
    var tabs = int.querySelectorAll('.ct-tab');
    var soloCrear = document.getElementById('ct-solo-crear');
    var btn = document.getElementById('ct-enviar');
    var err = document.getElementById('ct-error');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].onclick = function () {
        modo = this.getAttribute('data-t');
        for (var j = 0; j < tabs.length; j++) tabs[j].classList.toggle('activo', tabs[j] === this);
        soloCrear.style.display = modo === 'crear' ? '' : 'none';
        btn.textContent = modo === 'crear' ? 'Crear mi cuenta' : 'Entrar';
        err.textContent = '';
      };
    }
    document.getElementById('ct-form').onsubmit = function (e) {
      e.preventDefault();
      err.textContent = '';
      var nombre = (document.getElementById('ct-nombre').value || '').trim();
      var tel = (document.getElementById('ct-tel').value || '').replace(/\D/g, '');
      var pin = (document.getElementById('ct-pin').value || '').trim();
      if (modo === 'crear' && nombre.length < 2) { err.textContent = 'Cuéntanos tu nombre 🙂'; return; }
      if (tel.length < 9) { err.textContent = 'Revisa tu número de celular (9 dígitos).'; return; }
      if (!/^\d{4,6}$/.test(pin)) { err.textContent = 'El PIN debe tener de 4 a 6 números.'; return; }
      btn.disabled = true;
      btn.textContent = 'Un momento…';
      var recordar = !!(document.getElementById('ct-recordar') && document.getElementById('ct-recordar').checked);
      cuentaPost({ action: modo, nombre: nombre, telefono: tel, pin: pin }).then(function (j) {
        if (j && j.ok && j.token) {
          guardarSesion(j.token, recordar);
          cuentaPerfil = j.perfil || null;
          if (window.arkTrack) window.arkTrack(modo === 'crear' ? 'club_cuenta_creada' : 'club_login');
          window.renderCuenta();
        } else {
          btn.disabled = false;
          btn.textContent = modo === 'crear' ? 'Crear mi cuenta' : 'Entrar';
          err.textContent = (j && j.error) || 'No pudimos conectarnos. Prueba de nuevo 🙏';
        }
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = modo === 'crear' ? 'Crear mi cuenta' : 'Entrar';
        err.textContent = 'No pudimos conectarnos. Prueba de nuevo 🙏';
      });
    };
    document.getElementById('ct-rec').onclick = function (e) { e.preventDefault(); pintarRecuperar(int); };
  }

  // Recuperar la cuenta con el correo registrado en "Mis datos". Si el sistema de correos
  // está activo (flags.correo → Resend en el backend) manda un código de 6 dígitos al correo
  // y el paso 2 lo canjea por el PIN nuevo; si no, valida celular+correo y cambia directo.
  function pintarRecuperar(int) {
    var porCodigo = !!(cuentaFlags && cuentaFlags.correo);
    int.innerHTML =
      '<div class="cuenta-card cuenta-acceso cuenta-form">' +
        '<h3>🔓 Recuperar mi cuenta</h3>' +
        '<p>' + (porCodigo
          ? 'Ingresa tu celular y el correo que registraste en tu cuenta: te enviaremos un <b>código de 6 números</b> para estrenar PIN.'
          : 'Ingresa tu celular, el correo que registraste en tu cuenta y elige un PIN nuevo.') + '</p>' +
        '<form id="cr-form" autocomplete="off">' +
          '<label for="cr-tel">Tu celular (WhatsApp)</label>' +
          '<input id="cr-tel" inputmode="tel" maxlength="15" placeholder="Ej. 999 999 999">' +
          '<label for="cr-email">Tu correo registrado</label>' +
          '<input id="cr-email" type="email" maxlength="80" placeholder="tucorreo@gmail.com">' +
          (porCodigo ? '' :
            '<label for="cr-pin">Tu PIN nuevo (4 a 6 números)</label>' +
            '<input id="cr-pin" type="password" inputmode="numeric" maxlength="6" placeholder="••••">' +
            '<label class="ct-check"><input type="checkbox" id="cr-recordar" checked> Mantener mi sesión iniciada en este dispositivo</label>') +
          '<p class="ct-error" id="cr-error"></p>' +
          '<button type="submit" class="ct-enviar" id="cr-enviar">' + (porCodigo ? '📩 Enviarme el código' : 'Recuperar y entrar') + '</button>' +
        '</form>' +
        '<p class="ct-ayuda"><a href="#" id="cr-volver">← Volver</a> · ¿No registraste un correo? <a href="https://wa.me/' + WA + '?text=' +
          encodeURIComponent('Hola 👋 Olvidé el PIN de mi cuenta del Club Arakaki y no registré correo, ¿me ayudan a recuperarla?') +
          '" target="_blank" rel="noopener">Escríbenos por WhatsApp</a></p>' +
      '</div>';
    document.getElementById('cr-volver').onclick = function (e) { e.preventDefault(); pintarAcceso(int); };
    document.getElementById('cr-form').onsubmit = function (e) {
      e.preventDefault();
      var err = document.getElementById('cr-error');
      var btn = document.getElementById('cr-enviar');
      var btnTxt = porCodigo ? '📩 Enviarme el código' : 'Recuperar y entrar';
      var tel = (document.getElementById('cr-tel').value || '').replace(/\D/g, '');
      var email = (document.getElementById('cr-email').value || '').trim();
      var pinEl = document.getElementById('cr-pin');
      var pin = pinEl ? (pinEl.value || '').trim() : '';
      err.textContent = '';
      if (tel.length < 9) { err.textContent = 'Revisa tu número de celular (9 dígitos).'; return; }
      if (!email) { err.textContent = 'Ingresa el correo que registraste en tu cuenta.'; return; }
      if (!porCodigo && !/^\d{4,6}$/.test(pin)) { err.textContent = 'El PIN nuevo debe tener de 4 a 6 números.'; return; }
      var recordar = !!(document.getElementById('cr-recordar') && document.getElementById('cr-recordar').checked);
      btn.disabled = true;
      btn.textContent = 'Un momento…';
      cuentaPost({ action: 'recuperar', telefono: tel, email: email, pin: pin }).then(function (j) {
        if (j && j.ok && j.codigo) {
          pintarRecuperarCodigo(int, tel); // paso 2: el código ya viaja al correo
        } else if (j && j.ok && j.token) {
          guardarSesion(j.token, recordar);
          cuentaPerfil = j.perfil || null;
          if (window.arkTrack) window.arkTrack('club_recupero');
          window.renderCuenta();
        } else {
          btn.disabled = false;
          btn.textContent = btnTxt;
          err.textContent = (j && j.error) || 'No pudimos conectarnos. Prueba de nuevo 🙏';
        }
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = btnTxt;
        err.textContent = 'No pudimos conectarnos. Prueba de nuevo 🙏';
      });
    };
  }

  // Paso 2 de la recuperación: canjear el código que llegó al correo por el PIN nuevo
  function pintarRecuperarCodigo(int, tel) {
    int.innerHTML =
      '<div class="cuenta-card cuenta-acceso cuenta-form">' +
        '<h3>📩 Revisa tu correo</h3>' +
        '<p>Te enviamos un <b>código de 6 números</b> (vence en 15 minutos). Si no lo ves, busca en <b>spam</b> o correos no deseados.</p>' +
        '<form id="cc-form" autocomplete="off">' +
          '<label for="cc-codigo">Código del correo</label>' +
          '<input id="cc-codigo" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code">' +
          '<label for="cc-pin">Tu PIN nuevo (4 a 6 números)</label>' +
          '<input id="cc-pin" type="password" inputmode="numeric" maxlength="6" placeholder="••••">' +
          '<label class="ct-check"><input type="checkbox" id="cc-recordar" checked> Mantener mi sesión iniciada en este dispositivo</label>' +
          '<p class="ct-error" id="cc-error"></p>' +
          '<button type="submit" class="ct-enviar" id="cc-enviar">Cambiar mi PIN y entrar</button>' +
        '</form>' +
        '<p class="ct-ayuda"><a href="#" id="cc-volver">← ¿No te llegó? Pedir otro código</a></p>' +
      '</div>';
    document.getElementById('cc-volver').onclick = function (e) { e.preventDefault(); pintarRecuperar(int); };
    document.getElementById('cc-form').onsubmit = function (e) {
      e.preventDefault();
      var err = document.getElementById('cc-error');
      var btn = document.getElementById('cc-enviar');
      var codigo = (document.getElementById('cc-codigo').value || '').replace(/\D/g, '');
      var pin = (document.getElementById('cc-pin').value || '').trim();
      err.textContent = '';
      if (codigo.length !== 6) { err.textContent = 'Escribe el código de 6 números que te llegó al correo.'; return; }
      if (!/^\d{4,6}$/.test(pin)) { err.textContent = 'El PIN nuevo debe tener de 4 a 6 números.'; return; }
      var recordar = !!(document.getElementById('cc-recordar') && document.getElementById('cc-recordar').checked);
      btn.disabled = true;
      btn.textContent = 'Un momento…';
      cuentaPost({ action: 'reccode', telefono: tel, codigo: codigo, pin: pin }).then(function (j) {
        if (j && j.ok && j.token) {
          guardarSesion(j.token, recordar);
          cuentaPerfil = j.perfil || null;
          if (window.arkTrack) window.arkTrack('club_recupero');
          window.renderCuenta();
        } else {
          btn.disabled = false;
          btn.textContent = 'Cambiar mi PIN y entrar';
          err.textContent = (j && j.error) || 'No pudimos conectarnos. Prueba de nuevo 🙏';
        }
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = 'Cambiar mi PIN y entrar';
        err.textContent = 'No pudimos conectarnos. Prueba de nuevo 🙏';
      });
    };
  }

  // Historial de preguntas del cliente (con la respuesta del negocio cuando ya llegó)
  function preguntasHtml(lista) {
    if (!lista || !lista.length) return '<p class="ct-vacio" style="margin-top:14px">Aún no haces preguntas. ¡Anímate! 🙌</p>';
    return lista.map(function (q) {
      return '<div class="cpreg">' +
        '<p class="cq-q">🙋 ' + esc(q.pregunta) + (q.ts ? ' <small>' + new Date(Number(q.ts)).toLocaleDateString('es-PE') + '</small>' : '') + '</p>' +
        (q.respuesta
          ? '<p class="cq-r">💬 ' + esc(q.respuesta) + (q.respTs ? ' <small>' + new Date(Number(q.respTs)).toLocaleDateString('es-PE') + '</small>' : '') + '</p>'
          : '<p class="cq-esp">⏳ Esperando respuesta… te la mostramos aquí mismo.</p>') +
        '</div>';
    }).join('');
  }

  // Foto de perfil: recorte cuadrado centrado a 144px y JPEG liviano (dataURL de pocos KB)
  function comprimirFoto(file, cb) {
    try {
      var lector = new FileReader();
      lector.onerror = function () { cb(null); };
      lector.onload = function () {
        var img = new Image();
        img.onerror = function () { cb(null); };
        img.onload = function () {
          try {
            var S = 144;
            var lienzo = document.createElement('canvas');
            lienzo.width = S; lienzo.height = S;
            var ctx = lienzo.getContext('2d');
            var m = Math.min(img.width, img.height);
            ctx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
            cb(lienzo.toDataURL('image/jpeg', 0.82));
          } catch (e) { cb(null); }
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(file);
    } catch (e) { cb(null); }
  }

  function fotoHtml(p, id) {
    return p.foto
      ? '<img class="ch-foto"' + (id ? ' id="' + id + '"' : '') + ' src="' + esc(p.foto) + '" alt="">'
      : '<span class="ch-foto ch-foto-vacia"' + (id ? ' id="' + id + '"' : '') + '>👤</span>';
  }

  // Panel del cliente logueado: puntos, promos, sorteos, favoritos, su último pedido,
  // sus preguntas al negocio y la gestión de su cuenta (datos, foto, direcciones, PIN)
  function pintarPanelCliente(int, p) {
    var html = '<div class="cuenta-card cuenta-hola"><div class="ch-cab">' + fotoHtml(p) +
      '<div><h3>¡Hola, ' + esc(p.nombre || 'casero') + '! 👋</h3>' +
      '<p>' + (p.pedidos ? 'Llevas <b>' + p.pedidos + '</b> pedido' + (p.pedidos === 1 ? '' : 's') + ' con nosotros 💛' : 'Bienvenido al Club Arakaki 💛') + '</p></div></div>' +
      '<button type="button" class="ct-salir" id="ct-salir">🚪 Cerrar sesión</button></div>';

    if (fnClub('puntos')) {
      html += '<div class="cuenta-card cuenta-puntos"><h3>🪙 Mis puntos</h3>' +
        '<div class="cp-num">' + (Number(p.puntos) || 0) + '</div>' +
        '<p>Ganas puntos con cada pedido entregado. <a href="https://wa.me/' + WA + '?text=' +
        encodeURIComponent('Hola 👋 Quiero canjear mis puntos del Club Arakaki 🪙') +
        '" target="_blank" rel="noopener">Canjéalos por WhatsApp 📲</a></p></div>';
    }
    if (fnClub('promos')) {
      html += '<div class="cuenta-card cuenta-promos"><h3>🎁 Promos exclusivas</h3>' +
        ((p.promos && p.promos.length) ? p.promos.map(function (pr) {
          return '<div class="cprom"><b>' + esc(pr.titulo) + '</b>' +
            (pr.texto ? '<p>' + esc(pr.texto) + '</p>' : '') +
            (pr.hasta ? '<small>Hasta el ' + new Date(Number(pr.hasta)).toLocaleDateString('es-PE') + '</small>' : '') + '</div>';
        }).join('') : '<p class="ct-vacio">Pronto verás aquí promos solo para miembros 👀</p>');
      html += '</div>';
    }
    if (fnClub('cupones')) {
      html += '<div class="cuenta-card cuenta-cupones"><h3>🎫 Cupones exclusivos</h3>' +
        ((p.cupones && p.cupones.length) ? p.cupones.map(function (cu) {
          return '<div class="ccup">' +
            (cu.imagen ? '<img src="' + esc(cu.imagen) + '" alt="' + esc(cu.titulo || 'Cupón') + '">' : '') +
            '<b>' + esc(cu.titulo) + '</b>' +
            (cu.codigo ? '<span class="ccup-cod">' + esc(cu.codigo) + '</span>' : '') +
            (cu.hasta ? '<small>Hasta el ' + new Date(Number(cu.hasta)).toLocaleDateString('es-PE') + '</small>' : '') + '</div>';
        }).join('') : '<p class="ct-vacio">Pronto verás aquí cupones solo para miembros 🎫</p>');
      html += '</div>';
    }
    if (fnClub('sorteos')) {
      html += '<div class="cuenta-card cuenta-sorteos"><h3>🎟️ Sorteos</h3>' +
        ((p.sorteos && p.sorteos.length) ? p.sorteos.map(function (s) {
          return '<div class="csort" data-id="' + esc(s.id) + '"><b>' + esc(s.titulo) + '</b>' +
            (s.premio ? '<p>🏆 ' + esc(s.premio) + '</p>' : '') +
            (s.hasta ? '<small>Hasta el ' + new Date(Number(s.hasta)).toLocaleDateString('es-PE') + '</small>' : '') +
            '<button type="button" class="cs-btn"' + (s.participando ? ' disabled' : '') + '>' +
            (s.participando ? '✅ Ya estás participando' : '🎟️ Participar gratis') + '</button></div>';
        }).join('') : '<p class="ct-vacio">No hay sorteos activos ahorita. ¡Atento a los avisos! 🔔</p>');
      html += '</div>';
    }
    if (fnClub('favoritos')) {
      html += '<div class="cuenta-card cuenta-favs"><h3>⭐ Mis favoritos</h3>' +
        ((p.favs && p.favs.length)
          ? '<div class="cfav-grid">' + p.favs.map(function (f) { return favItemHtml(f, true); }).join('') + '</div>' +
            '<button type="button" class="ct-enviar" id="cf-todos">🛒 Agregar todos a mi pedido</button>'
          : '<p class="ct-vacio">Marca la estrellita ⭐ de cualquier producto del catálogo y aparecerá aquí.</p>' +
            '<a class="ct-enviar ct-link" href="/pisco">Ver el catálogo 🛍️</a>');
      html += '</div>';
    }
    if (p.habitual && p.habitual.length) {
      html += '<div class="cuenta-card cuenta-habitual"><h3>🔁 Mi último pedido</h3><p>Lo que pediste la última vez:</p>' +
        '<div class="cfav-grid">' + p.habitual.slice(0, 6).map(function (h) { return favItemHtml(h, false); }).join('') + '</div>' +
        '<button type="button" class="ct-enviar" id="ch-todos">🛒 Repetir mi último pedido</button></div>';
    }

    // ❓ Mis preguntas: el cliente pregunta y el dueño le responde desde el panel
    html += '<div class="cuenta-card cuenta-form cuenta-preguntas"><h3>❓ Mis preguntas</h3>' +
      '<p>Pregúntanos lo que quieras (un producto, precios, tu pedido) y te respondemos aquí mismo.</p>' +
      '<textarea id="cq-texto" rows="2" maxlength="400" placeholder="Escribe tu pregunta o consulta…"></textarea>' +
      '<p class="ct-error" id="cq-error"></p>' +
      '<button type="button" class="ct-enviar" id="cq-enviar">📨 Enviar mi pregunta</button>' +
      '<div id="cq-lista">' + preguntasHtml(p.preguntas) + '</div></div>';

    // 👤 Mis datos: foto de perfil, nombre y correo (recuperación + avisos exclusivos)
    html += '<div class="cuenta-card cuenta-form cuenta-datos"><h3>👤 Mis datos</h3>' +
      '<div class="cd-foto-fila">' + fotoHtml(p, 'cd-foto-prev') +
      '<div class="cd-foto-btns"><button type="button" class="ct-mini" id="cd-foto-btn">📷 ' + (p.foto ? 'Cambiar mi foto' : 'Subir mi foto') + '</button>' +
      (p.foto ? '<button type="button" class="ct-mini" id="cd-foto-del">🗑 Quitar</button>' : '') +
      '<input type="file" id="cd-foto-input" accept="image/*" style="display:none"></div></div>' +
      '<label for="cd-nombre">Tu nombre</label><input id="cd-nombre" maxlength="60" value="' + esc(p.nombre || '') + '">' +
      '<label for="cd-email">Tu correo (opcional)</label><input id="cd-email" type="email" maxlength="80" placeholder="tucorreo@gmail.com" value="' + esc(p.email || '') + '">' +
      '<p class="ct-nota">📬 Registrando tu correo puedes <b>recuperar tu cuenta</b> si olvidas tu PIN y recibes <b>avisos exclusivos solo para miembros</b> — descuentos, regalos y la respuesta a tus preguntas — que verás reflejados aquí en tu panel.</p>' +
      '<p class="ct-error" id="cd-error"></p>' +
      '<button type="button" class="ct-enviar" id="cd-guardar">💾 Guardar mis datos</button></div>';

    // 📍 Mis direcciones de entrega (se reflejan en el carrito como chips 👤)
    html += '<div class="cuenta-card cuenta-form cuenta-dirs"><h3>📍 Mis direcciones de entrega</h3>' +
      '<p>La <b>principal</b> ⭐ se llena sola en el carrito; todas aparecen como opciones al hacer tu pedido.</p>' +
      '<div id="cd-dirs"></div>' +
      '<textarea id="cd-dir-nueva" rows="2" maxlength="200" placeholder="Calle, número, distrito y referencia"></textarea>' +
      '<p class="ct-error" id="cd-dir-error"></p>' +
      '<button type="button" class="ct-enviar" id="cd-dir-add">➕ Guardar dirección</button></div>';

    // 🔑 Cambiar mi PIN
    html += '<div class="cuenta-card cuenta-form cuenta-pin"><h3>🔑 Cambiar mi PIN</h3>' +
      '<label for="cp-actual">Tu PIN actual</label><input id="cp-actual" type="password" inputmode="numeric" maxlength="6" placeholder="••••">' +
      '<label for="cp-nuevo">Tu PIN nuevo (4 a 6 números)</label><input id="cp-nuevo" type="password" inputmode="numeric" maxlength="6" placeholder="••••">' +
      '<p class="ct-error" id="cp-error"></p>' +
      '<button type="button" class="ct-enviar" id="cp-cambiar">Cambiar mi PIN</button></div>';

    int.innerHTML = html;

    document.getElementById('ct-salir').onclick = function () {
      cuentaPost({ action: 'salir' }).catch(function () {});
      borrarSesion();
      window.renderCuenta();
    };
    var cfTodos = document.getElementById('cf-todos');
    if (cfTodos) cfTodos.onclick = function () { agregarListaAlCarrito(p.favs || []); };
    var chTodos = document.getElementById('ch-todos');
    if (chTodos) chTodos.onclick = function () { agregarListaAlCarrito(p.habitual || []); };

    // Quitar un favorito desde la cuenta
    var xs = int.querySelectorAll('.cfav-x');
    for (var i = 0; i < xs.length; i++) {
      (function (x) {
        x.onclick = function () {
          var fila = x.parentNode;
          var nom = fila.getAttribute('data-nombre');
          fila.style.opacity = '.4';
          cuentaPost({ action: 'fav', producto: nom, on: false }).then(function (j) {
            if (j && j.ok) {
              if (fila.parentNode) fila.parentNode.removeChild(fila);
              p.favs = (p.favs || []).filter(function (f) { return f.name !== nom; });
              if (cuentaPerfil) cuentaPerfil.favs = p.favs;
              if (!p.favs.length) pintarPanelCliente(int, p);
            } else fila.style.opacity = '';
          }).catch(function () { fila.style.opacity = ''; });
        };
      })(xs[i]);
    }

    // Participar en un sorteo (1 toque)
    var sorteos = int.querySelectorAll('.csort');
    for (var k = 0; k < sorteos.length; k++) {
      (function (fila) {
        var btn = fila.querySelector('.cs-btn');
        if (!btn || btn.disabled) return;
        btn.onclick = function () {
          btn.disabled = true;
          btn.textContent = 'Un momento…';
          cuentaPost({ action: 'sorteo', id: fila.getAttribute('data-id') }).then(function (j) {
            if (j && j.ok) {
              btn.textContent = '✅ Ya estás participando';
              if (window.arkTrack) window.arkTrack('club_sorteo');
            } else {
              btn.disabled = false;
              btn.textContent = '🎟️ Participar gratis';
              alert((j && j.error) || 'No se pudo registrar tu participación 🙏');
            }
          }).catch(function () { btn.disabled = false; btn.textContent = '🎟️ Participar gratis'; });
        };
      })(sorteos[k]);
    }

    // Enviar una pregunta al negocio (aparece en el panel del dueño → ❓ Consultas)
    var cqBtn = document.getElementById('cq-enviar');
    cqBtn.onclick = function () {
      var ta = document.getElementById('cq-texto');
      var errQ = document.getElementById('cq-error');
      var texto = (ta.value || '').trim();
      errQ.textContent = '';
      if (texto.length < 5) { errQ.textContent = 'Cuéntanos tu pregunta con un poquito más de detalle 🙂'; return; }
      cqBtn.disabled = true; cqBtn.textContent = 'Enviando…';
      cuentaPost({ action: 'pregunta', texto: texto }).then(function (j) {
        cqBtn.disabled = false; cqBtn.textContent = '📨 Enviar mi pregunta';
        if (j && j.ok && j.pregunta) {
          ta.value = '';
          p.preguntas = [j.pregunta].concat(p.preguntas || []).slice(0, 10);
          if (cuentaPerfil) cuentaPerfil.preguntas = p.preguntas;
          document.getElementById('cq-lista').innerHTML = preguntasHtml(p.preguntas);
          if (window.arkTrack) window.arkTrack('club_pregunta');
        } else errQ.textContent = (j && j.error) || 'No pudimos enviar tu pregunta. Prueba de nuevo 🙏';
      }).catch(function () {
        cqBtn.disabled = false; cqBtn.textContent = '📨 Enviar mi pregunta';
        errQ.textContent = 'No pudimos enviar tu pregunta. Prueba de nuevo 🙏';
      });
    };

    // Guardar nombre y correo
    var cdBtn = document.getElementById('cd-guardar');
    cdBtn.onclick = function () {
      var errD = document.getElementById('cd-error');
      var nombre = (document.getElementById('cd-nombre').value || '').trim();
      var email = (document.getElementById('cd-email').value || '').trim();
      errD.textContent = '';
      if (nombre.length < 2) { errD.textContent = 'Cuéntanos tu nombre 🙂'; return; }
      cdBtn.disabled = true; cdBtn.textContent = 'Guardando…';
      cuentaPost({ action: 'perfil', nombre: nombre, email: email }).then(function (j) {
        cdBtn.disabled = false;
        if (j && j.ok) {
          p.nombre = j.nombre; p.email = j.email;
          if (cuentaPerfil) { cuentaPerfil.nombre = j.nombre; cuentaPerfil.email = j.email; }
          cdBtn.textContent = '✅ ¡Datos guardados!';
          setTimeout(function () { cdBtn.textContent = '💾 Guardar mis datos'; }, 2500);
        } else {
          cdBtn.textContent = '💾 Guardar mis datos';
          errD.textContent = (j && j.error) || 'No se pudo guardar. Prueba de nuevo 🙏';
        }
      }).catch(function () {
        cdBtn.disabled = false; cdBtn.textContent = '💾 Guardar mis datos';
        errD.textContent = 'No se pudo guardar. Prueba de nuevo 🙏';
      });
    };

    // Foto de perfil: elegir → comprimir en el navegador → subir
    var fotoBtn = document.getElementById('cd-foto-btn');
    var fotoInput = document.getElementById('cd-foto-input');
    fotoBtn.onclick = function () { fotoInput.click(); };
    fotoInput.onchange = function () {
      var f = fotoInput.files && fotoInput.files[0];
      if (!f) return;
      fotoBtn.disabled = true; fotoBtn.textContent = '⏳ Subiendo…';
      comprimirFoto(f, function (dataURL) {
        if (!dataURL) {
          fotoBtn.disabled = false; fotoBtn.textContent = '📷 Subir mi foto';
          document.getElementById('cd-error').textContent = 'No pudimos leer esa imagen. Prueba con otra 🙏';
          return;
        }
        cuentaPost({ action: 'foto', foto: dataURL }).then(function (j) {
          if (j && j.ok) {
            p.foto = dataURL;
            if (cuentaPerfil) cuentaPerfil.foto = dataURL;
            pintarPanelCliente(int, p); // re-pinta con la foto nueva (avatar del saludo + botón Quitar)
          } else {
            fotoBtn.disabled = false; fotoBtn.textContent = '📷 Subir mi foto';
            document.getElementById('cd-error').textContent = (j && j.error) || 'No se pudo subir la foto 🙏';
          }
        }).catch(function () {
          fotoBtn.disabled = false; fotoBtn.textContent = '📷 Subir mi foto';
          document.getElementById('cd-error').textContent = 'No se pudo subir la foto 🙏';
        });
      });
    };
    var fotoDel = document.getElementById('cd-foto-del');
    if (fotoDel) fotoDel.onclick = function () {
      fotoDel.disabled = true;
      cuentaPost({ action: 'foto', foto: '' }).then(function (j) {
        if (j && j.ok) { p.foto = ''; if (cuentaPerfil) cuentaPerfil.foto = ''; pintarPanelCliente(int, p); }
        else fotoDel.disabled = false;
      }).catch(function () { fotoDel.disabled = false; });
    };

    // Direcciones de entrega: viven en la cuenta (el carrito las pinta como chips 👤)
    var dirsCont = document.getElementById('cd-dirs');
    function dirsPlano() { // [principal, ...adicionales]
      var plano = [];
      if (p.direccion) plano.push(p.direccion);
      (p.direcciones || []).forEach(function (d) { if (d) plano.push(d); });
      return plano;
    }
    function guardarDirsCuenta(principal, otras, cb) {
      cuentaPost({ action: 'dirs', direccion: principal, direcciones: otras }).then(function (j) {
        if (j && j.ok) {
          p.direccion = j.direccion; p.direcciones = j.direcciones;
          if (cuentaPerfil) { cuentaPerfil.direccion = j.direccion; cuentaPerfil.direcciones = j.direcciones; }
          pintarDirsCuenta();
          pintarDirs(); // refresca los chips del carrito
        } else document.getElementById('cd-dir-error').textContent = (j && j.error) || 'No se pudo guardar 🙏';
        if (cb) cb(!!(j && j.ok));
      }).catch(function () {
        document.getElementById('cd-dir-error').textContent = 'No se pudo guardar 🙏';
        if (cb) cb(false);
      });
    }
    function pintarDirsCuenta() {
      var plano = dirsPlano();
      dirsCont.innerHTML = plano.length ? plano.map(function (d, idx) {
        var esPrin = idx === 0;
        return '<div class="cdir' + (esPrin ? ' principal' : '') + '">' +
          '<span class="cdir-txt">' + (esPrin ? '⭐ ' : '📍 ') + esc(d) + (esPrin ? ' <small>Principal</small>' : '') + '</span>' +
          '<span class="cdir-btns">' +
          (esPrin ? '' : '<button type="button" class="ct-mini cdir-main" data-i="' + idx + '" title="Usarla como principal">⭐ Principal</button>') +
          '<button type="button" class="ct-mini cdir-x" data-i="' + idx + '" aria-label="Borrar esta dirección">✕</button></span></div>';
      }).join('') : '<p class="ct-vacio">Aún no guardas direcciones. Agrega la primera aquí abajo 👇</p>';
      var mains = dirsCont.querySelectorAll('.cdir-main');
      for (var d1 = 0; d1 < mains.length; d1++) mains[d1].onclick = function () {
        var plano2 = dirsPlano();
        var elegida = plano2.splice(Number(this.getAttribute('data-i')), 1)[0];
        guardarDirsCuenta(elegida, plano2);
      };
      var eqs = dirsCont.querySelectorAll('.cdir-x');
      for (var d2 = 0; d2 < eqs.length; d2++) eqs[d2].onclick = function () {
        var plano3 = dirsPlano();
        plano3.splice(Number(this.getAttribute('data-i')), 1);
        guardarDirsCuenta(plano3[0] || '', plano3.slice(1));
      };
    }
    pintarDirsCuenta();
    document.getElementById('cd-dir-add').onclick = function () {
      var taD = document.getElementById('cd-dir-nueva');
      var errDir = document.getElementById('cd-dir-error');
      var val = (taD.value || '').trim();
      errDir.textContent = '';
      if (val.length < 5) { errDir.textContent = 'Escribe la dirección con calle, número y distrito 🙂'; return; }
      var plano4 = dirsPlano();
      if (plano4.length >= 6) { errDir.textContent = 'Ya tienes 6 direcciones guardadas. Borra una para agregar otra 🙏'; return; }
      plano4.push(val);
      guardarDirsCuenta(plano4[0], plano4.slice(1), function (ok) { if (ok) taD.value = ''; });
    };

    // Cambiar el PIN (pide el actual; el servidor cierra las otras sesiones)
    var cpBtn = document.getElementById('cp-cambiar');
    cpBtn.onclick = function () {
      var errP = document.getElementById('cp-error');
      var actual = (document.getElementById('cp-actual').value || '').trim();
      var nuevo = (document.getElementById('cp-nuevo').value || '').trim();
      errP.textContent = '';
      if (!/^\d{4,6}$/.test(nuevo)) { errP.textContent = 'El PIN nuevo debe tener de 4 a 6 números.'; return; }
      cpBtn.disabled = true; cpBtn.textContent = 'Un momento…';
      cuentaPost({ action: 'pin', pinActual: actual, pinNuevo: nuevo }).then(function (j) {
        cpBtn.disabled = false;
        if (j && j.ok) {
          cpBtn.textContent = '✅ PIN actualizado';
          document.getElementById('cp-actual').value = '';
          document.getElementById('cp-nuevo').value = '';
          setTimeout(function () { cpBtn.textContent = 'Cambiar mi PIN'; }, 2500);
        } else {
          cpBtn.textContent = 'Cambiar mi PIN';
          errP.textContent = (j && j.error) || 'No se pudo cambiar. Prueba de nuevo 🙏';
        }
      }).catch(function () {
        cpBtn.disabled = false; cpBtn.textContent = 'Cambiar mi PIN';
        errP.textContent = 'No se pudo cambiar. Prueba de nuevo 🙏';
      });
    };
  }

  // ---------- Chat vendedor flotante (→ /api/chat) ----------
  // Solo aparece si el backend confirma que el bot está activo (API key + no apagado en /panel).
  // Mecánica conversacional estilo WHAPE: "escribiendo…" antes de cada mensaje, párrafos
  // revelados uno a uno (el bot separa ideas con \n\n) y botones de respuesta rápida
  // (sugerencias que manda /api/chat) que se envían como si el cliente los escribiera.
  var CHAT_KEY = 'arakaki_chat';
  var CHAT_SALUDO = '¡Hola! 👋 Soy el asistente del *Minimarket Arakaki*. Activa nuestros *avisos gratis* y déjame tu WhatsApp o correo para enterarte *antes que nadie* de ofertas, sorteos y novedades 🔔';
  var CHAT_SUG_INICIAL = ['🔔 Quiero los avisos gratis', '📩 Dejar mi WhatsApp/correo', '🛒 Ver productos'];
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
      '<span class="fab-burbuja">' + esc(cfg.invitacion || '¿Te aviso de las ofertas? 🔔') + '</span>' +
      '<img class="fab-gato" src="/img/asistente-arakaki.png" alt="Asistente Arakaki">';
    document.body.appendChild(fab);

    var caja = document.createElement('div');
    caja.id = 'chat-caja';
    caja.innerHTML =
      '<div class="chat-cab">' +
        '<img class="chat-avatar" src="/img/asistente-arakaki.png" alt="">' +
        '<div class="chat-tit"><b>Asistente Arakaki</b><small>' + esc(cfg.subtitulo || 'Entérate primero de ofertas y novedades') + '</small></div>' +
        '<button class="chat-cerrar" aria-label="Cerrar">✕</button>' +
      '</div>' +
      '<div id="chat-msgs"></div>' +
      '<div id="chat-quick"></div>' +
      '<form id="chat-form" autocomplete="off">' +
        '<textarea id="chat-in" rows="1" placeholder="Escríbeme aquí 😊" maxlength="500"></textarea>' +
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

    function pintarQuick(labels, push, conCuenta) {
      quick.innerHTML = '';
      var off = 0;
      if (push) { // botón especial: activa los avisos con un toque (no manda un mensaje)
        var pb = document.createElement('button');
        pb.type = 'button';
        pb.className = 'chat-opt push';
        pb.textContent = '🔔 Activar avisos gratis';
        pb.onclick = function () { activarPushChat(); };
        quick.appendChild(pb);
        off = 1;
      }
      (labels || []).forEach(function (lbl, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'chat-opt';
        b.textContent = lbl;
        b.style.animationDelay = ((i + off) * 80) + 'ms'; // aparecen en cascada
        b.onclick = function () { enviar(lbl); };
        quick.appendChild(b);
      });
      if (conCuenta) { // acceso directo al Club (solo en la bienvenida, si está activo)
        var cb = document.createElement('button');
        cb.type = 'button';
        cb.className = 'chat-opt cuenta';
        cb.textContent = '👤 Mi cuenta';
        cb.style.animationDelay = (((labels || []).length + off) * 80) + 'ms';
        cb.onclick = function () { location.href = '/mi-cuenta'; };
        quick.appendChild(cb);
      }
    }

    // El cliente tocó "🔔 Activar avisos gratis" (el bot mandó el marcador [[PUSH]] → j.push).
    // Suscribe este navegador; si no se puede, lo lleva a dejar su WhatsApp/correo.
    function activarPushChat() {
      pintarQuick([]); // quita el botón para que no lo toque dos veces
      st.push = false;
      if (!PUSH_OK) {
        if (IOS) { pushGuiaIOS(); recibir('En iPhone primero agrega la web a tu inicio 📲 (te dejé la guía). ¡Igual déjame tu WhatsApp o correo y yo te aviso de las ofertas! 😊', ['Te dejo mi WhatsApp', 'Te dejo mi correo'], false); }
        else recibir('Tu navegador no permite avisos 🙈 pero déjame tu WhatsApp o correo y te aviso de todas las ofertas 😉', ['Te dejo mi WhatsApp', 'Te dejo mi correo'], false);
        return;
      }
      if (Notification.permission === 'denied') {
        recibir('Veo que los avisos están *bloqueados* en tu navegador 🙈 Puedes reactivarlos en los ajustes del sitio. Mientras, déjame tu WhatsApp o correo y te aviso igual 😊', ['Te dejo mi WhatsApp', 'Te dejo mi correo'], false);
        return;
      }
      pushActivar().then(function () {
        pushPintarBtn();
        enviar('✅ Listo, activé las notificaciones');
      }).catch(function () {
        recibir('No pude activar los avisos ahorita 🙏 Prueba de nuevo o déjame tu WhatsApp o correo y yo te aviso 😉', ['Te dejo mi WhatsApp', 'Te dejo mi correo'], false);
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
      pintarQuick(st.sug, st.push);
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
          pintarQuick(botonesIni, false, !!(cuentaFlags && cuentaFlags.on));
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
      st.push = false;
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
        body: JSON.stringify({ sid: st.sid, uid: miUid(), mensajes: hist }),
      }).then(function (r) { return r.json(); }).then(function (j) {
        recibir((j && j.reply) || CHAT_ERROR + '\nhttps://wa.me/' + WA, (j && j.sugerencias) || [], j && j.push);
      }).catch(function () {
        recibir(CHAT_ERROR + '\nhttps://wa.me/' + WA, []);
      });
    }

    function recibir(texto, sugerencias, push) {
      quitarEscribiendo();
      st.msgs.push({ r: 'b', t: texto });
      st.sug = sugerencias;
      st.push = !!push;
      chatGuardar(st);
      revelarBot(texto, function () {
        ocupado = false;
        pintarQuick(sugerencias, push);
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

  // ---------- Combos de venta cruzada (subir el ticket) ----------
  // Dos piezas: la sección "El complemento perfecto" al pie de cada página de categoría (tarjetas
  // premium de OTRAS categorías que combinan) y "el toque final" dentro del carrito (mini-sugerencias
  // con ➕, justo antes de enviar: el mejor momento para un extra). El dueño las administra en
  // panel → 📝 Sitio → 🧩 Combos (config:comple, viaja en /api/precios como c); sin configurar nada,
  // manda el pareo automático COMPLE_AUTO y las sugerencias rotan cada día para sentirse frescas.
  var COMPLE_AUTO = {
    'pisco': ['refrescos', 'aguas-importadas', 'chocolates-importados'],
    'vinos': ['chocolates-importados', 'galletas', 'aguas-importadas'],
    'vinos-peruanos': ['chocolates-importados', 'galletas', 'aguas-importadas'],
    'vinos-argentinos': ['chocolates-importados', 'galletas', 'aguas-importadas'],
    'vinos-chilenos': ['chocolates-importados', 'galletas', 'aguas-importadas'],
    'whisky': ['refrescos', 'aguas-importadas', 'chocolates-importados'],
    'ron': ['refrescos', 'aguas-importadas', 'dulces'],
    'licor-frances': ['chocolates-importados', 'galletas', 'aguas-importadas'],
    'licor-italiano': ['aguas-importadas', 'chocolates-importados', 'galletas'],
    'vodka': ['refrescos', 'aguas-importadas', 'dulces'],
    'tequila': ['refrescos', 'aguas-importadas', 'dulces'],
    'anisado': ['galletas', 'chocolates-importados', 'dulces'],
    'licores-variados': ['refrescos', 'chocolates-importados', 'aguas-importadas'],
    'refrescos': ['ron', 'whisky', 'vodka'],
    'aguas-importadas': ['licor-italiano', 'vinos', 'chocolates-importados'],
    'helados': ['chocolates-importados', 'galletas', 'dulces'],
    'chocolates-importados': ['vinos', 'helados', 'galletas'],
    'dulces': ['chocolates-importados', 'galletas', 'helados'],
    'galletas': ['chocolates-importados', 'dulces', 'backtoschool'],
    'backtoschool': ['galletas', 'frutas-y-vegetales', 'chocolates-importados'],
    'frutas-y-vegetales': ['backtoschool', 'aguas-importadas', 'helados'],
  };
  var COMPLE_TIT = '✨ El complemento perfecto';
  var COMPLE_SUB = 'Combinan con lo que estás viendo — complétalo de una vez';
  var COMPLE_N = 3; // sugerencias visibles (el dueño puede elegir hasta 8: rotan cada día)

  // Catálogo en vivo compartido (/api/precios): renderCategoria y el carrito usan LA MISMA respuesta.
  var vivoData = null;   // última respuesta {p,s,x,v,c}
  var vivoPend = null;   // callbacks esperando el fetch en curso (evita pedirlo 2 veces)
  function cargarVivo(cb) {
    if (vivoData) { cb(vivoData); return; }
    if (vivoPend) { vivoPend.push(cb); return; }
    vivoPend = [cb];
    function avisar(data) {
      var lista = vivoPend || [];
      vivoPend = null;
      lista.forEach(function (f) { try { f(data); } catch (e) {} });
    }
    fetch('/api/precios').then(function (r) { return r.json(); }).then(function (data) {
      if (data) vivoData = data;
      avisar(vivoData);
    }).catch(function () { avisar(null); });
  }

  // Índice de TODO el catálogo (base + productos del panel) con precio/stock en vivo aplicados.
  // Se arma una vez por página, después de que cargarVivo trajo los overrides.
  var vivoIndice = null;
  function indiceVivo() {
    if (vivoIndice) return vivoIndice;
    var porNombre = {}, porCat = {};
    var cats = (window.ARAKAKI_CATALOG && window.ARAKAKI_CATALOG.categories) || {};
    var d = vivoData || {};
    Object.keys(cats).forEach(function (slug) {
      (cats[slug].sections || []).forEach(function (sec) {
        (sec.products || []).forEach(function (p) {
          if (porNombre[p.name]) return;
          var it = { name: p.name, price: p.price, img: p.img, cat: slug };
          porNombre[p.name] = it;
          (porCat[slug] = porCat[slug] || []).push(it);
        });
      });
    });
    (d.x || []).forEach(function (e) {
      if (!e || !e.nombre || porNombre[e.nombre]) return;
      var it = { name: e.nombre, price: e.precio || '', img: e.img, cat: e.cat };
      porNombre[e.nombre] = it;
      (porCat[e.cat] = porCat[e.cat] || []).push(it);
    });
    Object.keys(porNombre).forEach(function (n) {
      var it = porNombre[n];
      var pv = d.p && d.p[it.cat + '|' + n];
      if (pv !== undefined) it.price = pv;
      var st = d.s && d.s[it.cat + '|' + n];
      if (st === 'agotado') it.agotado = 1;
      if (st === 'oculto') it.oculto = 1;
    });
    vivoIndice = { porNombre: porNombre, porCat: porCat };
    return vivoIndice;
  }

  // Elige hasta n sugerencias para una categoría: el combo del dueño si lo armó, si no el pareo
  // automático (1 producto por categoría pareja, intercalado). Nunca ofrece agotados ni ocultos.
  // Devuelve { t, s, prods } o null si el dueño apagó la sección / no hay nada que ofrecer.
  function elegirComple(slug, n, excluir) {
    var cfgAll = (vivoData && vivoData.c) || {};
    if (String(cfgAll.on) === '0') return null; // interruptor general apagado (panel → 🧩 Combos)
    var cfg = (cfgAll.cats || {})[slug] || {};
    if (cfg.off) return null;
    var idx = indiceVivo();
    var fuera = {};
    (excluir || []).forEach(function (x) { fuera[x] = 1; });
    function visible(it) { return it && !it.agotado && !it.oculto && !fuera[it.name]; }
    var dia = Math.floor(Date.now() / 86400000); // la rotación diaria: hoy no ves lo mismo que ayer
    var out = [];
    var propios = (cfg.prods || []).map(function (nom) { return idx.porNombre[nom]; }).filter(visible);
    if (propios.length) {
      var ini = dia % propios.length;
      for (var i = 0; i < propios.length && out.length < n; i++) out.push(propios[(ini + i) % propios.length]);
    } else {
      var pares = COMPLE_AUTO[slug] || [];
      for (var v = 0; out.length < n && v < n; v++) {
        for (var j = 0; j < pares.length && out.length < n; j++) {
          var pool = (idx.porCat[pares[j]] || []).filter(function (it) {
            return visible(it) && out.indexOf(it) < 0;
          });
          if (pool.length) out.push(pool[(dia + v) % pool.length]);
        }
      }
    }
    if (!out.length) return null;
    return { t: cfg.t || COMPLE_TIT, s: cfg.s || COMPLE_SUB, prods: out };
  }

  function enCarrito(nombre) {
    var c = leerCarrito();
    for (var i = 0; i < c.length; i++) if (c[i].name === nombre) return true;
    return false;
  }

  // Sección al pie de la página de categoría: mismas tarjetas premium, productos de otras categorías.
  function pintarComple(slug, cont) {
    var sel = elegirComple(slug, COMPLE_N, []);
    if (!sel) return;
    var html = '<section class="seccion premium comple"><div class="interior">' +
      '<h2 class="titulo-seccion">' + esc(sel.t) + '</h2>' +
      '<p class="sub-seccion">' + esc(sel.s) + '</p>' +
      '<div class="grilla-prods">' +
      sel.prods.map(function (p, i) { return cardProdHTML(p, 'c', i); }).join('') +
      '</div></div></section>';
    cont.insertAdjacentHTML('beforeend', html);
    var cards = cont.querySelectorAll('.seccion.comple .prod');
    for (var i = 0; i < cards.length; i++) {
      (function (card, p) {
        function elegir() {
          if (!enCarrito(p.name) && !p.agotado && window.arkTrack) window.arkTrack('comple_elegir');
          alternarProducto(p);
        }
        card.querySelector('.btn-elegir').onclick = elegir;
        card.querySelector('.prod-img').onclick = elegir;
      })(cards[i], sel.prods[i]);
    }
  }

  // "El toque final" dentro del carrito: mira la categoría del ÚLTIMO producto elegido y ofrece
  // hasta 3 que combinan (los del dueño o los automáticos), con ➕ para sumarlos en 1 toque.
  function pintarCompleCarrito() {
    var cont = document.getElementById('car-comple');
    if (!cont) return;
    function ocultar() { cont.innerHTML = ''; cont.style.display = 'none'; }
    if (!leerCarrito().length || !window.ARAKAKI_CATALOG) { ocultar(); return; }
    cargarVivo(function (data) {
      if (data && data.c && String(data.c.car) === '0') { ocultar(); return; } // apagado desde el panel
      var c = leerCarrito(); // releer: pudo cambiar mientras llegaba la respuesta
      if (!c.length) { ocultar(); return; }
      var idx = indiceVivo();
      var enCar = c.map(function (p) { return p.name; });
      var sel = null;
      for (var i = c.length - 1; i >= 0 && !sel; i--) {
        var it = idx.porNombre[c[i].name];
        if (it && it.cat) sel = elegirComple(it.cat, COMPLE_N, enCar);
      }
      if (!sel) { ocultar(); return; }
      cont.style.display = '';
      cont.classList.toggle('brillo', CAR_FX.brillo);
      cont.innerHTML = '<div class="car-comple-tit"></div>' +
        sel.prods.map(function (p) {
          return '<div class="car-comple-item">' +
            '<img loading="lazy" src="' + esc(p.img) + '" alt="">' +
            '<div class="cci-nom">' + esc(p.name) + '</div>' +
            '<div class="cci-precio">' + (p.price ? 'S/ ' + esc(p.price) : 'según tienda') + '</div>' +
            '<button type="button" class="cci-add" data-n="' + esc(p.name) + '">' + esc(CAR_TXT.sumar) + '</button>' +
          '</div>';
        }).join('');
      var titEl = cont.querySelector('.car-comple-tit');
      if (CAR_FX.typing) escribirTitulo(titEl, CAR_TXT.toqueTit);
      else if (titEl) titEl.textContent = CAR_TXT.toqueTit;
      var botones = cont.querySelectorAll('.cci-add');
      for (var b = 0; b < botones.length; b++) {
        botones[b].onclick = function () {
          var p = indiceVivo().porNombre[this.getAttribute('data-n')];
          if (!p || p.agotado || enCarrito(p.name)) return;
          var lista = leerCarrito();
          lista.push({ name: p.name, price: p.price, img: p.img, qty: 1 });
          guardarCarrito(lista);
          if (window.arkTrack) window.arkTrack('comple_carrito');
          pintarCarrito(); // repinta lista + total + nuevas sugerencias
          pintarBadge();
          marcarProds();
        };
      }
    });
  }

  // ---------- Render de página de categoría ----------
  // Tarjeta premium de producto (misma para el catálogo y los productos subidos desde el panel)
  function cardProdHTML(p, si, pi) {
    return '<div class="prod" data-nombre="' + esc(p.name) + '" data-sec="' + si + '" data-idx="' + pi + '">' +
      '<div class="prod-img"><img loading="lazy" src="' + esc(p.img) + '" alt="' + esc(p.name) + '">' +
        '<div class="prod-check" aria-hidden="true">✓</div>' +
        '<div class="prod-elegido"><span class="pe-check">✓</span>Producto elegido<small>toca para quitar</small></div></div>' +
      '<div class="prod-info">' +
        '<div class="prod-nombre">' + esc(p.name) + '</div>' +
        (p.price ? '<div class="prod-precio">S/ ' + esc(p.price) + '</div>' : '<div class="prod-precio" style="font-size:13px;opacity:.7">Precio en tienda / WhatsApp</div>') +
        '<button class="btn-elegir">Elegir producto</button>' +
      '</div></div>';
  }

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
        sec.products.map(function (p, pi) { return cardProdHTML(p, si, pi); }).join('') +
        '</div></div></section>';
    });
    cont.innerHTML = html;

    function conectarCard(card, p) {
      card.querySelector('.btn-elegir').onclick = function () { alternarProducto(p); };
      card.querySelector('.prod-img').onclick = function () { alternarProducto(p); };
    }
    var cards = cont.querySelectorAll('.prod');
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        var sec = cat.sections[Number(card.getAttribute('data-sec'))];
        conectarCard(card, sec.products[Number(card.getAttribute('data-idx'))]);
      })(cards[i]);
    }
    marcarProds();
    pintarFavStars(); // estrellas ⭐ del Club si el cliente ya está logueado
    pintarShareBtns(); // compartir: para todos, con o sin cuenta
    destacarCompartido(cont); // si llegó desde un enlace compartido (?p=), brillo al producto

    // Catálogo "en vivo" (panel 💰 / WhatsApp del dueño) sobre el catálogo base:
    //   x = productos nuevos subidos desde el panel · p = precios · s = stock (agotado/oculto).
    // Si falla o responde el stub del dev-server, se queda el catálogo base.
    cargarVivo(function (data) {
      data = data || {};

      // 1) Productos nuevos del panel: se suman a su sección con la misma tarjeta premium
      var yaEsta = {};
      cat.sections.forEach(function (sec) { sec.products.forEach(function (p) { yaEsta[p.name] = 1; }); });
      (data.x || []).forEach(function (e) {
        if (e.cat !== slug || !e.nombre || yaEsta[e.nombre] || !cat.sections.length) return;
        yaEsta[e.nombre] = 1;
        var si = 0;
        cat.sections.forEach(function (sec, i) { if (e.sec && sec.title === e.sec) si = i; });
        var sec = cat.sections[si];
        var p = { name: e.nombre, price: e.precio || '', img: e.img };
        sec.products.push(p); // el carrito captura este objeto al elegir
        var grilla = cont.querySelectorAll('.grilla-prods')[si];
        if (!grilla) return;
        var caja = document.createElement('div');
        caja.innerHTML = cardProdHTML(p, si, sec.products.length - 1);
        var card = caja.firstChild;
        grilla.appendChild(card);
        conectarCard(card, p);
      });

      // 2) Precios en vivo: los overrides pisan los del catálogo
      if (data.p) cat.sections.forEach(function (sec, si) {
        sec.products.forEach(function (p, pi) {
          var nuevo = data.p[slug + '|' + p.name];
          if (nuevo === undefined || nuevo === p.price) return;
          p.price = nuevo; // el carrito captura este objeto al elegir
          var card = cont.querySelector('.prod[data-sec="' + si + '"][data-idx="' + pi + '"]');
          var el = card && card.querySelector('.prod-precio');
          if (el) { el.textContent = 'S/ ' + nuevo; el.removeAttribute('style'); }
        });
      });

      // 3) Stock en vivo: 'agotado' apaga la tarjeta con su sello (no se puede elegir), 'oculto' la esconde
      if (data.s) cat.sections.forEach(function (sec, si) {
        sec.products.forEach(function (p, pi) {
          var st = data.s[slug + '|' + p.name];
          if (!st) return;
          var card = cont.querySelector('.prod[data-sec="' + si + '"][data-idx="' + pi + '"]');
          if (!card) return;
          if (st === 'oculto') { card.style.display = 'none'; return; }
          if (st === 'agotado') {
            p.agotado = 1; // alternarProducto no lo deja añadir (sí quitar si ya estaba)
            card.classList.add('agotado');
            var sello = document.createElement('div');
            sello.className = 'prod-agotado';
            sello.textContent = 'AGOTADO';
            card.querySelector('.prod-img').appendChild(sello);
          }
        });
      });

      // 4) Video y textos del hero en vivo (panel → 📝 Sitio → 🎬 Videos): config:videos
      //    v = 'no' quita el video · ruta/URL lo cambia · t/s pisan título y subtítulo
      var vv = data.v && data.v[slug];
      var hero = vv && cont.querySelector('.hero');
      if (hero) {
        if (vv.t) { var h1 = hero.querySelector('h1'); if (h1) h1.textContent = vv.t; }
        if (vv.s) { var sub = hero.querySelector('.sub'); if (sub) sub.textContent = vv.s; }
        var vid = hero.querySelector('video');
        if (vv.v === 'no') {
          if (vid) vid.parentNode.removeChild(vid);
        } else if (vv.v && (!vid || vid.getAttribute('src') !== vv.v)) {
          if (!vid) {
            vid = document.createElement('video');
            vid.autoplay = true; vid.loop = true;
            vid.setAttribute('playsinline', ''); vid.setAttribute('muted', '');
            hero.appendChild(vid);
          }
          vid.muted = true; // antes de play(): los navegadores solo dejan autoplay silenciado
          vid.setAttribute('src', vv.v);
          var pr = vid.play && vid.play();
          if (pr && pr.catch) pr.catch(function () {});
        }
      }

      // 5) Combos de venta cruzada: la sección "El complemento perfecto" al pie de la página
      pintarComple(slug, cont);

      marcarProds();
      pintarFavStars(); // estrellas también en las tarjetas recién añadidas
      pintarShareBtns(); // compartir también en las nuevas (productos del panel + combos)
      destacarCompartido(cont); // por si el compartido era un producto subido desde el panel
    });
  };

  // ---------- Arranque ----------
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', armarBase);
  else armarBase();
  pushRegistrarSW(); // SW listo en todas las páginas (recibe los push aunque la web esté cerrada)
})();
