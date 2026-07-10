const express = require('express');
const path = require('path');
const db = require('../db/init');
const { requireAuth } = require('../middleware/auth');
const { installProtocol, PROTOCOLS } = require('../services/installer');

const router = express.Router();
const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');

router.use(requireAuth);

// Liste des serveurs
router.get('/', (req, res) => {
  const servers = db.prepare('SELECT id, label, host, ssh_port, ssh_user, status, created_at FROM servers').all();
  res.json(servers);
});

// Ajouter un serveur (la clé SSH doit déjà être déployée sur le VPS au préalable)
router.post('/', (req, res) => {
  const { label, host, ssh_port, ssh_user, ssh_key_path } = req.body;
  if (!label || !host || !ssh_key_path) {
    return res.status(400).json({ error: 'label, host et ssh_key_path sont requis' });
  }
  const info = db
    .prepare('INSERT INTO servers (label, host, ssh_port, ssh_user, ssh_key_path) VALUES (?, ?, ?, ?, ?)')
    .run(label, host, ssh_port || 22, ssh_user || 'root', ssh_key_path);
  res.json({ id: info.lastInsertRowid });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM servers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Lance l'installation d'un protocole sur un serveur
router.post('/:id/install', async (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Serveur introuvable' });

  const { protocol, domain, port } = req.body;
  if (!PROTOCOLS[protocol]) {
    return res.status(400).json({ error: `Protocole invalide. Options: ${Object.keys(PROTOCOLS).join(', ')}` });
  }

  const install = db
    .prepare('INSERT INTO installations (server_id, protocol, domain, port, status) VALUES (?, ?, ?, ?, ?)')
    .run(server.id, protocol, domain || null, port || null, 'installing');
  const installationId = install.lastInsertRowid;

  try {
    const result = await installProtocol(server, protocol, { domain, port }, SCRIPTS_DIR);
    const status = result.code === 0 ? 'active' : 'failed';
    db.prepare('UPDATE installations SET status = ?, config_path = ?, raw_meta = ? WHERE id = ?').run(
      status,
      result.configPath,
      JSON.stringify({ stdout: result.stdout?.slice(-4000), stderr: result.stderr?.slice(-2000) }),
      installationId
    );
    res.json({ installationId, status, stdout: result.stdout, stderr: result.stderr });
  } catch (err) {
    db.prepare('UPDATE installations SET status = ? WHERE id = ?').run('failed', installationId);
    res.status(500).json({ error: err.message, installationId });
  }
});

router.get('/:id/installations', (req, res) => {
  const rows = db.prepare('SELECT * FROM installations WHERE server_id = ?').all(req.params.id);
  res.json(rows);
});

module.exports = router;
