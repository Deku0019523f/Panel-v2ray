const express = require('express');
const QRCode = require('qrcode');
const db = require('../db/init');
const { requireAuth } = require('../middleware/auth');
const { addVmessClient, addRealityClient, removeClient } = require('../services/xrayClients');

const router = express.Router();
router.use(requireAuth);

function buildVmessLink(installation, uuid, label) {
  const meta = JSON.parse(installation.raw_meta || '{}');
  const payload = {
    v: '2',
    ps: label || '1024-ws',
    add: installation.domain || meta.host || '',
    port: installation.port,
    id: uuid,
    aid: 0,
    net: 'ws',
    type: 'none',
    host: '',
    path: '/',
    tls: 'none',
  };
  return 'vmess://' + Buffer.from(JSON.stringify(payload)).toString('base64');
}

function buildRealityLink(installation, uuid, extra) {
  const { publicKey, shortId, sni, ip, port } = extra;
  return `vless://${uuid}@${ip}:${port}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${sni}&fp=chrome&pbk=${publicKey}&sid=${shortId}&type=tcp&headerType=none#1024-reality`;
}

// Liste des clients d'une installation
router.get('/installation/:installationId', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM clients WHERE installation_id = ?')
    .all(req.params.installationId);
  res.json(rows);
});

// Créer un nouveau client (client final = personne à qui tu revends l'accès)
router.post('/installation/:installationId', async (req, res) => {
  const installation = db
    .prepare('SELECT * FROM installations WHERE id = ?')
    .get(req.params.installationId);
  if (!installation) return res.status(404).json({ error: 'Installation introuvable' });

  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(installation.server_id);
  const { label, data_limit_gb, expires_at, price_fcfa } = req.body;

  try {
    let uuid, link;

    if (installation.protocol === 'vmess-ws' || installation.protocol === 'tcp-wss') {
      const result = await addVmessClient(server, installation.config_path, { label });
      uuid = result.uuid;
      link = buildVmessLink(installation, uuid, label);
    } else if (installation.protocol === 'reality') {
      const result = await addRealityClient(server, installation.config_path, { label });
      uuid = result.uuid;
      // publicKey/shortId/sni sont générés une fois à l'install et stockés dans raw_meta
      const meta = JSON.parse(installation.raw_meta || '{}');
      link = buildRealityLink(installation, uuid, {
        publicKey: meta.publicKey,
        shortId: meta.shortId || '88',
        sni: installation.domain || meta.sni,
        ip: server.host,
        port: installation.port,
      });
    } else {
      return res.status(400).json({
        error: `Ajout multi-client pas encore supporté pour ${installation.protocol} (hysteria2/ss-rust/https gèrent 1 seul client par install pour l'instant)`,
      });
    }

    const info = db
      .prepare(
        `INSERT INTO clients (installation_id, label, uuid, expires_at, data_limit_gb, price_fcfa)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(installation.id, label || null, uuid, expires_at || null, data_limit_gb || null, price_fcfa || null);

    const qrDataUrl = await QRCode.toDataURL(link);
    res.json({ id: info.lastInsertRowid, uuid, link, qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Supprimer / révoquer un client
router.delete('/:clientId', async (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.clientId);
  if (!client) return res.status(404).json({ error: 'Client introuvable' });

  const installation = db.prepare('SELECT * FROM installations WHERE id = ?').get(client.installation_id);
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(installation.server_id);

  const serviceName = installation.protocol === 'reality' ? 'xray' : 'v2ray';
  try {
    await removeClient(server, installation.config_path, serviceName, client.uuid);
    db.prepare('DELETE FROM clients WHERE id = ?').run(client.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Vérifie / suspend automatiquement les clients expirés (à appeler via cron)
router.post('/check-expirations', async (req, res) => {
  const expired = db
    .prepare(`SELECT * FROM clients WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < datetime('now')`)
    .all();

  const results = [];
  for (const client of expired) {
    const installation = db.prepare('SELECT * FROM installations WHERE id = ?').get(client.installation_id);
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(installation.server_id);
    const serviceName = installation.protocol === 'reality' ? 'xray' : 'v2ray';
    try {
      await removeClient(server, installation.config_path, serviceName, client.uuid);
      db.prepare(`UPDATE clients SET status = 'expired' WHERE id = ?`).run(client.id);
      results.push({ id: client.id, status: 'expired_and_removed' });
    } catch (err) {
      results.push({ id: client.id, status: 'error', error: err.message });
    }
  }
  res.json({ processed: results.length, results });
});

module.exports = router;
