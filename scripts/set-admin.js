import fs from 'node:fs';
import crypto from 'node:crypto';
import {createDatabase} from '../database.js';
import {envPath, normalizeEmail} from '../config.js';
try {
  const email = normalizeEmail(process.argv[2]);
  if (process.argv.length !== 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Uso: npm run admin:set -- correo-de-cuenta-existente@ejemplo.com');
  const db = createDatabase();
  let users;
  try {users = await db.prepare('SELECT id FROM users WHERE lower(trim(email))=?').all(email);} finally {await db.close();}
  if (users.length !== 1) throw new Error('El correo debe corresponder a una única cuenta ya registrada. No se ha modificado nada.');
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : 'NODE_ENV=development\nHOST=127.0.0.1\nPORT=5173\n';
  content = content.split(/\r?\n/).filter(line => !/^\s*(?:export\s+)?ADMIN_(EMAIL|USER_ID)\s*=/.test(line)).join('\n').trimEnd();
  content += `\nADMIN_EMAIL=${JSON.stringify(email)}\nADMIN_USER_ID=${users[0].id}\n`;
  const temporary = `${envPath}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, content, {mode: 0o600, flag: 'wx'});
    fs.renameSync(temporary, envPath);
  } finally {if (fs.existsSync(temporary)) fs.unlinkSync(temporary);}
  console.log(`Administrador asignado a la cuenta existente ID ${users[0].id}. Reinicia el servidor para aplicar la configuración.`);
  console.log('No se han modificado usuarios, contraseñas ni sesiones. Las variables exportadas en la terminal tienen prioridad sobre .env.');
} catch (error) {
  console.error(error.code ? `No se pudo configurar el administrador (${error.code}).` : error.message);
  process.exitCode = 1;
}
