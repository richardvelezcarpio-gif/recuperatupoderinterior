import {asyncRoutes} from '../app.js';
import {prepareProgramFixture} from './program-fixture.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {mountProgram,DAY_MS} from '../program.js';

test('Respuestas privadas, edición, completado y eliminación persistentes',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rpi-answers-'));const file=path.join(directory,'test.sqlite');
 let db=new Database(file);db.pragma('foreign_keys=ON');db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2);');
 let server,url,time=Date.UTC(2026,0,1);const initial=time;
 async function launch(){prepareProgramFixture(db);const app=asyncRoutes(express());app.use(express.json({limit:'12kb'}));mountProgram(app,{db,now:()=>time,getUser:req=>req.headers.authorization==='a'?{id:1}:req.headers.authorization==='b'?{id:2}:null});app.use((error,req,res,next)=>res.status(error.status||500).json({error:'Solicitud inválida.'}));server=app.listen(0,'127.0.0.1');await once(server,'listening');url=`http://127.0.0.1:${server.address().port}`;}
 async function stop(){await new Promise(resolve=>server.close(resolve));}
 const call=(endpoint,user='a',method='GET',body,extra={})=>fetch(url+endpoint,{method,headers:{...(user?{Authorization:user}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const read=async user=>(await (await call('/api/program/days/1',user)).json()).answers;
 const payload={reflection:'Reflexión privada A',questions:['Una','Dos','Tres'],exercise:'<script>alert("no ejecutar")</script>'};
 t.after(async()=>{await stop();db.close();fs.rmSync(directory,{recursive:true,force:true});});await launch();
 await t.test('Autenticación y días bloqueados impiden leer, guardar, completar y eliminar',async()=>{
  for(const [method,endpoint] of [['GET','/api/program/days/1'],['PUT','/api/program/days/1/answers'],['POST','/api/program/days/1/complete'],['DELETE','/api/program/days/1/answers']])assert.equal((await call(endpoint,null,method,method==='GET'?undefined:payload)).status,401);
  for(const user of ['a','b'])assert.equal((await call('/api/program/start',user,'POST',{})).status,200);
  for(const suffix of ['answers','complete'])assert.equal((await call('/api/program/days/2/'+suffix,'a',suffix==='complete'?'POST':'PUT',payload)).status,403);
  assert.equal((await call('/api/program/days/2/answers','a','DELETE',{})).status,403);
  assert.equal((await call('/api/program/days/2')).status,403);
  assert.equal((await call('/api/program/days/8/answers','a','PUT',payload)).status,400);
 });
 await t.test('Guardado y edición pertenecen exclusivamente al usuario autenticado',async()=>{
  assert.equal((await call('/api/program/days/1/answers','a','PUT',payload)).status,200);
  assert.equal((await read('a')).reflection,payload.reflection);assert.equal((await read('b')).reflection,'');
  assert.equal((await call('/api/program/days/1/answers','a','PUT',{...payload,user_id:2})).status,400);
  assert.equal((await call('/api/program/days/1/answers?user_id=1','b','PUT',{...payload,reflection:'Privada B'})).status,200);
  assert.equal((await read('a')).reflection,payload.reflection);assert.equal((await read('b')).reflection,'Privada B');
  assert.equal((await call('/api/program/days/1/answers','a','PUT',{...payload,reflection:'Editada A'})).status,200);
  assert.equal((await read('a')).reflection,'Editada A');assert.equal((await read('b')).reflection,'Privada B');
  const status=await (await call('/api/program/status')).text();assert.ok(!status.includes('Editada A'));assert.ok(!status.includes('Privada B'));
 });
 await t.test('Validación de longitud, tipos, campos, origen y contenido JSON',async()=>{
  for(const body of [{...payload,reflection:'x'.repeat(501)},{...payload,questions:['solo una']},{...payload,questions:[1,2,3]},{...payload,exercise:null},{...payload,completed:true},[],null])assert.equal((await call('/api/program/days/1/answers','a','PUT',body)).status,400);
  for(const [method,suffix] of [['PUT','answers'],['POST','complete'],['DELETE','answers']])assert.equal((await call('/api/program/days/1/'+suffix,'a',method,payload,{Origin:'https://otro.example'})).status,403);
  assert.equal((await call('/api/program/days/1/answers','a','PUT',payload,{'Content-Type':'text/plain'})).status,403);
  assert.equal((await read('a')).reflection,'Editada A');
 });
 await t.test('Completar guarda respuestas, mantiene edición y no adelanta el siguiente día',async()=>{
  assert.equal((await call('/api/program/days/1/complete','a','POST',payload)).status,200);
  assert.equal((await read('a')).completed,true);
  let status=await (await call('/api/program/status')).json();assert.deepEqual(status.completedDays,[1]);assert.equal(status.availableDays,1);assert.equal(status.startedAt,new Date(initial).toISOString());
  assert.deepEqual((await (await call('/api/program/status','b')).json()).completedDays,[]);
  assert.equal((await call('/api/program/days/1/answers','a','PUT',{...payload,reflection:'Final A'})).status,200);
  assert.equal((await read('a')).completed,true);
  time=initial+DAY_MS-1;assert.equal((await call('/api/program/days/2/complete','a','POST',payload)).status,403);
  time++;assert.equal((await call('/api/program/days/2/answers','a','PUT',payload)).status,200);
 });
 await t.test('Reinicio conserva respuestas y completado sin cambiar usuarios ni calendario',async()=>{
  const starts=db.prepare('SELECT * FROM program_starts ORDER BY user_id').all();await stop();db.close();db=new Database(file);await launch();
  assert.equal((await read('a')).reflection,'Final A');assert.equal((await read('a')).completed,true);assert.equal((await read('b')).reflection,'Privada B');
  assert.deepEqual(db.prepare('SELECT * FROM program_starts ORDER BY user_id').all(),starts);assert.deepEqual(db.prepare('SELECT * FROM users').all(),[{id:1},{id:2}]);
 });
 await t.test('Eliminar solo afecta las respuestas propias del día elegido y persiste',async()=>{
  assert.equal((await call('/api/program/days/1/answers?user_id=2','a','DELETE',{})).status,200);
  assert.equal((await read('a')).reflection,'');assert.equal((await read('a')).completed,false);assert.equal((await read('b')).reflection,'Privada B');
  assert.equal((await (await call('/api/program/days/2')).json()).answers.reflection,payload.reflection);
  assert.equal((await (await call('/api/program/status')).json()).startedAt,new Date(initial).toISOString());
  await stop();db.close();db=new Database(file);await launch();assert.equal((await read('a')).reflection,'');assert.equal((await read('b')).reflection,'Privada B');
  assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
 });
});
