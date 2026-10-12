# Estado de integración PostgreSQL

El backend activo preparado usa pg y rpi_private, con consultas parametrizadas y TLS validado mediante la CA oficial en certs/. Los hashes scrypt, sesiones y calendario no cambian. No se crean tablas al arrancar. better-sqlite3 se conserva exclusivamente para respaldo, importación y pruebas históricas aisladas; server.js/app.js/database.js no lo importan.

APP_WRITES_ENABLED=false en .env mantiene bloqueadas las mutaciones HTTP (503). No se modifican las variables ADMIN ni SMTP. DATABASE_URL es privada, ya configurada y excluida de Git. La CA se carga explícitamente en el cliente pg para que funcione aunque Node ya haya arrancado. No se desactiva rejectUnauthorized.

## Activación futura (NO ejecutada)

En la carpeta del proyecto:

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run activate
```

El comando comprueba PostgreSQL/administrador antes de iniciar. Si el puerto está ocupado, únicamente termina un servidor suspendido y su supervisor suspendido cuyo directorio sea exactamente este proyecto. Nunca reanuda el proceso antiguo SQLite. Si encuentra otro proceso, aborta. Después inicia el supervisor Node con APP_WRITES_ENABLED=true solo para ese proceso. No edita SQLite ni .env y no cambia DNS ni despliega. No ejecutar antes de autorizar escrituras.

Para una futura revisión sin escrituras: npm run dev (respeta APP_WRITES_ENABLED=false); requiere primero liberar el puerto antiguo de forma controlada. No lanzar ambos comandos simultáneamente. Para detener el nuevo supervisor, Ctrl+C; .env conserva false.

## Pruebas

Con Node 22: npm test. tests/admin.test.js crea un esquema rpi_test_<aleatorio> con datos exclusivamente ficticios y lo elimina al terminar; requiere DATABASE_URL y permiso de crear ese esquema. Nunca escribe en rpi_private. Compara los ocho registros reales con el respaldo autorizado. Comprueba registro/login, sesiones persistentes entre instancias, roles, CSV consentido, desbloqueo, edición, eliminación sintética, rollback y mantenimiento. Las demás pruebas de programa usan SQLite temporal, nunca el archivo real.

Las pruebas de navegador usan esquemas sintéticos y Chrome instalado; no añaden dependencias. La aplicación permanece suspendida hasta autorización.

## Recuperación

Ante fallo de activación no reanudar el antiguo proceso SQLite. Mantener APP_WRITES_ENABLED=false y revisar errores seguros. Después de habilitar escrituras en PostgreSQL, no volver al respaldo SQLite sin reconciliar las nuevas altas, sesiones y respuestas. SQLite y data/backups se conservan como respaldo intacto.

El limitador en memoria es adecuado al único servidor local actual; antes de escalar a varias instancias se necesitará un limitador compartido y revisar el proxy HTTPS. No se ha desplegado en Vercel.
