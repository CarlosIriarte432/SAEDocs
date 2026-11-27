const db = require('../config/db');
const { registrarAuditoria } = require('../utils/auditLogger');

let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch {
  bcrypt = require('bcrypt');
}

const VALID_ROLES = ['admin', 'user', 'lector'];

// ==========================================
// 1. LISTAR TODOS LOS USUARIOS + ESTADÍSTICAS
// ==========================================
const getAllUsers = async (req, res) => {
  try {
    const query = `
      SELECT
        u.*,
        COALESCE(docs.total_docs, 0)::int AS total_docs,
        COALESCE(logs.total_actions, 0)::int AS total_actions,
        logs.last_activity
      FROM users u
      LEFT JOIN (
        SELECT uploaded_by, COUNT(*) AS total_docs
        FROM vehicle_documents
        GROUP BY uploaded_by
      ) docs ON docs.uploaded_by = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS total_actions, MAX(created_at) AS last_activity
        FROM audit_logs
        GROUP BY user_id
      ) logs ON logs.user_id = u.id
      ORDER BY u.id ASC
    `;

    const { rows } = await db.query(query);

    // Nunca enviamos el hash de la contraseña al frontend
    const safeUsers = rows.map(({ password, password_hash, ...rest }) => rest);

    res.json({ success: true, data: safeUsers });
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({ success: false, error: 'Error al obtener la lista de usuarios.' });
  }
};

// ==========================================
// 2. CREAR NUEVO USUARIO
// ==========================================
const createUser = async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ success: false, error: 'Todos los campos son obligatorios.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ success: false, error: 'Rol inválido.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();

  try {
    const existing = await db.query('SELECT id FROM users WHERE LOWER(email) = $1', [cleanEmail]);
    if (existing.rowCount > 0) {
      return res.status(400).json({ success: false, error: 'Ya existe un usuario con ese correo.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role`,
      [cleanName, cleanEmail, hashedPassword, role]
    );

    await registrarAuditoria({
      user: req.user,
      action: 'CREO_USUARIO',
      entityType: 'USUARIO',
      details: `Creó cuenta para ${cleanName} (${cleanEmail}) con rol ${role.toUpperCase()}`
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creando usuario:', error);
    res.status(500).json({ success: false, error: 'Error al crear el usuario.' });
  }
};

// ==========================================
// 3. EDITAR USUARIO (Nombre, correo, rol y/o contraseña)
// ==========================================
const updateUser = async (req, res) => {
  const { id } = req.params;
  const { name, email, role, password } = req.body;

  if (!name || !email || !role) {
    return res.status(400).json({ success: false, error: 'Nombre, correo y rol son obligatorios.' });
  }

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ success: false, error: 'Rol inválido.' });
  }

  if (password && password.length < 6) {
    return res.status(400).json({ success: false, error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }

  // Evitar que el administrador actual se quite sus propios permisos de admin
  if (Number(req.user.id) === Number(id) && role !== 'admin') {
    return res.status(400).json({
      success: false,
      error: 'No puedes cambiar tu propio rol de administrador mientras tienes sesión activa.'
    });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();

  try {
    const currentRes = await db.query('SELECT id, name, email, role FROM users WHERE id = $1', [id]);
    if (currentRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
    }
    const oldUser = currentRes.rows[0];

    const emailDup = await db.query(
      'SELECT id FROM users WHERE LOWER(email) = $1 AND id <> $2',
      [cleanEmail, id]
    );
    if (emailDup.rowCount > 0) {
      return res.status(400).json({ success: false, error: 'Ese correo ya está en uso por otra cuenta.' });
    }

    let result;
    if (password && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, 10);
      result = await db.query(
        `UPDATE users
         SET name = $1, email = $2, role = $3, password = $4
         WHERE id = $5
         RETURNING id, name, email, role`,
        [cleanName, cleanEmail, role, hashedPassword, id]
      );
    } else {
      result = await db.query(
        `UPDATE users
         SET name = $1, email = $2, role = $3
         WHERE id = $4
         RETURNING id, name, email, role`,
        [cleanName, cleanEmail, role, id]
      );
    }

    const cambios = [];
    if (oldUser.name !== cleanName) cambios.push(`nombre (${oldUser.name} → ${cleanName})`);
    if (oldUser.email !== cleanEmail) cambios.push(`correo (${oldUser.email} → ${cleanEmail})`);
    if (oldUser.role !== role) cambios.push(`rol (${oldUser.role} → ${role})`);
    if (password && password.trim() !== '') cambios.push('actualizó contraseña');

    await registrarAuditoria({
      user: req.user,
      action: 'EDITO_USUARIO',
      entityType: 'USUARIO',
      details: `Editó usuario ${cleanName}: ${cambios.length ? cambios.join(', ') : 'sin cambios relevantes'}`
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error actualizando usuario:', error);
    res.status(500).json({ success: false, error: 'Error al actualizar el usuario.' });
  }
};

// ==========================================
// 4. ELIMINAR USUARIO
// ==========================================
const deleteUser = async (req, res) => {
  const { id } = req.params;

  if (Number(req.user.id) === Number(id)) {
    return res.status(400).json({
      success: false,
      error: 'No puedes eliminar tu propia cuenta mientras estás conectado.'
    });
  }

  try {
    const userRes = await db.query('SELECT id, name, email, role FROM users WHERE id = $1', [id]);
    if (userRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
    }
    const targetUser = userRes.rows[0];

    // Desvinculamos documentos subidos por este usuario para no perder archivos históricos
    await db.query('UPDATE vehicle_documents SET uploaded_by = NULL WHERE uploaded_by = $1', [id]).catch(() => {});

    await db.query('DELETE FROM users WHERE id = $1', [id]);

    await registrarAuditoria({
      user: req.user,
      action: 'ELIMINO_USUARIO',
      entityType: 'USUARIO',
      details: `Eliminó cuenta de ${targetUser.name} (${targetUser.email} • ${targetUser.role})`
    });

    res.json({ success: true, message: 'Usuario eliminado correctamente.' });
  } catch (error) {
    console.error('Error eliminando usuario:', error);
    res.status(500).json({ success: false, error: 'Error al eliminar el usuario.' });
  }
};

module.exports = { getAllUsers, createUser, updateUser, deleteUser };