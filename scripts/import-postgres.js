import {databasePath} from '../config.js';
import pg from 'pg';
import {readSnapshot,connectionOptions,transfer,tables,classifyError} from './import-core.js';
const mode=process.argv[2];
let client;
let stage='arguments';
try {
  if(process.argv.length!==3 || !['--check','--import','--local-check'].includes(mode)) throw new Error('Usa --check, --import o --local-check.');
  stage='sqlite';
  const data=readSnapshot(databasePath);
  stage='postgres';
  if(mode==='--local-check') console.log(JSON.stringify({sqlite:'verificado',counts:Object.fromEntries(Object.keys(tables).map(t=>[t,data[t].length]))}));
  else {
    client=new pg.Client(connectionOptions(process.env));
    // Consumir errores asíncronos sin imprimir mensajes del proveedor.
    client.on('error',()=>{});
    await client.connect();
    const report=await transfer(client,data,{importData:mode==='--import'});
    console.log(JSON.stringify({status:mode==='--import'?'Importación confirmada':'Requisitos verificados; no se importaron datos',tables:report}));
  }
} catch (error) {
  const safe=classifyError(error,stage);
  console.error(`[${safe.code}] ${safe.message}`);
  process.exitCode=1;
} finally {if(client) await client.end().catch(()=>{});}
