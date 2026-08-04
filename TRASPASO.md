# Traspaso del ecosistema web a nombre del dueño

Objetivo: que **todo** (dominio, código, hosting, base de datos, WhatsApp, IA, correos)
quede a nombre del dueño del Minimarket Arakaki, y que el desarrollador siga trabajando
con **su propio usuario invitado**, no con las contraseñas del dueño.

> **Regla de oro:** donde la plataforma permita *invitar a un colaborador*, se invita.
> Compartir contraseña solo donde no exista invitación, y guardada en un gestor
> (Bitwarden gratis o 1Password), nunca por WhatsApp ni por correo.
> Ventaja para el dueño: puede revocar el acceso cuando quiera, sin cambiar nada.

---

## 0. Antes de empezar

- [ ] **Un correo del negocio** (ej. `minimarketarakaki@gmail.com`), NO el personal de nadie.
      Va a ser el titular de las 8 cuentas. Con su propia recuperación por celular del negocio.
- [ ] **Un celular** que quede como segundo factor (2FA) en manos del dueño.
- [ ] **Gestor de contraseñas** instalado (Bitwarden, gratis) para guardar todo en un solo lugar.
- [ ] **Respaldo de la base de datos ANTES de mover nada** (ver Fase 4).

---

## 1. Inventario: las 8 cuentas

| # | Cuenta | Qué guarda | Hoy | Cómo entra el desarrollador |
|---|---|---|---|---|
| 1 | **Dominio** minimarketarakaki.com | la dirección pública | del dueño (confirmar registrador) | no necesita |
| 2 | **GitHub** | todo el código, fotos y catálogo | del desarrollador | colaborador (gratis) |
| 3 | **Vercel** | hosting + variables de entorno | del desarrollador (Hobby) | miembro del equipo (requiere Pro) |
| 4 | **Upstash Redis** | clientes del Club, PINs, pedidos, chats, config del panel, avisos push | del desarrollador | miembro del equipo |
| 5 | **Meta Business / WhatsApp** | número 51977737199 y token del bot | por confirmar | admin invitado (gratis) |
| 6 | **Anthropic** | llave de la IA (bot y chat web) + facturación por uso | del desarrollador | miembro de la organización (gratis) |
| 7 | **Resend** | correos del Club | sin configurar | miembro |
| 8 | **Llaves VAPID** (avisos push) | viven como variables en Vercel | del desarrollador | se copian tal cual |

Verificar aparte que sean del dueño: Facebook `/minimarketarakaki1`, Instagram, Google Business,
la cuenta de Systeme.io (el sitio viejo) y el número físico de WhatsApp.

---

## 2. Fase 1 — El dueño crea sus cuentas

Todas con el correo del negocio y con 2FA activado. El dueño escribe sus propias contraseñas;
el desarrollador solo acompaña.

- [ ] GitHub — github.com (recomendado: crear además una organización gratuita `MinimarketArakaki`)
- [ ] Vercel — vercel.com (entrando con la cuenta de GitHub del negocio)
- [ ] Upstash — upstash.com
- [ ] Anthropic — console.anthropic.com (con tarjeta y **límite de gasto mensual**)
- [ ] Resend — resend.com
- [ ] Meta Business Suite — business.facebook.com (verificación de empresa con RUC)
- [ ] En cada una: invitar al desarrollador con su propio correo

---

## 3. Fase 2 — El código (GitHub)

- [ ] Transferir el repositorio `minimarket-arakaki-web` a la cuenta/organización del dueño
      (Settings → Danger Zone → Transfer ownership). Se conserva todo el historial.
- [ ] El dueño agrega al desarrollador como colaborador con permiso de escritura.
- [ ] Confirmar que el repo quedó **privado**.

---

## 4. Fase 3 — Hosting (Vercel)

- [ ] Crear el proyecto en el Vercel del dueño, importando el repo ya transferido.
- [ ] Copiar las variables de entorno. Ojo con cuáles se copian iguales y cuáles se rehacen:

| Variable | Qué es | ¿Se copia igual? |
|---|---|---|
| `VAPID_PUBLIC_KEY` | avisos push | **SÍ, textual** — si cambia se pierden todos los suscriptores |
| `VAPID_PRIVATE_KEY` | avisos push | **SÍ, textual** — igual que la anterior |
| `VAPID_SUBJECT` | correo de contacto del push | cambiar al correo del negocio |
| `UPSTASH_REDIS_REST_URL` | base de datos | nueva (Fase 4) |
| `UPSTASH_REDIS_REST_TOKEN` | base de datos | nueva (Fase 4) |
| `ANTHROPIC_API_KEY` | IA del bot y del chat | nueva, del dueño; revocar la vieja |
| `WHATSAPP_TOKEN` | bot de WhatsApp | nueva (Fase 5) |
| `WHATSAPP_PHONE_NUMBER_ID` | bot de WhatsApp | verificar tras la transferencia; suele cambiar |
| `WHATSAPP_VERIFY_TOKEN` | webhook de Meta | conviene cambiarla |
| `ARAKAKI_ADMIN_PASS` | contraseña del panel | **la elige el dueño**, nueva |
| `ARAKAKI_OWNER_PHONE` | quién recibe los avisos | igual |
| `ARAKAKI_BOT_MODEL` | modelo de IA | igual |
| `ARAKAKI_BOT_PROMPT` | respaldo del cerebro del bot | normalmente vacía (el vivo está en la base) |
| `RESEND_API_KEY` | correos | nueva (Fase 7) |
| `RESEND_FROM` | remitente | `Minimarket Arakaki <avisos@minimarketarakaki.com>` |

- [ ] Primer despliegue apuntando **todavía a la base vieja**, y probar todo en la URL
      `*.vercel.app` del dueño. Si algo falla, se arregla aquí, sin tocar la web en vivo.
- [ ] Decidir plan: en **Hobby** entra un solo usuario. Con **Pro ($20/mes)** el dueño es
      titular y el desarrollador entra con su cuenta; además Hobby es formalmente para uso
      no comercial y esto es una tienda.

---

## 5. Fase 4 — La base de datos (Upstash) ← la parte delicada

Es lo único que **no** está en el código: clientes del Club con sus PINs y sesiones, pedidos,
conversaciones de WhatsApp, toda la configuración del panel, las fotos de productos subidos,
los videos y las suscripciones de avisos.

Herramienta: `tools/migrar-redis.js` (conserva tipo y **vencimiento** de cada dato; sin eso
los clientes quedarían deslogueados y la web dejaría de reconocer sus celulares).

- [ ] **Respaldo primero** (esto hay que hacerlo aunque no hubiera mudanza):

```bash
node tools/migrar-redis.js respaldo
```

- [ ] Guardar ese archivo fuera de la computadora. **Contiene datos de clientes**: no se sube a
      GitHub (la carpeta `respaldos/` está excluida) ni se manda por chat.
- [ ] Crear la base nueva en el Upstash del dueño (misma región: `us-east-1`).
- [ ] Elegir una hora con la tienda cerrada (6 a.m.) para que no entren pedidos a mitad de copia.
- [ ] Copiar, con las variables del origen y del destino en el entorno:

```bash
node tools/migrar-redis.js copiar
```

- [ ] Cotejar antes de cambiar nada:

```bash
node tools/migrar-redis.js verificar
```

- [ ] Recién cuando diga "Todo cuadra": cambiar `UPSTASH_REDIS_REST_URL` y `_TOKEN` en el
      Vercel del dueño y volver a desplegar.
- [ ] Probar: entrar al panel, abrir un pedido viejo, y que un cliente del Club entre con su PIN
      **sin** tener que volver a iniciar sesión.

---

## 6. Fase 5 — WhatsApp (lo que más demora: empezar temprano)

- [ ] El dueño crea su Business Manager y lo verifica con los datos de la empresa (RUC).
- [ ] Solicitud de transferencia del número 51977737199 desde el Business Manager actual al del
      dueño (ambas partes tienen que aceptar).
- [ ] App nueva en Meta for Developers + token permanente de usuario del sistema.
- [ ] Actualizar `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_VERIFY_TOKEN` en Vercel.
- [ ] Actualizar la URL del webhook a `https://www.minimarketarakaki.com/api/whatsapp`.
- [ ] Poner la tarjeta del dueño: **desde el 1-oct-2026 Meta cobra por mensaje**.
- [ ] Probar: escribirle al número y que el bot conteste.

---

## 7. Fase 6 — El dominio (al final, no antes)

- [ ] Confirmar en qué registrador está minimarketarakaki.com y que el dueño tenga el usuario.
      Si se compró dentro de Systeme.io, hay que sacarlo antes de dar de baja ese servicio.
- [ ] Agregar el dominio en el proyecto de Vercel del dueño y apuntar el DNS.
- [ ] **No borrar los registros MX** si hay correo en ese dominio.
- [ ] Esperar el certificado SSL y probar `https://www.minimarketarakaki.com`.
- [ ] Recién ahí: dar de baja Systeme.io (deja de pagarse).

---

## 8. Fase 7 — Correos (Resend)

- [ ] Cuenta del dueño + verificar el dominio (registros SPF/DKIM en el DNS).
- [ ] `RESEND_FROM = Minimarket Arakaki <avisos@minimarketarakaki.com>`.
- [ ] Probar: recuperar la clave del Club desde /mi-cuenta y que llegue el código.

---

## 9. Fase 8 — Cierre

- [ ] Cambiar en el código la dirección fija del sitio (`api/_correo.js`) al dominio propio.
- [ ] Revocar la llave vieja de Anthropic y el token viejo de WhatsApp.
- [ ] Apagar el proyecto viejo de Vercel y la base vieja de Upstash (después de una semana
      estable, no antes).
- [ ] Repaso final: portada · carrito → WhatsApp · panel con la contraseña nueva · Club con PIN ·
      chat web · aviso push de prueba · bot de WhatsApp · correo de recuperación.
- [ ] **Acta de entrega** firmada: lista de las 8 cuentas, quién es titular, quién tiene acceso
      y con qué permiso, y en qué queda el mantenimiento.

---

## 10. Costos mensuales después del traspaso

| Servicio | Costo |
|---|---|
| Dominio | ~S/ 50 al año, según registrador |
| Vercel | gratis en Hobby · $20/mes en Pro (recomendado por uso comercial y por el acceso compartido) |
| Upstash | gratis en el volumen actual |
| Anthropic | por uso (centavos por conversación); poner límite mensual |
| Resend | gratis hasta 3000 correos/mes |
| WhatsApp | gratis hasta el 30-set-2026; después, por mensaje |
| Systeme.io | **se deja de pagar** al mudar el dominio |

---

## 11. Pendiente de confirmar con el dueño

1. ¿En qué registrador está minimarketarakaki.com y tiene el usuario y la clave?
2. ¿A nombre de quién está hoy el Business Manager de WhatsApp?
3. ¿Vercel Pro, o el desarrollador sigue publicando por GitHub y pide acceso puntual?
4. ¿Cuál va a ser el correo del negocio, titular de las 8 cuentas?
