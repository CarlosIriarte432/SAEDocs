const express = require('express');
const cors = require('cors');
const path = require('path');


// Forzar a dotenv a buscar el archivo .env en la raíz del proyecto (una carpeta más atrás)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Importar rutas
const vehicleRoutes = require('./routes/vehicleRoutes');
const docRoutes = require('./routes/docRoutes');
const { login } = require('./controllers/authController');
const { verifyToken, requireAdmin } = require('./middlewares/authMiddleware');
const { getVehicleWithDocs, getAllVehicles, addVehicle, deleteVehicle, getDashboardStats, getAuditLogs } = require('./controllers/vehicleController');
const app = express();
const PORT = process.env.PORT || 3000;
const { getAllUsers, createUser, updateUser, deleteUser } = require('./controllers/userController');


// Middlewares base
app.use(cors({
  origin: [
    'http://127.0.0.1:5500', // Entorno Local
    'http://localhost:5500', // Entorno Local alternativo
    'https://carlosiriarte432.github.io', // Entorno Producción
    'https://saedocs.carlosiriarte432.workers.dev' // Entorno Producción

  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());

// 1. Servir el Frontend: Esto hace que al entrar a localhost:3000 cargue tu HTML
app.use(express.static(path.join(__dirname, '../frontend')));

// --- RUTA ESTÁTICA PRIMERO --- (Para que le gane al router)
app.get('/api/vehicles/dashboard-stats', verifyToken, getDashboardStats);

// 2. Montar las rutas de la API backend (Routers)
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/documents', docRoutes);
app.post('/api/auth/login', login);

// Rutas de Administración (Requieren Token + Ser Admin)
app.get('/api/admin/vehicles', verifyToken, requireAdmin, getAllVehicles);
app.post('/api/admin/vehicles', verifyToken, requireAdmin, addVehicle);
app.delete('/api/admin/vehicles/:id', verifyToken, requireAdmin, deleteVehicle);
app.get('/api/admin/audit-logs', verifyToken, requireAdmin, getAuditLogs);


// Rutas de Administración de Usuarios (Requieren Token + Ser Admin)
app.get('/api/admin/users', verifyToken, requireAdmin, getAllUsers);
app.post('/api/admin/users', verifyToken, requireAdmin, createUser);
app.put('/api/admin/users/:id', verifyToken, requireAdmin, updateUser);
app.delete('/api/admin/users/:id', verifyToken, requireAdmin, deleteUser);

// 3. Endpoint de salud (opcional, para saber que la API pura responde)
app.get('/api', (req, res) => {
  res.send('API de SAEDocs funcionando 🚛');
});

// Levantar el servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});