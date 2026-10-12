# CA pública de Supabase

Origen oficial del enlace: https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json
Descarga HTTPS verificada: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

Certificado: Supabase Root 2021 CA. Válido hasta 2031-04-26.
Huella SHA-256 DER: 807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA

La cadena y el nombre aws-0-us-east-2.pooler.supabase.com fueron verificados con OpenSSL, usando esta CA obtenida independientemente por HTTPS. No se confió directamente en un certificado capturado de la conexión fallida.

El comando db:import:check configura NODE_EXTRA_CA_CERTS antes de iniciar Node. Cargar esta variable desde config.js/.env después del inicio no actualiza las CA de Node. Se conserva rejectUnauthorized:true. No se modificó el almacén del sistema, SMTP ni el comando de importación. Este certificado es público y no contiene claves privadas.
