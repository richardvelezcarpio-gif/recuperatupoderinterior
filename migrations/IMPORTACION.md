# Importación preparada; no ejecutada

Requiere Node 22, el esquema 001 ya aplicado y las cuatro tablas vacías en rpi_private. El origen es DATABASE_PATH, resuelto por config.js; se abre exclusivamente en modo lectura y se toma una instantánea consistente, incluyendo WAL. No se leen secretos del origen ni se imprimen datos de las filas.

Configurar manualmente DATABASE_URL en .env (ya excluido de Git), sin incluirla en comandos, capturas ni registros. Usar la URL PostgreSQL privada de Supabase, con contraseña codificada para URL y sin parámetros de consulta. Preferir conexión directa o Session pooler para esta operación. TLS exige certificado válido y mínimo TLS 1.2; si se requiere una CA adicional, usar NODE_EXTRA_CA_CERTS con el certificado oficial. Nunca desactivar la validación.

Comprobación local, sin conexión PostgreSQL:

```sh
node scripts/import-postgres.js --local-check
```

Comprobación completa (conecta a PostgreSQL, transacción de solo lectura; no importa):

```sh
npm run db:import:check
```

Importación real, SOLO en la fase autorizada:

```sh
npm run db:import
```

Antes de importar: pausar escrituras de la aplicación y cualquier escritor del destino; generar respaldo consistente reciente verificado. La instantánea no incluye cambios posteriores. Mantener la pausa hasta validar el resultado. No activar el backend PostgreSQL ni reabrir escrituras como parte de este script.

Se comprueban integridad y relaciones de SQLite, columnas/tipos, valores compatibles con PostgreSQL, hashes, JSON de tres respuestas y correos normalizados duplicados. Se aborta ante anomalías, sin corregir o descartar registros. Los contenidos se preservan exactamente; la normalización de huellas solo representa enteros como cadenas y ordena filas. No normaliza texto ni JSON.

El destino se comprueba vacío en las cuatro tablas y se bloquea durante la importación. Se insertan users, sessions, program_starts y program_answers mediante parámetros en un único cliente/transacción. Se comparan recuentos y SHA-256 antes del COMMIT. El ajuste usa ALTER SEQUENCE RESTART transaccional, no setval (no reversible). Requiere propietario de tablas/secuencia y acceso a todas las filas; usar el rol postgres de la configuración actual. No se crean roles ni se cambian permisos o RLS. Se espera la secuencia rpi_private.users_id_seq generada por 001.

Ante errores se intenta ROLLBACK. Una caída de conexión durante COMMIT puede dejar el resultado incierto: inspeccionar el destino antes de reintentar. Nunca vaciar tablas para forzar una repetición; el script rechaza un destino ocupado. La salida contiene únicamente recuentos/huellas agregadas o errores genéricos, sin mensajes privados del proveedor.

Las tablas se cargan en memoria: adecuado para el volumen actual; revisar estrategia antes de usar con bases grandes. La prueba PostgreSQL es simulada en esta fase; no acredita conectividad, permisos ni ejecución real en Supabase.

Pruebas: `node --test tests/import.test.js`.

Referencias: https://node-postgres.com/features/ssl ; https://node-postgres.com/features/transactions ; https://www.postgresql.org/docs/current/sql-altersequence.html
