# Minimarket Arakaki WEB — Mapa del proyecto (leer antes de explorar)

Réplica del sitio de Systeme.io (www.minimarketarakaki.com) para poder optimizarlo con IA.
Sitio de la bodega + carrito → WhatsApp + CRM de WhatsApp + base de clientes. Arquitectura calcada de WHAPE.

## Stack (no explorar: es esto)
- **Vercel serverless** + Node **CommonJS**. SIN package.json, SIN build, SIN dependencias. `fetch` global.
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
| `assets/site.js` | Preloader, header/menú/footer inyectados, carrito (localStorage `arakaki_carrito`) → mensaje wa.me + POST /api/pedido, `renderCategoria()`, chat vendedor flotante (`#chat-fab`/`#chat-caja` → /api/chat; solo aparece si GET /api/chat da `{on:true}`; historial en sessionStorage `arakaki_chat`) |
| `data/catalog.js` | Catálogo (341 productos, 20 categorías). GENERADO: no editar a mano |
| `data/catalog-fuente.json` | Datos extraídos del sitio original (fuente de verdad para regenerar) |
| `tools/build-catalog.js` | catalog-fuente.json → data/catalog.js |
| `tools/build-pages.js` | Genera las 20 páginas de categoría |
| `tools/dev-server.js` | Preview local con cleanUrls (`node tools/dev-server.js [puerto]`, def. 3210); /api/* responde stub |
| `panel.html` | CRM del dueño (pass = ARAKAKI_ADMIN_PASS): 🏠 Inicio (dashboard: tarjetas-resumen + últimos pedidos/chats + guía), 💬 Chats, 🛒 Pedidos, 💰 Precios (overrides en vivo), 👥 Club, 📊 Analíticas, ⚙️ Bot (prompt editable + avisos + interruptor del chat web + respuestas rápidas). Menú lateral en escritorio / barra inferior en móvil. Carga /data/catalog.js para la tabla de precios |
| `track.js` | Mini analítica (pageview + clicks) → /api/track |
| `api/whatsapp.js` | Webhook Meta (GET verify, POST). Si escribe un NÚMERO AUTORIZADO (config:ownerphone, lista separada por comas) → asistente ADMIN de precios (Claude + tools buscar/cambiar/quitar precio sobre config:precios; sin API key hay comando fijo `precio <prod> [monto]`). Resto: idempotencia msg.id → guarda lead → autoStatus → notifica dueño → si paused NO responde → bot Claude (getPrompt de Redis) |
| `api/precios.js` | GET público: overrides de precios (config:precios) con caché CDN 60s. Lo consume site.js al renderizar categorías |
| `api/chat.js` | Chat vendedor de la web (widget de site.js). GET → `{on}` (hay ANTHROPIC_API_KEY y config:webchat≠'0'); POST {sid,mensajes} → Claude con el MISMO cerebro del bot (config:prompt + sufijo web) y tools `buscar_productos` (catálogo + precios en vivo) y `registrar_pedido` (LPUSH pedidos con pagina:'chat-web' + aviso a los dueños) → CIERRA la venta en la página. Rate limit por sesión (40/h) e IP (120/h) en `chatrl:*`. El historial vive en el navegador, NO en Redis |
| `api/_catalogo.js` | GENERADO por build-catalog: índice liviano [{c,n,p}] de productos para whatsapp.js/crm.js. No editar a mano |
| `api/crm.js` | Backend del panel: list/get/send/status/rename/note/tags/pause/clearchat/delete/pedidos/pedidoestado/clientes/clientedel/stats/getprompt/setprompt/resetprompt/setnotify/gettemplates/settemplates/getprecios/setprecio |
| `api/pedido.js` | SIN pass (solo escribe): action 'pedido' (carrito web → LPUSH pedidos) y 'registro' (Club → cliente:<tel>). Notifica al dueño por WhatsApp |
| `api/track.js` | Suma contadores stat:* en Redis |
| `api/_prompt.js` | DEFAULT_PROMPT del bot vendedor. ⚠️ El prompt VIVO está en Redis `config:prompt` (panel → ⚙️ Bot) |

## Claves Redis
`lead:<phone>` {phone,name,status,paused,note,tags[],messages[≤300],lastMsgId} · `leads` ZSET · `pedidos` LIST (≤500, {id,nombre,direccion,items,total,pagina,ts,estado}) · `cliente:<tel>` {nombre,telefono,interes,club,creado} · `clientes` ZSET · `config:{prompt,templates,notify}` · `config:ownerphone` hasta 6 números separados por coma (TODOS reciben avisos y usan el asistente de precios; editable en panel → ⚙️ Bot) · `config:precios` JSON {"<slug>|<nombre exacto>": "85"} (overrides que PISAN los precios de catalog.js; los lee /api/precios) · `config:webchat` '1'/'0' interruptor del chat vendedor de la web (panel → ⚙️ Bot, junto a los avisos) · `chatrl:*` rate limit del chat web (TTL 2h) · `stat:*` (analítica; el chat suma stat:chatweb_msg y stat:chatweb_pedido)

Estados de lead: nuevo → interesado → pedido → entregado (o descartado). autoStatus solo avanza.

## Env vars (Vercel)
WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_VERIFY_TOKEN · ANTHROPIC_API_KEY · UPSTASH_REDIS_REST_URL/TOKEN (o KV_REST_API_*) · ARAKAKI_ADMIN_PASS · ARAKAKI_OWNER_PHONE · ARAKAKI_BOT_MODEL (def. claude-haiku-4-5-20251001) · ARAKAKI_BOT_PROMPT (opcional)

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
- **Textos del bot de WhatsApp** → panel → ⚙️ Bot (Redis `config:prompt`); `api/_prompt.js` es solo el respaldo.
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
