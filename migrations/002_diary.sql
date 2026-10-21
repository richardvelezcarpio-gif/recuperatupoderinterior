-- PENDIENTE DE AUTORIZACIÓN. Ejecutar manualmente como propietario del backend.
-- Solo crea/protege la tabla nueva. No ejecutar 001 ni scripts de importación.
BEGIN;
CREATE TABLE IF NOT EXISTS rpi_private.diary_entries (
 id TEXT PRIMARY KEY,
 user_id BIGINT NOT NULL REFERENCES rpi_private.users(id) ON DELETE RESTRICT,
 request_key TEXT NOT NULL,
 title TEXT NOT NULL DEFAULT '' CHECK(char_length(title)<=120),
 reflection TEXT NOT NULL CHECK(char_length(reflection) BETWEEN 1 AND 2000 AND length(trim(reflection))>0),
 emotion TEXT NOT NULL DEFAULT '' CHECK(emotion IN ('','Feliz','Tranquilo','Agradecido','Triste','Ansioso','Enojado','Esperanzado')),
 prompt TEXT NOT NULL DEFAULT '' CHECK(char_length(prompt)<=300),
 created_at BIGINT NOT NULL CHECK(created_at>=0),
 updated_at BIGINT NOT NULL CHECK(updated_at>=created_at),
 version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
 UNIQUE(user_id,request_key)
);
CREATE INDEX IF NOT EXISTS diary_user_date_idx ON rpi_private.diary_entries(user_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS diary_user_emotion_date_idx ON rpi_private.diary_entries(user_id,emotion,created_at DESC,id DESC);
ALTER TABLE rpi_private.diary_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rpi_private.diary_entries FROM PUBLIC,anon,authenticated,service_role;
-- Sin políticas públicas. Solo conexión privada del propietario; Express delimita user_id.
COMMIT;
