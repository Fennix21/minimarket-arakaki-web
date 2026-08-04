// Carga el archivo .env de la raíz del proyecto (formato CLAVE=valor, # comenta la línea).
// Lo usan tools/dev-server.js y tools/migrar-redis.js para tener las llaves de Upstash en la PC
// sin escribirlas a mano en cada terminal. El .env está en .gitignore: nunca se sube.
// Plantilla y advertencias: .env.ejemplo
// Lo que ya venga en el entorno MANDA (así se puede pisar una variable suelta al correr).
const fs = require('fs');
const path = require('path');

function cargarEnv(raiz) {
  const ruta = path.join(raiz || path.join(__dirname, '..'), '.env');
  if (!fs.existsSync(ruta)) return 0;
  let n = 0;
  for (const linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const t = linea.trim();
    if (!t || t[0] === '#') continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const clave = t.slice(0, i).trim();
    let valor = t.slice(i + 1).trim();
    if ((valor[0] === '"' && valor.endsWith('"')) || (valor[0] === "'" && valor.endsWith("'"))) valor = valor.slice(1, -1);
    if (!(clave in process.env)) { process.env[clave] = valor; n++; }
  }
  return n;
}

module.exports = { cargarEnv };
