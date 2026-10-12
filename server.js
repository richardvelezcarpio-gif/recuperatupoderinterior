import {createDatabase} from './database.js';
import {createApp} from './app.js';
const db=createDatabase();
try {
 const app=await createApp({db,writesEnabled:process.env.APP_WRITES_ENABLED==='true'});
 const server=app.listen(Number(process.env.PORT||5173),process.env.HOST||'127.0.0.1',()=>console.log(`Recupera tu Poder Interior: http://localhost:${server.address().port} (PostgreSQL; escrituras ${process.env.APP_WRITES_ENABLED==='true'?'activas':'bloqueadas'})`));
 server.on('error',async()=>{console.error('No se pudo iniciar el servidor.');await db.close();process.exitCode=1;});
 for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(async()=>{await db.close();process.exit(0);}));
} catch {console.error('Inicio PostgreSQL fallido; revisa conexión TLS y configuración del administrador.');await db.close();process.exitCode=1;}
