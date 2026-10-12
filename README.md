# Recupera tu Poder Interior — V4

Node.js 22 LTS, Express y SQLite. No utiliza Supabase.

## Desarrollo local

Usa Node **22.13 o posterior de la rama 22** (`nvm use` si utilizas nvm). `better-sqlite3` es un módulo nativo: no alternes Node 22 y Node 26 con el mismo `node_modules`.

```bash
npm install
cp .env.example .env # Solo la primera vez, si .env aún no existe.
npm run dev
```

Abre http://localhost:5173. El servidor local escucha únicamente en `127.0.0.1` por defecto. Mantén el mismo hostname al entrar e iniciar sesión: `localhost` y `127.0.0.1` no comparten cookies.

En este Mac, Node 22 también está disponible mediante:

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
```

## Asignar la cuenta administradora

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

Las sesiones siguen en la tabla SQLite existente y duran siete días, también después de reiniciar el servidor. Se conserva el formato de contraseñas scrypt existente. La cookie es `HttpOnly`, `SameSite=Lax` y se marca `Secure` en producción (requiere HTTPS). No cambies `DATABASE_PATH` para reparar un acceso: la ruta predeterminada continúa siendo `data/usuarios.sqlite`.

`/admin`, `/admin.html` y **todas** las API bajo `/api/admin` comprueban identidad y autorización en el servidor. Una sesión normal no implica permisos administrativos. La página de denegación permite iniciar sesión con otra cuenta y conserva el diseño oscuro y dorado.

Solo se sirven archivos públicos enumerados explícitamente. No se publican la base SQLite, código del servidor, configuraciones, scripts ni dependencias.

## Usuarios y exportación

El panel muestra nombre, correo, consentimiento y fecha de registro (UTC), en páginas de veinte registros. Nunca devuelve contraseñas ni hashes. El CSV incluye únicamente `marketing=1`, respeta la retirada de consentimiento y escapa comillas y fórmulas de hojas de cálculo. Ambas operaciones requieren administrador.

## Pruebas

```bash
npm test
```

Las pruebas usan bases temporales independientes. Verifican registro, login, compatibilidad con sesiones y contraseñas previas, asignación local, persistencia tras reinicio, permisos, variantes de rutas, archivos privados, datos del panel, CSV, cierre de sesión y cookies de producción. Nunca insertan ni borran usuarios de la base de desarrollo.

## Copias y despliegue

Conserva `data/usuarios.sqlite` y sus archivos WAL mientras el servidor esté activo. Haz copias con la API de backup de SQLite o con el servidor detenido; no copies solo el archivo principal durante escrituras. La copia previa a esta corrección se encuentra en `data/backups/` y no se sirve por HTTP.

Antes de un despliegue público, prepara HTTPS, disco persistente, verificación de correo, recuperación de contraseña, controles CSRF/origen, límites de intentos persistentes y políticas de privacidad. Esta configuración está preparada para desarrollo local, no convierte por sí sola el proyecto en un servicio público listo para producción.
