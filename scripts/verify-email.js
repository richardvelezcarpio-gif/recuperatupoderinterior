import '../config.js';
import {createProgramMailer} from '../emails/smtp.js';

try {
  await createProgramMailer().verify();
  console.log('Conexión y autenticación SMTP verificadas. No se ha enviado ningún correo.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
