# Recupera tu Poder Interior — V4

Node.js 22 LTS y Express, con PostgreSQL alojado en Supabase como backend actual. La aplicación utiliza `pg` y el esquema `rpi_private`; la autenticación y las sesiones son propias de la aplicación, no Supabase Auth. SQLite se conserva como almacenamiento heredado, respaldo y soporte de pruebas históricas e importación.

## Desarrollo local

Usa Node **22.13 o posterior de la rama 22** (`nvm use` si utilizas nvm). `better-sqlite3` es un módulo nativo: no alternes Node 22 y Node 26 con el mismo `node_modules`.

```bash
npm install
cp .env.example .env # Solo la primera vez, si .env aún no existe.
npm run dev
```

Antes de iniciar, configura `DATABASE_URL` con una base de desarrollo independiente y conserva `APP_WRITES_ENABLED=false` hasta autorizar escrituras. No reutilices credenciales de producción para desarrollo o pruebas. El arranque no crea tablas ni ejecuta migraciones; la configuración administrativa puede consultar la base.

Abre http://localhost:5173. El servidor local escucha únicamente en `127.0.0.1` por defecto. Mantén el mismo hostname al entrar e iniciar sesión: `localhost` y `127.0.0.1` no comparten cookies.

En este Mac, Node 22 también está disponible mediante:

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
```

## Asignar la cuenta administradora

Este procedimiento requiere autorización para escrituras y una base de desarrollo independiente.

1. Registra tu cuenta desde http://localhost:5173/acceso.html si todavía no existe.
2. En una terminal dentro del proyecto, ejecuta:

```bash
npm run admin:set -- tu-correo@ejemplo.com
```

3. Reinicia `npm run dev` si no se reinició automáticamente.
4. Abre **http://localhost:5173/admin.html** e inicia sesión con esa cuenta.

Este comando local comprueba que la cuenta ya exista y escribe `ADMIN_EMAIL` y `ADMIN_USER_ID` en `.env`, con permisos de lectura/escritura solo para el propietario. No modifica usuarios, contraseñas ni sesiones. No existe una API pública para asignar administradores. Para cambiar de administrador, repite el comando con otra cuenta existente. Para deshabilitarlo, deja ambos valores vacíos y reinicia.

El ID debe coincidir con el correo normalizado de la cuenta existente. No se promueve automáticamente al primer registrado ni a alguien que registre un correo reservado después del arranque. Si hay una configuración parcial, inválida o ambigua, el servidor rechaza el arranque. Las variables exportadas en la terminal tienen prioridad sobre `.env`; elimina asignaciones antiguas de `ADMIN_EMAIL` y `ADMIN_USER_ID` si contradicen el archivo.

`config.js` carga `.env` desde la carpeta del proyecto, independientemente del directorio de ejecución. `.env`, sus variantes locales y `data/` están excluidos de Git; `.env.example` no contiene credenciales. La cuenta administradora local se guarda únicamente en `.env`.

## Sesiones y seguridad

Las sesiones se guardan en PostgreSQL y duran siete días, también después de reiniciar el servidor. Se conserva el formato de contraseñas scrypt. La cookie es `HttpOnly`, `SameSite=Lax` y se marca `Secure` en producción (requiere HTTPS). `DATABASE_URL` selecciona el backend actual; `DATABASE_PATH` corresponde a herramientas y datos SQLite heredados y no cambia la conexión PostgreSQL.

`/admin`, `/admin.html` y **todas** las API bajo `/api/admin` comprueban identidad y autorización en el servidor. Una sesión normal no implica permisos administrativos. La página de denegación permite iniciar sesión con otra cuenta y conserva el diseño oscuro y dorado.

Se sirven las páginas y scripts públicos enumerados explícitamente y los recursos de `/assets/`. No se publican la base SQLite, código del servidor, configuraciones, scripts ni dependencias.

## Usuarios y exportación

El panel muestra nombre, correo, consentimiento y fecha de registro (UTC), en páginas de veinte registros. Nunca devuelve contraseñas ni hashes. El CSV incluye únicamente `marketing=1`, respeta la retirada de consentimiento y escapa comillas y fórmulas de hojas de cálculo. Ambas operaciones requieren administrador.

## Pruebas

La selección siguiente usa simulaciones y lecturas de código, sin conexiones PostgreSQL ni envíos SMTP reales:

```bash
node --test tests/emails.test.js tests/smtp.test.js tests/import-diagnostics.test.js
```

Ejecuta con Node 22. No utilices `npm test` indiscriminadamente: incluye `tests/admin.test.js`, que usa `DATABASE_URL`, crea un esquema `rpi_test_*`, escribe datos ficticios y elimina el esquema al terminar. También consulta `rpi_private` y compara datos con un respaldo local. **Nunca ejecutar las pruebas administrativas contra producción**, aunque las escrituras previstas estén en un esquema de prueba.

Antes de ejecutarlas, se necesita una base PostgreSQL completamente independiente, credenciales exclusivas y revisión de las dependencias de datos/respaldo del test. `APP_WRITES_ENABLED=false` no impide las escrituras SQL directas de los tests. Otras pruebas históricas crean y eliminan SQLite temporal. Consulta `POSTGRESQL.md`.

## Copias y despliegue

Conserva los archivos SQLite heredados y `data/backups/`; no son el backend activo. No reemplaces PostgreSQL por una copia SQLite sin reconciliar los datos. Los respaldos actuales de PostgreSQL deben gestionarse y verificarse por separado. No subas bases, respaldos ni credenciales al repositorio.

El repositorio incluye la entrada serverless `api/index.js` y `vercel.json`, que empaqueta los recursos estáticos y certificados y dirige las solicitudes a Express. PostgreSQL externo proporciona la persistencia; no se depende del disco local de Vercel para guardar usuarios o sesiones. No se ejecutan migraciones al arrancar.

Antes de una publicación, verifica en Vercel la rama, el directorio raíz, Node 22, `DATABASE_URL`, `APP_WRITES_ENABLED` y, cuando corresponda, `ADMIN_EMAIL`, `ADMIN_USER_ID`, `APP_URL` y las variables SMTP. No copies secretos a la documentación. La configuración del repositorio no certifica el estado del despliegue ni sus variables.

Quedan por revisar para operación pública la recuperación de contraseña, verificación de correo, controles CSRF/origen, límites de intentos compartidos entre instancias y políticas de privacidad. Un push puede disparar un despliegue automático si la integración de Vercel está habilitada; requiere autorización previa.

## Orígenes autorizados del programa

`ALLOWED_ORIGINS` es una lista separada por comas de orígenes exactos aprobados para el entorno. Cada entrada contiene esquema y autoridad (dominio y puerto, si corresponde), sin ruta, barra final, credenciales, parámetros, fragmentos ni comodines. Se exige el formato canónico de `URL.origin`; no se normalizan encabezados recibidos para ampliar permisos.

En producción y Preview se admiten únicamente orígenes HTTPS no locales. Solo con `NODE_ENV=development` y fuera de Vercel se permiten `localhost`, `127.0.0.1` o `[::1]`, siempre con puerto explícito no predeterminado. No hay orígenes autorizados por defecto: una lista ausente o con cualquier entrada inválida bloquea las escrituras del programa con 403 para usuarios autenticados. Las lecturas y las reglas de autenticación no cambian. `APP_WRITES_ENABLED=false` sigue bloqueando las mutaciones con 503.

Antes de publicar, configurar `ALLOWED_ORIGINS` en Vercel usando exclusivamente los orígenes HTTPS verificados del proyecto, asignando por separado Production y Preview. Incluir solo los dominios que realmente servirán el formulario; aprobar cada dominio Preview expresamente, sin autorizar todos los subdominios de Vercel. No copiar valores de Host ni X-Forwarded-* a esta lista. Esta documentación no establece ni modifica valores de Vercel; requiere autorización antes de aplicar configuración o desplegar.

Las escrituras exigen un único encabezado Origin autorizado, JSON y ausencia de Fetch Metadata cross-site. Los encabezados Host y X-Forwarded-* no conceden autorización. Este control protege el contexto de navegador; no sustituye las sesiones y los permisos frente a clientes que pueden falsificar encabezados.

Prueba aislada, sin PostgreSQL: `node --test tests/origin.test.js`. Usa solicitudes locales y una base simulada; no ejecutar `npm test` completo contra una base real.

## Batería local previa a publicación

Con Node 22, ejecutar `npm run test:safe`. La lista explícita excluye `tests/admin.test.js` y no importa el cliente PostgreSQL. Comprueba Origin, rutas, recursos, registro/login, cookies, permisos, privacidad, guardado y desbloqueo. Usa identidades ficticias, SQLite en memoria para la aplicación integrada y archivos SQLite temporales propios para comprobar persistencia del programa; estos últimos se eliminan al terminar. No usa la base real ni envía correo.

Esta batería no sustituye la validación del despliegue real. Antes de publicar se deben confirmar dominio canónico, Node 22, rama, directorio raíz, configuración de Production y Preview, `ALLOWED_ORIGINS` y `APP_WRITES_ENABLED`. No ejecutar pruebas de escritura en Preview si comparte la base de producción. Conservar `DATABASE_URL` y las credenciales existentes.
