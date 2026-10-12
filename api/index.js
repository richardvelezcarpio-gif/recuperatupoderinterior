import { createDatabase } from '../database.js';
import { createApp } from '../app.js';

// One initialized Express app per warm serverless instance.
// Keep production writes disabled until database and auth are verified.
let appPromise;
function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const db = createDatabase();
      try {
        return await createApp({
          db,
          writesEnabled: process.env.APP_WRITES_ENABLED === 'true'
        });
      } catch (error) {
        await db.close();
        throw error;
      }
    })().catch(error => {
      appPromise = undefined;
      throw error;
    });
  }
  return appPromise;
}

export default async function handler(req, res) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (error) {
    console.error('No se pudo iniciar la aplicación:', {code: error.code || error.name, missingFile: error.code === 'ENOENT' ? error.path : undefined});
    if (!res.headersSent) {
      return res.status(503).json({ error: 'Servicio temporalmente no disponible.' });
    }
  }
}
