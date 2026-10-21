import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
const source=fs.readFileSync(new URL('../mi-diario.js',import.meta.url),'utf8');
function fixture(){
 const nodes=new Map();const events={};
 function element(){return {value:'',textContent:'',hidden:false,disabled:false,children:[],addEventListener(n,f){this[n]=f;},replaceChildren(){this.children=[];},append(...a){this.children.push(...a);},focus(){},reset(){}};}
 const el=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 let fail=false,confirmed=false,requests=[];
 const fetch=async(url,options)=>{requests.push({url,...options});if(url.endsWith('/search'))return {ok:true,status:200,json:async()=>({entries:[],hasMore:false})};if(fail)throw Error('offline');return {ok:true,status:200,json:async()=>({entry:{id:'saved',created_at:1700000000000,version:1}})};};
 const context=vm.createContext({document:{getElementById:el,createElement:element},window:{addEventListener(n,f){events[n]=f;}},fetch,crypto,Date,JSON,Error,confirm:()=>confirmed});
 vm.runInContext(source,context);return {el,events,requests,setFail:v=>fail=v,setConfirm:v=>confirmed=v};
}
test('Editor conserva texto ante fallos y reutiliza clave al reintentar',async()=>{const f=fixture();f.el('title').value='Mi título';f.el('reflection').value='Texto privado sintético';f.el('editor').input();f.setFail(true);await f.el('editor').onsubmit({preventDefault(){}});assert.equal(f.el('reflection').value,'Texto privado sintético');assert.match(f.el('feedback').textContent,/conexión/);assert.equal(f.el('save').disabled,false);let prevented=false;f.events.beforeunload({preventDefault(){prevented=true;}});assert.ok(prevented);const first=f.requests.find(r=>r.url==='/api/diary').body;f.setFail(false);await f.el('editor').onsubmit({preventDefault(){}});assert.equal(f.requests.filter(r=>r.url==='/api/diary')[1].body,first);assert.match(f.el('feedback').textContent,/guardada/);});
test('Cancelar descarte o eliminación conserva la entrada y no envía DELETE',async()=>{const f=fixture();f.el('reflection').value='Conservar';f.el('editor').input();f.el('new').onclick();assert.equal(f.el('reflection').value,'Conservar');await f.el('editor').onsubmit({preventDefault(){}});await f.el('delete').onclick();assert.ok(!f.requests.some(r=>r.method==='DELETE'));assert.equal(f.el('reflection').value,'Conservar');});
test('Preguntas rotativas y escritura libre no sustituyen la reflexión',()=>{const f=fixture();f.el('reflection').value='Mi texto';const topics=new Set();for(let i=0;i<14;i++){f.el('guided').onclick();topics.add(f.el('prompt').textContent.split(':')[0]);}assert.equal(topics.size,7);f.el('free').onclick();assert.equal(f.el('reflection').value,'Mi texto');assert.equal(f.el('prompt').textContent,'');});
