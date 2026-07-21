// Service Worker del Minimarket Arakaki — recibe las notificaciones push (Web Push)
// y abre la página al tocarlas. Lo registran assets/site.js (web) y panel.html (CRM).
// El payload lo arma api/_push.js: { title, body, url, icon, tag, image }.
// image = banner grande (Chrome/Edge/Android; iPhone y Firefox la ignoran sin romper).

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch (err) { data = { body: e.data ? e.data.text() : '' }; }
  var title = data.title || 'Minimarket Arakaki';
  var opts = {
    body: data.body || '',
    // Logo oficial (gato sobre cuadro rojo lleno): ninguna notificación sale sin identidad visual
    icon: data.icon || '/img/logo-push-192.png',
    badge: '/img/logo-oficial-192.png',
    tag: data.tag || 'arakaki',
    renotify: true,
    data: { url: data.url || '/', cid: data.cid || '' },
  };
  if (data.image) opts.image = data.image;
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var d = e.notification.data || {};
  var url = d.url || '/';
  var abrir = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (tabs) {
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      // Si ya hay una pestaña del sitio abierta, la enfocamos y navegamos ahí
      if ('focus' in t) { t.focus(); if (t.navigate && url !== '/') return t.navigate(url); return; }
    }
    return self.clients.openWindow(url);
  });
  var tareas = [abrir];
  // Conteo de clics por campaña (stat:evp:push_click:/<cid>, lo lee el panel)
  if (d.cid) tareas.push(fetch('/api/track', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ev: 'push_click', p: '/' + d.cid }),
  }).catch(function () {}));
  e.waitUntil(Promise.all(tareas));
});
