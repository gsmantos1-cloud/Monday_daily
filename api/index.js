/**
 * Vercel Serverless Entry Point
 * Todas as rotas /api/* chegam aqui e são tratadas pelo Express.
 */
process.env.IS_SERVERLESS = '1';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const db = require('../server/db-turso');
const app = require('../server/index');

let initPromise = null;

module.exports = async (req, res) => {
  // Inicializa Turso uma vez por instância (cache entre requests quentes)
  if (!initPromise) {
    initPromise = db.init().catch(err => {
      console.error('[Serverless] DB init error:', err.message);
      initPromise = null; // permite retry
      throw err;
    });
  }
  await initPromise;
  return app(req, res);
};
