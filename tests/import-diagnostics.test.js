import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyError,connectionOptions,transfer} from '../scripts/import-core.js';
test('Clasifica códigos sin filtrar detalles privados',()=>{
 for(const [code,expected] of Object.entries({ENOTFOUND:'DNS_ERROR',ECONNREFUSED:'CONNECTION_ERROR','28P01':'AUTH_ERROR',DEPTH_ZERO_SELF_SIGNED_CERT:'TLS_ERROR','42501':'PERMISSION_ERROR','42P01':'TABLE_MISSING',TARGET_NOT_EMPTY:'TARGET_NOT_EMPTY',SQLITE_CORRUPT:'SQLITE_INVALID'})) {
  const safe=classifyError({code,message:'SECRET',detail:'SECRET',stack:'SECRET'});
  assert.equal(safe.code,expected);assert.ok(!JSON.stringify(safe).includes('SECRET'));
 }
 assert.equal(classifyError(new Error('Tenant or user not found')).code,'AUTH_ERROR');
 assert.equal(classifyError(new Error('SECRET'),'sqlite').code,'SQLITE_INVALID');
 assert.equal(classifyError(new Error('SECRET')).code,'UNKNOWN_ERROR');
});
test('URL ausente, mal formada y TLS inseguro se distinguen',()=>{
 for(const [env,code] of [[{},'URL_MISSING'],[{DATABASE_URL:'secret'},'URL_INVALID'],[{DATABASE_URL:'postgres://x:%ZZ@localhost/db'},'URL_INVALID'],[{NODE_TLS_REJECT_UNAUTHORIZED:'0'},'TLS_ERROR']]) {
  assert.throws(()=>connectionOptions(env),e=>e.code===code);
 }
});
test('Transfer conserva diagnóstico seguro tras rollback',async()=>{
 const calls=[];const client={async query(sql){calls.push(sql);if(sql==='BEGIN')throw Object.assign(new Error('SECRET'),{code:'42501'});if(sql.includes('information_schema'))throw Object.assign(new Error('SECRET'),{code:'42P01'});return {rows:[]};}};
 await assert.rejects(transfer(client,{}),e=>e.code==='TABLE_MISSING'&&!e.message.includes('SECRET'));
 assert.equal(calls.at(-1),'ROLLBACK');
});
