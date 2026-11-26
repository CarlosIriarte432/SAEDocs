const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'Z3r0P1ng_S43D0cs_S3cr3t_2026';

// Verifica si el usuario está logueado
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];
  
  if (!token) return res.status(403).json({ error: 'Acceso denegado. Se requiere token.' });
  
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified; 
    next(); 
  } catch (error) {
    res.status(401).json({ error: 'Token inválido o expirado.' });
  }
};

// Verifica si el usuario tiene rango de Administrador
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Privilegios de administrador requeridos.' });
  }
  next();
};

// Agrega esto debajo de requireAdmin en backend/middlewares/authMiddleware.js
const requireUploader = (req, res, next) => {
  const allowedRoles = ['admin', 'user'];
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado: tu perfil es de solo lectura.'
    });
  }
  next();
};

module.exports = { verifyToken, requireAdmin, requireUploader };
