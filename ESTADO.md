# Estado — Minimarket Arakaki WEB

Actualizado: 2026-08-04

## Qué es
Web de la bodega (San Isidro) con carrito → WhatsApp, CRM del dueño, Club de clientes y bots.
Réplica del sitio de Systeme.io para poder optimizarlo. El dueño administra casi todo desde
`/panel` sin tocar código ni esperar un deploy.

## Cómo se compila y se prueba
Sin build. Preview local: `node tools/dev-server.js` → localhost:3210 (los `/api/*` responden stub).
Antes de commit: `node --check` a cada .js tocado (y a los `<script>` inline de los HTML).
Publicar: `git push` a main (Vercel redeploya solo). Producción: minimarket-arakaki-web.vercel.app

## Mapa rápido
El mapa completo (tabla de archivos + claves de Redis + recetas) está en `CLAUDE.md`. En corto:
- `index.html` + 20 páginas de categoría (shells generados por `tools/build-pages.js`).
- `assets/site.js` y `site.css`: header, menú, footer, carrito, chat y Club. **Nada de eso está en los HTML.**
- `api/*.js`: serverless CommonJS; toda la data en Upstash Redis.
- `panel.html` = CRM del dueño · `mi-cuenta.html` = cuenta del cliente.
- `TRASPASO.md` = checklist del traspaso del ecosistema al dueño (operativa) ·
  `TRASPASO-SIMPLE.md` = la misma hoja de ruta en cristiano, para mostrarle al dueño.

## Hecho (últimas entregas)
- 2026-08-04 — **Primer respaldo real de la base**: `respaldos/redis-20260804-0936.ndjson`
  (3.8 MB, 106 claves = las 106 anunciadas, ninguna vacía, los 5 tipos y los vencimientos
  conservados). Confirma que los clientes de hoy son de prueba: 1 solo cliente del Club y
  1 lista de pedidos, contra 25 claves de configuración del panel. Sostiene la decisión de
  mudar solo configuración. ⚠️ El respaldo lleva datos personales y la carpeta del proyecto
  vive dentro de OneDrive: se sincroniza solo a la nube personal del desarrollador.
- 2026-08-04 — Desarrollo más fluido, dos cosas: (1) `api/_redis.js`, el ÚNICO lugar donde se
  habla con la base — el helper `redis()` estaba copiado en 13 archivos de `api/` y ahora todos
  lo piden de ahí, con freno `ARAKAKI_REDIS_RO=1` de solo lectura; (2) `tools/dev-server.js` con
  **modo base real**: con un `.env` en la raíz (plantilla en `.env.ejemplo`, ignorado por git)
  corre los handlers de verdad contra Upstash y los recarga en cada pedido, así que ya no hace
  falta publicar para ver datos reales. Probado con un Upstash de mentira: 14 verificaciones
  (datos reales vs stub, clave del panel, freno de escritura, 404, y que sin `.env` todo sigue igual).
- 2026-08-04 — Cierre de aprendizaje: las buenas prácticas del proyecto subidas al taller
  (`skills/taller/referencias/web-negocio.md` nuevo + añadidos en `proceso.md` y `ui-whape.md`).
  Ya extraído: no hace falta volver a recorrer el repo para "sacar lo aprendido".
- 2026-08-04 — `tools/migrar-redis.js`: respaldo / copiar / restaurar / verificar de Upstash
  conservando tipo y vencimiento. Probado contra dos Upstash de mentira levantados en memoria:
  copia completa (14 claves, 5 tipos, TTL exactos), `--solo-config` (3 de 14, cero datos de
  clientes), restauración filtrada desde un respaldo completo y los tres frenos de seguridad.
- 2026-08-04 — `TRASPASO.md`: checklist por fases de las 8 cuentas + mapa de datos delicados
  (§11: qué clave guarda qué dato personal, las 3 llaves de acceso, dónde están físicamente).
- 2026-07-28 — Mi cuenta: accesos con medallón, cerrar sesión visible, barra inferior fija,
  puntos en la barra, banner 10:7 y layout responsive escritorio+móvil.

## Siguiente paso
**Los avisos de pedidos al dueño están apagados de hecho**: hay 0 dueños suscritos a Web Push
(`push:duenos` vacío) y el aviso por WhatsApp no existe porque el bot no está conectado a la API.
Hoy el dueño solo se entera de un pedido porque el cliente le manda el `wa.me` desde su teléfono;
si el cliente arma el carrito y no llega a enviarlo, el pedido queda en la base sin que nadie lo
vea. Arreglo: que el dueño instale la web en su celular (Agregar a inicio) y active 🔔 los avisos.
Son 2 minutos y enciende algo ya construido.

Después, la **Fase 1 del traspaso** (`TRASPASO.md`): el dueño crea el correo del negocio y sus
cuentas con 2FA, en el orden GitHub → Vercel → Upstash (Meta ya no va primero). Lo técnico de
este lado está listo: hay respaldo, la mudanza es `copiar --solo-config` y el `.env` deja
trabajar en local contra la base real.

Repetir `node tools/migrar-redis.js respaldo` antes de cualquier cambio grande (y una vez al
mes cuando entren clientes de verdad): el respaldo de hoy es una foto de hoy.

## Decisiones tomadas (no re-discutir)
- Todo el ecosistema pasa a nombre del dueño (8 cuentas). Martín entra **invitado por rol** con
  su propio usuario, no con contraseñas compartidas: el dueño puede revocarlo sin cambiar nada.
- Clientes y pedidos de hoy son datos de **prueba**: la mudanza es solo configuración
  (`copiar --solo-config`). La base nueva arranca limpia, sin ventana de madrugada.
- El **dominio se muda al final**, cuando la web ya funcione en el Vercel del dueño.
- **Meta/WhatsApp NO va primero** (corregido el 2026-08-04, antes decía lo contrario): el bot
  nunca se conectó a la API — 0 conversaciones en la base — y el 51977737199 es la app WhatsApp
  Business de la tienda, que ya es del dueño. El carrito solo abre un `wa.me` y el mensaje lo
  manda el cliente desde su propio teléfono. No hay nada que transferir: esa fase sale de la ruta
  crítica (ver Fase 5 de `TRASPASO.md`, con la advertencia de que un número no puede estar a la
  vez en la app y en la API).
- Los respaldos van a `respaldos/`, fuera de git: llevan celulares, direcciones y hashes de PIN.
- **No se migra a Supabase** (ni a otra "nube única"), decidido el 2026-08-04. De las 8 cuentas
  solo reemplazaría Upstash: GitHub, el hosting del sitio, WhatsApp, Anthropic y Resend seguirían
  igual. A cambio habría que rediseñar el modelo de datos entero (todo son claves Redis con ZSET,
  LIST y vencimientos, que Postgres no tiene) y reescribir los ~15 `api/*.js` (las Edge Functions
  son Deno, no Node): semanas de trabajo para que la web haga exactamente lo mismo, y en plena
  mudanza al dueño. Se revisaría solo si algún día hicieran falta reportes SQL o varias sucursales.

## Trampas de este proyecto
- Para ver datos reales en local hace falta un `.env` con las llaves de Upstash (copiar
  `.env.ejemplo`). Sin él, el dev-server responde datos de muestra, no la base. Dejar siempre
  `ARAKAKI_REDIS_RO=1` si apunta a producción, y **jamás** poner `WHATSAPP_TOKEN` en el `.env`
  local: cada prueba le mandaría un WhatsApp real al dueño.
- Tras un deploy, `/assets` tarda ~5-10 min en refrescar: sondear con curl (cada archivo por
  separado) antes de dar por buena una prueba en producción.
- En Windows, `process.exit()` dentro de un flujo async con `fetch` revienta con una aserción de
  libuv y falsea el código de salida: usar `process.exitCode`.
- El remoto suele estar adelante por deploys ya hechos: `git pull` antes de empezar.
