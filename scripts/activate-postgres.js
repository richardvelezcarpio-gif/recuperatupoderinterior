// Ejecutar únicamente cuando se autorice habilitar escrituras reales.
import {execFileSync,spawn} from 'node:child_process';
import path from 'node:path';
import {root,adminConfig} from '../config.js';
import {createDatabase} from '../database.js';
function command(file,args){return execFileSync(file,args,{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}
function cwd(pid){return command('/usr/sbin/lsof',['-a','-p',String(pid),'-d','cwd','-Fn']).split('\n').find(v=>v.startsWith('n'))?.slice(1);}
try {
 const db=createDatabase();try {await adminConfig(db);await db.prepare('SELECT COUNT(*) FROM users').get();}finally{await db.close();}
 const port=Number(process.env.PORT||5173);if(!Number.isInteger(port)||port<1||port>65535)throw Error();
 let listeners=[];try{listeners=command('/usr/sbin/lsof',['-t','-iTCP:'+port,'-sTCP:LISTEN']).split('\n').filter(Boolean);}catch{}
 const toStop=[];
 for(const text of new Set(listeners)) {
  const pid=Number(text);const state=command('/bin/ps',['-p',text,'-o','stat=']);
  if(cwd(pid)!==root || !state.includes('T'))throw Error();
  const parent=Number(command('/bin/ps',['-p',text,'-o','ppid=']));
  const parentArgs=command('/bin/ps',['-p',String(parent),'-o','command=']);
  const parentState=command('/bin/ps',['-p',String(parent),'-o','stat=']);
  if(cwd(parent)!==root || !parentState.includes('T') || !parentArgs.includes('--watch') || !parentArgs.includes('server.js'))throw Error();
  toStop.push(parent,pid);
 }
 // Nunca SIGCONT: el código SQLite suspendido no debe procesar peticiones pendientes.
 for(const pid of new Set(toStop))process.kill(pid,'SIGKILL');
 const child=spawn(process.execPath,['--watch','--watch-path=server.js','--watch-path=app.js','--watch-path=database.js','--watch-path=config.js','--watch-path=program.js','server.js'],{cwd:root,stdio:'inherit',env:{...process.env,APP_WRITES_ENABLED:'true',PATH:path.dirname(process.execPath)+':'+process.env.PATH}});
 child.on('error',()=>{console.error('No se pudo iniciar el supervisor.');process.exitCode=1;});
 child.on('exit',code=>{process.exitCode=code??1;});
} catch {console.error('Activación detenida: verifica PostgreSQL, administrador y que el puerto esté libre o pertenezca al servidor suspendido de este proyecto.');process.exitCode=1;}
