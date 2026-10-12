import nodemailer from 'nodemailer';
import {generateProgramReminder} from './program-reminders.js';

const officialEmail = 'recuperatupoderinterior.oficial@gmail.com';

export function createProgramMailer({env = process.env, createTransport = nodemailer.createTransport} = {}) {
  function options() {
    if (env.SMTP_HOST !== 'smtp.gmail.com' || env.SMTP_PORT !== '465' ||
        env.SMTP_SECURE !== 'true' || env.SMTP_USER !== officialEmail) {
      throw new Error('Configura Gmail SMTP según .env.example (puerto 465 y conexión segura).');
    }
    const pass = String(env.SMTP_PASS || '').replace(/\s/g, '');
    if (!pass) throw new Error('Falta SMTP_PASS: configura manualmente la contraseña de aplicación en .env.');
    return {
      host: env.SMTP_HOST, port: 465, secure: true,
      auth: {user: officialEmail, pass},
      tls: {minVersion: 'TLSv1.2', rejectUnauthorized: true},
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000
    };
  }
  async function execute(operation) {
    const config = options();
    let transport;
    try {
      transport = createTransport(config);
      return await operation(transport);
    } catch (error) {
      // Nunca propagar respuestas SMTP: pueden contener destinatarios o credenciales.
      throw new Error(error?.code === 'EAUTH'
        ? 'Gmail rechazó la autenticación. Revisa SMTP_USER y la contraseña de aplicación SMTP_PASS.'
        : 'No se pudo completar la operación SMTP. Revisa la conexión y la configuración de Gmail.');
    } finally {
      transport?.close();
    }
  }
  return {
    verify: () => execute(transport => transport.verify()),
    async sendProgramReminder({to, day, name}) {
      if (typeof to !== 'string' || to.length > 254 || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(to)) {
        throw new Error('Indica un único correo destinatario válido.');
      }
      const content = generateProgramReminder(day, name, env.APP_URL);
      return execute(transport => transport.sendMail({
        from: {name: 'Recupera tu Poder Interior', address: officialEmail},
        replyTo: officialEmail, to, ...content
      }));
    }
  };
}
