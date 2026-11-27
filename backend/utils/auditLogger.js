// backend/utils/auditLogger.js
const db = require('../config/db');

async function registrarAuditoria({ user, fallbackUserId, action, entityType, plate, details }) {
  try {
    const userId = user?.id || fallbackUserId || null;
    let userName = user?.name || null;

    // Si el JWT no traía el nombre, lo buscamos en la tabla users
    if (!userName && userId) {
      const uRes = await db.query('SELECT name FROM users WHERE id = $1', [userId]);
      if (uRes.rowCount > 0) userName = uRes.rows[0].name;
    }

    await db.query(
      `INSERT INTO audit_logs (user_id, user_name, action, entity_type, plate, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, userName || 'Usuario Sistema', action, entityType, plate || null, details]
    );
  } catch (err) {
    console.error('⚠️ Error guardando registro de auditoría:', err.message);
  }
}

module.exports = { registrarAuditoria };