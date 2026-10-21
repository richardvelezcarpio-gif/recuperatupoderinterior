import crypto from 'node:crypto';
export const emotions=['Feliz','Tranquilo','Agradecido','Triste','Ansioso','Enojado','Esperanzado'];
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const fields='id,title,reflection,emotion,prompt,created_at,updated_at,version';
export function mountDiary(app,{db,getUser,now=Date.now,allowedOrigins=new Set()}){
 app.use('/api/diary',async(req,res,next)=>{
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  const user=await getUser(req);if(!user)return res.status(401).json({error:'Inicia sesión para acceder a tu diario.'});
  if(!['GET','HEAD'].includes(req.method)&&(!req.is('application/json')||req.get('Sec-Fetch-Site')==='cross-site'||!allowedOrigins.has(req.get('Origin'))||req.rawHeaders.filter((v,i)=>i%2===0&&v.toLowerCase()==='origin').length!==1))return res.status(403).json({error:'Abre el diario desde el sitio autorizado.'});
  req.diaryUserId=user.id;next();
 });
 const bad=res=>res.status(400).json({error:'Revisa los campos y sus límites.'});
 const own=(req)=>db.prepare(`SELECT ${fields} FROM diary_entries WHERE id=? AND user_id=?`).get(req.params.id,req.diaryUserId);
 const missing=res=>res.status(404).json({error:'Entrada no disponible.'});
 function valid(b,create){return b&&typeof b==='object'&&!Array.isArray(b)&&Object.keys(b).every(k=>['title','reflection','emotion','prompt',create?'request_key':'version'].includes(k))&&['title','reflection','prompt'].every(k=>typeof b[k]==='string'&&!b[k].includes('\u0000'))&&b.title.length<=120&&b.reflection.trim().length>0&&b.reflection.length<=2000&&b.prompt.length<=300&&(b.emotion===''||emotions.includes(b.emotion))&&(create?uuid(b.request_key):Number.isSafeInteger(b.version)&&b.version>0);}
 async function list(req,res){
  const b=req.method==='GET'?{}:req.body;
  if(!b||Array.isArray(b)||Object.keys(b).some(k=>!['q','emotion','date','offset','timezone','endTimezone'].includes(k)))return bad(res);
  const {q='',emotion='',date='',offset=0,timezone=0,endTimezone=timezone}=b;
  if(typeof q!=='string'||q.length>120||q.includes('\u0000')||!(emotion===''||emotions.includes(emotion))||typeof date!=='string'||!Number.isSafeInteger(offset)||offset<0||offset>1000000||!Number.isInteger(timezone)||Math.abs(timezone)>840||!Number.isInteger(endTimezone)||Math.abs(endTimezone)>840)return bad(res);
  let start=0,end=8640000000000000;
  if(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)return bad(res);start=Date.parse(date)+timezone*60000;end=Date.parse(date)+86400000+endTimezone*60000;if(end<=start||end-start>93600000)return bad(res);}
  // Search text travels in the JSON body, never in the URL or logs.
  const rows=await db.prepare(`SELECT ${fields} FROM diary_entries WHERE user_id=? AND (?='' OR emotion=?) AND created_at>=? AND created_at<? AND (LOWER(title) LIKE ? ESCAPE '!' OR LOWER(reflection) LIKE ? ESCAPE '!') ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET ?`).all(req.diaryUserId,emotion,emotion,start,end,'%'+q.toLowerCase().replace(/[!%_]/g,'!$&')+'%','%'+q.toLowerCase().replace(/[!%_]/g,'!$&')+'%',offset);
  res.json({entries:rows.slice(0,20),hasMore:rows.length>20});
 }
 app.get('/api/diary',list);app.post('/api/diary/search',list);
 app.get('/api/diary/:id',async(req,res)=>{if(!uuid(req.params.id))return missing(res);const row=await own(req);return row?res.json({entry:row}):missing(res);});
 app.post('/api/diary',async(req,res)=>{
  const b=req.body;if(!valid(b,true))return bad(res);const time=now();
  await db.prepare('INSERT INTO diary_entries(id,user_id,request_key,title,reflection,emotion,prompt,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,1) ON CONFLICT(user_id,request_key) DO NOTHING').run(crypto.randomUUID(),req.diaryUserId,b.request_key,b.title,b.reflection,b.emotion,b.prompt,time,time);
  const row=await db.prepare(`SELECT ${fields} FROM diary_entries WHERE user_id=? AND request_key=?`).get(req.diaryUserId,b.request_key);res.status(201).json({entry:row});
 });
 app.put('/api/diary/:id',async(req,res)=>{
  if(!uuid(req.params.id))return missing(res);const b=req.body;if(!valid(b,false))return bad(res);
  const result=await db.prepare('UPDATE diary_entries SET title=?,reflection=?,emotion=?,prompt=?,updated_at=?,version=version+1 WHERE id=? AND user_id=? AND version=?').run(b.title,b.reflection,b.emotion,b.prompt,now(),req.params.id,req.diaryUserId,b.version);
  if(!result.changes){if(!await own(req))return missing(res);return res.status(409).json({error:'Esta entrada cambió en otra ventana. Tu texto sigue aquí: cópialo antes de recargar la entrada.'});}res.json({entry:await own(req)});
 });
 app.delete('/api/diary/:id',async(req,res)=>{
  if(!uuid(req.params.id))return missing(res);const b=req.body;if(!b||Object.keys(b).length!==1||!Number.isSafeInteger(b.version)||b.version<1)return bad(res);
  const result=await db.prepare('DELETE FROM diary_entries WHERE id=? AND user_id=? AND version=?').run(req.params.id,req.diaryUserId,b.version);
  if(!result.changes){if(!await own(req))return missing(res);return res.status(409).json({error:'La entrada cambió en otra ventana. Recárgala antes de eliminarla.'});}res.json({ok:true});
 });
 // No request bodies, personal text, or database errors are logged.
 app.use('/api/diary',(error,req,res,next)=>{
  if(error.type==='entity.parse.failed')return res.status(400).json({error:'JSON no válido.'});
  if(error.type==='entity.too.large')return res.status(413).json({error:'El texto excede el tamaño permitido.'});
  return res.status(503).json({error:'No se pudo completar la operación. Conserva tu texto e inténtalo de nuevo.'});
 });
}
