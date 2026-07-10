-- Servers: VPS gérés par le panel (le tien ou ceux de clients revendeurs)
CREATE TABLE IF NOT EXISTS servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  host TEXT NOT NULL,
  ssh_port INTEGER DEFAULT 22,
  ssh_user TEXT DEFAULT 'root',
  ssh_key_path TEXT,
  status TEXT DEFAULT 'pending', -- pending, online, offline
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Une "installation" = un protocole installé sur un serveur (ex: reality sur server 1)
CREATE TABLE IF NOT EXISTS installations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES servers(id),
  protocol TEXT NOT NULL, -- vmess-ws | ss-rust | reality | hysteria2 | https
  domain TEXT,
  port INTEGER,
  config_path TEXT,
  raw_meta TEXT,
  status TEXT DEFAULT 'installing', -- installing, active, failed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Clients revendus (utilisateurs finaux)
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  installation_id INTEGER NOT NULL REFERENCES installations(id),
  label TEXT,
  uuid TEXT,
  password TEXT,
  email TEXT,
  data_limit_gb REAL,
  data_used_bytes INTEGER DEFAULT 0,
  expires_at DATETIME,
  status TEXT DEFAULT 'active', -- active, expired, suspended
  price_fcfa INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'admin'
);
