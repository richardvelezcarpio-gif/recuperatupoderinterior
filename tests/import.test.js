import {test} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {tables,readSnapshot,fingerprint,connectionOptions,transfer} from '../scripts/import-core.js';
const data={users:[{id:9007199254740993n,name:'Prueba',email:'test@example.invalid',password_hash:'a'.repeat(32)+':'+ 'b'.repeat(128),marketing:1n,created_at:'2026-01-01 00:00:00'}],sessions:[],program_starts:[],program_answers:[]};
function mock({occupied=false,corrupt=false,failAt=''}={}) {
  const calls=[],stored={};
  return {calls,async query(sql,args) {
    calls.push(sql);
    if(failAt && sql.startsWith(failAt)) throw new Error('PRIVATE');
    if(sql.includes('information_schema')) return {rows:Object.entries(tables).flatMap(([table_name,s])=>s.columns.map(column_name=>({table_name,column_name,data_type:s.integers.includes(column_name)?'bigint':'text'})))};
    if(sql.startsWith('SELECT 1')) return {rows:occupied?[{}]:[]};
    if(sql.includes('pg_get_serial_sequence')) return {rows:[{name:'rpi_private.users_id_seq'}]};
    if(sql.startsWith('INSERT')) {const table=sql.match(/rpi_private\.(\w+)/)[1]; (stored[table]??=[]).push(Object.fromEntries(tables[table].columns.map((c,i)=>[c,args[i]])));}
    if(sql.startsWith('SELECT ') && sql.includes('FROM rpi_private.')) {const table=sql.match(/FROM rpi_private\.(\w+)/)[1]; return {rows:corrupt?[]:stored[table]||[]};}
    return {rows:[]};
  }};
}
test('TLS obligatorio y sin parámetros que sustituyan SSL',()=>{
  const env={DATABASE_URL:'postgresql://test:fake@localhost:5432/test'};
  assert.equal(connectionOptions(env).ssl.rejectUnauthorized,true);
  assert.throws(()=>connectionOptions({...env,DATABASE_URL:env.DATABASE_URL+'?sslmode=disable'}));
  assert.throws(()=>connectionOptions({...env,NODE_TLS_REJECT_UNAUTHORIZED:'0'}));
});
test('Huellas preservan BIGINT y detectan modificaciones',()=>{
  assert.equal(fingerprint('users',data.users),fingerprint('users',data.users.map(r=>({...r,id:String(r.id),marketing:'1'}))));
  assert.notEqual(fingerprint('users',data.users),fingerprint('users',data.users.map(r=>({...r,name:'Otro'}))));
  assert.throws(()=>fingerprint('users',[{...data.users[0],name:'a\0b'}]));
});
test('Verificación previa no inserta ni ajusta secuencia',async()=>{
  const c=mock();await transfer(c,data);assert.ok(c.calls.includes('ROLLBACK'));assert.ok(!c.calls.some(s=>/INSERT|ALTER|COMMIT/.test(s)));
});
test('Importación parametrizada, bloqueada y ajuste transaccional exacto',async()=>{
  const c=mock();await transfer(c,data,{importData:true});
  assert.ok(c.calls.some(s=>s.startsWith('LOCK TABLE')));
  assert.ok(c.calls.some(s=>s.includes('VALUES ($1,$2,$3,$4,$5,$6)')));
  assert.ok(c.calls.includes('ALTER SEQUENCE rpi_private.users_id_seq RESTART WITH 9007199254740994'));
  assert.equal(c.calls.at(-1),'COMMIT');
});
for(const options of [{occupied:true},{corrupt:true},{failAt:'INSERT'},{failAt:'ALTER SEQUENCE'},{failAt:'COMMIT'}]) test('Rollback ante '+JSON.stringify(options),async()=>{
  const c=mock(options);await assert.rejects(transfer(c,data,{importData:true}),e=>!e.message.includes('PRIVATE'));assert.equal(c.calls.at(-1),'ROLLBACK');
});
test('SQLite real temporal: lectura intacta, datos completos, sesión nula y JSON inválido rechazados',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rpi-import-test-'));const file=path.join(dir,'test.sqlite');
  const db=new Database(file);
  try {
    db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,marketing INTEGER NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
    CREATE TABLE program_starts(user_id INTEGER PRIMARY KEY REFERENCES users(id),started_at INTEGER NOT NULL CHECK(started_at>=0));
    CREATE TABLE program_answers(user_id INTEGER NOT NULL REFERENCES users(id),day INTEGER NOT NULL CHECK(day BETWEEN 1 AND 7),reflection TEXT NOT NULL,questions TEXT NOT NULL,exercise TEXT NOT NULL,completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN(0,1)),updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,day));`);
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(...Object.values(data.users[0]));
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('c'.repeat(64),data.users[0].id,123n);
    db.prepare('INSERT INTO program_starts VALUES(?,?)').run(data.users[0].id,0n);
    db.prepare('INSERT INTO program_answers VALUES(?,?,?,?,?,?,?)').run(data.users[0].id,1,'Reflexión','["uno","dos","tres"]','Ejercicio',1,123);
    const before=fs.readFileSync(file);const result=readSnapshot(file);
    assert.equal(result.users[0].id,data.users[0].id);assert.equal(result.program_answers[0].questions,'["uno","dos","tres"]');assert.deepEqual(fs.readFileSync(file),before);
    db.exec('UPDATE sessions SET token_hash=NULL');assert.throws(()=>readSnapshot(file));
    db.prepare('UPDATE sessions SET token_hash=?').run('c'.repeat(64));db.exec("UPDATE program_answers SET questions='invalid'");assert.throws(()=>readSnapshot(file));
  } finally {db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
