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

// ... (tu función getVehicleWithDocs sigue intacta arriba)

// [NUEVO] Listar toda la flota para el Panel Admin
const getAllVehicles = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM vehicles ORDER BY id DESC');
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error en getAllVehicles:', error);
    res.status(500).json({ error: 'Error obteniendo la flota' });
  }
};

// [NUEVO] Registrar un nuevo vehículo
const addVehicle = async (req, res) => {
  const { plate, type, internal_number } = req.body;
  try {
    // 1. Evitar duplicados
    const { rows: existing } = await db.query('SELECT id FROM vehicles WHERE plate = $1', [plate.toUpperCase()]);
    if (existing.length > 0) return res.status(400).json({ error: 'La patente ya está registrada.' });

    // 2. Insertar
    const result = await db.query(
      'INSERT INTO vehicles (plate, type, internal_number) VALUES ($1, $2, $3) RETURNING *',
      [plate.toUpperCase(), type, internal_number || null]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error en addVehicle:', error);
    res.status(500).json({ error: 'Error al registrar vehículo' });
  }
};

// [NUEVO] Eliminar un vehículo
const deleteVehicle = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM vehicles WHERE id = $1', [id]);
    res.json({ success: true, message: 'Vehículo eliminado correctamente' });
  } catch (error) {
    console.error('Error en deleteVehicle:', error);
    res.status(500).json({ error: 'Error al eliminar vehículo' });
  }
};

// [NUEVO] Obtener estadísticas globales para el Dashboard
const getDashboardStats = async (req, res) => {
  try {
    // 1. Extraemos cada vehículo y su documento MÁS RECIENTE por tipo
const query = `
      SELECT DISTINCT ON (v.id, d.document_type_id)
        v.id AS vehicle_id,
        v.plate,
        v.type,
        v.internal_number,
        d.document_type_id AS doc_type,
        d.expiration_date
      FROM vehicles v
      LEFT JOIN vehicle_documents d ON v.id = d.vehicle_id
      ORDER BY v.id, d.document_type_id, d.created_at DESC;
    `;
    const { rows } = await db.query(query);

    // 2. Agrupamos los documentos
    const vehiclesMap = {};
    rows.forEach(row => {
      if (!vehiclesMap[row.vehicle_id]) {
        vehiclesMap[row.vehicle_id] = { id: row.vehicle_id, plate: row.plate, type: row.type, internal_number: row.internal_number, docs: {} };
      }
      if (row.doc_type) {
        // Guardamos un objeto para saber que existe físicamente en la BD
        vehiclesMap[row.vehicle_id].docs[row.doc_type] = { date: row.expiration_date };
      }
    });

    const today = new Date();
    today.setHours(today.getHours() - 4); 
    today.setHours(0, 0, 0, 0); // Forzamos medianoche estricta
    
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    const stats = { alDia: [], porVencer: [], vencidos: [] };
    const REQUIRED_DOCS = ['1', '2', '3', '4'];
    const docNames = { '1': 'SOAP', '2': 'Rev. Técnica', '3': 'Permiso de circulación', '4': 'Padrón' };

    // 3. Motor de Clasificación
    Object.values(vehiclesMap).forEach(vehicle => {
      let missing = [];
      let expired = [];
      let expiring = [];

      REQUIRED_DOCS.forEach(docType => {
        const docRecord = vehicle.docs[docType];
        const docName = docNames[docType];
        
        // A. Si no existe, falta
        if (!docRecord) {
          missing.push(docName);
          return;
        }

        // B. Regla Padrón
        if (docType === '4') {
          return; 
        }

        // C. Validar fechas
        if (docRecord.date) {
          const expDate = new Date(docRecord.date);
          expDate.setHours(0, 0, 0, 0);

          if (expDate <= today) {
            expired.push(docName);
          } else if (expDate <= thirtyDaysFromNow) {
            expiring.push(docName);
          }
        } else {
          missing.push(docName);
        }
      });

      // Guardamos la estructura cruda para que el frontend la dibuje
      vehicle.alerts = { missing, expired, expiring };

      // Clasificación final
      if (expired.length > 0 || missing.length > 0) {
        stats.vencidos.push(vehicle);
      } else if (expiring.length > 0) {
        stats.porVencer.push(vehicle);
      } else {
        stats.alDia.push(vehicle);
      }
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error en getDashboardStats:', error);
    res.status(500).json({ error: 'Error calculando estadísticas de flota' });
  }
};


// Actualiza el module.exports para exportar todo
module.exports = { getVehicleWithDocs, getAllVehicles, addVehicle, deleteVehicle, getDashboardStats };
