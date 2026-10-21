const $=id=>document.getElementById(id);
const questions=[['Amor propio','¿Qué necesidad tuya merece atención hoy?'],['Creencias y PNL','¿Qué frase limitante te repites y cómo podrías reformularla de manera realista y amable?'],['Prosperidad','¿Qué recurso o habilidad tienes y qué pequeño paso puedes dar para cuidarlo?'],['Gratitud','¿Qué gesto sencillo de hoy agradeces y por qué?'],['Metas y visión','¿Qué te gustaría construir y cuál sería el primer paso?'],['Disciplina personal','¿Qué compromiso pequeño y sostenible puedes cumplir hoy?'],['Fe y conexión espiritual','¿Qué te ayuda a sentir esperanza o conexión con algo significativo para ti?'],['Amor propio','¿Cómo te hablarías si fueras tu mejor amigo?'],['Creencias y PNL','¿Qué evidencia te invita a revisar una creencia que te limita?'],['Prosperidad','¿Cómo puedes definir una vida suficiente según tus propios valores?'],['Gratitud','¿Qué aprendizaje difícil puedes reconocer sin negar lo que sentiste?'],['Metas y visión','¿Qué decisión de hoy te acerca a la persona que quieres ser?'],['Disciplina personal','¿Qué obstáculo puedes hacer más pequeño para empezar?'],['Fe y conexión espiritual','¿Qué práctica de calma o contemplación quieres regalarte?']];
let questionIndex=Math.floor(Date.now()/86400000)%questions.length,entry=null,dirty=false,busy=false,offset=0,requestKey=crypto.randomUUID(),revision=0,searchRun=0,pendingCreate=null;
const message=t=>$('feedback').textContent=t;
const data=()=>({title:$('title').value,reflection:$('reflection').value,emotion:$('emotion').value,prompt:$('prompt').textContent});
function changed(){dirty=true;revision++;}
$('editor').addEventListener('input',changed);
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
async function api(path,method='GET',body){
 let r;try{r=await fetch('/api/diary'+path,{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});}catch{throw Error('No hay conexión. Tu texto sigue aquí; vuelve a intentar guardarlo.');}
 if(r.status===401){$('login').hidden=false;throw Error('Tu sesión venció. Inicia sesión en otra pestaña y vuelve aquí para guardar tu texto.');}
 const result=await r.json().catch(()=>({error:'No se pudo completar la operación. Tu texto permanece aquí.'}));
 if(!r.ok)throw Error(result.error||'No se pudo completar la operación.');$('login').hidden=true;return result;
}
function editing(row){entry=row;$('title').value=row?.title||'';$('reflection').value=row?.reflection||'';$('emotion').value=row?.emotion||'';$('prompt').textContent=row?.prompt||'';$('prompt').hidden=!row?.prompt;$('delete').hidden=!row;$('entry-date').textContent=row?'Creada: '+new Date(row.created_at).toLocaleString('es'):'La fecha se registra al guardar.';dirty=false;revision++;requestKey=crypto.randomUUID();pendingCreate=null;}
function discard(){return !dirty||confirm('Tienes texto sin guardar. ¿Quieres descartarlo?');}
function locking(value){busy=value;for(const id of ['save','delete','new','guided','free','title','reflection','emotion'])$(id).disabled=value;}
$('guided').onclick=()=>{const q=questions[questionIndex++%questions.length];$('prompt').textContent=q[0]+': '+q[1];$('prompt').hidden=false;changed();};
$('free').onclick=()=>{$('prompt').textContent='';$('prompt').hidden=true;changed();};
$('new').onclick=()=>{if(!busy&&discard()){editing(null);message('Una página nueva para escucharte.');$('reflection').focus();}};
$('editor').onsubmit=async e=>{
 e.preventDefault();if(busy)return;locking(true);const currentRevision=revision;
 try{
  let result;
  if(entry)result=await api('/'+entry.id,'PUT',{...data(),version:entry.version});
  else{pendingCreate ||= {...data(),request_key:requestKey};result=await api('','POST',pendingCreate);
   // A timed-out creation can be retried without duplicates. Save any newer draft afterwards.
   if(JSON.stringify(data())!==JSON.stringify({title:pendingCreate.title,reflection:pendingCreate.reflection,emotion:pendingCreate.emotion,prompt:pendingCreate.prompt})){
    entry=result.entry;pendingCreate=null;result=await api('/'+entry.id,'PUT',{...data(),version:entry.version});
   }
  }
  entry=result.entry;pendingCreate=null;dirty=revision!==currentRevision;$('delete').hidden=false;$('entry-date').textContent='Creada: '+new Date(entry.created_at).toLocaleString('es');message(dirty?'Entrada guardada; tienes cambios posteriores pendientes.':'Tu entrada está guardada.');await loadHistory();
 }catch(e){message(e.message);}finally{locking(false);}
};
$('delete').onclick=async()=>{if(!entry||busy||!confirm('¿Eliminar definitivamente esta entrada? Esta acción no se puede deshacer.'))return;locking(true);try{await api('/'+entry.id,'DELETE',{version:entry.version});editing(null);message('Entrada eliminada.');await loadHistory();}catch(e){message(e.message);}finally{locking(false);}};
async function loadHistory(){const run=++searchRun;$('history-status').textContent='Buscando…';try{
 const date=$('date').value;const localDay=date?new Date(date+'T00:00:00'):new Date();const timezone=localDay.getTimezoneOffset();const nextDay=new Date(localDay);nextDay.setDate(nextDay.getDate()+1);const endTimezone=nextDay.getTimezoneOffset();
 const result=await api('/search','POST',{q:$('search').value,emotion:$('filter-emotion').value,date,offset,timezone,endTimezone});if(run!==searchRun)return;
 $('history').replaceChildren();for(const row of result.entries){const article=document.createElement('article');article.className='entry';const button=document.createElement('button');button.className='secondary';button.textContent=row.title||'Sin título';button.onclick=async()=>{if(busy||!discard())return;locking(true);try{const r=await api('/'+row.id);editing(r.entry);message('Entrada abierta.');$('reflection').focus();}catch(e){message(e.message);}finally{locking(false);}};const meta=document.createElement('p');meta.className='hint';meta.textContent=new Date(row.created_at).toLocaleString('es')+(row.emotion?' · '+row.emotion:'');article.append(button,meta);$('history').append(article);}
 $('history-status').textContent=result.entries.length?'Más recientes primero.':'No hay entradas para estos filtros.';$('previous').disabled=offset===0;$('more').disabled=!result.hasMore;$('page').textContent='Página '+(offset/20+1);
 }catch(e){if(run===searchRun)$('history-status').textContent=e.message;}}
$('filters').onsubmit=e=>{e.preventDefault();offset=0;loadHistory();};$('clear').onclick=()=>{$('filters').reset();offset=0;loadHistory();};$('more').onclick=()=>{offset+=20;loadHistory();};$('previous').onclick=()=>{offset=Math.max(0,offset-20);loadHistory();};
loadHistory();
