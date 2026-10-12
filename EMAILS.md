# Recordatorios del programa — plantillas y Gmail SMTP

Gmail SMTP está preparado para llamadas explícitas. No hay envíos automáticos, tareas programadas ni cambios de SQLite.

`generateProgramReminder(day, name, publicUrl = process.env.APP_URL)` en `emails/program-reminders.js` devuelve `{subject, html, text}` para los días 2–7. Usa los mensajes suministrados y escapa el nombre en HTML. El mensaje no lleva destinatario, secretos ni respuestas del programa. Solo incluye el número del día en el enlace.

## Vista previa local

Desde la carpeta del proyecto, con Node 22:

```sh
APP_URL=https://example.com node scripts/preview-email.js 2 "Richard"
```

El comando muestra las rutas de un HTML y un TXT temporales. Abre el HTML en el navegador. `example.com` sirve únicamente como dominio de muestra para la vista previa; no hay envíos ni debe usarse como dominio de producción. Cambia el número para visualizar los días 3–7.

## APP_URL y navegación

Cuando exista el sitio público, configura `APP_URL=https://tu-dominio-publico.com` en `.env` o en el entorno del servidor. La validación exige HTTPS y un nombre DNS público, sin IP literal, host local, dominio interno, puerto alternativo, ruta, credenciales, query ni fragmento. Es una validación sintáctica: antes de activar envíos habrá que comprobar que el dominio resuelve públicamente, tiene HTTPS válido y pertenece al sitio. No se realiza ninguna petición de red al generar plantillas.

El botón apunta a `/programa-7-dias.html?dia=N`. El inicio de sesión conserva ese destino interno validado. El cliente abre el día solicitado solo cuando el servidor informa que está disponible; la petición del contenido mantiene la comprobación de 24 horas existente. Un enlace no inicia el calendario ni concede acceso a días futuros.

## Pruebas relevantes

```sh
node --test tests/emails.test.js tests/smtp.test.js tests/program.test.js
```

## Pendiente para otra fase

Dominio público y HTTPS, integración de envío con el programa, selección de usuarios y preferencias de recordatorios, programación según inicio y plazo, registro de envíos/idempotencia para evitar duplicados y gestión de errores/reintentos. Las frases «ya está disponible» solo deben enviarse después del desbloqueo correspondiente. Nada de esto está activado en esta fase.

## Gmail SMTP (fase 6B)

Con Node 22, la configuración local es:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=recuperatupoderinterior.oficial@gmail.com
SMTP_PASS=
```

En la cuenta oficial, activa la verificación en dos pasos y crea una contraseña de aplicación desde [la configuración de Google](https://support.google.com/accounts/answer/185833?hl=es). Si Google no ofrece esta opción, revisa las restricciones de la cuenta indicadas allí. Usa esa contraseña de aplicación, no la contraseña habitual de Gmail.

Abre `.env` localmente en tu editor y completa `SMTP_PASS` manualmente. No la pegues en chats, comandos de terminal, capturas, registros ni `.env.example`. `.env` está excluido de Git y tiene permisos de lectura/escritura solo para su propietario. Conserva esos permisos y revoca la contraseña en Google si se expone. La variable del entorno del proceso tiene prioridad sobre `.env`.

Desde la carpeta del proyecto:

```sh
npm run email:verify
```

Este comando comprueba conexión TLS y autenticación mediante `transporter.verify()`; no envía correos, no necesita `APP_URL` y no garantiza entrega en la bandeja de entrada. Si falta `SMTP_PASS`, falla antes de conectar. Los errores se muestran sin respuestas SMTP originales ni credenciales. Documentación: [Nodemailer SMTP](https://nodemailer.com/smtp).

`emails/smtp.js` exporta `createProgramMailer()`, con `verify()` y `sendProgramReminder({to, day, name})`. El módulo no envía al importarlo y no está conectado a rutas ni temporizadores. Quien lo utilice debe cargar primero `config.js` para leer `.env`; el comando de verificación ya lo hace. El envío explícito exige `APP_URL` público válido y utiliza las plantillas existentes de los días 2–7. Tanto el remitente como `Reply-To` son el correo oficial; las respuestas se atienden manualmente en Gmail. No se leen respuestas privadas del programa.

Las pruebas de `tests/smtp.test.js` inyectan un transporte simulado: no conectan con Gmail ni envían mensajes reales. Una futura integración deberá comprobar el desbloqueo del destinatario antes de solicitar un envío.
