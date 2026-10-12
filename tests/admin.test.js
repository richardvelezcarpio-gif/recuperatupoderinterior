import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {once} from 'node:events';
import pg from 'pg';
import {createDatabase} from '../database.js';
import {createApp} from '../app.js';
import {connectionOptions,readSnapshot,fingerprint,tables} from '../scripts/import-core.js';
import {root} from '../config.js';
import {DAY_MS} from '../program.js';

test('PostgreSQL aislado: autenticación, seguridad, rollback y persistencia real',async t=>{
 const schema='rpi_test_'+crypto.randomBytes(8).toString('hex');
 const options=connectionOptions(process.env);options.ssl.ca=fs.readFileSync(root+'/certs/supabase-prod-ca-2021.crt','utf8');
 const control=new pg.Client(options);await control.connect();
 let db,server,url,cookieA,cookieB;let time=Date.now();
 const baseline={};for(const table of Object.keys(tables)) baseline[table]=fingerprint(table,(await control.query(`SELECT * FROM rpi_private.${table}`)).rows);
 const migration=fs.readFileSync(root+'/migrations/001_initial_postgres.sql','utf8').replaceAll('rpi_private',schema);
 await control.query(migration);
 const env={ADMIN_EMAIL:'',ADMIN_USER_ID:''};
 async function launch(writes=true){db=createDatabase({schema});const app=await createApp({db,now:()=>time,writesEnabled:writes,adminEnv:env});server=app.listen(0,'127.0.0.1');await once(server,'listening');url=`http://127.0.0.1:${server.address().port}`;}
 async function stop(){if(server){await new Promise(r=>server.close(r));server=null;}if(db){await db.close();db=null;}}
 const call=(p,{method='GET',body,cookie,headers={}}={})=>fetch(url+p,{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const payload={reflection:'Prueba privada',questions:['a','b','c'],exercise:'Ejercicio'};
 const password='Fixture-only-password-739!';
 t.after(async()=>{await stop();try{await control.query(`DROP SCHEMA ${schema} CASCADE`);}finally{await control.end();}});
 await launch();
 await t.test('Registro y sesiones atómicos; duplicado y login inválido',async()=>{
  for(const [email,marketing] of [['a@example.invalid',true],['b@example.invalid',false]]){
   const response=await call('/api/register',{method:'POST',body:{name:'Prueba',email,password,marketing}});assert.equal(response.status,200);
   assert.match(response.headers.get('set-cookie'),/HttpOnly/i);const cookie=response.headers.get('set-cookie').split(';')[0];if(marketing)cookieA=cookie;else cookieB=cookie;
  }
  assert.equal((await call('/api/register',{method:'POST',body:{name:'Prueba',email:'A@example.invalid',password,marketing:true}})).status,409);
  assert.equal((await call('/api/login',{method:'POST',body:{email:'a@example.invalid',password:'incorrecta'}})).status,401);
  const response=await call('/api/login',{method:'POST',body:{email:'a@example.invalid',password}});assert.equal(response.status,200);cookieA=response.headers.get('set-cookie').split(';')[0];
  await assert.rejects(db.transaction(async tx=>{await tx.prepare('INSERT INTO users(name,email,password_hash,marketing) VALUES(?,?,?,?) RETURNING id').run('Fake','rollback@example.invalid','fake',0);throw Error('simulado');}));
  assert.equal(await db.prepare('SELECT id FROM users WHERE email=?').get('rollback@example.invalid'),undefined);
 });
 await t.test('Administrador, CSV y protección de archivos',async()=>{
  const me=await (await call('/api/me',{cookie:cookieA})).json();env.ADMIN_EMAIL='a@example.invalid';env.ADMIN_USER_ID=String(me.user.id);await stop();await launch();
  assert.equal((await call('/api/admin/users')).status,401);
  assert.equal((await call('/api/admin/users',{cookie:cookieB})).status,403);
  const result=await call('/api/admin/users',{cookie:cookieA});assert.equal(result.status,200);assert.ok(!(await result.text()).includes('password_hash'));
  const csv=await (await call('/api/admin/export.csv',{cookie:cookieA})).text();assert.ok(csv.includes('a@example.invalid'));assert.ok(!csv.includes('b@example.invalid'));
  for(const p of ['/.env','/data/usuarios.sqlite','/database.js','/certs/supabase-prod-ca-2021.crt'])assert.equal((await call(p)).status,404);
  assert.equal((await call('/admin.html',{cookie:cookieB})).status,403);
 });
 await t.test('Inicio, privacidad, guardado, edición y desbloqueo exacto',async()=>{
  assert.equal((await call('/api/program/status')).status,401);
  await call('/api/program/start',{method:'POST',body:{},cookie:cookieA});
  const first=await (await call('/api/program/status',{cookie:cookieA})).json();assert.equal(first.availableDays,1);
  await call('/api/program/start',{method:'POST',body:{},cookie:cookieA});assert.equal((await (await call('/api/program/status',{cookie:cookieA})).json()).startedAt,first.startedAt);
  for(const [p,method] of [['/api/program/days/2','GET'],['/api/program/days/2/answers','PUT'],['/api/program/days/2/complete','POST']])assert.equal((await call(p,{method,body:method==='GET'?undefined:payload,cookie:cookieA})).status,403);
  assert.equal((await call('/api/program/days/1/answers',{method:'PUT',body:payload,cookie:cookieA})).status,200);
  await call('/api/program/start',{method:'POST',body:{},cookie:cookieB});assert.equal((await (await call('/api/program/days/1',{cookie:cookieB})).json()).answers.reflection,'');
  assert.equal((await call('/api/program/days/1/answers',{method:'PUT',body:payload,cookie:cookieA,headers:{Origin:'https://evil.invalid'}})).status,403);
  assert.equal((await call('/api/program/days/1/complete',{method:'POST',body:payload,cookie:cookieA})).status,200);
  assert.equal((await call('/api/program/days/1/answers',{method:'PUT',body:{...payload,reflection:'Editada'},cookie:cookieA})).status,200);
  for(const days of [1,2,6]) {time=Date.parse(first.startedAt)+days*DAY_MS-1;assert.equal((await call('/api/program/days/'+(days+1),{cookie:cookieA})).status,403);time++;assert.equal((await call('/api/program/days/'+(days+1),{cookie:cookieA})).status,200);}
 });
 await t.test('Persistencia tras nueva instancia, eliminar solo datos sintéticos y logout',async()=>{
  await stop();await launch();const a=await (await call('/api/program/days/1',{cookie:cookieA})).json();assert.equal(a.answers.reflection,'Editada');assert.equal(a.answers.completed,true);
  assert.equal((await call('/api/program/days/1/answers',{method:'DELETE',body:{},cookie:cookieA})).status,200);
  assert.equal((await (await call('/api/program/days/1',{cookie:cookieA})).json()).answers.reflection,'');
  assert.equal((await call('/api/logout',{method:'POST',cookie:cookieB})).status,200);assert.equal((await call('/api/me',{cookie:cookieB})).status,401);
 });
 await t.test('Mantenimiento bloquea escrituras y sirve páginas',async()=>{
  await stop();await launch(false);
  assert.equal((await call('/api/register',{method:'POST',body:{}})).status,503);
  for(const page of ['/','/acceso.html','/mi-espacio.html','/programa-7-dias.html'])assert.equal((await call(page,{cookie:cookieA})).status,200);
 });
 await t.test('Ocho registros migrados intactos y coincidentes con respaldo',async()=>{
  const backup=readSnapshot(root+'/data/backups/pre-supabase-20261011T230426.005817Z/usuarios.sqlite');
  for(const table of Object.keys(tables)){const rows=(await control.query(`SELECT * FROM rpi_private.${table}`)).rows;assert.equal(fingerprint(table,rows),baseline[table]);assert.equal(fingerprint(table,rows),fingerprint(table,backup[table]));}
 });
});
