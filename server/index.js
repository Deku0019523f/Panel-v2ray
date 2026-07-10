require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

require('./db/init'); // initialise la DB + crée l'admin par défaut si besoin

const authRoutes = require('./routes/auth');
const serverRoutes = require('./routes/servers');
const clientRoutes = require('./routes/clients');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/clients', clientRoutes);

// Panel web statique
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[vpn-panel] démarré sur http://localhost:${PORT}`);
});
