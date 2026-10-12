const questions=[
'¿Te cuesta decir que no por miedo a decepcionar a alguien?',
'¿Dejas tus necesidades para el final cuando alguien te necesita?',
'¿Tu tranquilidad depende de cómo otra persona te responde?',
'¿Evitas conversaciones importantes para no perder una relación?',
'¿Te culpas cuando decides priorizar tu bienestar?',
'¿Buscas constantemente la aprobación de los demás?',
'¿Mantienes situaciones que te hacen daño por miedo a empezar de nuevo?',
'¿Te resulta difícil reconocer lo que realmente deseas para ti?'
];
const labels=['Casi nunca','A veces','Con frecuencia','Casi siempre'];
const answers=Array(questions.length).fill(null);let step=0;
const el=id=>document.getElementById(id);
function render(){el('counter').textContent=`Pregunta ${step+1} de ${questions.length}`;el('bar').style.width=`${step/questions.length*100}%`;el('question').textContent=questions[step];el('choices').replaceChildren();labels.forEach((label,i)=>{const b=document.createElement('button');b.className='choice'+(answers[step]===i?' selected':'');b.textContent=label;b.setAttribute('aria-pressed',String(answers[step]===i));b.addEventListener('click',()=>{answers[step]=i;render()});el('choices').append(b)});el('back').disabled=step===0;el('next').disabled=answers[step]===null;el('next').textContent=step===questions.length-1?'Ver mi reflexión →':'Siguiente →'}
el('start').onclick=()=>{el('intro').classList.add('hidden');el('quiz').classList.remove('hidden');render()};
el('back').onclick=()=>{if(step>0){step--;render()}};
el('next').onclick=()=>{if(answers[step]===null)return;if(step<questions.length-1){step++;render();return}const total=answers.reduce((a,b)=>a+b,0);let msg;if(total<=7)msg='Tus respuestas sugieren que reconoces muchos de tus límites. Reflexiona sobre qué hábito te ayuda a sostener tu paz y cómo puedes fortalecerlo.';else if(total<=15)msg='Quizá en algunas situaciones te cuesta priorizarte. Observa en qué momentos dices sí cuando realmente quisieras decir no. Un límite pequeño también es un comienzo.';else msg='Tus respuestas invitan a mirar cuánto espacio ocupan las expectativas ajenas en tu vida. Pregúntate: ¿qué necesito hoy para sentirme escuchado por mí mismo? Puedes comenzar con un paso pequeño y seguro.';el('reflection').textContent=msg;el('quiz').classList.add('hidden');el('result').classList.remove('hidden')};
el('restart').onclick=()=>{answers.fill(null);step=0;el('result').classList.add('hidden');el('intro').classList.remove('hidden')};
