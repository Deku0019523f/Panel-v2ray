const { NodeSSH } = require('node-ssh');

/**
 * Ouvre une connexion SSH vers un serveur enregistré en DB.
 * server = ligne de la table `servers`
 */
async function connect(server) {
  const ssh = new NodeSSH();
  await ssh.connect({
    host: server.host,
    port: server.ssh_port || 22,
    username: server.ssh_user || 'root',
    privateKeyPath: server.ssh_key_path, // clé sans passphrase recommandée pour l'automatisation
    readyTimeout: 15000,
  });
  return ssh;
}

/**
 * Exécute une commande shell et retourne stdout/stderr/code.
 */
async function exec(ssh, command) {
  const result = await ssh.execCommand(command, { cwd: '/root' });
  return result; // { stdout, stderr, code }
}

/**
 * Lit un fichier distant (ex: config.json) et le retourne en texte.
 */
async function readRemoteFile(ssh, remotePath) {
  const result = await ssh.execCommand(`cat ${remotePath}`);
  if (result.code !== 0) throw new Error(`Impossible de lire ${remotePath}: ${result.stderr}`);
  return result.stdout;
}

/**
 * Écrit un fichier distant à partir d'une string (utilise un heredoc pour éviter
 * les soucis d'échappement avec des JSON contenant des guillemets).
 */
async function writeRemoteFile(ssh, remotePath, content) {
  const marker = 'PANEL_EOF_' + Date.now();
  const escaped = content; // le contenu JSON ne contient pas le marker, donc safe
  const cmd = `cat > ${remotePath} << '${marker}'\n${escaped}\n${marker}`;
  const result = await ssh.execCommand(cmd);
  if (result.code !== 0) throw new Error(`Écriture échouée sur ${remotePath}: ${result.stderr}`);
  return result;
}

module.exports = { connect, exec, readRemoteFile, writeRemoteFile };
