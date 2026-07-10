const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || './data/panel.db';

// S'assure que le dossier data/ existe (pattern identique à tes autres projets bot-v2)
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Crée un admin par défaut au premier lancement uniquement
const adminCount = db.prepare('SELECT COUNT(*) as c FROM admins').get().c;
if (adminCount === 0) {
  const username = process.env.ADMIN_DEFAULT_USER || 'admin';
  const password = process.env.ADMIN_DEFAULT_PASSWORD || 'changeme123';
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, hash);
  console.log(`[init] Admin par défaut créé -> user: ${username} / password: ${password} (change-le immédiatement !)`);
}

module.exports = db;
