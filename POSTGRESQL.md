# PostgreSQL: estado actual y antecedentes

## Backend actual

La aplicación utiliza PostgreSQL alojado en Supabase, mediante `pg`, con el esquema `rpi_private` y las tablas `users`, `sessions`, `program_starts` y `program_answers`. Conserva la autenticación propia, los hashes scrypt, las sesiones y el calendario del programa. No utiliza Supabase Auth.

Las consultas son parametrizadas. El cliente verifica TLS mediante la CA pública de `certs/supabase-prod-ca-2021.crt`; no se debe desactivar `rejectUnauthorized`. `DATABASE_URL` es privada y debe configurarse por entorno. No se crean tablas ni se ejecutan migraciones al arrancar.

`better-sqlite3` se conserva para herramientas de importación, respaldo y pruebas históricas. `server.js`, `app.js` y `database.js` no lo utilizan como backend. Los archivos SQLite y sus respaldos deben conservarse.

## Entornos y escrituras

`APP_WRITES_ENABLED=false` bloquea las mutaciones HTTP de la aplicación con respuesta 503. No bloquea consultas de lectura al arrancar ni escrituras SQL directas de herramientas o pruebas. No representa un permiso de solo lectura de PostgreSQL.

Desarrollo y pruebas deben usar una base completamente independiente de producción, con credenciales propias. No basta con cambiar el nombre del esquema dentro de la base de producción. Antes de habilitar escrituras, comprobar el destino y autorizar la operación.

El repositorio contiene `api/index.js` y `vercel.json` para Vercel. Esto describe el código disponible, no confirma qué commit, variables o versión Node están ejecutándose en producción. Esa verificación debe hacerse por separado, sin revelar secretos. El limitador en memoria no se comparte entre instancias; revisar límites compartidos y el proxy HTTPS antes de escalar.

## Pruebas seguras seleccionadas

Con Node 22, esta selección utiliza simulaciones, sin PostgreSQL ni correo real:

```sh
node --test tests/emails.test.js tests/smtp.test.js tests/import-diagnostics.test.js
```

## Pruebas administrativas: nunca contra producción

`npm test` incluye `tests/admin.test.js`. Este test usa `DATABASE_URL`, crea un esquema `rpi_test_*`, inserta y modifica datos ficticios y elimina el esquema al finalizar. También consulta tablas de `rpi_private` y compara datos con un respaldo local. Sus supuestos históricos deben revisarse antes de ejecutarlo en un entorno nuevo.

**Nunca ejecutar esta prueba contra producción.** El esquema temporal no convierte la base en un entorno aislado. Se requiere una base PostgreSQL de pruebas independiente, un usuario exclusivo, datos ficticios y un respaldo/fixture compatible; revisar estos requisitos antes de autorizar la ejecución. `APP_WRITES_ENABLED=false` no protege frente al SQL directo de los tests.

Las pruebas históricas de programa e importación pueden crear y eliminar archivos SQLite temporales. No forman parte de la selección anterior. No ejecutar migraciones ni scripts de importación o activación como parte de una comprobación rutinaria.

## Información histórica

Las notas anteriores describían una transición local con el servidor suspendido, ocho registros usados para comparación y una activación todavía no ejecutada. Esos detalles no certifican el estado actual de los procesos, los datos o el despliegue. La antigua afirmación «No se ha desplegado en Vercel» no debe usarse como diagnóstico actual.

`scripts/activate-postgres.js` es una herramienta de esa transición: consulta PostgreSQL y la configuración administrativa, puede terminar procesos suspendidos del proyecto y arranca un supervisor con escrituras habilitadas. No es un paso obligatorio de desarrollo ni de despliegue. No ejecutarlo sin una revisión y autorización específica.

## Recuperación y conservación

Conservar SQLite, `data/backups/` y los respaldos de consolidación y sincronización. Después de registrar datos en PostgreSQL, no volver al respaldo SQLite sin reconciliación. Los respaldos de PostgreSQL deben verificarse de forma independiente. No publicar `.env`, bases de datos, volcados, respaldos ni credenciales. No confundir el certificado público de CA con una clave privada.
