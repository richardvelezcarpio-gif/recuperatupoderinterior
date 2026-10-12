import pg from 'pg';
import fs from 'node:fs';
import {root} from './config.js';
import path from 'node:path';

export function createDatabase({env=process.env,schema='rpi_private'}={}) {
  if(schema!=='rpi_private' && !/^rpi_test_[a-f0-9]+$/.test(schema)) throw Error('Esquema no permitido.');
  if(env.NODE_TLS_REJECT_UNAUTHORIZED==='0') throw Error('TLS debe estar habilitado.');
  let u;try {u=new URL(env.DATABASE_URL);} catch {throw Error('Configura DATABASE_URL.');}
  if(!['postgres:','postgresql:'].includes(u.protocol)||!u.password||!u.username||!u.hostname||u.search||u.hash) throw Error('DATABASE_URL inválida.');
  const options={host:u.hostname,port:Number(u.port||5432),user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),database:decodeURIComponent(u.pathname.slice(1)),ssl:{rejectUnauthorized:true,minVersion:'TLSv1.2',ca:fs.readFileSync(path.join(root,'certs/supabase-prod-ca-2021.crt'),'utf8')},max:5,connectionTimeoutMillis:15000,idleTimeoutMillis:10000,statement_timeout:15000};
  const pool=new pg.Pool(options);pool.on('error',()=>console.error('Error de conexión PostgreSQL.'));
  function wrap(executor) {
    function prepare(sql) {
      let n=0;
      sql=sql.replace(/\?/g,()=>'$'+(++n)).replace(/\b(FROM|JOIN|INTO|UPDATE)\s+(users|sessions|program_starts|program_answers)\b/gi,(_,verb,table)=>`${verb} ${schema}.${table}`);
      const query=async args=>{
        const result=await executor.query(sql,args);
        // Solo BIGINT: pg lo entrega como texto. No convertir campos de texto numérico.
        for(const field of result.fields||[]) if(field.dataTypeID===20) for(const row of result.rows){if(row[field.name]!==null){const value=Number(row[field.name]);if(!Number.isSafeInteger(value))throw Error('Entero fuera de rango seguro.');row[field.name]=value;}}
        return result;
      };
      return {all:async(...args)=>(await query(args)).rows,get:async(...args)=>(await query(args)).rows[0],run:async(...args)=>{const r=await query(args);return {changes:r.rowCount,lastInsertRowid:r.rows[0]?.id};}};
    }
    return {prepare,async transaction(fn){
      if(executor!==pool) return fn(wrap(executor));
      const client=await pool.connect();try{await client.query('BEGIN');const value=await fn(wrap(client));await client.query('COMMIT');return value;}catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
    },close:()=>pool.end()};
  }
  return wrap(pool);
}
