const crypto = require('crypto');
const { connect, readRemoteFile, writeRemoteFile, exec } = require('./ssh');

/**
 * Gère l'ajout/suppression de clients sur une inbound xray existante
 * (vmess-ws ou reality), en éditant directement le config.json distant.
 *
 * On ne modifie QUE le tableau `clients` de la première inbound —
 * tout le reste (port, streamSettings, reality settings) reste inchangé,
 * donc le service continue de tourner pour tous les clients existants.
 */

function newUuid() {
  return crypto.randomUUID();
}

async function loadConfig(server, configPath) {
  const ssh = await connect(server);
  try {
    const raw = await readRemoteFile(ssh, configPath);
    return JSON.parse(raw);
  } finally {
    ssh.dispose();
  }
}

async function saveConfigAndRestart(server, configPath, config, serviceName) {
  const ssh = await connect(server);
  try {
    const json = JSON.stringify(config, null, 2);
    await writeRemoteFile(ssh, configPath, json);
    // vérifie que le xray démarre bien avec la nouvelle config avant de considérer que c'est ok
    const test = await exec(ssh, `/usr/local/bin/xray run -test -config ${configPath}`);
    if (test.code !== 0) {
      throw new Error(`Config invalide après modification: ${test.stderr || test.stdout}`);
    }
    await exec(ssh, `systemctl restart ${serviceName}`);
  } finally {
    ssh.dispose();
  }
}

/**
 * Ajoute un client à l'inbound vmess-ws (protocole "vmess").
 */
async function addVmessClient(server, configPath, { label }) {
  const config = await loadConfig(server, configPath);
  const uuid = newUuid();
  config.inbounds[0].settings.clients.push({ id: uuid, email: label || uuid });
  await saveConfigAndRestart(server, configPath, config, 'v2ray');
  return { uuid };
}

/**
 * Ajoute un client à l'inbound reality (protocole "vless", flow xtls-rprx-vision).
 */
async function addRealityClient(server, configPath, { label }) {
  const config = await loadConfig(server, configPath);
  const uuid = newUuid();
  config.inbounds[0].settings.clients.push({
    id: uuid,
    flow: 'xtls-rprx-vision',
    email: label || uuid,
  });
  await saveConfigAndRestart(server, configPath, config, 'xray');
  return { uuid };
}

async function removeClient(server, configPath, serviceName, uuid) {
  const config = await loadConfig(server, configPath);
  config.inbounds[0].settings.clients = config.inbounds[0].settings.clients.filter(
    (c) => c.id !== uuid
  );
  await saveConfigAndRestart(server, configPath, config, serviceName);
}

module.exports = { addVmessClient, addRealityClient, removeClient, loadConfig };
