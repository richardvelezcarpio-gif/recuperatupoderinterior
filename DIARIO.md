# Mi Diario Interior — gratuito y privado

Implementación local; pendiente de migración y publicación. No usa membresías ni pagos.

## Publicación (requiere autorización separada)
1. Revisar y ejecutar `migrations/002_diary.sql` completo en una base aislada primero; comprobar restricciones, índices, RLS y permisos. No ejecutar `001_initial_postgres.sql`, importadores ni `npm test` completo.
2. Obtener autorización específica y disponer de recuperación de la base antes de ejecutar 002 en el Supabase existente. Es incremental e idempotente para una tabla creada por esta misma migración; si ya existe una tabla con diferente estructura, detenerse y revisar. No modifica las cuatro tablas previas.
3. Confirmar que rpi_private no esté expuesto por Data API y que el backend use el propietario previsto. RLS sin políticas deniega acceso directo; el propietario puede acceder, por lo que el aislamiento del backend es obligatorio.
4. Publicar el commit autorizado después de la migración. No activar APP_WRITES_ENABLED en Preview mientras comparta base con Production. Mantener ALLOWED_ORIGINS exactos.
5. Verificar HTTPS, redirección a login, CRUD y aislamiento en entorno aislado. No crear usuarios ni reflexiones de prueba en producción sin permiso.

## Privacidad y límites
`/mi-diario.html` y `/mi-diario.js` requieren sesión. API `/api/diary` obtiene user_id exclusivamente de ella; administradores no tienen excepción. El panel administrativo no consulta el diario. No analytics, IA, correo ni persistencia del borrador en localStorage. El texto se renderiza con textContent/value. Todas las consultas están parametrizadas y delimitadas por user_id.

Título opcional de 120 caracteres, reflexión obligatoria de 2000, pregunta opcional de 300; siete emociones opcionales. Historial de 20 entradas por página, orden estable por fecha e ID, búsqueda literal sin distinción de mayúsculas, fecha local con selector nativo. Las preguntas rotan entre siete temas y se puede escribir libremente. Sin vencimiento programado ni límite temporal vinculado al programa de siete días.

Las búsquedas usan POST con JSON para no incluir palabras privadas en URLs. No registrar cuerpos HTTP ni añadir grabación de sesiones/analítica a estas rutas en la infraestructura. El cifrado en reposo depende de Supabase; no es cifrado de extremo a extremo y el propietario de la base puede leer datos. La privacidad respecto a otros usuarios y al panel se impone en la aplicación.

Guardados reintentables con request_key por usuario; versiones evitan sobrescrituras concurrentes (409). No se vacía el editor por errores y se avisa antes de abandonar o descartar un borrador. El borrador vive solo en memoria: cerrar forzosamente el navegador o perder energía puede perder texto no guardado. Guardar antes de cerrar. La fecha original no se altera al editar. Eliminar requiere confirmación y versión vigente.

## Pruebas
`npm run test:safe` usa datos sintéticos y no escribe en PostgreSQL. La migración SQL aún requiere ejecución autorizada en una base aislada para verificar comportamiento PostgreSQL real. No se ejecuta al arrancar la aplicación. Sin migración, los endpoints del diario fallan con un error genérico 503, sin impedir las herramientas existentes.
