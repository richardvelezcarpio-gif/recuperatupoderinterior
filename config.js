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

// Canonical origins only: never derive authorization from request/proxy headers.
export function allowedOriginsConfig(env=process.env) {
  const denied = new Set();
  if (typeof env.ALLOWED_ORIGINS !== 'string' || !env.ALLOWED_ORIGINS.trim()) return denied;
  const origins = env.ALLOWED_ORIGINS.split(',').map(value => value.trim());
  for (const origin of origins) {
    let url;
    try { url = new URL(origin); } catch { return denied; }
    if (url.origin !== origin || origin.includes('*') || url.username || url.password) return denied;
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const development = env.NODE_ENV === 'development' && !env.VERCEL;
    if (loopback) {
      if (!development || !url.port || !['http:', 'https:'].includes(url.protocol)) return denied;
    } else if (url.protocol !== 'https:') return denied;
  }
  return new Set(origins);
}
