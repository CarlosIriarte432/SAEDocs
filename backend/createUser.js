require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./config/db');

async function createAdmin() {
  const hashedPassword = await bcrypt.hash('user123', 10);
  try {
    await db.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
      ['Carlos (C)', 'darwin@saedocs.cl', hashedPassword, 'admin']
    );
    console.log('✅ Usuario admin creado con éxito. (Email: darwin@saedocs.cl | Pass: admin123)');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  process.exit();
}
createAdmin();