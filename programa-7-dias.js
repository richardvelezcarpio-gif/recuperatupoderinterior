const requestedDayValue = new URLSearchParams(location.search).get('dia');
const requestedDay = /^[1-7]$/.test(requestedDayValue || '') ? Number(requestedDayValue) : 0;
let openRequestedDay = Boolean(requestedDay);
const grid = document.querySelector('#days-grid');
const start = document.querySelector('#start-program');
const message = document.querySelector('#program-status');
const countdown = document.querySelector('#countdown');
let state = null;
let receivedAt = 0;
let checking = false;
const cards = [];
for (let day = 1; day <= 7; day++) {
  const article = document.createElement('article');
  article.className = 'day-card is-locked';
  article.innerHTML = `<p class="eyebrow gold">DÍA ${String(day).padStart(2, '0')} <span class="day-time">· 5 MIN</span></p><h2 id="titulo-dia-${day}">Día ${day}</h2><button class="btn btn-primary day-toggle" type="button" disabled aria-expanded="false" aria-controls="contenido-dia-${day}">🔒 Día ${day} bloqueado</button><p class="completion-label">Pendiente</p><div class="day-content" id="contenido-dia-${day}" role="region" aria-labelledby="titulo-dia-${day}" hidden></div>`;
  article.setAttribute('aria-labelledby', `titulo-dia-${day}`);
  const button = article.querySelector('button');
  const region = article.querySelector('.day-content');
  button.addEventListener('click', async () => {
    if (!region.hidden) {if(region.querySelector('form')?.dataset.dirty === 'true' && !window.confirm('Tienes cambios sin guardar. ¿Cerrar este día y descartarlos?')) return; region.replaceChildren(); region.hidden = true; button.setAttribute('aria-expanded', 'false'); button.textContent = `Abrir día ${day} ↗`; return;}
    button.disabled = true;
    try {
      const data = await request(`/api/program/days/${day}`);
      article.querySelector('h2').textContent = data.title;
      region.replaceChildren();
      renderEditor(region, data, article);
      region.hidden = false; button.setAttribute('aria-expanded', 'true'); button.textContent = `Cerrar día ${day} −`;
    } catch (error) {message.textContent = error.message; await refresh();}
    finally {button.disabled = !state || day > state.availableDays;}
  });
  cards.push({day, article, button, region}); grid.append(article);
}
async function request(url, options = {}) {
  const response = await fetch(url, {credentials: 'same-origin', cache: 'no-store', ...options});
  if (response.status === 401) {location.replace('/acceso.html?mode=login&next=' + encodeURIComponent('/programa-7-dias.html' + (requestedDay ? `?dia=${requestedDay}` : ''))); throw Error('Inicia sesión para continuar.');}
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'No se pudo consultar el programa.');
  return data;
}
function render(data) {
  state = data; receivedAt = performance.now(); start.hidden = Boolean(data.startedAt);
  message.textContent = data.startedAt ? (data.availableDays === 7 ? 'Tus siete días están disponibles.' : `Tienes ${data.availableDays} ${data.availableDays === 1 ? 'día disponible' : 'días disponibles'}.`) : 'Pulsa Comenzar programa para abrir el día 1. Los siguientes se abrirán cada 24 horas.';
  for (const {day, article, button, region} of cards) {
    const locked = day > data.availableDays;
    article.querySelector('.completion-label').textContent = data.completedDays.includes(day) ? '✓ Completado' : 'Pendiente';
    article.classList.toggle('is-locked', locked); button.disabled = locked;
    if (locked) {region.hidden = true; region.replaceChildren(); article.querySelector('h2').textContent = `Día ${day}`; button.setAttribute('aria-expanded', 'false');}
    button.textContent = locked ? `🔒 Día ${day} bloqueado` : `${region.hidden ? 'Abrir' : 'Cerrar'} día ${day} ${region.hidden ? '↗' : '−'}`;
  }
  tick();
  if (openRequestedDay) {
    if (requestedDay <= data.availableDays) {
      openRequestedDay = false;
      const card = cards[requestedDay - 1];
      card.button.click(); // El contenido se vuelve a autorizar en el servidor.
      card.article.scrollIntoView({block:'start'});
    } else {
      message.textContent += ` El día ${requestedDay} del enlace todavía no está disponible.`;
    }
  }
}
function tick() {
  if (!state || state.remainingMs === null) {countdown.textContent = ''; return;}
  // Solo una estimación visual. Abrir un día siempre exige autorización del servidor.
  const seconds = Math.max(0, Math.ceil((state.remainingMs - (performance.now() - receivedAt)) / 1000));
  if (!seconds) {countdown.textContent = 'Comprobando el próximo desbloqueo con el servidor…'; return;}
  const hours = Math.floor(seconds / 3600); const minutes = Math.floor(seconds % 3600 / 60); const rest = seconds % 60;
  countdown.textContent = `Día ${state.availableDays + 1}: faltan ${hours} h ${String(minutes).padStart(2,'0')} min ${String(rest).padStart(2,'0')} s.`;
}
async function refresh() {
  if (checking) return;
  checking = true;
  try {render(await request('/api/program/status'));}
  catch (error) {message.textContent = `${error.message} Vuelve a actualizar la página si el problema continúa.`;}
  finally {checking = false;}
}
start.addEventListener('click', async () => {
  start.disabled = true;
  try {render(await request('/api/program/start', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'}));}
  catch (error) {message.textContent = error.message;}
  finally {start.disabled = false;}
});
setInterval(() => {
  tick();
  if (state?.remainingMs !== null && state && performance.now() - receivedAt >= state.remainingMs && !document.hidden) refresh();
}, 1000);
setInterval(() => {if (!document.hidden) refresh();}, 30000);
window.addEventListener('pageshow', refresh);
window.addEventListener('focus', refresh);
document.addEventListener('visibilitychange', () => {if (!document.hidden) refresh();});
refresh();

function renderEditor(region, data, article) {
  const day = data.day;
  const form = document.createElement('form'); form.className = 'answer-form'; form.dataset.dirty = 'false';
  const fields = [];
  function paragraph(tag, text) {const node=document.createElement(tag); node.textContent=text; form.append(node);}
  function field(label, value) {
    const wrapper=document.createElement('label'); wrapper.textContent=label;
    const input=document.createElement('textarea'); input.maxLength=500; input.rows=4; input.value=value;
    wrapper.append(input); form.append(wrapper); fields.push(input);
  }
  paragraph('h3','Reflexión'); data.description.split(/\n\s*\n/).forEach(text=>paragraph('p',text));
  field('Mi reflexión',data.answers.reflection);
  paragraph('h3','Tres preguntas');
  data.questions.forEach((question,index)=>field(`${index+1}. ${question}`,data.answers.questions[index]));
  paragraph('h3','Ejercicio práctico'); paragraph('p',data.exercise);
  field('Mi experiencia con el ejercicio',data.answers.exercise);
  if(data.commitment){paragraph('h3','Compromiso');paragraph('p',data.commitment);}
  paragraph('p',data.commitment?'Hasta 500 caracteres por campo.':'Hasta 500 caracteres por campo. Los textos de este día son provisionales.');
  const actions=document.createElement('div'); actions.className='answer-actions';
  const save=document.createElement('button'); save.type='submit'; save.className='btn btn-primary';save.textContent='Guardar mis respuestas';
  const complete=document.createElement('button');complete.type='button';complete.className='answer-secondary';complete.textContent='Marcar día como completado';
  const remove=document.createElement('button');remove.type='button';remove.className='answer-secondary';remove.textContent='Eliminar respuestas';
  actions.append(save,complete,remove);form.append(actions);
  const feedback=document.createElement('p');feedback.className='answer-feedback';feedback.setAttribute('role','status');form.append(feedback);
  form.addEventListener('input',()=>{form.dataset.dirty='true';feedback.textContent='Cambios sin guardar.';});
  function values(){return {reflection:fields[0].value,questions:fields.slice(1,4).map(field=>field.value),exercise:fields[4].value};}
  async function submit(action) {
    if(action==='delete' && !window.confirm('¿Eliminar definitivamente las respuestas de este día? El día volverá a pendiente. Esta acción no se puede deshacer.'))return;
    const elements=[...fields,save,complete,remove];elements.forEach(element=>element.disabled=true);
    feedback.textContent='Procesando…';
    try {
      const result=await request(`/api/program/days/${day}/${action==='complete'?'complete':'answers'}`,{method:action==='delete'?'DELETE':action==='complete'?'POST':'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='delete'?{}:values())});
      if(action==='delete')fields.forEach(field=>field.value='');
      form.dataset.dirty='false';
      article.querySelector('.completion-label').textContent=result.answers.completed?'✓ Completado':'Pendiente';
      feedback.textContent=action==='delete'?'Respuestas eliminadas.':action==='complete'?'Respuestas guardadas. Día completado.':'Respuestas guardadas.';
      await refresh();
    } catch(error){feedback.textContent=error.message;}
    finally {elements.forEach(element=>element.disabled=false);}
  }
  form.addEventListener('submit',event=>{event.preventDefault();submit('save');});
  complete.addEventListener('click',()=>submit('complete'));
  remove.addEventListener('click',()=>submit('delete'));
  region.append(form);
}
window.addEventListener('beforeunload',event=>{if(document.querySelector('form[data-dirty="true"]')){event.preventDefault();event.returnValue='';}});
