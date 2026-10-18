import express from 'express';
import {mountProgram} from './program.js';
import crypto from 'node:crypto';
import path from 'node:path';
import {root, normalizeEmail, adminConfig} from './config.js';

// Express 4: propagar errores de handlers asíncronos al middleware seguro.
export function asyncRoutes(app) {
  for(const method of ['get','post','put','delete','use']) {
    const original=app[method].bind(app);
    app[method]=(...args)=>original(...args.map(value=>typeof value==='function' && value.length<4
      ? (req,res,next)=>Promise.resolve().then(()=>value(req,res,next)).catch(next) : value));
  }
  return app;
}
export async function createApp({db, now=Date.now, writesEnabled=false, adminEnv=process.env}) {
const admin = await adminConfig(db,adminEnv);
const app = asyncRoutes(express());
app.use((req,res,next)=>{
  if(!writesEnabled && !['GET','HEAD','OPTIONS'].includes(req.method)) return res.status(503).json({error:'Mantenimiento: escrituras temporalmente desactivadas.'});
  next();
});
app.disable('x-powered-by');
app.use(express.json({limit: '12kb'}));
app.use(async (req, res, next) => {
  res.set({'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin'});
  next();
});
app.use('/api', async (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const secure = process.env.NODE_ENV === 'production';
const cookieName = 'rpi_session';
const sessionTTL = 7 * 24 * 3600 * 1000;
const hash = token => crypto.createHash('sha256').update(token).digest('hex');
function pwHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function pwVerify(password, stored) {
  const [salt, key] = String(stored).split(':');
  if (!salt || !/^[a-f0-9]{128}$/i.test(key || '')) return false;
  return crypto.timingSafeEqual(crypto.scryptSync(password, salt, 64), Buffer.from(key, 'hex'));
}
function sessionToken(req) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const split = part.indexOf('=');
    if (part.slice(0, split).trim() !== cookieName) continue;
    try { return decodeURIComponent(part.slice(split + 1)); } catch { return null; }
  }
  return null;
}
async function getUser(req) {
  if (Object.hasOwn(req, 'authenticatedUser')) return req.authenticatedUser;
  const token = sessionToken(req);
  req.authenticatedUser = token
    ? await db.prepare('SELECT u.id,u.name,u.email,u.marketing FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?').get(hash(token), now()) || null
    : null;
  return req.authenticatedUser;
}
async function newSession(res, userId, sessionDb=db) {
  const token = crypto.randomBytes(32).toString('hex');
  await sessionDb.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run(hash(token), userId, now() + sessionTTL);
  res.cookie(cookieName, token, {httpOnly: true, secure, sameSite: 'lax', maxAge: sessionTTL, path: '/'});
}
const attempts = new Map();
function rateLimit(req, res, next) {
  const currentTime = now();
  let entry = attempts.get(req.ip);
  if (!entry || entry.reset < currentTime) { entry = {count: 0, reset: currentTime + 15 * 60000}; attempts.set(req.ip, entry); }
  if (++entry.count > 25) return res.status(429).json({error: 'Demasiados intentos. Espera 15 minutos.'});
  next();
}
app.post('/api/register', rateLimit, async (req, res) => {
  const {name, email, password, marketing} = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 80 || typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== 'string' || password.length < 12 || password.length > 128 || typeof marketing !== 'boolean') {
    return res.status(400).json({error: 'Revisa los datos. La contraseña necesita al menos 12 caracteres.'});
  }
  const normalized = normalizeEmail(email);
  if (await db.prepare('SELECT id FROM users WHERE lower(trim(email))=?').get(normalized)) return res.status(409).json({error: 'Este correo ya tiene una cuenta.'});
  try {
    await db.transaction(async tx=>{
      // Serialize normalized-email checks for concurrent registrations.
      await tx.prepare('SELECT pg_advisory_xact_lock(hashtext(?))').get(normalized);
      if(await tx.prepare('SELECT id FROM users WHERE lower(trim(email))=?').get(normalized)) throw Object.assign(new Error('Duplicado'),{code:'23505'});
      const info=await tx.prepare('INSERT INTO users(name,email,password_hash,marketing) VALUES(?,?,?,?) RETURNING id').run(name.trim(),normalized,pwHash(password),Number(marketing));
      await newSession(res,info.lastInsertRowid,tx);
    });
    res.json({ok: true});
  } catch (error) {
    res.removeHeader('Set-Cookie');
    if (error.code === '23505') return res.status(409).json({error: 'Este correo ya tiene una cuenta.'});
    console.error('No se pudo registrar la cuenta:', error.code);
    res.status(500).json({error: 'No se pudo completar el registro.'});
  }
});
app.post('/api/login', rateLimit, async (req, res) => {
  const {email, password} = req.body || {};
  if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 128) return res.status(400).json({error: 'Datos inválidos.'});
  const users = await db.prepare('SELECT id,password_hash FROM users WHERE lower(trim(email))=?').all(normalizeEmail(email));
  const user = users.length === 1 ? users[0] : null;
  if (!user || !pwVerify(password, user.password_hash)) return res.status(401).json({error: 'Correo o contraseña incorrectos.'});
  await newSession(res, user.id);
  res.json({ok: true});
});
app.get('/api/me', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({error: 'Inicia sesión.'});
  res.json({user: {...user, isAdmin: await isAdmin(req)}});
});
app.post('/api/logout', async (req, res) => {
  const token = sessionToken(req);
  if (token) await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));
  res.clearCookie(cookieName, {path: '/', httpOnly: true, sameSite: 'lax', secure});
  res.json({ok: true});
});
mountProgram(app, {db, getUser, now});

// La identidad se asigna localmente, nunca desde el registro o una API pública.
async function isAdmin(req) {
  const user = await getUser(req);
  return Boolean(user && admin && user.id === admin.id && normalizeEmail(user.email) === admin.email);
}
async function adminOnly(req, res, next) {
  if (!await getUser(req)) return res.status(401).json({error: 'Inicia sesión para continuar.', loginUrl: '/acceso.html?mode=login&next=%2Fadmin.html'});
  if (!await isAdmin(req)) return res.status(403).json({error: 'Tu sesión está activa, pero esta cuenta no tiene permisos de administrador.', loginUrl: '/acceso.html?mode=login&next=%2Fadmin.html'});
  next();
}
// Protege todo el espacio administrativo, incluidas futuras API.
app.use('/api/admin', adminOnly);
app.get('/api/admin/summary', async (req, res) => {
  res.json(await db.prepare('SELECT COUNT(*) total, COALESCE(SUM(CASE WHEN marketing=1 THEN 1 ELSE 0 END),0) marketing FROM users').get());
});
app.get('/api/admin/users', async (req, res) => {
  const page = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
  const limit = 20;
  const users = await db.prepare('SELECT id,name,email,marketing,created_at FROM users ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, (page - 1) * limit);
  res.json({users, page, limit});
});
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
app.get('/api/admin/export.csv', async (req, res) => {
  const users = await db.prepare('SELECT name,email,created_at FROM users WHERE marketing=1 ORDER BY id DESC').all();
  const rows = [['Nombre', 'Email', 'Acepta marketing', 'Registro'], ...users.map(user => [user.name, user.email, 'Sí', user.created_at])];
  res.set({'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="contactos-autorizados.csv"'});
  res.send('\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'));
});
function sendPage(res, file, status = 200) {
  res.set('Cache-Control', 'no-store');
  res.status(status).sendFile(path.join(root, file));
}
app.get(['/admin', '/admin.html'], async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!await getUser(req)) return res.redirect('/acceso.html?mode=login&next=%2Fadmin.html');
  if (!await isAdmin(req)) return sendPage(res, 'acceso-denegado.html', 403);
  sendPage(res, 'admin.html');
});
for (const page of ['test', 'mi-espacio', 'programa-7-dias']) {
  app.get([`/${page}`, `/${page}.html`], async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const day = page === 'programa-7-dias' && typeof req.query.dia === 'string' && /^[1-7]$/.test(req.query.dia) ? `?dia=${req.query.dia}` : '';
    if (!await getUser(req)) return res.redirect('/acceso.html?mode=login&next=' + encodeURIComponent(`/${page}.html${day}`));
    sendPage(res, `${page}.html`);
  });
}
// Public images only; never expose project files or credentials.
app.use('/assets', express.static(path.join(root, 'assets'), {dotfiles: 'deny', index: false, fallthrough: false}));
app.use('/assets', (error, req, res, next) => {
  if (error.status === 404) return res.status(404).send('Archivo no encontrado.');
  next(error);
});
app.get('/admin.js', adminOnly, async (req, res) => {res.set('Cache-Control', 'no-store'); res.sendFile(path.join(root, 'admin.js'));});
app.get(['/', '/index', '/index.html'], async (req, res) => sendPage(res, 'index.html'));
app.get(['/acceso', '/acceso.html'], async (req, res) => sendPage(res, 'acceso.html'));
// Lista explícita: nunca publicar SQLite, código servidor, .env o node_modules.
for (const file of ['styles.css', 'cuenta.css', 'script.js', 'cuenta.js', 'test.js', 'programa-7-dias.js']) app.get('/' + file, async (req, res) => res.sendFile(path.join(root, file)));
app.use(async (req, res) => res.status(404).send('Página no encontrada.'));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') return res.status(400).json({error: 'El contenido de la solicitud no es válido.'});
  if (error.type === 'entity.too.large') return res.status(413).json({error: 'La solicitud es demasiado grande.'});
  console.error('Error del servidor:', error.code || error.name);
  res.status(500).json({error: 'No se pudo completar la solicitud.'});
});

return app;
}
