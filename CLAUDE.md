# Minimarket Arakaki WEB — Mapa del proyecto (leer antes de explorar)

Réplica del sitio de Systeme.io (www.minimarketarakaki.com) para poder optimizarlo con IA.
Sitio de la bodega + carrito → WhatsApp + CRM de WhatsApp + base de clientes. Arquitectura calcada de WHAPE.

## Stack (no explorar: es esto)
- **Vercel serverless** + Node **CommonJS**. `package.json` mínimo (ÚNICA dependencia: `web-push` para las notificaciones). SIN build de frontend. `fetch` global.
- BD = **Upstash Redis** vía REST (helper `redis(cmd)` duplicado en cada api/*.js).
- Frontend = HTML sueltos. Las 20 páginas de categoría son shells que renderizan desde `data/catalog.js` con `assets/site.js`.
- `vercel.json`: cleanUrls, maxDuration 30 para whatsapp.js y chat.js, headers de caché (7d para /img, 5min+SWR para /assets y /data).
- **Deploy = `git push` a main** (repo GitHub conectado a Vercel).
- WhatsApp del negocio: **51977737199**. Imágenes y videos YA MIGRADOS al repo (jul 2026): fotos de producto en `img/productos/<slug>/` (WebP ≤640px q80), videos en `img/videos/` (540p H.264 sin audio), beneficios/logo/redes en `img/`. Cero dependencia del CloudFront de Systeme (las URLs cloudfront que quedan en catalog-fuente.json son elementos que el build descarta).

## Archivos
| Archivo | Qué es |
|---|---|
| `index.html` | Home: preloader, portada (fachada `img/fachada-principal.webp` + video en círculo + botón que abre el POPUP del mapa), cinta marquee, tarjetas de categorías con imágenes rotando, beneficios, form Club Arakaki (→ /api/pedido registro). POPUP Fiestas Patrias: 1 vez/día (localStorage `arakaki_fp_dia`), SOLO en julio, video Machu Picchu + countdown al 28 jul |
| `<categoria>.html` ×20 | Shells generados por `tools/build-pages.js`. Llaman `renderCategoria('<slug>')` |
| `assets/site.css` | Estilos de todo el sitio público (marca: rojo #7c0f14, negro #262626, Montserrat/Poppins) |
| `assets/site.js` | Preloader, header/menú/footer inyectados (el **lema del header** y **todo el footer** salen de `SITIO_DEF` + fetch a `/api/sitio`; editables desde panel → 📝 Sitio), carrito (localStorage `arakaki_carrito`) → mensaje wa.me + POST /api/pedido, `renderCategoria()`, chat vendedor flotante (`#chat-fab`/`#chat-caja` → /api/chat; solo aparece si GET /api/chat da `{on:true}`; estilo mensajería: "escribiendo…" + párrafos `\n\n` revelados uno a uno + botones de respuesta rápida `sugerencias` + pantalla completa en móvil; historial en sessionStorage `arakaki_chat`) |
| `data/catalog.js` | Catálogo (341 productos, 20 categorías). GENERADO: no editar a mano |
| `data/catalog-fuente.json` | Datos extraídos del sitio original (fuente de verdad para regenerar) |
| `tools/build-catalog.js` | catalog-fuente.json → data/catalog.js |
| `tools/build-pages.js` | Genera las 20 páginas de categoría |
| `tools/dev-server.js` | Preview local con cleanUrls (`node tools/dev-server.js [puerto]`, def. 3210); /api/* responde stub |
| `panel.html` | CRM del dueño (pass = ARAKAKI_ADMIN_PASS): 🏠 Inicio (dashboard: tarjetas-resumen + últimos pedidos/chats + guía), 💬 Chats, 🛒 Pedidos, ❓ Consultas (preguntas que el chat web no pudo responder; ✓ = revisada y se borra; badge con el total), 💰 Precios (overrides en vivo), 👥 Club, 📊 Analíticas, 📝 Sitio (lema del header + todos los textos del footer: títulos, dirección/referencia, horario, teléfonos, redes y copyright → config:sitio), ⚙️ Bot (3 sub-pestañas: 🤖 WhatsApp = cerebro del bot + respuestas rápidas · 💬 Chat web = interruptor on/off + saludo/botones/burbuja/subtítulo del widget + cerebro PROPIO independiente de WhatsApp · 🔔 Avisos = números autorizados + notify). Menú lateral en escritorio / barra inferior en móvil. Carga /data/catalog.js para la tabla de precios |
| `track.js` | Mini analítica (pageview + clicks) → /api/track |
| `sw.js` + `manifest.webmanifest` | Web Push + PWA: el SW muestra los push y abre la página al tocarlos; manifest con íconos `img/icon-192/512.png` y `img/apple-touch-icon.png` (gato oficial sobre #262626). En iPhone el push SOLO funciona con la web instalada (Agregar a inicio): site.js muestra la guía. El botón "🔔 Avísame de las ofertas" vive en el footer (site.js, delegación de click) |
| `api/push.js` | Web Push: GET ?key (clave pública VAPID, caché 5min) · POST subscribe/unsubscribe (rol `clientes` público, `duenos` con pass) · send/test/count/savepromo/delpromo (admin, pass). `send` acepta `image` (banner; Chrome/Edge/Android, iPhone/Firefox la ignoran), registra la campaña en `pushlog` con id `c<ts36>` para contar clics · `test` con campos = ensayo de la promo real solo a los dueños · `count` devuelve TODO el panel (contadores + promos guardadas + historial con clics). Compositor del panel (⚙️ Bot → 🔔 Avisos): promos guardadas reutilizables (no se borran al enviar), buscador de fotos del catálogo, vista previa, contadores de caracteres, aviso anti-saturación (<24h) y caja de estrategias. Tope 5000 suscriptores por rol |
| `api/_push.js` | Motor compartido (lib `web-push` + VAPID): `pushTo(rol,payload)` con poda de suscripciones muertas (404/410) y `pushDuenos(titulo,cuerpo)` — enganchado DENTRO de `notifyOwner` de pedido.js/chat.js/whatsapp.js (push gratis además del WhatsApp, que cobrará por mensaje desde oct-2026; respeta config:notify) |
| `api/whatsapp.js` | Webhook Meta (GET verify, POST). Si escribe un NÚMERO AUTORIZADO (config:ownerphone, lista separada por comas) → asistente ADMIN de precios (Claude + tools buscar/cambiar/quitar precio sobre config:precios; sin API key hay comando fijo `precio <prod> [monto]`). Resto: idempotencia msg.id → guarda lead → autoStatus → notifica dueño → si paused NO responde → bot Claude (getPrompt de Redis) |
| `api/precios.js` | GET público: overrides de precios (config:precios) con caché CDN 60s. Lo consume site.js al renderizar categorías |
| `api/sitio.js` | GET público: textos editables del header (lema) y del footer (config:sitio) con caché CDN 60s. site.js los aplica sobre sus defaults (funciona sin backend) |
| `api/chat.js` | Chat vendedor de la web (widget de site.js). GET → `{on,saludo?,botones?,invitacion?,subtitulo?}` (textos editables de config:webchatui; si faltan, site.js usa sus defaults); POST {sid,mensajes} → `{reply,sugerencias}` (el bot termina con línea `>>> a | b | c` que extraerSugerencias convierte en botones de respuesta rápida) vía Claude con cerebro INDEPENDIENTE: `config:webprompt` si existe (panel → 💬 Chat de la web), si no el de WhatsApp (config:prompt) + OBJETIVO_VENTA; siempre + REGLAS_WEB y tools `buscar_productos` (por texto Y/O categoría entera, tolera plurales; precio en vivo, null o "0" = sin precio publicado → se cotiza por WhatsApp, NUNCA inventar), `registrar_pedido` (LPUSH pedidos con pagina:'chat-web' + aviso a los dueños; devuelve productos_registrados para que el bot verifique; un re-registro de la MISMA sesión REEMPLAZA su pedido 'nuevo' anterior — corrección, no duplica — con aviso 🔁) y `registrar_consulta` (pregunta que el bot NO pudo responder → LPUSH `consultas` + aviso a dueños, máx 3 avisos/sesión) → CIERRA la venta en la página. Rate limit por sesión (40/h) e IP (120/h) en `chatrl:*`. El historial vive en el navegador, NO en Redis |
| `api/_catalogo.js` | GENERADO por build-catalog: índice liviano [{c,n,p}] de productos para whatsapp.js/crm.js. No editar a mano |
| `api/crm.js` | Backend del panel: list/get/send/status/rename/note/tags/pause/clearchat/delete/pedidos/pedidoestado/consultas/consultadel/clientes/clientedel/stats/getprompt/setprompt/resetprompt/setnotify (owner+notify, ya NO webchat)/getwebchat/setwebchat (on/off + textos + cerebro del chat web)/gettemplates/settemplates/getprecios/setprecio/getsitio/setsitio (lema + textos del footer) |
| `api/pedido.js` | SIN pass (solo escribe): action 'pedido' (carrito web → LPUSH pedidos) y 'registro' (Club → cliente:<tel>). Notifica al dueño por WhatsApp |
| `api/track.js` | Suma contadores stat:* en Redis |
| `api/_prompt.js` | DEFAULT_PROMPT del bot vendedor. ⚠️ El prompt VIVO está en Redis `config:prompt` (panel → ⚙️ Bot) |

## Claves Redis
`lead:<phone>` {phone,name,status,paused,note,tags[],messages[≤300],lastMsgId} · `leads` ZSET · `pedidos` LIST (≤500, {id,nombre,direccion,items,total,pagina,ts,estado}) · `cliente:<tel>` {nombre,telefono,interes,club,creado} · `clientes` ZSET · `config:{prompt,templates,notify}` · `config:ownerphone` hasta 6 números separados por coma (TODOS reciben avisos y usan el asistente de precios; editable en panel → ⚙️ Bot) · `config:precios` JSON {"<slug>|<nombre exacto>": "85"} (overrides que PISAN los precios de catalog.js; los lee /api/precios) · `config:webchat` '1'/'0' interruptor del chat vendedor de la web (panel → ⚙️ Bot, junto a los avisos) · `config:webprompt` cerebro PROPIO del chat web (vacío = usa config:prompt con enfoque vendedor) · `config:webchatui` JSON {saludo,botones[],invitacion,subtitulo} textos del widget (campo ausente = default de site.js) · `config:sitio` JSON {lema,visitanosTit,direccion,referencia,mapLabel,horarioTit,horario,contactoTit,telefonos,redesTit,facebook,instagram,youtube,copy} textos editables del header/footer (campo ausente = default de `SITIO_DEF` en site.js; lo sirve /api/sitio) · `chatrl:*` rate limit del chat web (TTL 2h) · `consultas` LIST (≤200, {id,pregunta,producto,sid,ts}: preguntas que el chat web no pudo responder) · `stat:*` (analítica; el chat suma stat:chatweb_msg, stat:chatweb_pedido y stat:chatweb_consulta; los broadcast suman stat:push_enviados) · `push:clientes` / `push:duenos` HASH {endpoint → subscriptionJSON} suscripciones Web Push (panel → ⚙️ Bot → 🔔 Avisos) · `config:pushpromos` JSON array (≤20 promociones guardadas {id,nombre,title,body,url,image,ts}) · `pushlog` LIST (≤50 campañas enviadas {id,ts,title,enviados,img}; clics en `stat:evp:push_click:/<id>`, los suma sw.js vía /api/track)

Estados de lead: nuevo → interesado → pedido → entregado (o descartado). autoStatus solo avanza.

## Env vars (Vercel)
WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_VERIFY_TOKEN · ANTHROPIC_API_KEY · UPSTASH_REDIS_REST_URL/TOKEN (o KV_REST_API_*) · ARAKAKI_ADMIN_PASS · ARAKAKI_OWNER_PHONE · ARAKAKI_BOT_MODEL (def. claude-haiku-4-5-20251001) · ARAKAKI_BOT_PROMPT (opcional) · VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (Web Push; sin ellas el sitio funciona y el botón de ofertas dice "muy pronto")

## Ahorro de tokens (leer SIEMPRE)
- **NO leer completos** `data/catalog.js` ni `data/catalog-fuente.json` (miles de líneas de datos): usar Grep por nombre de producto, o Read con offset/limit.
- Las 20 páginas `<categoria>.html` son **idénticas** salvo el slug: leer UNA (ej. vinos.html) basta para conocerlas todas.
- Este CLAUDE.md ya describe toda la arquitectura: no explorar con Glob/Grep para "entender el proyecto"; ir directo al archivo que indica la tabla.
- panel.html es grande (~900 líneas): leer solo la sección relevante (login / tabs / inicio / chats / precios / pedidos / club / stats / bot están en bloques marcados con comentarios `---------`).
- No usar Agent/subagentes aquí: el proyecto es chico, Grep+Read directo siempre alcanza.

## Recetas rápidas (hacer esto, sin explorar)
- **Cambiar precio** → el dueño lo hace SOLO desde panel → 💰 Precios o por WhatsApp (override en Redis, sin deploy). En código: editar `data/catalog-fuente.json` → `node tools/build-catalog.js` → commit; OJO: un override en `config:precios` pisa lo que diga el catálogo (consolidar con `node tools/aplicar-precios.js [--borrar]`, necesita las env de Upstash).
- **Cambiar producto (nombre/foto)** → Grep del nombre en `data/catalog-fuente.json` → editar → `node tools/build-catalog.js` → commit.
- **Producto nuevo** → convertir su foto a WebP ≤640px (q80) y guardarla en `img/productos/<slug>/` → añadirlo al array de su página en catalog-fuente.json con `img` = ruta local (`products` si la categoría tiene precios; el stream img+txt si no) → regenerar. NO hotlinkear imágenes externas.
- **Categoría nueva** → slug en `tools/build-pages.js` (PAGES) + `tools/build-catalog.js` (META) + `assets/site.js` (MENU) → correr ambos tools.
- **Cambiar textos/estilo del sitio** → `assets/site.css` y `assets/site.js` (header/menú/footer/carrito se inyectan desde ahí, NO están en los HTML).
- **Editar el lema del header o los textos del footer** (sin deploy) → el dueño lo hace SOLO desde panel → 📝 Sitio (override en Redis `config:sitio`, lo sirve /api/sitio). En código, los defaults viven en la constante `SITIO_DEF` de `assets/site.js`.
- **Textos del bot de WhatsApp** → panel → ⚙️ Bot (Redis `config:prompt`); `api/_prompt.js` es solo el respaldo.
- **Ajustar el chat web** → textos (bienvenida animada, botones, burbuja, subtítulo) y cerebro propio: panel → ⚙️ Bot → 💬 Chat de la web (cerebro vacío = usa el de WhatsApp) · lógica/tools/límites: `api/chat.js` (reglas técnicas en REGLAS_WEB, objetivo vendedor en OBJETIVO_VENTA) · mascota/estilos (paleta pastel oro/crema): bloques "Chat vendedor" de `assets/site.js` y `site.css` · prender/apagar: panel → ⚙️ Bot. Producción = minimarket-arakaki-web.vercel.app (el dominio .com aún apunta a Systeme.io).
- **Probar** → `node tools/dev-server.js` → localhost:3210 (los /api/* responden stub).
- **Publicar** → `git push` a main (Vercel redeploya solo).

## Reglas de trabajo
- **Verificar antes de commit**: `node --check` a cada .js tocado; para HTML extraer `<script>` inline y `node --check`.
- El sitio DEBE funcionar sin env vars (wa.me links puros); el CRM/bot se activa al configurarlas.
- Productos: editar `data/catalog-fuente.json` y correr `node tools/build-catalog.js` (nunca editar catalog.js a mano).
- Página nueva de categoría: añadirla a tools/build-pages.js + META de build-catalog.js + MENU de assets/site.js.
- Estilo: ES5-ish en frontend (var, funciones con nombre), español en comentarios y UI, emojis en labels.
- Popups permitidos SOLO los del dueño: mapa (botón portada) y Fiestas Patrias (1/día, julio). No añadir otros. El preloader es requisito del dueño: bloque premium **autocontenido** (id `ap-preloader`, gato de la suerte + anillos/partículas dorados, tema dark-gold) que trae su propio `<style>` y `<script>` y se auto-oculta en window.load con respaldo 5s. Vive en `index.html` y en la constante `PRELOADER` de `tools/build-pages.js` (regenera las páginas de categoría). NO usa site.css/site.js.
- Color de barra superior y acentos de marca: `--naranja: #e64831` (pedido explícito del dueño). El rojo vino `--rojo` queda para fondos de secciones.
- **Tarjetas de categoría = tema premium dark-gold** (`renderCategoria` → `.seccion.premium` + `.prod`): tarjeta negra con borde/acentos dorados `--dorado #d4a941`, nombre/precio/botón en serif Georgia, botón "Elegir producto" con degradado dorado. Estado elegido = sello dorado ✓ (`.prod-check`) + botón vino oscuro "Quitar del pedido". NO confundir con los carruseles del home (`.cat-carrusel` / `.seccion.vino`), que son otra cosa y no se tocan.
- **Imagen de producto SIEMPRE a su ratio original con `height:auto` (nunca recortar ni deformar).** El tamaño de la card se ajusta angostándola, no recortando: escritorio vía `.seccion.premium .interior` max-width (~920px, 3/fila) y móvil capando `.grilla-prods` a 300px centrada (1/fila). Así la card completa (imagen + nombre + precio + botón) entra de un vistazo sin scroll.
- **Verde = solo WhatsApp.** El botón flotante "Ver mi pedido" (`#carrito-btn`) es premium negro-oro; `--verde-wa` queda reservado para acciones reales de WhatsApp (botón de envío en el modal del carrito y FAB de chat).
