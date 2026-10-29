const db = require('./db');

const createTables = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      role VARCHAR(50) DEFAULT 'coordinador',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id SERIAL PRIMARY KEY,
      plate VARCHAR(10) UNIQUE NOT NULL,
      type VARCHAR(50),
      brand VARCHAR(50),
      internal_number VARCHAR(50),
      status VARCHAR(20) DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS document_types (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      requires_expiration BOOLEAN DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS vehicle_documents (
      id SERIAL PRIMARY KEY,
      vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
      document_type_id INTEGER REFERENCES document_types(id),
      cloudinary_url TEXT NOT NULL,
      cloudinary_public_id TEXT,
      expiration_date DATE,
      uploaded_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    console.log('⏳ Creando tablas en la base de datos...');
    await db.query(queryText);
    
    // Insertamos tipos de documentos por defecto para tener con qué probar
    await db.query(`
      INSERT INTO document_types (name, requires_expiration) 
      VALUES 
        ('SOAP', true),
        ('Revisión Técnica', true),
        ('Permiso de Circulación', true),
        ('Padrón', false)
      ON CONFLICT DO NOTHING;
    `);

    console.log('✅ Tablas creadas e inicializadas con éxito.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error creando las tablas:', err);
    process.exit(1);
  }
};

createTables();