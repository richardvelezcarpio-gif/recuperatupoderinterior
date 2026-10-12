const year=document.getElementById('year');if(year)year.textContent=new Date().getFullYear();
const menu=document.getElementById('menuToggle'),nav=document.getElementById('nav');
function closeMenu(){nav?.classList.remove('open');menu?.setAttribute('aria-expanded','false');menu?.setAttribute('aria-label','Abrir menú');}
menu?.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Cerrar menú':'Abrir menú');});
nav?.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));
document.addEventListener('keydown',event=>{if(event.key==='Escape'){const open=nav?.classList.contains('open');closeMenu();if(open)menu?.focus();}});
document.addEventListener('click',event=>{if(nav&&!nav.contains(event.target)&&!menu?.contains(event.target))closeMenu();});
