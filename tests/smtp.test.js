import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProgramMailer} from '../emails/smtp.js';
const address = 'recuperatupoderinterior.oficial@gmail.com';
const config = {SMTP_HOST:'smtp.gmail.com', SMTP_PORT:'465', SMTP_SECURE:'true', SMTP_USER:address, SMTP_PASS:'simulated-password', APP_URL:'https://example.com'};
function mock(env = config, failure) {
  const calls = {verify:0, messages:[], closed:0, created:0};
  const mailer = createProgramMailer({env, createTransport(options) {
    calls.created++; calls.options = options;
    return {
      async verify() {calls.verify++; if(failure) throw failure; return true;},
      async sendMail(message) {calls.messages.push(message); if(failure) throw failure; return {messageId:'simulated'};},
      close() {calls.closed++;}
    };
  }});
  return {mailer, calls};
}
test('Verificación segura sin enviar y sin requerir APP_URL', async () => {
  const {mailer,calls} = mock({...config, APP_URL:''});
  assert.equal(calls.created,0);
  assert.equal(await mailer.verify(),true);
  assert.equal(calls.verify,1); assert.equal(calls.messages.length,0); assert.equal(calls.closed,1);
  assert.equal(calls.options.port,465); assert.equal(calls.options.secure,true);
  assert.equal(calls.options.tls.rejectUnauthorized,true);
  assert.equal(calls.options.auth.user,address);
  assert.equal(calls.options.logger,false); assert.equal(calls.options.debug,false);
  assert.equal(calls.options.disableFileAccess,true); assert.equal(calls.options.disableUrlAccess,true);
});
test('Reutiliza las seis plantillas con remitente y respuestas al correo oficial', async () => {
  const {mailer,calls} = mock();
  for(let day=2;day<=7;day++) await mailer.sendProgramReminder({to:'ana@example.com',day,name:'Ana'});
  assert.equal(calls.messages.length,6); assert.equal(calls.closed,6);
  calls.messages.forEach((message,index) => {
    assert.equal(message.from.address,address); assert.equal(message.replyTo,address);
    assert.equal(message.to,'ana@example.com'); assert.ok(message.subject);
    assert.ok(message.html.includes(`dia=${index+2}`)); assert.ok(message.text.includes(`dia=${index+2}`));
    assert.ok(!JSON.stringify(message).includes(config.SMTP_PASS));
  });
});
test('Configuración incompleta o insegura no crea transporte', async () => {
  for(const patch of [{SMTP_PASS:''},{SMTP_HOST:'evil.example'},{SMTP_PORT:'587'},{SMTP_SECURE:'false'},{SMTP_USER:'other@example.com'}]) {
    const {mailer,calls} = mock({...config,...patch});
    await assert.rejects(mailer.verify()); assert.equal(calls.created,0);
  }
});
test('Valida destinatario, día y dominio antes de conectar', async () => {
  const {mailer,calls} = mock();
  for(const to of ['a@example.com\r\nBcc:x@example.com','a@example.com,b@example.com','bad', ['a@example.com']]) {
    await assert.rejects(mailer.sendProgramReminder({to,day:2,name:'Ana'}));
  }
  await assert.rejects(mailer.sendProgramReminder({to:'a@example.com',day:8,name:'Ana'}));
  assert.equal(calls.created,0);
  const invalid = mock({...config,APP_URL:'http://localhost:5173'});
  await assert.rejects(invalid.mailer.sendProgramReminder({to:'a@example.com',day:2,name:'Ana'}));
  assert.equal(invalid.calls.created,0);
});
test('Errores SMTP saneados y transporte cerrado tanto al verificar como al enviar', async () => {
  for(const code of ['EAUTH','ECONNECTION']) {
    const {mailer,calls} = mock(config,Object.assign(new Error(`private ${config.SMTP_PASS}`),{code}));
    for(const run of [()=>mailer.verify(),()=>mailer.sendProgramReminder({to:'a@example.com',day:2,name:'Ana'})]) {
      await assert.rejects(run(),error => !error.message.includes(config.SMTP_PASS) && !error.message.includes('private'));
    }
    assert.equal(calls.closed,2);
  }
});
