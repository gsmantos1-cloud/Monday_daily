/**
 * migrate-to-turso.js
 * Migra todos os dados do team-hub.json para o Turso.
 * Rodar UMA vez: node migrate-to-turso.js
 *
 * Requer: TURSO_URL e TURSO_AUTH_TOKEN no .env
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

const DB_PATH = path.join(__dirname, 'team-hub.json');

async function main() {
  if (!process.env.TURSO_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.error('❌ Configure TURSO_URL e TURSO_AUTH_TOKEN no arquivo .env');
    process.exit(1);
  }

  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ team-hub.json não encontrado em:', DB_PATH);
    process.exit(1);
  }

  const db = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  // Criar tabela KV
  await db.execute(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

  // Ler dados locais
  const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

  const keys = ['users', 'boards', 'tasks', 'comments', 'channels', 'messages',
                 'sessions', 'goals', 'ideas', 'task_history', 'notifications', '_seq'];

  let ok = 0;
  for (const key of keys) {
    if (data[key] !== undefined) {
      await db.execute({
        sql: `INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)`,
        args: [key, JSON.stringify(data[key])]
      });
      const count = Array.isArray(data[key]) ? data[key].length : typeof data[key];
      console.log(`✅ ${key}: ${count} registros`);
      ok++;
    }
  }

  console.log(`\n🎉 Migração concluída! ${ok} coleções enviadas para o Turso.`);
  console.log('Agora atualize o server para usar db-turso.js e configure o .env com as credenciais do Turso.');
  process.exit(0);
}

main().catch(e => { console.error('❌ Erro:', e.message); process.exit(1); });
