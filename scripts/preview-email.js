import '../config.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateProgramReminder} from '../emails/program-reminders.js';
try {
  const day = Number(process.argv[2] || 2);
  const name = process.argv[3] || 'Richard';
  const email = generateProgramReminder(day, name);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rpi-email-preview-'));
  for (const type of ['html','text']) fs.writeFileSync(path.join(directory,`dia-${day}.${type === 'text' ? 'txt' : type}`), email[type],{mode:0o600});
  console.log('Vista previa local; no se ha enviado ningún correo.');
  console.log('Asunto: ' + email.subject);
  console.log(path.join(directory,`dia-${day}.html`));
  console.log(path.join(directory,`dia-${day}.txt`));
} catch(error) {console.error(error.message); process.exitCode=1;}
