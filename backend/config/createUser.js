// backend/scripts/createUser.js
const path = require('path');
const bcrypt = require('bcryptjs'); // Cambia a 'bcrypt' si es el paquete que usas en package.json
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const db = require('../config/db');

async function createUser() {
  // 👇 Edita estos 4 datos antes de correr el script
  const name = 'Sebastian Carvajal';
  const email = 'scr@sae.cl';
  const plainPassword = 'scr123';
  const role = 'lector'; // 'admin' o 'operator' (cualquier rol distinto de 'admin' queda sin acceso a admin.html)

  try {
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    // ⚠️ Verifica si tu columna en Neon se llama 'password' o 'password_hash'
    const res = await db.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role`,
      [name, email.toLowerCase().trim(), hashedPassword, role]
    );

    console.log('✅ Usuario creado con éxito:', res.rows[0]);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creando usuario:', error.message);
    process.exit(1);
  }
}

createUser();