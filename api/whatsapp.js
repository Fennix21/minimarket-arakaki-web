// Webhook del bot de WhatsApp del Minimarket Arakaki (adaptado del CRM de WHAPE).
// - GET  : verificación del webhook con Meta.
// - POST : recibe mensajes, guarda el lead en Redis, responde con Claude
//          (con memoria de la conversación) y envía la respuesta por WhatsApp.
//          Si el lead está "pausado" (tú tomaste el control), NO responde solo.
//
// Variables de entorno:
//   WHATSAPP_VERIFY_TOKEN, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, ANTHROPIC_API_KEY
//   ARAKAKI_BOT_MODEL  (opcional; por defecto claude-haiku-4-5-20251001)
//   ARAKAKI_OWNER_PHONE (avisos de nuevos clientes/pedidos a tu WhatsApp)
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (activan CRM/memoria)

const MODEL = process.env.ARAKAKI_BOT_MODEL || 'claude-haiku-4-5-20251001';
const GRAPH = 'https://graph.facebook.com/v21.0';

const { DEFAULT_PROMPT } = require('./_prompt');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const HAS_REDIS = !!(REDIS_URL && REDIS_TOKEN);

async function redis(cmd) {
  if (!HAS_REDIS) return null;
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const data = await r.json();
  return data.result;
}

async function getLead(phone) {
  const raw = await redis(['GET', 'lead:' + phone]);
  if (raw) { try { return JSON.parse(raw); } catch (e) {} }
  return { phone, name: '', status: 'nuevo', paused: false, messages: [] };
}

async function saveLead(lead) {
  lead.updatedAt = Date.now();
  if (lead.messages.length > 300) lead.messages = lead.messages.slice(-300);
  await redis(['SET', 'lead:' + lead.phone, JSON.stringify(lead)]);
  await redis(['ZADD', 'leads', String(lead.updatedAt), lead.phone]);
}

// El "cerebro" del bot: se edita desde /panel → ⚙️ Bot (Redis manda sobre el código).
async function getPrompt() {
  if (HAS_REDIS) {
    const custom = await redis(['GET', 'config:prompt']);
    if (custom) return custom;
  }
  return process.env.ARAKAKI_BOT_PROMPT || DEFAULT_PROMPT;
}

// Clasificación automática del lead (solo avanza; nunca pisa lo confirmado a mano).
const STATUS_ORDER = { nuevo: 0, interesado: 1, pedido: 2, entregado: 3 };
function autoStatus(current, text, isAttachment) {
  current = current || 'nuevo';
  if (current === 'entregado' || current === 'descartado') return current;
  const t = (text || '').toLowerCase();
  const pedido = /(quiero hacer este pedido|pedido \(web\)|comprobante|constancia|captura|ya\s*(te|le)?\s*(pagu|yape|yapi|deposit|transfer)|yape[ée]|ya\s*pagu[eé])/i;
  const interes = /(cu[aá]nto|precio|cuesta|vale|tienen|hay\s|delivery|env[ií]o|pedir|comprar|lo\s*quiero|me\s*interesa)/i;
  let target = current;
  if (isAttachment || pedido.test(t)) target = 'pedido';
  else if (interes.test(t)) target = 'interesado';
  return STATUS_ORDER[target] > STATUS_ORDER[current] ? target : current;
}

async function askClaude(messages, systemPrompt) {
  while (messages.length && messages[0].role !== 'user') messages.shift();
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 400, system: systemPrompt, messages }),
  });
  const data = await r.json();
  if (!r.ok) { console.error('Claude error', JSON.stringify(data)); return 'Disculpa, tuve un problemita. ¿Me lo repites? 🙏'; }
  const block = (data.content || []).find((b) => b.type === 'text');
  return (block && block.text) || 'Disculpa, ¿puedes repetir tu mensaje?';
}

// Normaliza el formato al de WhatsApp: negrita con UN asterisco, sin markdown ** ni #.
function waFormat(s) {
  if (!s) return s;
  let t = String(s);
  t = t.replace(/\*\*\*([^\n]+?)\*\*\*/g, '*$1*');
  t = t.replace(/\*\*([^\n]+?)\*\*/g, '*$1*');
  t = t.replace(/__([^\n]+?)__/g, '*$1*');
  t = t.replace(/^\s{0,3}#{1,6}\s+(.+?)\s*$/gm, '*$1*');
  t = t.replace(/^(\s*)[*-]\s+/gm, '$1• ');
  t = t.split('\n').map((line) => {
    if (((line.match(/\*/g) || []).length) % 2 === 1) line = line.replace(/\*(?=[^*]*$)/, '');
    return line;
  }).join('\n');
  return t;
}

async function sendWhatsApp(to, body) {
  const r = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: waFormat(body) } }),
  });
  if (!r.ok) console.error('WhatsApp send error', await r.text());
}

// Aviso a tu WhatsApp personal (config en /panel → ⚙️). No se avisa a sí mismo.
async function notifyOwner(text, from) {
  try {
    if (!HAS_REDIS) return;
    if ((await redis(['GET', 'config:notify'])) === '0') return;
    const owner = ((await redis(['GET', 'config:ownerphone'])) || process.env.ARAKAKI_OWNER_PHONE || '').replace(/\D/g, '');
    if (!owner) return;
    if (from && from.replace(/\D/g, '') === owner) return;
    await sendWhatsApp(owner, text);
  } catch (e) { console.error('notifyOwner error', e); }
}

module.exports = async (req, res) => {
  // Verificación del webhook con Meta
  if (req.method === 'GET') {
    const q = req.query || {};
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(q['hub.challenge']);
    }
    return res.status(403).send('Forbidden');
  }
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg) return res.status(200).send('ok');

    const from = msg.from;
    const profileName = value?.contacts?.[0]?.profile?.name || '';
    const text = msg.type === 'text' ? msg.text.body : null;
    // Adjunto (la captura de Yape/Plin suele venir como imagen)
    let media = null, caption = '';
    if (msg.type === 'image') { media = { id: msg.image?.id, type: 'image' }; caption = msg.image?.caption || ''; }
    else if (msg.type === 'document') { media = { id: msg.document?.id, type: 'document' }; caption = msg.document?.caption || ''; }

    let lead = null;
    if (HAS_REDIS) {
      lead = await getLead(from);
      if (msg.id) { // idempotencia: ignora reintentos de Meta del mismo mensaje
        if (lead.lastMsgId === msg.id) return res.status(200).send('ok');
        lead.lastMsgId = msg.id;
      }
      const isNewLead = !lead.messages || lead.messages.length === 0;
      const prevStatus = lead.status || 'nuevo';
      if (profileName && !lead.name) lead.name = profileName;
      const entry = { role: 'user', text: text || caption || '[adjunto: ' + msg.type + ']', ts: Date.now() };
      if (media && media.id) entry.media = media;
      lead.messages.push(entry);
      lead.status = autoStatus(lead.status, text || caption, !!media);
      await saveLead(lead);

      const who = lead.name || ('+' + from);
      if (isNewLead) {
        const preview = text || ('(envió ' + msg.type + ')');
        await notifyOwner('🆕 *Nuevo cliente* en el WhatsApp de Arakaki\n👤 ' + who + ' (+' + from + ')\n💬 "' + preview.slice(0, 200) + '"\n\nMíralo en el panel 👉 /panel', from);
      } else if (lead.status === 'pedido' && prevStatus !== 'pedido') {
        await notifyOwner('🛒 *' + who + '* tiene un PEDIDO en curso (mandó pedido web o comprobante).\nRevísalo 👉 /panel', from);
      }
    }

    // Mensaje que no es texto (imagen/audio/etc.) — suele ser la captura de pago
    if (text === null) {
      if (!lead || !lead.paused) {
        const isImg = msg.type === 'image' || msg.type === 'document';
        const ack = isImg
          ? '¡Gracias! 🙌 Recibí tu imagen. La reviso y te confirmo en un momento.'
          : 'Recibí tu mensaje 🙌. Si puedes, escríbeme por texto para ayudarte más rápido.';
        await sendWhatsApp(from, ack);
        if (lead) { lead.messages.push({ role: 'assistant', text: ack, ts: Date.now() }); await saveLead(lead); }
      } else if (lead) { await saveLead(lead); }
      return res.status(200).send('ok');
    }

    // Si tú tomaste el control, el bot NO responde (solo guarda el mensaje)
    if (HAS_REDIS && lead.paused) {
      await saveLead(lead);
      return res.status(200).send('ok');
    }

    // Sin API key de Claude: solo registra y avisa (el sitio sigue útil sin bot).
    if (!process.env.ANTHROPIC_API_KEY) return res.status(200).send('ok');

    // Memoria: últimas ~12 entradas de la conversación
    let history;
    if (HAS_REDIS) {
      history = lead.messages.slice(-12).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }));
    } else {
      history = [{ role: 'user', content: text }];
    }

    const reply = await askClaude(history, await getPrompt());
    await sendWhatsApp(from, reply);

    if (HAS_REDIS) {
      lead.messages.push({ role: 'assistant', text: reply, ts: Date.now() });
      await saveLead(lead);
    }
  } catch (e) {
    console.error('Webhook error', e);
  }

  return res.status(200).send('ok');
};
