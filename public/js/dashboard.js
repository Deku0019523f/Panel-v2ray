const token = localStorage.getItem('panel_token');
if (!token) window.location.href = '/index.html';

document.getElementById('whoami').textContent = localStorage.getItem('panel_username') || '';
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('panel_token');
  window.location.href = '/index.html';
});

const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
let selectedServerId = null;
let selectedInstallationId = null;

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, { ...options, headers: authHeaders });
  if (res.status === 401) {
    localStorage.removeItem('panel_token');
    window.location.href = '/index.html';
    return;
  }
  return res.json();
}

async function loadServers() {
  const servers = await api('/servers');
  const tbody = document.querySelector('#serversTable tbody');
  tbody.innerHTML = '';
  servers.forEach((s) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.label}</td>
      <td>${s.host}</td>
      <td><span class="badge ${s.status}">${s.status}</span></td>
      <td>
        <button class="btn-small" onclick="selectServer(${s.id}, '${s.label.replace(/'/g, "")}')">Gérer</button>
        <button class="btn-small danger" onclick="deleteServer(${s.id})">Suppr.</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

window.selectServer = (id, label) => {
  selectedServerId = id;
  document.getElementById('selServerLabel').textContent = label;
  document.getElementById('installCard').style.display = 'block';
  document.getElementById('clientsCard').style.display = 'none';
};

window.deleteServer = async (id) => {
  if (!confirm('Supprimer ce serveur du panel ? (le VPS lui-même n\'est pas touché)')) return;
  await api(`/servers/${id}`, { method: 'DELETE' });
  loadServers();
};

document.getElementById('addServerBtn').addEventListener('click', async () => {
  const label = document.getElementById('s_label').value;
  const host = document.getElementById('s_host').value;
  const ssh_port = document.getElementById('s_port').value || 22;
  const ssh_user = document.getElementById('s_user').value || 'root';
  const ssh_key_path = document.getElementById('s_key').value;
  if (!label || !host || !ssh_key_path) return alert('Nom, hôte et chemin de clé SSH requis');

  const result = await api('/servers', {
    method: 'POST',
    body: JSON.stringify({ label, host, ssh_port: Number(ssh_port), ssh_user, ssh_key_path }),
  });
  if (result.error) return alert(result.error);
  loadServers();
});

document.getElementById('installBtn').addEventListener('click', async () => {
  const protocol = document.getElementById('protocolSelect').value;
  const domain = document.getElementById('i_domain').value;
  const port = document.getElementById('i_port').value;
  const log = document.getElementById('installLog');
  log.textContent = 'Installation en cours... (cela peut prendre 1-3 minutes)';

  const result = await api(`/servers/${selectedServerId}/install`, {
    method: 'POST',
    body: JSON.stringify({ protocol, domain, port: port ? Number(port) : undefined }),
  });

  if (result.error) {
    log.textContent = `Erreur: ${result.error}\n${result.stderr || ''}`;
    return;
  }
  log.textContent = `Statut: ${result.status}\n\n${result.stdout || ''}`;
  if (result.status === 'active') {
    selectedInstallationId = result.installationId;
    document.getElementById('selInstallationId').textContent = selectedInstallationId;
    document.getElementById('clientsCard').style.display = 'block';
    loadClients();
  }
});

async function loadClients() {
  if (!selectedInstallationId) return;
  const clients = await api(`/clients/installation/${selectedInstallationId}`);
  const tbody = document.querySelector('#clientsTable tbody');
  tbody.innerHTML = '';
  clients.forEach((c) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${c.label || '-'}</td>
      <td><span class="badge ${c.status}">${c.status}</span></td>
      <td>${c.expires_at || '—'}</td>
      <td>${c.price_fcfa ? c.price_fcfa + ' FCFA' : '—'}</td>
      <td><button class="btn-small danger" onclick="deleteClient(${c.id})">Révoquer</button></td>`;
    tbody.appendChild(tr);
  });
}

window.deleteClient = async (id) => {
  if (!confirm('Révoquer cet accès client ?')) return;
  await api(`/clients/${id}`, { method: 'DELETE' });
  loadClients();
};

document.getElementById('addClientBtn').addEventListener('click', async () => {
  const label = document.getElementById('c_label').value;
  const expires_at = document.getElementById('c_expires').value;
  const price_fcfa = document.getElementById('c_price').value;

  const result = await api(`/clients/installation/${selectedInstallationId}`, {
    method: 'POST',
    body: JSON.stringify({ label, expires_at: expires_at || null, price_fcfa: price_fcfa ? Number(price_fcfa) : null }),
  });

  const resultDiv = document.getElementById('newClientResult');
  if (result.error) {
    resultDiv.innerHTML = `<p style="color:var(--danger)">${result.error}</p>`;
    return;
  }
  resultDiv.innerHTML = `
    <div style="margin:10px 0; padding:12px; background:#0b0f14; border-radius:8px; border:1px solid var(--border);">
      <p style="font-size:12px; color:var(--text-dim); word-break:break-all;">${result.link}</p>
      <img src="${result.qrDataUrl}" width="140" />
    </div>`;
  loadClients();
});

loadServers();
