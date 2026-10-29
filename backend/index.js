const express = require('express');
const cors = require('cors');
const path = require('path');

// Forzar a dotenv a buscar el archivo .env en la raíz del proyecto (una carpeta más atrás)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Importar rutas
const vehicleRoutes = require('./routes/vehicleRoutes');
const docRoutes = require('./routes/docRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares base
app.use(cors());
app.use(express.json());

// 1. Servir el Frontend: Esto hace que al entrar a localhost:3000 cargue tu HTML
app.use(express.static(path.join(__dirname, '../frontend')));

// 2. Montar las rutas de la API backend
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/documents', docRoutes);

// 3. Endpoint de salud (opcional, para saber que la API pura responde)
app.get('/api', (req, res) => {
  res.send('API de SAEDocs funcionando 🚛');
});

// Levantar el servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});