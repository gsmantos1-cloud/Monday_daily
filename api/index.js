/**
 * Vercel Serverless Entry Point
 * Todas as rotas /api/* e /socket.io/* chegam aqui.
 * As variáveis de ambiente vêm do painel do Vercel (não usa dotenv aqui).
 */
process.env.IS_SERVERLESS = '1';

const db = require('../server/db-turso');
const app = require('../server/index');

let initPromise = null;

module.exports = async (req, res) => {
  try {
    if (!initPromise) {
      initPromise = db.init().catch(err => {
        initPromise = null; // permite retry numa próxima request
        throw err;
      });
    }
    await initPromise;
    return app(req, res);
  } catch (err) {
    console.error('[Serverless] erro:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Erro interno: ' + (err.message || 'desconhecido') }));
  }
};
