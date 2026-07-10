# Panel-v2ray

Panel web d'administration pour installer, gérer et **revendre** des accès
VPN/proxy (V2Ray+WebSocket, Reality, Hysteria2, Shadowsocks-rust, HTTPS)
sur un ou plusieurs VPS, à distance, via SSH.

Dépôt : https://github.com/Deku0019523f/Panel-v2ray

---

## Sommaire

- [Présentation](#présentation)
- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration d'un VPS géré](#configuration-dun-vps-géré)
- [Utilisation](#utilisation)
- [API](#api)
- [Base de données](#base-de-données)
- [Sécurité](#sécurité--à-vérifier-avant-mise-en-prod)
- [Limites connues](#limites-connues)
- [Roadmap](#roadmap--extensions-possibles)
- [Crédits](#crédits)

---

## Présentation

Ce projet part des scripts d'installation VPN en bash de
[v2ray-wss](https://github.com/mrjnamei/v2ray-wss) (vendorisés tels quels
dans `server/scripts/`, aucune modification) et ajoute une couche complète
de gestion :

- un **backend Node.js/Express** qui pilote ces scripts à distance par SSH,
- une **base SQLite** qui garde la trace des serveurs, des protocoles
  installés et des clients revendus,
- un **panel web** (thème sombre) pour tout faire sans toucher au terminal :
  ajouter un VPS, installer un protocole dessus, créer des accès clients
  avec QR code, prix en FCFA et date d'expiration.

L'objectif : passer d'un simple script d'installation à usage unique à un
outil de gestion multi-serveurs, multi-clients, réutilisable pour un usage
personnel ou pour une activité de revente (à la manière d'un panel type
3X-UI, mais construit sur mesure autour des scripts v2ray-wss).

## Fonctionnalités

| Fonctionnalité | Statut |
|---|---|
| Connexion admin (JWT) | ✅ |
| Ajout / suppression de serveurs VPS (SSH par clé) | ✅ |
| Installation à distance : V2Ray+WS, Reality, Hysteria2, SS-rust, HTTPS proxy | ✅ |
| Exécution non-interactive des scripts d'origine (sans les modifier) | ✅ |
| Multi-clients sur une même installation (V2Ray+WS, Reality) | ✅ |
| Génération de lien de connexion + QR code par client | ✅ |
| Prix (FCFA), date d'expiration, statut par client | ✅ |
| Révocation d'un client (édition config + redémarrage du service) | ✅ |
| Vérification/désactivation automatique des accès expirés | ✅ (endpoint manuel, cron à brancher) |
| Multi-clients pour Hysteria2 / SS-rust / HTTPS | 🚧 à faire |
| Suivi réel de la consommation data | 🚧 à faire |
| Intégration paiement Wave / Mobile Money | 🚧 à faire |

## Architecture

```
Panel-v2ray/
├── server/
│   ├── index.js                # bootstrap Express
│   ├── db/
│   │   ├── schema.sql          # schéma SQLite
│   │   └── init.js             # connexion DB + création admin par défaut
│   ├── services/
│   │   ├── ssh.js              # wrapper SSH (node-ssh) : connect/exec/read/write
│   │   ├── installer.js        # upload + exécution non-interactive des .sh
│   │   └── xrayClients.js      # ajout/suppression de clients multi-tenant
│   ├── routes/
│   │   ├── auth.js             # login admin
│   │   ├── servers.js          # CRUD serveurs + déclenchement d'installation
│   │   └── clients.js          # CRUD clients revendus par installation
│   ├── middleware/auth.js      # vérification du JWT
│   └── scripts/                # scripts .sh vendorisés (v2ray-wss, non modifiés)
├── public/                     # panel web (HTML/CSS/JS vanilla, pas de build)
│   ├── index.html              # page de connexion
│   ├── dashboard.html          # dashboard principal
│   ├── css/style.css
│   └── js/{login,dashboard}.js
├── package.json
└── .env.example
```

**Flux d'installation d'un protocole :**

1. Le panel se connecte en SSH au VPS déclaré.
2. Il copie le script correspondant dans `/root/panel-scripts/`.
3. Il l'exécute en lui injectant sur `stdin` les réponses attendues par les
   `read -t Ns` du script (domaine, port...) — les scripts originaux ne
   sont jamais modifiés, seulement pilotés depuis l'extérieur.
4. Le résultat (statut, chemin du `config.json` généré) est stocké dans la
   table `installations`.

**Flux d'ajout d'un client (revente) :**

1. Pour V2Ray+WS / Reality : le panel lit le `config.json` distant via SSH,
   ajoute une entrée dans le tableau `clients` de l'inbound (nouvel UUID),
   réécrit le fichier, **teste la config avec `xray run -test`** avant de
   redémarrer le service — pour ne jamais casser l'accès des clients déjà
   actifs en cas d'erreur.
2. Un lien de connexion (`vmess://` ou `vless://`) et un QR code sont
   générés côté panel et renvoyés à l'admin.

## Installation

Prérequis : Node.js ≥ 18.

```bash
git clone https://github.com/Deku0019523f/Panel-v2ray.git
cd Panel-v2ray
npm install
cp .env.example .env
```

Édite `.env` :

```
PORT=3000
JWT_SECRET=change_moi_en_production_stp
DB_PATH=./data/panel.db
ADMIN_DEFAULT_USER=admin
ADMIN_DEFAULT_PASSWORD=change_ce_mot_de_passe
```

Puis lance :

```bash
npm start
```

Ouvre `http://localhost:3000` (ou l'IP/domaine de ta machine hôte). Le
compte admin est créé automatiquement au premier lancement avec les
identifiants définis dans `.env`.

## Configuration d'un VPS géré

Chaque serveur que tu ajoutes dans le panel doit être accessible en SSH
par clé (pas de mot de passe) :

```bash
# Sur ta machine (là où tourne le panel), génère une clé dédiée si besoin
ssh-keygen -t ed25519 -f ~/.ssh/panel_key -N ""

# Copie la clé publique sur le VPS cible
ssh-copy-id -i ~/.ssh/panel_key.pub root@IP_DU_VPS
```

Dans le panel, ajoute le serveur avec :
- **Hôte** : IP ou domaine du VPS
- **Utilisateur SSH** : `root` (requis par les scripts d'origine)
- **Chemin clé privée** : `/home/toi/.ssh/panel_key` (chemin lisible par
  le process Node qui fait tourner le panel)

## Utilisation

1. **Ajouter un serveur** depuis le dashboard (hôte + clé SSH).
2. Cliquer **Gérer** → choisir un protocole (V2Ray+WS, Reality, Hysteria2,
   SS-rust, HTTPS) → renseigner domaine/port si nécessaire → **Installer**.
   L'installation prend 1 à 3 minutes, le log s'affiche en direct.
3. Une fois l'installation active, la section **Clients** apparaît :
   créer un accès (nom du client, expiration, prix FCFA) génère un lien
   de connexion + QR code à transmettre au client final.
4. **Révoquer** un client le supprime de la config xray et redémarre le
   service proprement.

## API

Toutes les routes `/api/servers` et `/api/clients` nécessitent un header
`Authorization: Bearer <token>` obtenu via `/api/auth/login`.

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/auth/login` | Connexion admin, retourne un JWT |
| GET | `/api/servers` | Liste des serveurs |
| POST | `/api/servers` | Ajoute un serveur (`label`, `host`, `ssh_port`, `ssh_user`, `ssh_key_path`) |
| DELETE | `/api/servers/:id` | Retire un serveur du panel (ne touche pas le VPS) |
| POST | `/api/servers/:id/install` | Lance l'installation d'un protocole (`protocol`, `domain`, `port`) |
| GET | `/api/servers/:id/installations` | Liste des installations d'un serveur |
| GET | `/api/clients/installation/:installationId` | Liste des clients d'une installation |
| POST | `/api/clients/installation/:installationId` | Crée un client (`label`, `expires_at`, `data_limit_gb`, `price_fcfa`) |
| DELETE | `/api/clients/:clientId` | Révoque un client |
| POST | `/api/clients/check-expirations` | Désactive les clients expirés (à brancher sur un cron) |

## Base de données

SQLite (`better-sqlite3`), schéma complet dans `server/db/schema.sql` :

- **servers** : VPS déclarés (hôte, port SSH, utilisateur, chemin de clé)
- **installations** : un protocole installé sur un serveur donné
- **clients** : les accès revendus, rattachés à une installation
- **admins** : comptes d'administration du panel

## Sécurité — à vérifier avant mise en prod

- Change **`JWT_SECRET`** dans `.env` (valeur par défaut = non sécurisée).
- Le panel tourne en HTTP simple sur le port 3000 : mets-le derrière un
  reverse proxy HTTPS (nginx ou Caddy) avant toute exposition publique.
- Les clés SSH ne sont **jamais** stockées en base — seul leur chemin sur
  disque est enregistré (`servers.ssh_key_path`).
- Pas de rate-limiting sur `/api/auth/login` pour l'instant : à ajouter
  (`express-rate-limit`) avant une exposition sur Internet.
- Recommandé : clé SSH dédiée par déploiement du panel, avec droits
  restreints si possible plutôt que `root` partagé avec d'autres usages.

## Limites connues

- Le multi-client n'est implémenté que pour les protocoles basés sur xray
  (V2Ray+WS, Reality), car leur `config.json` supporte nativement un
  tableau de clients. Hysteria2 et Shadowsocks-rust utilisent un mécanisme
  d'authentification différent par instance — un seul client géré pour
  l'instant.
- Pas de suivi réel de la consommation data (le champ `data_limit_gb`
  existe en base mais n'est pas encore branché sur les stats réelles
  d'xray).
- Pas de file d'attente pour les installations : deux installations
  lancées en même temps sur des serveurs différents fonctionnent, mais il
  n'y a pas de verrou si on relance deux fois sur le même serveur.

## Roadmap / extensions possibles

- Multi-clients pour Hysteria2 (auth HTTP callback) et SS-rust (multi-port
  ou multi-utilisateur natif selon version).
- Statistiques de trafic réelles via l'API stats gRPC/HTTP d'xray
  (`stats` + `policy.levels` dans `config.json`).
- Cron intégré (`node-cron`) pour appeler automatiquement
  `/api/clients/check-expirations` au lieu d'un déclenchement manuel.
- Intégration paiement Wave / MTN MoMo pour générer un client
  automatiquement à la validation d'un paiement.
- Rôles multi-admin (actuellement un seul niveau d'accès).
- Notifications Telegram à l'admin lors d'une installation terminée ou
  d'un client arrivant à expiration.

## Crédits

- Scripts d'installation VPN originaux : [v2ray-wss](https://github.com/mrjnamei/v2ray-wss)
  (vendorisés dans `server/scripts/`, non modifiés).
- Panel, orchestration SSH, gestion multi-clients et interface web :
  développés dans ce dépôt.
