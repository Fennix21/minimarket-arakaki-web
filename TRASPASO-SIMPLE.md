# El traspaso de la web, explicado sin tecnicismos

Guía para el dueño del Minimarket Arakaki. La versión técnica, con cada paso detallado, está
en `TRASPASO.md`; esta cuenta lo mismo en cristiano.

---

## En una frase

La web funciona perfecto, pero **las llaves están a nombre del desarrollador**. El traspaso
pone cada llave a nombre del negocio, sin apagar la web ni un minuto.

## Por qué conviene hacerlo

Hoy, si el desarrollador se pierde de vista o simplemente se enferma, el negocio no puede
entrar a cambiar un precio, ni recuperar la lista de clientes, ni renovar el dominio.

Cuando terminemos, es al revés: **todo está a tu nombre y el desarrollador entra invitado**.
Lo puedes sacar cuando quieras, con un clic, sin que se caiga nada y sin cambiar contraseñas.

---

## Piensa en la web como un local

| La llave | Qué es en la vida real | ¿Ya es tuya? |
|---|---|---|
| **El dominio** | la dirección en la calle: `minimarketarakaki.com` | falta confirmar en qué empresa está registrada |
| **El código** | los planos del local | del desarrollador |
| **El hosting** | el terreno donde está construido y que lo mantiene abierto 24 horas | del desarrollador |
| **La base de datos** | tu libreta: clientes del Club, pedidos, precios, promos, todo lo que editas en el panel | del desarrollador |
| **La IA** | el empleado que contesta el chat de la web | del desarrollador |
| **Los correos** | el buzón desde el que se le escribe a los clientes | todavía sin usar |
| **Las llaves de avisos** | lo que hace sonar el celular cuando entra un pedido | se copian tal cual, no es una cuenta |

**La más valiosa es la base de datos.** Es la única que no se puede volver a fabricar: el
código y las fotos se pueden reconstruir, tus clientes no. Ya tiene un respaldo guardado.

## Buenas noticias: dos cosas que NO hay que mudar

- **El WhatsApp de la tienda ya es tuyo.** El número que usan los clientes es tu WhatsApp
  Business de siempre; la web solo abre el chat, no lo controla. No hay nada que transferir.
- **Las llaves de los avisos se copian tal cual.** Si se cambiaran, todos los que activaron
  las notificaciones tendrían que volver a activarlas. No se tocan.

---

## Antes de empezar necesitas tres cosas

1. **Un correo del negocio** (por ejemplo `minimarketarakaki@gmail.com`), que **no sea el
   personal de nadie**. Va a ser el titular de todas las cuentas.
2. **Un celular tuyo a la mano.** Cada cuenta va a pedir confirmación por el teléfono cada vez
   que alguien intente entrar desde un equipo nuevo. Esa es tu principal protección.
3. **Un guardador de contraseñas** (Bitwarden, gratis). Van a ser varias claves y no se
   apuntan en un papel ni se mandan por WhatsApp.

---

## El camino, paso a paso

### Paso 1 — Tú creas las cuentas
**Quién lo hace:** tú, con el desarrollador al lado guiándote.
**Cuánto demora:** alrededor de una hora, de una sentada.

Son **cinco cuentas**: GitHub (los planos), Vercel (el terreno), Upstash (la libreta),
Anthropic (la IA) y Resend (los correos). Todas con el correo del negocio, todas con la
confirmación por celular activada, y **las contraseñas las escribes tú**.

En cada una, al final, invitas al desarrollador con su propio correo.

### Paso 2 — Los planos pasan a tu cuenta
**Quién lo hace:** el desarrollador. **Se nota desde afuera:** nada.

El código completo, con todo su historial, se transfiere a tu cuenta. Queda privado.

### Paso 3 — El terreno
**Quién lo hace:** el desarrollador. **Se nota desde afuera:** nada.

Se levanta la web en tu cuenta de hosting, apuntando a tus planos. Por un rato van a existir
las dos versiones, la vieja y la nueva, funcionando en paralelo. Eso es a propósito: es la red
de seguridad.

### Paso 4 — La libreta (el paso delicado)
**Quién lo hace:** el desarrollador. **Se nota desde afuera:** nada.

Primero se saca un respaldo completo. Después se copia **solo la configuración** —tus textos,
precios, promos, fotos, el cerebro del chat— a la base nueva. Los clientes y pedidos de hoy
son de prueba, así que la libreta arranca limpia y no hay que hacerlo de madrugada.

### Paso 5 — La dirección
**Quién lo hace:** los dos. **Cuándo:** al final, nunca antes.
**Cuánto demora:** el cambio es de minutos, pero puede tardar unas horas en verse en todos
los teléfonos del país.

Recién cuando la web nueva está probada y andando, se apunta `minimarketarakaki.com` hacia
ella. Este es el momento en que el negocio **deja de pagar Systeme.io**.

### Paso 6 — Repaso y acta
**Quién lo hace:** los dos, juntos.

Se prueba todo de punta a punta: la portada, un pedido de prueba, el panel, el Club, el chat,
un aviso al celular. Y se firma un acta simple: qué cuentas existen, quién es el titular,
quién tiene acceso y con qué permiso, y qué incluye el mantenimiento de ahí en adelante.

---

## ¿La web se cae en algún momento?

**No.** La web vieja sigue viva hasta que la nueva está probada; recién ahí se cambia la
dirección. Y la vieja no se apaga hasta una semana después, por si algo aparece. Un cliente
que entre a comprar en medio del traspaso no se entera de nada.

---

## Cuánto cuesta mantenerla, al mes

| Servicio | Costo |
|---|---|
| Dominio (la dirección) | unos S/ 50 **al año** |
| Hosting | gratis en el plan actual. Unos $20 al mes si se pasa al plan de empresa, que es lo correcto para un negocio y además permite compartir el acceso |
| Base de datos | gratis con el volumen de hoy |
| IA del chat | por uso, centavos por conversación. **Se le pone un tope mensual** para que no haya sorpresas |
| Correos | gratis hasta 3.000 al mes |
| Systeme.io | **se deja de pagar** |

En la práctica: hoy se puede sostener casi con lo que ya se paga, y lo que se ahorra de
Systeme.io cubre buena parte del resto.

---

## Tus datos de clientes: quién puede verlos

Los nombres, celulares y direcciones de tus clientes viven **en un solo lugar**: la base de
datos. Ni los planos ni el terreno guardan nada de eso.

Hay exactamente **tres llaves** que abren esa información, y las tres deben quedar en tus
manos:

1. La entrada a la consola de la base de datos.
2. El código de acceso de la base (vive guardado dentro del hosting).
3. **La contraseña del panel.** Ojo con esta: quien la tenga ve nombres, celulares y
   direcciones. Vale lo mismo que las otras dos. No se comparte por chat ni se repite de otro
   servicio.

Las claves que los clientes usan para su cuenta del Club no se guardan tal cual: quedan
cifradas de forma que nadie —ni el desarrollador— puede leerlas.

---

## Lo que falta que decidas

1. ¿En qué empresa está registrado `minimarketarakaki.com` y tienes el usuario y la clave?
2. ¿Cuál va a ser el correo del negocio?
3. ¿Hosting en el plan gratuito o en el de empresa (~$20 al mes)?
4. ¿Quién queda como segunda persona de confianza, por si pierdes el celular?

---

## Un pendiente que no es del traspaso, pero corre

**Hoy no te llega ningún aviso automático cuando entra un pedido.** Te enteras porque el
cliente te manda el mensaje por WhatsApp. Si arma el pedido en la web y no llega a enviarte el
mensaje, ese pedido queda guardado y nadie lo ve.

Se arregla en dos minutos y ya está construido: abre la web en tu celular, agrégala a la
pantalla de inicio y toca el botón 🔔 del final de la página. Desde ahí te suena el teléfono
con cada pedido, gratis.
