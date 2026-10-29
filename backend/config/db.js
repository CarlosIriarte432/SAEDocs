const { Pool } = require('pg');
const path = require('path');

// Esto fuerza a dotenv a buscar el .env en la raíz de SAEDocs
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('connect', () => {
  console.log('🟢 Conectado a la base de datos en Neon');
});

pool.on('error', (err) => {
  console.error('🔴 Error inesperado en el cliente de la base de datos', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};