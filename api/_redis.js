// Único lugar donde el proyecto habla con la base (Upstash Redis por REST).
// Antes este helper estaba copiado tal cual dentro de cada api/*.js (13 copias): si había que
// cambiar la conexión, eran 13 archivos y bastaba olvidar uno. Ahora todos lo piden de aquí.
//
// Sin las variables de entorno, redis() devuelve null y nada revienta (el sitio público
// funciona igual, solo se apaga lo que necesita base).
//
// ARAKAKI_REDIS_RO=1 → modo SOLO LECTURA: deja pasar las consultas y descarta cualquier
// comando que escriba. Es para poder mirar la base de verdad desde la PC (tools/dev-server.js)
// sin riesgo de tocarle un dato a un cliente. En Vercel esa variable no existe, así que en
// producción este freno no hace nada.

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const HAS_REDIS = !!(REDIS_URL && REDIS_TOKEN);
const SOLO_LECTURA = process.env.ARAKAKI_REDIS_RO === '1';

// Comandos que solo miran (los únicos que pasan en modo solo lectura).
const LECTURA = new Set([
  'GET', 'MGET', 'GETRANGE', 'STRLEN', 'EXISTS', 'TTL', 'PTTL', 'TYPE', 'KEYS', 'SCAN', 'DBSIZE',
  'HGET', 'HMGET', 'HGETALL', 'HKEYS', 'HVALS', 'HLEN', 'HEXISTS', 'HSCAN',
  'LRANGE', 'LLEN', 'LINDEX', 'SMEMBERS', 'SCARD', 'SISMEMBER', 'SSCAN',
  'ZRANGE', 'ZREVRANGE', 'ZRANGEBYSCORE', 'ZREVRANGEBYSCORE', 'ZSCORE', 'ZCARD', 'ZCOUNT',
  'ZRANK', 'ZREVRANK', 'ZSCAN', 'ZRANDMEMBER', 'PING',
]);

async function redis(cmd) {
  if (!HAS_REDIS) return null;
  if (SOLO_LECTURA) {
    const nombre = String((Array.isArray(cmd) ? cmd[0] : cmd) || '').toUpperCase();
    if (!LECTURA.has(nombre)) {
      console.warn('[redis] modo solo lectura: se descartó ' + nombre);
      return null;
    }
  }
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const data = await r.json();
  return data.result;
}

module.exports = { REDIS_URL, REDIS_TOKEN, HAS_REDIS, SOLO_LECTURA, redis };
