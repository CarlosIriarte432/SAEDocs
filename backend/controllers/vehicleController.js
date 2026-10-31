const db = require('../config/db');

const getVehicleWithDocs = async (req, res) => {
  const { plate } = req.params;
  try {
    const query = `
      SELECT 
        v.id, v.plate, v.type, v.brand, v.branch,
        d.id AS doc_id, d.cloudinary_url, d.expiration_date, d.created_at,
        dt.name AS document_name
      FROM vehicles v
      LEFT JOIN vehicle_documents d ON v.id = d.vehicle_id
      LEFT JOIN document_types dt ON d.document_type_id = dt.id
      WHERE v.plate = $1
      ORDER BY d.created_at DESC
    `;
    const { rows } = await db.query(query, [plate.toUpperCase()]);
    if (rows.length === 0) return res.status(404).json({ error: 'Vehículo no encontrado en la flota' });
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const getAllVehicles = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM vehicles ORDER BY id DESC');
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo la flota' });
  }
};

const addVehicle = async (req, res) => {
  const { plate, type, brand, branch } = req.body;
  try {
    const { rows: existing } = await db.query('SELECT id FROM vehicles WHERE plate = $1', [plate.toUpperCase()]);
    if (existing.length > 0) return res.status(400).json({ error: 'La patente ya está registrada.' });

    const result = await db.query(
      'INSERT INTO vehicles (plate, type, brand, branch) VALUES ($1, $2, $3, $4) RETURNING *',
      [plate.toUpperCase(), type, brand || 'Sin Marca', branch || 'Coquimbo']
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar vehículo' });
  }
};

const deleteVehicle = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM vehicles WHERE id = $1', [id]);
    res.json({ success: true, message: 'Vehículo eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar vehículo' });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT ON (v.id, d.document_type_id)
        v.id AS vehicle_id, v.plate, v.type, v.brand, v.branch,
        d.document_type_id AS doc_type, d.expiration_date
      FROM vehicles v
      LEFT JOIN vehicle_documents d ON v.id = d.vehicle_id
      ORDER BY v.id, d.document_type_id, d.created_at DESC;
    `;
    const { rows } = await db.query(query);

    const vehiclesMap = {};
    rows.forEach(row => {
      if (!vehiclesMap[row.vehicle_id]) {
        vehiclesMap[row.vehicle_id] = { id: row.vehicle_id, plate: row.plate, type: row.type, brand: row.brand, branch: row.branch, docs: {} };
      }
      if (row.doc_type) vehiclesMap[row.vehicle_id].docs[row.doc_type] = { date: row.expiration_date };
    });

    const today = new Date();
    today.setHours(today.getHours() - 4, 0, 0, 0); 
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    const stats = { alDia: [], porVencer: [], vencidos: [] };
    const REQUIRED_DOCS = ['1', '2', '3', '4'];
    const docNames = { '1': 'SOAP', '2': 'Rev. Técnica', '3': 'Permiso de circulación', '4': 'Padrón' };

    Object.values(vehiclesMap).forEach(vehicle => {
      let missing = [], expired = [], expiring = [];

      REQUIRED_DOCS.forEach(docType => {
        const docRecord = vehicle.docs[docType];
        const docName = docNames[docType];
        
        if (!docRecord) {
          missing.push(docName);
          return;
        }
        if (docType === '4') return; // Padrón no vence

        if (docRecord.date) {
          const expDate = new Date(docRecord.date);
          expDate.setHours(0, 0, 0, 0);
          if (expDate <= today) expired.push(docName);
          else if (expDate <= thirtyDaysFromNow) expiring.push(docName);
        } else {
          missing.push(docName);
        }
      });

      vehicle.alerts = { missing, expired, expiring };

      if (expired.length > 0 || missing.length > 0) stats.vencidos.push(vehicle);
      else if (expiring.length > 0) stats.porVencer.push(vehicle);
      else stats.alDia.push(vehicle);
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ error: 'Error calculando estadísticas' });
  }
};

module.exports = { getVehicleWithDocs, getAllVehicles, addVehicle, deleteVehicle, getDashboardStats };