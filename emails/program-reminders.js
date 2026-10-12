const templates = {
  "2": {
    "title": "Lo que callas también te lastima",
    "subject": "Hoy es momento de escuchar lo que has callado.",
    "paragraphs": [
      "Hola, {{nombre}}.",
      "Ayer comenzaste un camino importante: volver a escucharte.",
      "Hoy quiero preguntarte algo…",
      "¿Cuántas veces has guardado silencio para no perder a alguien, aunque por dentro te estuvieras lastimando?",
      "Tu segundo día ya está disponible."
    ]
  },
  "3": {
    "title": "No todo lo que amas te hace bien",
    "subject": "Amar también significa aprender a cuidarte.",
    "paragraphs": [
      "Hola, {{nombre}}.",
      "Hoy quiero hacerte una pregunta que quizá no sea fácil responder.",
      "¿Estás permaneciendo en alguna situación porque la amas, aunque sabes que te está quitando tranquilidad?",
      "No tienes que resolverlo todo hoy. Pero sí puedes comenzar a reconocer lo que sientes.",
      "Tu tercer día está disponible."
    ]
  },
  "4": {
    "title": "Aprender a poner límites sin culpa",
    "subject": "Decir que no también puede ser un acto de amor propio.",
    "paragraphs": [
      "Hola, {{nombre}}.",
      "¿Cuántas veces has aceptado algo que no querías solamente para evitar que alguien se molestara contigo?",
      "Hoy vamos a reflexionar sobre los límites y sobre esa culpa que a veces sentimos cuando comenzamos a elegirnos.",
      "Tu cuarto día ya está disponible."
    ]
  },
  "5": {
    "title": "Deja de cargar lo que no te corresponde",
    "subject": "No tienes que resolver la vida de todos.",
    "paragraphs": [
      "Hola, {{nombre}}.",
      "Quiero preguntarte algo…",
      "¿Quién está cuidando de ti mientras intentas solucionar los problemas de los demás?",
      "Hoy vamos a reconocer esas responsabilidades que hemos asumido y que quizá nunca nos correspondieron.",
      "Tu quinto día ya está disponible."
    ]
  },
  "6": {
    "title": "Reconstruye la relación contigo",
    "subject": "Hoy quiero que vuelvas a mirarte a ti.",
    "paragraphs": [
      "Hola, {{nombre}}.",
      "Has dedicado mucho tiempo a comprender a los demás.",
      "Pero ¿cuándo fue la última vez que te preguntaste qué necesitas tú para sentirte bien contigo mismo?",
      "Hoy vamos a hablar de tu valor, tus sueños y los compromisos que mereces cumplir contigo.",
      "Tu sexto día está disponible."
    ]
  },
  "7": {
    "title": "La vida que decides construir",
    "subject": "Llegaste al último día. Ahora comienza lo importante.",
    "paragraphs": [
      "Hola, {{nombre}}.",
      "Llegaste al séptimo día de este recorrido.",
      "Quizá todavía tengas preguntas, heridas o situaciones que resolver. Y está bien reconocerlo.",
      "Pero quiero preguntarte algo…",
      "¿Qué vas a hacer con todo lo que has descubierto sobre ti?",
      "Hoy vamos a construir un compromiso para los próximos treinta días.",
      "Tu séptimo día ya está disponible."
    ]
  }
};

const escapeHtml = value => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function validateAppUrl(value) {
  let url;
  try {url = new URL(value);} catch {throw new Error('Configura APP_URL con el origen HTTPS de tu dominio público.');}
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  // Solo nombres DNS públicos: sin IP literales, hosts locales ni dominios internos.
  const domain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
  const privateSuffix = /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion|lan|home|arpa)$/i;
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      url.pathname !== '/' || (url.port && url.port !== '443') || !domain.test(host) || privateSuffix.test(host)) {
    throw new Error('APP_URL debe ser un origen HTTPS con dominio público, sin puerto alternativo, rutas, credenciales ni parámetros.');
  }
  return url.origin;
}
// Función pura: prepara mensajes, no conecta con proveedores ni envía correos.
export function generateProgramReminder(day, name, publicUrl = process.env.APP_URL) {
  if (!Number.isInteger(day) || day < 2 || day > 7) throw new Error('El día del recordatorio debe ser un entero entre 2 y 7.');
  if (typeof name !== 'string' || !name.trim() || name.length > 120) throw new Error('El nombre debe tener entre 1 y 120 caracteres.');
  const origin = validateAppUrl(publicUrl);
  const link = new URL(`/programa-7-dias.html?dia=${day}`, origin).href;
  const person = name.trim().replace(/\s+/g, ' ');
  const template = templates[day];
  const paragraphs = template.paragraphs.map(paragraph => paragraph.replace('{{nombre}}', () => person));
  const button = 'Continuar mi transformación';
  const text = `${paragraphs.join('\n\n')}\n\n${button}: ${link}\n`;
  const html = `<!doctype html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(template.subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f5f2ed;color:#25221f;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f5f2ed"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;border:1px solid #e5ddcf"><tr><td style="padding:32px 24px">
<p style="margin:0 0 20px;font-size:12px;letter-spacing:2px;color:#76572c">RECUPERA TU PODER INTERIOR · DÍA ${day}</p>
<h1 style="font-size:26px;line-height:1.3;margin:0 0 26px;color:#25221f">${escapeHtml(template.title)}</h1>
${paragraphs.map(paragraph => `<p style="margin:0 0 20px;font-size:16px;line-height:1.7">${escapeHtml(paragraph)}</p>`).join('\n')}
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#db9b47" style="border-radius:6px;text-align:center"><a href="${escapeHtml(link)}" style="display:inline-block;padding:16px 24px;border:1px solid #db9b47;color:#1b1209;font-size:16px;line-height:1.5;font-weight:bold;text-decoration:none">${button}</a></td></tr></table>
<p style="margin:24px 0 0;color:#655e54;font-size:13px;line-height:1.6">Si el botón no se abre, copia este enlace en tu navegador:<br><a href="${escapeHtml(link)}" style="color:#76572c;word-break:break-all">${escapeHtml(link)}</a></p>
</td></tr></table></td></tr></table></body></html>`;
  return {subject: template.subject, html, text};
}
