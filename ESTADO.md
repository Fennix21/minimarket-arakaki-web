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
- `TRASPASO.md` = checklist del traspaso del ecosistema al dueño.

## Hecho (últimas entregas)
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
Sacar el **primer respaldo real** de la base: poner `UPSTASH_REDIS_REST_URL` y `_TOKEN` (las de
Vercel) en el entorno y correr `node tools/migrar-redis.js respaldo`. Hoy no existe ningún
respaldo de Upstash, y eso corre con o sin traspaso.

## Decisiones tomadas (no re-discutir)
- Todo el ecosistema pasa a nombre del dueño (8 cuentas). Martín entra **invitado por rol** con
  su propio usuario, no con contraseñas compartidas: el dueño puede revocarlo sin cambiar nada.
- Clientes y pedidos de hoy son datos de **prueba**: la mudanza es solo configuración
  (`copiar --solo-config`). La base nueva arranca limpia, sin ventana de madrugada.
- El **dominio se muda al final**, cuando la web ya funcione en el Vercel del dueño. **WhatsApp
  se empieza primero**: transferir el número entre Business Managers toma días.
- Los respaldos van a `respaldos/`, fuera de git: llevan celulares, direcciones y hashes de PIN.

## Trampas de este proyecto
- Las variables de Upstash **no están en local**: no se puede leer Redis desde el PC. Verificar
  por el panel o por los endpoints públicos.
- Tras un deploy, `/assets` tarda ~5-10 min en refrescar: sondear con curl (cada archivo por
  separado) antes de dar por buena una prueba en producción.
- En Windows, `process.exit()` dentro de un flujo async con `fetch` revienta con una aserción de
  libuv y falsea el código de salida: usar `process.exitCode`.
- El remoto suele estar adelante por deploys ya hechos: `git pull` antes de empezar.
