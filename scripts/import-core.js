import Database from 'better-sqlite3';
import {createHash} from 'node:crypto';

export const tables = {
  users: {columns:['id','name','email','password_hash','marketing','created_at'], integers:['id','marketing']},
  sessions: {columns:['token_hash','user_id','expires_at'], integers:['user_id','expires_at']},
  program_starts: {columns:['user_id','started_at'], integers:['user_id','started_at']},
  program_answers: {columns:['user_id','day','reflection','questions','exercise','completed','updated_at'], integers:['user_id','day','completed','updated_at']}
};

const diagnostics = {
  URL_MISSING: 'Falta DATABASE_URL en el entorno privado.',
  URL_INVALID: 'DATABASE_URL mal formada o con parámetros no admitidos.',
  DNS_ERROR: 'No se pudo resolver el host PostgreSQL.',
  CONNECTION_ERROR: 'No se pudo establecer o mantener la conexión PostgreSQL.',
  AUTH_ERROR: 'PostgreSQL rechazó el usuario o la contraseña.',
  TLS_ERROR: 'No se pudo validar la conexión TLS o su certificado.',
  PERMISSION_ERROR: 'Permisos insuficientes para acceder al esquema privado o sus tablas.',
  TABLE_MISSING: 'Falta una tabla requerida o el esquema rpi_private.',
  TARGET_NOT_EMPTY: 'Una de las tablas PostgreSQL ya contiene registros.',
  SQLITE_INVALID: 'SQLite no supera la comprobación de integridad, relaciones o compatibilidad.',
  PG_SCHEMA_INVALID: 'El esquema PostgreSQL o su secuencia no coincide con la migración.',
  DATA_MISMATCH: 'Los recuentos o huellas del destino no coinciden.',
  UNKNOWN_ERROR: 'Fallo no clasificado; no se muestran detalles privados.'
};
function diagnosticError(code) {return Object.assign(new Error(diagnostics[code]), {code});}
export function classifyError(error, stage = '') {
  const code = typeof error?.code === 'string' ? error.code : '';
  let category = Object.hasOwn(diagnostics, code) ? code : 'UNKNOWN_ERROR';
  if (['ENOTFOUND','EAI_AGAIN','EAI_FAIL'].includes(code)) category='DNS_ERROR';
  else if (['ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','EPIPE','08001','08006','57P01','53300'].includes(code)) category='CONNECTION_ERROR';
  else if (['28P01','28000'].includes(code)) category='AUTH_ERROR';
  else if (/^(ERR_TLS_|ERR_SSL_|CERT_|DEPTH_ZERO_|SELF_SIGNED_|UNABLE_TO_(VERIFY|GET_ISSUER))/.test(code)) category='TLS_ERROR';
  else if (code==='42501') category='PERMISSION_ERROR';
  else if (['42P01','3F000'].includes(code)) category='TABLE_MISSING';
  else if (code.startsWith('SQLITE_') || stage==='sqlite') category='SQLITE_INVALID';
  // Algunos errores de pg/Supavisor no tienen código. Solo se inspecciona;
  // jamás se imprime el mensaje, detalle, stack ni cause originales.
  if (category==='UNKNOWN_ERROR') {
    const message=String(error?.message || '');
    if (/tenant or user not found|password authentication failed|authentication failed/i.test(message)) category='AUTH_ERROR';
    else if (/certificate|self.signed|TLS|SSL/i.test(message)) category='TLS_ERROR';
    else if (/timeout|timed out|connection terminated|connection closed/i.test(message)) category='CONNECTION_ERROR';
  }
  return {code:category,message:diagnostics[category]};
}

const fail = () => {throw new Error('Datos o esquema incompatibles; importación cancelada.');};
export function fingerprint(table, rows) {
  const {columns,integers} = tables[table];
  const normalized = rows.map(row => JSON.stringify(columns.map(column => {
    const value=row[column];
    if(value===null && table==='users' && column==='created_at') return null;
    if(integers.includes(column)) {
      if(!['bigint','string','number'].includes(typeof value) || !/^-?\d+$/.test(String(value)) || (typeof value==='number' && !Number.isSafeInteger(value))) fail();
      const n=BigInt(value); if(n < -9223372036854775808n || n > 9223372036854775807n) fail();
      return n.toString();
    }
    if(typeof value!=='string' || value.includes('\0') || !value.isWellFormed()) fail();
    return value;
  }))).sort();
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
export function readSnapshot(filename) {
  const db=new Database(filename,{readonly:true,fileMustExist:true});
  db.defaultSafeIntegers(true);
  try {
    db.pragma('query_only = ON'); db.exec('BEGIN');
    if(JSON.stringify(db.pragma('integrity_check'))!==JSON.stringify([{integrity_check:'ok'}]) || db.pragma('foreign_key_check').length) fail();
    const data={};
    for(const [table,{columns,integers}] of Object.entries(tables)) {
      const schema=db.pragma(`table_info(${table})`);
      if(schema.length!==columns.length || columns.some((c,i)=>schema[i].name!==c || schema[i].type!==(integers.includes(c)?'INTEGER':'TEXT'))) fail();
      data[table]=db.prepare(`SELECT ${columns.join(',')} FROM ${table}`).all();
      fingerprint(table,data[table]);
    }
    const ids=new Set(data.users.map(r=>String(r.id)));
    const emails=new Set();
    for(const r of data.users) {
      if(!/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(r.password_hash) || ![0n,1n].includes(r.marketing)) fail();
      const email=r.email.trim().toLowerCase(); if(emails.has(email)) fail(); emails.add(email);
    }
    for(const table of ['sessions','program_starts','program_answers']) for(const r of data[table]) if(!ids.has(String(r.user_id))) fail();
    for(const r of data.sessions) if(!/^[a-f0-9]{64}$/i.test(r.token_hash) || r.expires_at<0n) fail();
    for(const r of data.program_starts) if(r.started_at<0n) fail();
    for(const r of data.program_answers) {
      let questions; try {questions=JSON.parse(r.questions);} catch {fail();}
      if(r.day<1n || r.day>7n || ![0n,1n].includes(r.completed) || r.updated_at<0n || !Array.isArray(questions) || questions.length!==3 || !questions.every(q=>typeof q==='string')) fail();
    }
    nextId(data);
    return data;
  } finally {if(db.inTransaction) db.exec('ROLLBACK'); db.close();}
}
function nextId(data) {
  const max=data.users.reduce((m,r)=>BigInt(r.id)>m?BigInt(r.id):m,0n);
  if(max>=9223372036854775807n) fail();
  return (max+1n).toString();
}
export function connectionOptions(env) {
  if(env.NODE_TLS_REJECT_UNAUTHORIZED==='0') throw diagnosticError('TLS_ERROR');
  if (!env.DATABASE_URL) throw diagnosticError('URL_MISSING');
  let url; try {url=new URL(env.DATABASE_URL); for(const value of [url.username,url.password,url.pathname]) decodeURIComponent(value);} catch {throw diagnosticError('URL_INVALID');}
  if(!['postgres:','postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.password || url.pathname.length<2 || url.search || url.hash) throw diagnosticError('URL_INVALID');
  // No pasar connectionString: sus parámetros SSL pueden sustituir el objeto ssl.
  return {host:url.hostname,port:Number(url.port||5432),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:decodeURIComponent(url.pathname.slice(1)),ssl:{rejectUnauthorized:true,minVersion:'TLSv1.2'},connectionTimeoutMillis:15000,statement_timeout:60000};
}
export async function transfer(client,data,{importData=false}={}) {
  let began=false;
  try {
    await client.query(importData?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); began=true;
    await client.query("SET LOCAL lock_timeout = '10s'");
    if(importData) await client.query(`LOCK TABLE ${Object.keys(tables).map(t=>'rpi_private.'+t).join(',')} IN ACCESS EXCLUSIVE MODE`);
    const metadata=(await client.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='rpi_private' ORDER BY table_name,ordinal_position")).rows;
    for(const [table,{columns,integers}] of Object.entries(tables)) {
      const actual=metadata.filter(r=>r.table_name===table);
      if((await client.query(`SELECT 1 FROM rpi_private.${table} LIMIT 1`)).rows.length) throw diagnosticError('TARGET_NOT_EMPTY');
      if(actual.length!==columns.length || columns.some((c,i)=>actual[i].column_name!==c || actual[i].data_type!==(integers.includes(c)?'bigint':'text'))) throw diagnosticError('PG_SCHEMA_INVALID');
    }
    const sequence=(await client.query("SELECT pg_get_serial_sequence('rpi_private.users','id') AS name")).rows[0]?.name;
    if(sequence!=='rpi_private.users_id_seq') throw diagnosticError('PG_SCHEMA_INVALID');
    const report={};
    for(const [table,{columns}] of Object.entries(tables)) {
      if(importData) {
        for(const row of data[table]) await client.query(`INSERT INTO rpi_private.${table} (${columns.join(',')}) VALUES (${columns.map((_,i)=>'$'+(i+1)).join(',')})`,columns.map(c=>typeof row[c]==='bigint'?row[c].toString():row[c]));
        const rows=(await client.query(`SELECT ${columns.join(',')} FROM rpi_private.${table}`)).rows;
        if(rows.length!==data[table].length || fingerprint(table,rows)!==fingerprint(table,data[table])) throw diagnosticError('DATA_MISMATCH');
      }
      report[table]={count:data[table].length,fingerprint:fingerprint(table,data[table])};
    }
    if(importData) {
      // RESTART es transaccional; setval NO se revierte con ROLLBACK.
      // Única interpolación: entero positivo calculado desde BIGINT validado.
      await client.query(`ALTER SEQUENCE rpi_private.users_id_seq RESTART WITH ${nextId(data)}`);
      await client.query('COMMIT');
    } else await client.query('ROLLBACK');
    began=false; return report;
  } catch (error) {
    if(began) {try {await client.query('ROLLBACK');} catch {}}
    const safe = classifyError(error);
    throw Object.assign(new Error(safe.message + ' Se intentó ROLLBACK; si falló COMMIT, verificar el destino antes de reintentar.'), {code:safe.code});
  }
}
