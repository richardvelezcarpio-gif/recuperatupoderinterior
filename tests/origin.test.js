import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createApp} from '../app.js';
import {allowedOriginsConfig} from '../config.js';

const origin='https://academy.example';
const body=JSON.stringify({reflection:'Fixture',questions:['a','b','c'],exercise:'Fixture'});

test('Configuración explícita, HTTPS y fallo cerrado',()=>{
  for(const value of [undefined,'','null','*','https://*.example',origin+',',origin+',http://external.example',origin+'/',origin+'/path',origin+'?x=1','https://user:pass@academy.example','https://localhost:5173','http://academy.example']) {
    assert.equal(allowedOriginsConfig({NODE_ENV:'production',ALLOWED_ORIGINS:value}).size,0);
  }
  assert.deepEqual([...allowedOriginsConfig({NODE_ENV:'production',ALLOWED_ORIGINS:origin+', https://preview.example'})],[origin,'https://preview.example']);
  for(const value of ['http://localhost:5173','http://127.0.0.1:5173','http://[::1]:5173']) assert.equal(allowedOriginsConfig({NODE_ENV:'development',ALLOWED_ORIGINS:value}).size,1);
  for(const value of ['http://localhost','http://localhost:80','https://localhost','http://localhost.evil:5173']) assert.equal(allowedOriginsConfig({NODE_ENV:'development',ALLOWED_ORIGINS:value}).size,0);
  assert.equal(allowedOriginsConfig({NODE_ENV:'development',VERCEL:'1',ALLOWED_ORIGINS:'http://localhost:5173'}).size,0);
});

async function fixture(t, origins=origin, writesEnabled=true) {
  let writes=0;
  const now=1700000000000;
  const db={prepare(sql){return {
    async get(){
      if(sql.includes('FROM sessions'))return {id:1,name:'Fixture',email:'member@example.invalid'};
      if(sql.includes('FROM program_starts'))return {started_at:now};
      if(sql.includes('FROM program_answers'))return undefined;
      throw Error('Consulta simulada inesperada');
    },async all(){if(sql.includes('FROM program_answers'))return [];throw Error('Consulta simulada inesperada');},
    async run(){assert.match(sql,/^(INSERT INTO program_starts|INSERT INTO program_answers|DELETE FROM program_answers)/);writes++;return {changes:1};}
  };}};
  const app=await createApp({db,now:()=>now,writesEnabled,adminEnv:{},originEnv:{NODE_ENV:'production',ALLOWED_ORIGINS:origins}});
  assert.equal(app.get('trust proxy'),false);
  const server=app.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve)}));
  function request({method='PUT',path='/api/program/days/1/answers',headers={},payload=body,rawHeaders}={}) {
    return new Promise((resolve,reject)=>{
      const h={'Content-Type':'application/json',Cookie:'rpi_session=fixture',Origin:origin,...headers};
      for(const k of Object.keys(h))if(h[k]===undefined)delete h[k];
      if(method !== 'GET' && payload != null) h['Content-Length']=Buffer.byteLength(payload);
      const req=http.request({host:'127.0.0.1',port:server.address().port,path,method,headers:rawHeaders||h},res=>{res.resume();res.on('end',()=>resolve(res.statusCode))});
      req.on('error',reject);req.end(method === 'GET' ? undefined : payload);
    });
  }
  return {request,writes:()=>writes};
}

test('Origen autorizado sobre HTTP interno; proxies no conceden permisos',async t=>{
  const f=await fixture(t);
  for(const headers of [{},{Host:'internal.invalid','X-Forwarded-Proto':'https'},{Host:'evil.example','X-Forwarded-Host':'evil.example','X-Forwarded-Proto':'http, https'}]){
    const before=f.writes();assert.equal(await f.request({headers}),200);assert.equal(f.writes(),before+1);
  }
});

test('Orígenes rechazados nunca escriben',async t=>{
  const f=await fixture(t);
  for(const value of [undefined,'null','','https://evil.example',origin+'/',origin+'/path',origin+':444',origin+', https://evil.example',origin+' https://evil.example','http://academy.example','https://user@academy.example']){
    assert.equal(await f.request({headers:{Origin:value,Host:'evil.example','X-Forwarded-Host':'academy.example','X-Forwarded-Proto':'https'}}),403);
    assert.equal(f.writes(),0);
  }
  assert.equal(await f.request({rawHeaders:['Host','academy.example','Content-Type','application/json','Cookie','rpi_session=fixture','Origin',origin,'Origin',origin]}),403);
  assert.equal(f.writes(),0);
});

test('JSON, cross-site, sesión, permisos y día bloqueado conservados',async t=>{
  const f=await fixture(t);
  const cases=[
    [{headers:{'Content-Type':'text/plain'}},403],
    [{headers:{'Sec-Fetch-Site':'cross-site'}},403],
    [{payload:'{'},400],
    [{payload:'{}'},400],
    [{headers:{Cookie:undefined}},401],
    [{path:'/api/program/days/2/answers'},403],
    [{path:'/api/admin/users',method:'GET',payload:undefined},403]
  ];
  for(const [options,status] of cases){assert.equal(await f.request(options),status);assert.equal(f.writes(),0);}
  for(const [method,path] of [['POST','/api/program/start'],['POST','/api/program/days/1/complete'],['DELETE','/api/program/days/1/answers']]){
    assert.equal(await f.request({method,path,headers:{Origin:undefined}}),403);assert.equal(f.writes(),0);
  }
  assert.equal(await f.request({method:'GET',path:'/api/program/status',headers:{Origin:undefined},payload:undefined}),200);
});

test('Configuración ausente o inválida bloquea escrituras; lecturas disponibles',async t=>{
  for(const value of ['',origin+',http://evil.example']){
    const f=await fixture(t,value);assert.equal(await f.request(),403);assert.equal(f.writes(),0);
    assert.equal(await f.request({method:'GET',path:'/api/program/status',payload:undefined}),200);
  }
});

test('Mantenimiento conserva precedencia y no escribe',async t=>{
  const f=await fixture(t,origin,false);assert.equal(await f.request(),503);assert.equal(f.writes(),0);
});
