document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('error');
  errorEl.textContent = '';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || 'Erreur de connexion';
      return;
    }
    localStorage.setItem('panel_token', data.token);
    localStorage.setItem('panel_username', data.username);
    window.location.href = '/dashboard.html';
  } catch (err) {
    errorEl.textContent = 'Serveur injoignable';
  }
});
