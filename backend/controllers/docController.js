const cloudinary = require('../config/cloudinary');
const db = require('../config/db');

const uploadDocument = async (req, res) => {
  try {
    // Estos datos vendrán del formulario del Frontend
    const { vehicle_id, document_type_id, expiration_date, uploaded_by } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No se adjuntó ningún documento' });
    }

    // 1. Subir a Cloudinary vía Stream (porque el archivo está en memoria)
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'saedocs/documentos', resource_type: 'auto' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(file.buffer);
    });

    // 2. Guardar el registro en la base de datos Neon
    const query = `
      INSERT INTO vehicle_documents 
      (vehicle_id, document_type_id, cloudinary_url, cloudinary_public_id, expiration_date, uploaded_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    
    const { rows } = await db.query(query, [
      vehicle_id, 
      document_type_id, 
      uploadResult.secure_url, 
      uploadResult.public_id, 
      expiration_date || null, // Algunos documentos (Padrón) no vencen
      uploaded_by
    ]);

    res.status(201).json({ 
      success: true, 
      message: 'Documento subido con éxito', 
      data: rows[0] 
    });

  } catch (error) {
    console.error('Error al subir documento:', error);
    res.status(500).json({ error: 'Error interno guardando el documento' });
  }
};

module.exports = {
  uploadDocument
};