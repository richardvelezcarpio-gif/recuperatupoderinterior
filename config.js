import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadEnvFile} from 'node:process';
export const root = path.dirname(fileURLToPath(import.meta.url));
export const envPath = path.join(root, '.env');
// Las variables exportadas tienen prioridad; la ruta no depende del directorio actual.
if (fs.existsSync(envPath)) loadEnvFile(envPath);
export const normalizeEmail = value => String(value ?? '').trim().toLowerCase();
export const databasePath = path.resolve(root, process.env.DATABASE_PATH || 'data/usuarios.sqlite');
export async function adminConfig(db, env=process.env) {
  const email = normalizeEmail(env.ADMIN_EMAIL);
  const idText = (env.ADMIN_USER_ID || '').trim();
  if (!email && !idText) return null;
  const id = Number(idText);
  if (!email || !/^\d+$/.test(idText) || !Number.isSafeInteger(id) || id < 1) {
    throw new Error('Configura ADMIN_EMAIL y ADMIN_USER_ID con npm run admin:set -- correo@ejemplo.com.');
  }
  const matches = await db.prepare('SELECT id FROM users WHERE lower(trim(email)) = ?').all(email);
  if (matches.length !== 1 || matches[0].id !== id) {
    throw new Error('El administrador no coincide con una cuenta existente única. Ejecuta npm run admin:set.');
  }
  return {email, id};
}
