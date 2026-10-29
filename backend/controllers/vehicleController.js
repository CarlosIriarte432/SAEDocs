const db = require('../config/db');

const getVehicleWithDocs = async (req, res) => {
  const { plate } = req.params;
  
  try {
    const query = `
      SELECT 
        v.id, v.plate, v.type, v.internal_number,
        d.id AS doc_id, d.cloudinary_url, d.expiration_date, d.created_at,
        dt.name AS document_name
      FROM vehicles v
      LEFT JOIN vehicle_documents d ON v.id = d.vehicle_id
      LEFT JOIN document_types dt ON d.document_type_id = dt.id
      WHERE v.plate = $1
      ORDER BY d.created_at DESC
    `;
    
    const { rows } = await db.query(query, [plate.toUpperCase()]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Vehículo no encontrado en la flota' });
    }

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error en getVehicleWithDocs:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { getVehicleWithDocs };