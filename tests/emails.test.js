import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {generateProgramReminder,validateAppUrl} from '../emails/program-reminders.js';
const subjects=[
 'Hoy es momento de escuchar lo que has callado.',
 'Amar también significa aprender a cuidarte.',
 'Decir que no también puede ser un acto de amor propio.',
 'No tienes que resolver la vida de todos.',
 'Hoy quiero que vuelvas a mirarte a ti.',
 'Llegaste al último día. Ahora comienza lo importante.'
];
for(let day=2;day<=7;day++)test(`Día ${day}: asunto, HTML, texto, nombre escapado y enlace limpio`,()=>{
 const email=generateProgramReminder(day,'Ana <script> & "María"', 'https://example.com');
 assert.equal(email.subject,subjects[day-2]);
 assert.match(email.html,/Hola, Ana &lt;script&gt; &amp; &quot;María&quot;\./);
 assert.doesNotMatch(email.html,/<script>/);assert.ok(email.text.includes('Hola, Ana <script> & "María".'));
 const links=[...email.html.matchAll(/href="([^"]+)"/g)].map(match=>match[1]);assert.equal(links.length,2);
 for(const link of links){const url=new URL(link);assert.equal(url.origin,'https://example.com');assert.equal(url.pathname,'/programa-7-dias.html');assert.equal(url.search,`?dia=${day}`);assert.equal(url.hash,'');}
 assert.ok(email.text.includes(`https://example.com/programa-7-dias.html?dia=${day}`));assert.match(email.html,/Continuar mi transformación/);
 assert.doesNotMatch(email.html,/\{\{nombre\}\}/);
});
test('APP_URL del entorno y rechazo de URLs locales, credenciales, parámetros y días inválidos',()=>{
 const previous=process.env.APP_URL;process.env.APP_URL='https://example.org';
 try{assert.ok(generateProgramReminder(2,'Richard').text.includes('https://example.org/'));}finally{if(previous===undefined)delete process.env.APP_URL;else process.env.APP_URL=previous;}
 for(const url of [undefined,'','http://example.com','https://localhost','https://localhost.','https://example.local','https://example.internal','https://127.0.0.1','https://10.0.0.1','https://[::1]','https://[fc00::1]','https://2130706433','https://example.com:8443','https://name:secret@example.com','https://example.com/?token=abc','https://example.com/#secret','https://example.com/path','javascript:alert(1)'])assert.throws(()=>validateAppUrl(url),String(url));
 for(const day of [1,8,2.5,'2',null])assert.throws(()=>generateProgramReminder(day,'Richard','https://example.com'));
 for(const name of ['',null,'x'.repeat(121)])assert.throws(()=>generateProgramReminder(2,name,'https://example.com'));
});
test('Regreso tras login: solo destinos internos permitidos, conserva dia=2–7',async()=>{
 const source=fs.readFileSync(new URL('../cuenta.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('const requestedNext='),source.indexOf('function setMode'));
 for(const next of ['/programa-7-dias.html?dia=2','/programa-7-dias.html?dia=7','https://evil.example','//evil.example','/programa-7-dias.html?dia=8','/programa-7-dias.html?dia=2&next=https://evil.example']){
  const result=vm.runInNewContext(code+'next',{params:new URLSearchParams({next})});
  assert.equal(result,/^\/programa-7-dias\.html\?dia=[2-7]$/.test(next)?next:'/mi-espacio.html');
 }
 const server=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');const start=server.indexOf("    const day = page === 'programa-7-dias'");const end=server.indexOf('\n    sendPage',start);
 const route=new (Object.getPrototypeOf(async function(){}).constructor)('page','req','res','getUser',server.slice(start,end));
 for(const day of ['2','7','8',['2','3'],'2&token=secret']){
  let location;await route('programa-7-dias',{query:{dia:day}},{redirect:value=>location=value},()=>null);
  const target=new URL(location,'http://localhost').searchParams.get('next');
  assert.equal(target,typeof day==='string'&&/^[1-7]$/.test(day)?`/programa-7-dias.html?dia=${day}`:'/programa-7-dias.html');
 }
});
test('Enlace abre una sola vez el día disponible; nunca abre el bloqueado',()=>{
 const source=fs.readFileSync(new URL('../programa-7-dias.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('function render(data)'),source.indexOf('function tick()'));
 const clicked=[];
 const cards=Array.from({length:7},(_,i)=>({day:i+1,article:{querySelector:()=>({textContent:''}),classList:{toggle(){}},scrollIntoView(){}},button:{click(){clicked.push(i+1)},setAttribute(){}},region:{hidden:true,replaceChildren(){}}}));
 const context=vm.createContext({cards,state:null,receivedAt:0,start:{},message:{textContent:''},performance:{now:()=>0},requestedDay:3,openRequestedDay:true,tick(){}});
 vm.runInContext(code,context);
 context.data={startedAt:'2026-01-01',availableDays:1,completedDays:[]};vm.runInContext('render(data)',context);assert.deepEqual(clicked,[]);assert.equal(cards[2].button.disabled,true);
 context.data.availableDays=3;vm.runInContext('render(data);render(data)',context);assert.deepEqual(clicked,[3]);
});
