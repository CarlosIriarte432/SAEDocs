const cloudinary = require('../config/cloudinary');
const db = require('../config/db');
const pdfParseModule = require('pdf-parse');
const sharp = require('sharp');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const PROMPT_ANALISIS = `
Eres un extractor de datos para documentos vehiculares de Chile.
Analiza el documento y devuelve ÚNICAMENTE un JSON válido con esta estructura exacta:
{
  "plate": "PATENTE sin guiones ni espacios en mayúsculas (ej: CJBB63) o null si no aparece",
  "document_type_id": número entero según el tipo: 1 = SOAP, 2 = Revisión Técnica, 3 = Permiso de Circulación, 4 = Padrón (Certificado de Inscripción), o null si no es claro,
  "expiration_date": "YYYY-MM-DD" con la fecha de vencimiento/vigencia hasta, o null si es Padrón o no aparece
}
No agregues texto adicional ni bloques markdown.
`;

// Helper compatible con pdf-parse v1 (función) y v2+ (clase PDFParse)
async function extractPdfText(buffer) {
  if (typeof pdfParseModule === 'function') {
    const data = await pdfParseModule(buffer);
    return (data.text || '').trim();
  }
  if (pdfParseModule.PDFParse) {
    const parser = new pdfParseModule.PDFParse({ data: buffer });
    const data = await parser.getText();
    await parser.destroy();
    return (data.text || '').trim();
  }
  return '';
}

const analyzeDocument = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No se adjuntó ningún documento' });
    }

    let parts = [];
    let method = 'vision';

    // RUTA 1 (Rápida < 1s): Si es PDF, intentar extraer texto plano primero
    if (file.mimetype === 'application/pdf') {
      try {
        const cleanText = await extractPdfText(file.buffer);
        if (cleanText.length > 40) {
          method = 'text';
          parts = [
            { text: `${PROMPT_ANALISIS}\n\nTexto extraído del documento:\n${cleanText.slice(0, 6000)}` }
          ];
        }
      } catch (pdfErr) {
        console.warn('No se pudo extraer texto del PDF, usando visión:', pdfErr.message);
      }
    }

    // RUTA 2 (Respaldo 2-3s): Imagen comprimida en RAM o PDF escaneado
    if (parts.length === 0) {
      let base64Data;
      let mimeType = file.mimetype;

      if (file.mimetype.startsWith('image/')) {
        // Copia liviana en RAM solo para la IA (no altera el archivo original)
        const optimizedBuffer = await sharp(file.buffer)
          .resize({ width: 1024, withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();

        base64Data = optimizedBuffer.toString('base64');
        mimeType = 'image/jpeg';
      } else {
        base64Data = file.buffer.toString('base64');
      }

      parts = [
        { text: PROMPT_ANALISIS },
        { inlineData: { mimeType, data: base64Data } }
      ];
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json'
      }
    });

    const rawText = (response.text || '').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(rawText);

    if (parsed.plate) {
      parsed.plate = parsed.plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    }

    res.status(200).json({
      success: true,
      method,
      data: {
        plate: parsed.plate || null,
        document_type_id: parsed.document_type_id || null,
        expiration_date: parsed.document_type_id === 4 ? null : (parsed.expiration_date || null)
      }
    });

  } catch (error) {
    console.error('Error analizando documento con IA:', error);
    res.status(500).json({ error: 'No se pudo analizar el documento automáticamente' });
  }
};

const uploadDocument = async (req, res) => {
  try {
    // Estos datos vendrán del formulario del Frontend
    const { vehicle_id, document_type_id, expiration_date, uploaded_by } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No se adjuntó ningún documento' });
    }

    // 1. Subir a Cloudinary vía Stream (archivo original sin compresión)
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
  uploadDocument,
  analyzeDocument
};