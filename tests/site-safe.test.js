import {test} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import {once} from 'node:events';
import {createApp} from '../app.js';
import {prepareProgramFixture} from './program-fixture.js';

// Synthetic storage only: this file never imports database.js or pg.
test('Aplicación integrada con usuarios ficticios y SQLite en memoria',async t=>{
 const memory=new Database(':memory:');memory.pragma('foreign_keys=ON');
 memory.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,marketing INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);`);
 prepareProgramFixture(memory);
 const db={prepare(sql){
   if(sql==='SELECT pg_advisory_xact_lock(hashtext(?))')return {get:async()=>undefined};
   const stmt=memory.prepare(sql);
   return {get:async(...args)=>stmt.get(...args),all:async(...args)=>stmt.all(...args),run:async(...args)=>{
     if(stmt.reader){const row=stmt.get(...args);return {changes:1,lastInsertRowid:row.id};}
     return stmt.run(...args);
   }};
 },async transaction(fn){memory.exec('BEGIN');try{const result=await fn(db);memory.exec('COMMIT');return result;}catch(error){memory.exec('ROLLBACK');throw error;}}};
 const origin='https://site.example',password='Synthetic-password-only-437!';
 let time=1700000000000,server,url,adminEnv={};
 const oldNodeEnv=process.env.NODE_ENV;process.env.NODE_ENV='production';
 async function stop(){if(server){server.closeAllConnections();await new Promise(r=>server.close(r));server=null;}}
 t.after(async()=>{await stop();memory.close();if(oldNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldNodeEnv;});
 async function launch(){const app=await createApp({db,now:()=>time,writesEnabled:true,adminEnv,originEnv:{NODE_ENV:'production',ALLOWED_ORIGINS:origin}});server=app.listen(0,'127.0.0.1');await once(server,'listening');url=`http://127.0.0.1:${server.address().port}`;}
 const call=(path,{method='GET',cookie,body,headers={}}={})=>fetch(url+path,{method,redirect:'manual',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 let a,b;
 await launch();
 await t.test('Rutas públicas y recursos idénticos; rutas privadas protegidas',async()=>{
  for(const file of ['index.html','acceso.html','styles.css','cuenta.css','script.js','cuenta.js','test.js','programa-7-dias.js',...fs.readdirSync(new URL('../assets/',import.meta.url)).map(f=>'assets/'+f)]){
   const r=await call('/'+file);assert.equal(r.status,200,file);assert.deepEqual(Buffer.from(await r.arrayBuffer()),fs.readFileSync(new URL('../'+file,import.meta.url)));
  }
  assert.equal((await call('/')).status,200);
  for(const path of ['/assets/missing-fixture.png','/.env','/database.js','/data/usuarios.sqlite','/.git/config','/certs/supabase-prod-ca-2021.crt'])assert.equal((await call(path)).status,404,path);
  for(const path of ['/test.html','/mi-espacio.html','/programa-7-dias.html','/admin.html'])assert.equal((await call(path)).status,302,path);
  for(const path of ['/api/me','/api/admin/users','/api/program/status','/admin.js'])assert.equal((await call(path)).status,401,path);
  const r=await call('/programa-7-dias.html?dia=3');assert.equal(new URL(r.headers.get('location'),url).searchParams.get('next'),'/programa-7-dias.html?dia=3');
 });
 await t.test('Registro, duplicados, login y cookies seguras',async()=>{
  for(const [email,marketing] of [['a@example.invalid',true],['b@example.invalid',false]]){
   const r=await call('/api/register',{method:'POST',body:{name:'Fixture',email,password,marketing}});assert.equal(r.status,200);
   const header=r.headers.get('set-cookie');for(const marker of ['HttpOnly','Secure','SameSite=Lax'])assert.ok(header.includes(marker));
   if(marketing)a=header.split(';')[0];else b=header.split(';')[0];
  }
  assert.equal((await call('/api/register',{method:'POST',body:{name:'Fixture',email:' A@EXAMPLE.INVALID ',password,marketing:true}})).status,409);
  assert.equal((await call('/api/login',{method:'POST',body:{email:'a@example.invalid',password:'wrong'}})).status,401);
  const r=await call('/api/login',{method:'POST',body:{email:'a@example.invalid',password}});assert.equal(r.status,200);a=r.headers.get('set-cookie').split(';')[0];
  const rows=memory.prepare('SELECT password_hash FROM users').all();assert.ok(rows.every(r=>r.password_hash!==password&&/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(r.password_hash)));
  assert.ok(memory.prepare('SELECT token_hash FROM sessions').all().every(r=>/^[a-f0-9]{64}$/.test(r.token_hash)&&r.token_hash!==a.split('=')[1]));
  assert.equal((await call('/api/me',{cookie:'rpi_session=invalid'})).status,401);
 });
 await t.test('Permisos administrativos y sesiones entre instancias',async()=>{
  adminEnv={ADMIN_EMAIL:'a@example.invalid',ADMIN_USER_ID:'1'};await stop();await launch();
  assert.equal((await call('/api/me',{cookie:a})).status,200);
  assert.equal((await call('/api/admin/users',{cookie:b})).status,403);
  assert.equal((await call('/admin.js',{cookie:b})).status,403);
  const r=await call('/api/admin/users',{cookie:a});assert.equal(r.status,200);assert.ok(!(await r.text()).includes('password_hash'));
  assert.equal((await call('/admin.html',{cookie:a})).status,200);
  const csv=await (await call('/api/admin/export.csv',{cookie:a})).text();assert.ok(csv.includes('a@example.invalid'));assert.ok(!csv.includes('b@example.invalid'));
 });
 await t.test('Respuestas aisladas, persistencia y desbloqueo del servidor',async()=>{
  for(const cookie of [a,b])assert.equal((await call('/api/program/start',{cookie,method:'POST',body:{}})).status,200);
  const body={reflection:'Private fixture A',questions:['a','b','c'],exercise:'Fixture'};
  assert.equal((await call('/api/program/days/1/answers',{cookie:a,method:'PUT',body})).status,200);
  assert.equal((await (await call('/api/program/days/1?user_id=1',{cookie:b})).json()).answers.reflection,'');
  assert.equal((await call('/api/program/days/1/answers',{cookie:a,method:'PUT',body:{...body,user_id:2}})).status,400);
  await stop();await launch();assert.equal((await (await call('/api/program/days/1',{cookie:a})).json()).answers.reflection,body.reflection);
  const start=time;for(let day=2;day<=7;day++){time=start+(day-1)*86400000-1;assert.equal((await call('/api/program/days/'+day,{cookie:a})).status,403);time++;assert.equal((await call('/api/program/days/'+day,{cookie:a})).status,200);}
 });
 await t.test('Logout y caducidad de sesiones',async()=>{
  assert.equal((await call('/api/logout',{method:'POST',cookie:a,body:{}})).status,200);
  assert.equal((await call('/api/me',{cookie:a})).status,401);
  time=1700000000000+7*86400000;assert.equal((await call('/api/me',{cookie:b})).status,401);
 });
});
