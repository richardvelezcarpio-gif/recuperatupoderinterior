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
import {mountProgram, DAY_MS} from '../program.js';

test('Desbloqueo seguro de siete días con reloj del servidor inyectado', async t => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rpi-unlock-'));
  const file=path.join(directory,'test.sqlite');
  let db=new Database(file);
  db.pragma('foreign_keys=ON');
  db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2);');
  const base=Date.UTC(2026,0,1,10,23,45,678);
  let time=base, server, url;
  async function launch() {
    prepareProgramFixture(db);const app=asyncRoutes(express()); app.use(express.json());
    // Identidades de prueba; en producción se inyecta getUser, con la sesión real de la aplicación.
    mountProgram(app,{allowedOrigins:new Set(['https://program.example']),db,now:()=>time,getUser:req=>req.headers.authorization==='fixture-a'?{id:1}:req.headers.authorization==='fixture-b'?{id:2}:null});
    server=app.listen(0,'127.0.0.1');await once(server,'listening');url=`http://127.0.0.1:${server.address().port}`;
  }
  async function stop(){await new Promise(resolve=>server.close(resolve));}
  const get=(endpoint,who='fixture-a',opts={})=>fetch(url+endpoint,{...opts,headers:{Origin:'https://program.example',...(who?{Authorization:who}:{}),...opts.headers}});
  const start=(who='fixture-a',body={})=>get('/api/program/start',who,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const status=async who=>(await get('/api/program/status',who)).json();
  t.after(async()=>{await stop();db.close();fs.rmSync(directory,{recursive:true,force:true});});
  await launch();
  await t.test('Autenticación, validación del día y protección del inicio',async()=>{
    for(const endpoint of ['/api/program/status','/api/program/days/1','/api/program/days/7'])assert.equal((await get(endpoint,null)).status,401);
    assert.equal((await start(null)).status,401);
    assert.equal((await get('/api/program/start','fixture-a',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://otro.example'},body:'{}'})).status,403);
    for(const day of ['0','8','-1','1.5','01','abc','1%20OR%201=1'])assert.equal((await get('/api/program/days/'+day)).status,400);
    assert.equal((await get('/api/program/days/1')).status,403);
    assert.equal((await status()).startedAt,null);
  });
  await t.test('Inicio exacto UTC, Día 1 inmediato y peticiones repetidas no reinician',async()=>{
    const first=await start('fixture-a',{user_id:2,started_at:0,now:9999999999999});
    assert.equal(first.status,200);assert.equal(first.headers.get('cache-control'),'no-store');
    const state=await first.json();assert.equal(state.startedAt,new Date(base).toISOString());assert.equal(state.availableDays,1);assert.equal(state.remainingMs,DAY_MS);
    assert.equal((await get('/api/program/days/1')).status,200);
    assert.equal((await get('/api/program/days/7?user_id=2&now=9999999999999')).status,403);
    time=base+1000;await Promise.all(Array.from({length:5},()=>start()));
    assert.equal((await status()).startedAt,state.startedAt);assert.equal(db.prepare('SELECT count(*) n FROM program_starts').get().n,1);
  });
  await t.test('Bloqueado un milisegundo antes; disponible exactamente a las 24, 48, 72, 96, 120 y 144 horas',async()=>{
    for(let day=2;day<=7;day++){
      time=base+(day-1)*DAY_MS-1;
      const blocked=await get('/api/program/days/'+day);assert.equal(blocked.status,403,`día ${day} antes del plazo`);
      const denied=await blocked.json();assert.equal(denied.exercise,undefined);assert.equal(denied.question,undefined);assert.equal(denied.title,undefined);
      assert.equal((await status()).availableDays,day-1);
      time++;assert.equal((await status()).availableDays,day);
      for(let previous=1;previous<=day;previous++)assert.equal((await get('/api/program/days/'+previous)).status,200);
    }
    assert.equal((await status()).remainingMs,null);
  });
  await t.test('Dos calendarios independientes y ningún contenido bloqueado en HTML o JavaScript público',async()=>{
    time=base+DAY_MS/2;await start('fixture-b');
    time=base+DAY_MS;
    assert.equal((await status('fixture-a')).availableDays,2);assert.equal((await status('fixture-b')).availableDays,1);
    assert.equal((await get('/api/program/days/2','fixture-b')).status,403);
    const html=fs.readFileSync(new URL('../programa-7-dias.html',import.meta.url),'utf8');
    const client=fs.readFileSync(new URL('../programa-7-dias.js',import.meta.url),'utf8');
    const source=fs.readFileSync(new URL('../program.js',import.meta.url),'utf8');
    const content=JSON.parse(source.slice('const content = '.length,source.indexOf(';\n')));
    for(const day of content){assert.ok(!html.includes(day.exercise));assert.ok(!client.includes(day.exercise));assert.ok(!html.includes(day.question));assert.ok(!client.includes(day.question));}
    const state=await status('fixture-b');assert.deepEqual(Object.keys(state).sort(),['availableDays','completedDays','nextUnlockAt','remainingMs','serverTime','startedAt']);
  });
  await t.test('Reabrir SQLite y reiniciar el servidor conserva el inicio y los usuarios',async()=>{
    const before=db.prepare('SELECT * FROM program_starts ORDER BY user_id').all();
    await stop();db.close();db=new Database(file);db.pragma('foreign_keys=ON');await launch();
    assert.equal((await status()).startedAt,new Date(base).toISOString());
    await start();assert.deepEqual(db.prepare('SELECT * FROM program_starts ORDER BY user_id').all(),before);
    assert.deepEqual(db.prepare('SELECT id FROM users ORDER BY id').all(),[{id:1},{id:2}]);
    assert.equal((await get('/api/program/days/2')).status,200);
  });
});
