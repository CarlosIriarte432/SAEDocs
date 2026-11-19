// backend/scripts/revertGoTruck.js
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const db = require('../config/db');

async function revertSync() {
  const filePath = path.join(__dirname, 'last_sync_ids.json');

  if (!fs.existsSync(filePath)) {
    console.log('⚠️ No se encontró last_sync_ids.json. Nada que revertir.');
    process.exit(0);
  }

  const ids = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (!Array.isArray(ids) || ids.length === 0) {
    console.log('⚠️ El archivo no tiene IDs registrados.');
    process.exit(0);
  }

  try {
    const res = await db.query(
      'DELETE FROM vehicles WHERE id = ANY($1::int[])',
      [ids]
    );
    console.log(`♻️ Rollback completado: ${res.rowCount} vehículos eliminados de Neon.`);
    fs.unlinkSync(filePath); // Limpia el archivo tras revertir
    process.exit(0);
  } catch (error) {
    console.error('❌ Error al revertir:', error.message);
    process.exit(1);
  }
}

revertSync();