const db = require('./db');

const seedDatabase = async () => {
  try {
    console.log('🌱 Sembrando datos de prueba para SAE...');

    // 1. Crear un usuario de prueba
    const userQuery = await db.query(`
      INSERT INTO users (name, email, role) 
      VALUES ('Darwin', 'darwin@sae.cl', 'admin') 
      ON CONFLICT (email) DO UPDATE SET name = 'Darwin'
      RETURNING id;
    `);
    const userId = userQuery.rows[0].id;

    // 2. Crear el camión CJBB63
    const vehicleQuery = await db.query(`
      INSERT INTO vehicles (plate, type, brand, internal_number) 
      VALUES ('CJBB63', 'Tractocamión', 'Volvo', 'TRK-01') 
      ON CONFLICT (plate) DO UPDATE SET type = 'Tractocamión'
      RETURNING id;
    `);
    const vehicleId = vehicleQuery.rows[0].id;

    // 3. Obtener IDs de los tipos de documento (creados en initDB)
    const { rows: docTypes } = await db.query('SELECT id, name FROM document_types');
    const getDocTypeId = (name) => docTypes.find(dt => dt.name === name)?.id;

    // Limpiar documentos previos de este camión por si corres el script varias veces
    await db.query('DELETE FROM vehicle_documents WHERE vehicle_id = $1', [vehicleId]);

    // 4. Insertar documentos simulando los 3 estados del semáforo
    await db.query(`
      INSERT INTO vehicle_documents (vehicle_id, document_type_id, cloudinary_url, expiration_date, uploaded_by)
      VALUES 
        -- Verde: SOAP (Vence en 6 meses)
        ($1, $2, 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', CURRENT_DATE + INTERVAL '6 months', $5),
        -- Amarillo: Revisión Técnica (Vence en 15 días)
        ($1, $3, 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', CURRENT_DATE + INTERVAL '15 days', $5),
        -- Rojo: Permiso de Circulación (Venció hace 5 días)
        ($1, $4, 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', CURRENT_DATE - INTERVAL '5 days', $5)
    `, [
      vehicleId, 
      getDocTypeId('SOAP'), 
      getDocTypeId('Revisión Técnica'), 
      getDocTypeId('Permiso de Circulación'),
      userId
    ]);

    console.log('✅ Camión CJBB63 y sus documentos insertados correctamente.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error sembrando datos:', error);
    process.exit(1);
  }
};

seedDatabase();