const db = require('../config/db');
const cloudinary = require('../config/cloudinary');
const { registrarAuditoria } = require('../utils/auditLogger');

const DOC_PREFIX = {
  '1': 'SOAP',
  '2': 'Revision_Tecnica',
  '3': 'Permiso_Circulacion',
  '4': 'Padron'
};

const DOC_LABELS = {
  '1': 'SOAP',
  '2': 'Revisión Técnica',
  '3': 'Permiso de Circulación',
  '4': 'Padrón'
};

function normalizarIso(val) {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const parsed = new Date(str);
  return isNaN(parsed) ? '' : parsed.toISOString().split('T')[0];
}

function formatearFechaCL(rawDate) {
  const iso = normalizarIso(rawDate);
  if (!iso) return 'Sin fecha';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

// ==========================================
// 1. SUBIR NUEVO DOCUMENTO
// ==========================================
const uploadDocument = async (req, res) => {
  const { vehicle_id, document_type_id, expiration_date, uploaded_by } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ success: false, error: 'Debes seleccionar un archivo.' });
  }

  try {
    const vehRes = await db.query('SELECT plate FROM vehicles WHERE id = $1', [vehicle_id]);
    if (vehRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Vehículo no encontrado.' });
    }

    const plate = vehRes.rows[0].plate.trim().toUpperCase();
    const docPrefix = DOC_PREFIX[String(document_type_id)] || 'Documento';
    const docLabel = DOC_LABELS[String(document_type_id)] || 'Documento';

    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `saedocs/documentos/${plate}`,
          public_id: `${docPrefix}_${Date.now()}`,
          resource_type: 'auto'
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(file.buffer);
    });

    const expDateValue = expiration_date && expiration_date !== '' ? expiration_date : null;

    const result = await db.query(
      `INSERT INTO vehicle_documents (vehicle_id, document_type_id, cloudinary_url, expiration_date, uploaded_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [vehicle_id, document_type_id, uploadResult.secure_url, expDateValue, uploaded_by || 1]
    );

    const detalleVenc = String(document_type_id) === '4'
      ? 'Documento Permanente'
      : `Vence: ${formatearFechaCL(expDateValue)}`;

    await registrarAuditoria({
      user: req.user,
      fallbackUserId: uploaded_by,
      action: 'SUBIO_DOCUMENTO',
      entityType: 'DOCUMENTO',
      plate,
      details: `Agregó ${docLabel} (${detalleVenc})`
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error subiendo documento:', error);
    res.status(500).json({ success: false, error: 'Error al subir el documento.' });
  }
};

// ==========================================
// 2. EDITAR DOCUMENTO EXISTENTE
// ==========================================
const updateDocument = async (req, res) => {
  const { id } = req.params;
  const { expiration_date } = req.body;
  const file = req.file;

  if (!expiration_date && !file) {
    return res.status(400).json({ success: false, error: 'Debes enviar una fecha o un archivo nuevo.' });
  }

  try {
    const existing = await db.query(
      `SELECT vd.*, v.plate
       FROM vehicle_documents vd
       JOIN vehicles v ON v.id = vd.vehicle_id
       WHERE vd.id = $1`,
      [id]
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Documento no encontrado.' });
    }
    const oldDoc = existing.rows[0];
    const plate = oldDoc.plate.trim().toUpperCase();
    const docLabel = DOC_LABELS[String(oldDoc.document_type_id)] || 'Documento';

    let newUrl = oldDoc.cloudinary_url;

    if (file) {
      const docPrefix = DOC_PREFIX[String(oldDoc.document_type_id)] || 'Documento';

      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `saedocs/documentos/${plate}`,
            public_id: `${docPrefix}_${Date.now()}`,
            resource_type: 'auto'
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(file.buffer);
      });

      newUrl = uploadResult.secure_url;

      const match = oldDoc.cloudinary_url?.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
      if (match && match[1]) {
        cloudinary.uploader.destroy(match[1]).catch(() => {});
      }
    }

    const finalDate = expiration_date !== undefined && expiration_date !== ''
      ? expiration_date
      : oldDoc.expiration_date;

    const result = await db.query(
      `UPDATE vehicle_documents
       SET expiration_date = $1,
           cloudinary_url = $2
       WHERE id = $3
       RETURNING id, expiration_date, cloudinary_url`,
      [finalDate, newUrl, id]
    );

    // Armamos el detalle exacto de lo que se editó
    const cambios = [];
    const oldIso = oldDoc.expiration_date ? String(oldDoc.expiration_date).split('T')[0] : '';
    const newIso = finalDate ? String(finalDate).split('T')[0] : '';

    if (file) cambios.push('reemplazó archivo adjunto');
    if (oldIso !== newIso) {
      cambios.push(`cambió vencimiento (${formatearFechaCL(oldIso)} → ${formatearFechaCL(newIso)})`);
    }

    await registrarAuditoria({
      user: req.user,
      action: 'EDITO_DOCUMENTO',
      entityType: 'DOCUMENTO',
      plate,
      details: `Editó ${docLabel}: ${cambios.length ? cambios.join(' y ') : 'actualizó registro'}`
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error actualizando documento:', error);
    res.status(500).json({ success: false, error: 'Error al actualizar el documento.' });
  }
};

module.exports = { uploadDocument, updateDocument };