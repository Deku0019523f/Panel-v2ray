const { connect, exec, readRemoteFile } = require('./ssh');

/**
 * Définition de chaque protocole : quel script vendorisé lancer, quelles
 * réponses envoyer sur stdin (les scripts originaux ont un `read -t Ns`
 * donc on peut aussi laisser vide pour prendre la valeur par défaut),
 * et où se trouve le config.json résultant sur le serveur.
 *
 * IMPORTANT: les scripts sont uploadés tels quels dans /root/panel-scripts/
 * sur le VPS cible avant exécution (voir uploadScripts ci-dessous).
 */
const PROTOCOLS = {
  'vmess-ws': {
    script: 'ws.sh',
    // ws.sh n'a aucun `read`, aucune entrée nécessaire
    stdin: '',
    configPath: '/usr/local/etc/v2ray/config.json',
  },
  'tcp-wss': {
    script: 'tcp-wss.sh',
    // demande: domaine, puis port (vide = 443)
    stdin: (opts) => `${opts.domain}\n\n`,
    configPath: '/usr/local/etc/v2ray/config.json',
  },
  https: {
    script: 'https.sh',
    stdin: (opts) => `${opts.domain}\n`,
    configPath: '/etc/caddy/https.json',
  },
  reality: {
    script: 'reality.sh',
    // port vide = 443, sni vide = www.amazon.com par défaut
    stdin: () => `\n\n`,
    configPath: '/usr/local/etc/xray/config.json',
  },
  hysteria2: {
    script: 'hy2.sh',
    stdin: () => `\n`,
    configPath: '/etc/hysteria/config.json',
  },
  'ss-rust': {
    script: 'ss-rust.sh',
    stdin: () => `\n`,
    configPath: '/etc/shadowsocks/config.json',
  },
};

/**
 * Copie tous les scripts vendorisés vers le VPS cible (une seule fois,
 * ou à chaque install pour être sûr d'avoir la dernière version).
 */
async function uploadScripts(ssh, localScriptsDir) {
  await exec(ssh, 'mkdir -p /root/panel-scripts');
  await ssh.putDirectory(localScriptsDir, '/root/panel-scripts', {
    recursive: true,
    concurrency: 5,
  });
  await exec(ssh, 'chmod +x /root/panel-scripts/*.sh');
}

/**
 * Lance l'installation d'un protocole sur un serveur.
 * `server` = ligne DB de `servers`, `protocol` = clé de PROTOCOLS,
 * `opts` = { domain, port } selon le protocole.
 * Retourne { stdout, stderr, code, configPath }.
 */
async function installProtocol(server, protocol, opts = {}, localScriptsDir) {
  const def = PROTOCOLS[protocol];
  if (!def) throw new Error(`Protocole inconnu: ${protocol}`);

  const ssh = await connect(server);
  try {
    await uploadScripts(ssh, localScriptsDir);

    const stdinPayload = typeof def.stdin === 'function' ? def.stdin(opts) : def.stdin;

    // On envoie le stdin via echo -e | bash pour simuler les réponses aux `read`
    const cmd = stdinPayload
      ? `printf '%b' ${JSON.stringify(stdinPayload)} | bash /root/panel-scripts/${def.script}`
      : `bash /root/panel-scripts/${def.script} < /dev/null`;

    const result = await exec(ssh, cmd);
    return { ...result, configPath: def.configPath, protocol };
  } finally {
    ssh.dispose();
  }
}

/**
 * Récupère le config.json généré par un protocole donné pour un serveur.
 */
async function fetchConfig(server, protocol) {
  const def = PROTOCOLS[protocol];
  if (!def) throw new Error(`Protocole inconnu: ${protocol}`);
  const ssh = await connect(server);
  try {
    const raw = await readRemoteFile(ssh, def.configPath);
    return raw;
  } finally {
    ssh.dispose();
  }
}

module.exports = { PROTOCOLS, installProtocol, fetchConfig, uploadScripts };
