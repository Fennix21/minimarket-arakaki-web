# Minimarket Arakaki — Sitio web + CRM de WhatsApp

Sitio de la bodega (réplica mejorada del original en Systeme.io) con:
- 🛒 Catálogo de 20 categorías y carrito que envía el pedido por WhatsApp
- 💬 CRM de WhatsApp con bot vendedor IA (mismo motor que WHAPE)
- 👥 Base de datos de clientes (Club Arakaki + pedidos web)
- 📊 Analítica propia sin cookies
- ⚡ Preloader, sin popups

## Cómo subirlo a internet (una sola vez)

1. **Vercel** → [vercel.com/new](https://vercel.com/new) → Import del repo de GitHub `minimarket-arakaki-web` → Deploy (sin configurar nada).
   Queda en vivo en `https://minimarket-arakaki-web.vercel.app` (dominio gratis). Después de esto, **cada `git push` a main actualiza el sitio en vivo**.

2. **Base de datos (activa CRM, pedidos y club)** → en Vercel: Storage → Create Database → **Upstash Redis** (gratis) → Connect. Eso crea solas las variables `KV_REST_API_*`. (O crea la base en upstash.com y pega `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`.)

3. **Variables de entorno** (Vercel → Settings → Environment Variables):

   | Variable | Qué es |
   |---|---|
   | `ARAKAKI_ADMIN_PASS` | Contraseña que inventes para entrar a `/panel` |
   | `ARAKAKI_OWNER_PHONE` | Tu WhatsApp personal para avisos (ej. 51960838350) |
   | `WHATSAPP_TOKEN` | Token permanente de Meta (igual que en WHAPE) |
   | `WHATSAPP_PHONE_NUMBER_ID` | ID del número 977 737 199 en Meta |
   | `WHATSAPP_VERIFY_TOKEN` | Palabra que inventes para verificar el webhook |
   | `ANTHROPIC_API_KEY` | Para que el bot responda con IA |

4. **Webhook de WhatsApp (activa el bot)** → [developers.facebook.com](https://developers.facebook.com) → tu app → WhatsApp → Configuration → Webhook:
   - Callback URL: `https://TU-DOMINIO/api/whatsapp`
   - Verify token: el mismo `WHATSAPP_VERIFY_TOKEN`
   - Suscribirse al campo `messages`

   ⚠️ El número 977 737 199 debe estar dado de alta en la app de Meta (WhatsApp Business Platform). Es el mismo proceso que hiciste con WHAPE.

**El sitio funciona desde el paso 1** (los botones de WhatsApp usan wa.me). Los pasos 2–4 encienden el CRM, la base de clientes y el bot.

## Probar en local

```
node tools/dev-server.js   →  http://localhost:3210
```

## Editar productos

1. Edita `data/catalog-fuente.json` (nombres, precios, imágenes)
2. `node tools/build-catalog.js`
3. `git push` → cambio en vivo

## Estructura

Ver [CLAUDE.md](CLAUDE.md) (mapa completo del proyecto).
