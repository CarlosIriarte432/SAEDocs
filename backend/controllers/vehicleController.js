const db = require('../config/db');
const cloudinary = require('../config/cloudinary');
const { registrarAuditoria } = require('../utils/auditLogger');

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
    const plateClean = plate.trim().toUpperCase();
    const { rows: existing } = await db.query('SELECT id FROM vehicles WHERE plate = $1', [plateClean]);
    if (existing.length > 0) return res.status(400).json({ error: 'La patente ya está registrada.' });

    const result = await db.query(
      'INSERT INTO vehicles (plate, type, brand, branch) VALUES ($1, $2, $3, $4) RETURNING *',
      [plateClean, type, brand || 'Sin Marca', branch || 'Coquimbo']
    );

    await registrarAuditoria({
      user: req.user,
      action: 'AGREGO_VEHICULO',
      entityType: 'VEHICULO',
      plate: plateClean,
      details: `Registró ${type} (${brand || 'Sin Marca'} • ${branch || 'Coquimbo'})`
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar vehículo' });
  }
};

const deleteVehicle = async (req, res) => {
  const { id } = req.params;
  try {
    const vehRes = await db.query('SELECT plate, type, branch FROM vehicles WHERE id = $1', [id]);
    const veh = vehRes.rows[0];

    if (veh) {
      const plate = veh.plate.trim().toUpperCase();
      const folderPath = `saedocs/documentos/${plate}`;

      // 1. Eliminar los archivos registrados en Neon por su public_id real
      const docsRes = await db.query(
        'SELECT cloudinary_url FROM vehicle_documents WHERE vehicle_id = $1',
        [id]
      );
      for (const row of docsRes.rows) {
        const match = row.cloudinary_url?.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
        if (match && match[1]) {
          const pubId = decodeURIComponent(match[1]);
          await cloudinary.uploader.destroy(pubId, { resource_type: 'image', invalidate: true }).catch(() => {});
          await cloudinary.uploader.destroy(pubId, { resource_type: 'raw', invalidate: true }).catch(() => {});
        }
      }

      // 2. Eliminar cualquier otro recurso en el asset_folder (Dynamic Folders) y borrar la carpeta
      try {
        if (typeof cloudinary.api.delete_resources_by_asset_folder === 'function') {
          await cloudinary.api.delete_resources_by_asset_folder(folderPath).catch(() => {});
        } else if (cloudinary.search) {
          const searchRes = await cloudinary.search.expression(`asset_folder="${folderPath}"`).execute().catch(() => null);
          if (searchRes?.resources?.length) {
            for (const asset of searchRes.resources) {
              await cloudinary.uploader.destroy(asset.public_id, { resource_type: asset.resource_type || 'image', invalidate: true }).catch(() => {});
            }
          }
        }

        await cloudinary.api.delete_resources_by_prefix(`${folderPath}/`, { resource_type: 'image' }).catch(() => {});
        await cloudinary.api.delete_resources_by_prefix(`${folderPath}/`, { resource_type: 'raw' }).catch(() => {});
        await cloudinary.api.delete_folder(folderPath);
      } catch (cloudErr) {
        console.warn(`Aviso limpiando carpeta Cloudinary (${folderPath}):`, cloudErr?.error?.message || cloudErr.message || cloudErr);
      }
    }

    // 3. Eliminar el vehículo de Neon
    await db.query('DELETE FROM vehicles WHERE id = $1', [id]);

    if (veh) {
      await registrarAuditoria({
        user: req.user,
        action: 'ELIMINO_VEHICULO',
        entityType: 'VEHICULO',
        plate: veh.plate,
        details: `Eliminó ${veh.type} de sucursal ${veh.branch || 'Coquimbo'}`
      });
    }

    res.json({ success: true, message: 'Vehículo y carpeta eliminados correctamente' });
  } catch (error) {
    console.error('Error al eliminar vehículo:', error);
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
          const iso = docRecord.date instanceof Date
            ? docRecord.date.toISOString().split('T')[0]
            : String(docRecord.date).split('T')[0];
          const [y, m, d] = iso.split('-');
          const expDate = new Date(Number(y), Number(m) - 1, Number(d));
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

const getAuditLogs = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, user_name, action, entity_type, plate, details, created_at
       FROM audit_logs
       ORDER BY created_at DESC
       LIMIT 200`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error obteniendo audit logs:', error);
    res.status(500).json({ success: false, error: 'Error obteniendo el historial de cambios' });
  }
};

module.exports = { getVehicleWithDocs, getAllVehicles, addVehicle, deleteVehicle, getDashboardStats, getAuditLogs };