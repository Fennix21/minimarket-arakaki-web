// Correos del negocio vía Resend (https://resend.com) — API REST con fetch, SIN dependencias.
// Se activa con RESEND_API_KEY en Vercel; sin ella HAS_CORREO=false y todo degrada con gracia:
// la recuperación de PIN vuelve al modo directo (celular+correo) y el panel avisa qué falta.
// RESEND_FROM = remitente verificado, ej. "Minimarket Arakaki <avisos@minimarketarakaki.com>".
// ⚠️ El remitente de prueba (onboarding@resend.dev) SOLO entrega al correo del dueño de la
// cuenta de Resend: para escribirle a los clientes hay que verificar un dominio (DNS SPF/DKIM).
// Límites del plan gratis: 100 correos/día, 3000/mes, lotes de máx. 100 por llamada.

const KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.RESEND_FROM || 'Minimarket Arakaki <onboarding@resend.dev>';
const HAS_CORREO = !!KEY;
const SITE = 'https://minimarket-arakaki-web.vercel.app';

const escHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Un correo individual (transaccional: código de recuperación, aviso de PIN cambiado)
async function enviarCorreo(para, asunto, html) {
  if (!HAS_CORREO) return { ok: false, error: 'sin RESEND_API_KEY' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [para], subject: asunto, html }),
  });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, id: j.id } : { ok: false, error: (j && j.message) || ('HTTP ' + r.status) };
}

// Campaña en lotes (endpoint /emails/batch de Resend: máx. 100 por llamada; pausa entre
// lotes por el rate limit de 2 req/s). items = [{ para, asunto, html }]
async function enviarLote(items) {
  if (!HAS_CORREO) return { enviados: 0, errores: ['sin RESEND_API_KEY'] };
  let enviados = 0;
  const errores = [];
  for (let i = 0; i < items.length; i += 100) {
    if (i > 0) await new Promise((ok) => setTimeout(ok, 700));
    const grupo = items.slice(i, i + 100).map((m) => ({ from: FROM, to: [m.para], subject: m.asunto, html: m.html }));
    const r = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KEY, 'content-type': 'application/json' },
      body: JSON.stringify(grupo),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) enviados += grupo.length;
    else errores.push((j && j.message) || ('HTTP ' + r.status));
  }
  return { enviados, errores };
}

// ---------- Plantillas (dark-gold de la marca; estilos inline: así lo exigen Gmail/Outlook) ----------

function marco(cuerpo, pie) {
  return '<!doctype html><html lang="es"><body style="margin:0;padding:0;background:#262626">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#262626;padding:26px 12px"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#1a1715;border:1px solid #6b5518;border-radius:16px">' +
    '<tr><td align="center" style="padding:30px 26px 14px">' +
    '<img src="' + SITE + '/img/logo-gato.png" width="66" alt="Minimarket Arakaki" style="display:block;margin:0 auto">' +
    '<div style="color:#d4a941;font-family:Georgia,\'Times New Roman\',serif;font-size:13px;letter-spacing:3px;text-transform:uppercase;padding-top:10px">Minimarket Arakaki</div>' +
    '</td></tr>' +
    '<tr><td style="padding:6px 26px 0;color:#f4ebd6;font-family:Georgia,\'Times New Roman\',serif;font-size:15px;line-height:1.65">' + cuerpo + '</td></tr>' +
    '<tr><td style="padding:22px 26px 26px">' +
    '<div style="border-top:1px solid #3a3126;padding-top:14px;color:#8d8570;font-family:Georgia,\'Times New Roman\',serif;font-size:11.5px;line-height:1.6">' +
    'Minimarket Arakaki · San Isidro, Lima · WhatsApp +51 977 737 199' + (pie ? '<br>' + pie : '') +
    '</div></td></tr>' +
    '</table></td></tr></table></body></html>';
}

// Código de recuperación de la cuenta del Club (vence en 15 minutos)
function htmlCodigo(nombre, codigo) {
  return marco(
    '<p style="margin:0 0 12px">¡Hola' + (nombre ? ', <b>' + escHtml(nombre) + '</b>' : '') + '! 👋</p>' +
    '<p style="margin:0 0 16px">Este es tu código para recuperar tu cuenta del <b>Club Arakaki</b>:</p>' +
    '<div style="text-align:center;margin:0 0 16px"><span style="display:inline-block;background:#262626;border:1.5px solid #d4a941;border-radius:12px;padding:14px 26px;color:#f2d894;font-size:30px;font-weight:bold;letter-spacing:8px">' + escHtml(codigo) + '</span></div>' +
    '<p style="margin:0 0 6px">Escríbelo en la página de recuperación y elige tu PIN nuevo. <b>Vence en 15 minutos.</b></p>',
    'Si tú no pediste este código, ignora este correo: tu cuenta sigue segura.'
  );
}

// Aviso de seguridad: el PIN de la cuenta acaba de cambiar
function htmlAvisoPin(nombre) {
  return marco(
    '<p style="margin:0 0 12px">¡Hola' + (nombre ? ', <b>' + escHtml(nombre) + '</b>' : '') + '! 👋</p>' +
    '<p style="margin:0 0 12px">Te avisamos que el <b>PIN de tu cuenta del Club Arakaki acaba de cambiar</b>.</p>' +
    '<p style="margin:0 0 6px">Si fuiste tú, no tienes que hacer nada. Si NO fuiste tú, escríbenos ya mismo por WhatsApp al <a href="https://wa.me/51977737199" style="color:#d4a941">+51 977 737 199</a> y lo resolvemos al toque 🙏</p>',
    ''
  );
}

// Promoción para miembros del Club (con enlace de baja obligatorio)
function htmlPromo(op) {
  const url = op.url ? (op.url.charAt(0) === '/' ? SITE + op.url : op.url) : '';
  const parrafos = String(op.texto || '').split(/\n{2,}/).map((p) =>
    '<p style="margin:0 0 12px">' + escHtml(p).replace(/\n/g, '<br>') + '</p>').join('');
  return marco(
    '<p style="margin:0 0 12px">¡Hola' + (op.nombre ? ', <b>' + escHtml(op.nombre) + '</b>' : '') + '! 👋</p>' +
    '<h2 style="margin:0 0 14px;color:#f2d894;font-size:21px;line-height:1.35">' + escHtml(op.titulo || '') + '</h2>' +
    parrafos +
    (url ? '<div style="text-align:center;margin:20px 0 8px"><a href="' + escHtml(url) + '" style="display:inline-block;background:#d4a941;color:#3a2708;text-decoration:none;font-weight:bold;font-size:15px;border-radius:12px;padding:13px 30px">Ver en la tienda 🛍️</a></div>' : ''),
    'Recibes este correo por ser miembro del Club Arakaki. ' +
    (op.bajaTok ? '<a href="' + SITE + '/api/correo?baja=' + escHtml(op.bajaTok) + '" style="color:#8d8570">Ya no quiero recibir promociones</a>' : '')
  );
}

module.exports = { HAS_CORREO, FROM, enviarCorreo, enviarLote, htmlCodigo, htmlAvisoPin, htmlPromo };
