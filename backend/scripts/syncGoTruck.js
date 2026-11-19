// backend/scripts/syncGoTruck.js
const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const db = require('../config/db');

// ⚠️ Déjalo en true primero para validar el conteo por empresa antes de insertar
const DRY_RUN = false;

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const gotruckApi = axios.create({
  baseURL: 'https://sae.grupodtg.com/api/sae_ai/v1',
  httpsAgent,
  headers: {
    'Authorization': `Bearer ${process.env.GOTRUCK_API_KEY}`,
    'Accept': 'application/json'
  }
});

// Empresas del Grupo SAE (sin puntos, con guión)
const EMPRESAS_SAE = [
  { rut: '78048910-3', nombre: 'SOCIEDAD TRANSPORTES SAE LTDA' },
  { rut: '76068941-6', nombre: 'TRANSPORTES CORPORATIVOS S.A' },
  { rut: '76196586-7', nombre: 'TRANSPORTES TIR LTDA' }
];

const BRANCH_MAP = {
  'Casa Matriz': 'Coquimbo',
  'Coquimbo': 'Coquimbo',
  'Copiapo': 'Copiapó',
  'Copiapó': 'Copiapó',
  'Santiago': 'Lampa',
  'Iquique': 'Alto Hospicio',
  'La Chimba': 'La Portada',
  'La Negra': 'La Negra',
  'Calama': 'Calama',
  'Caldera': 'Copiapó',
  'Mejillones': 'La Portada'
};

function normalizarMarca(mark) {
  if (!mark || !String(mark).trim()) return 'Sin Marca';
  return String(mark)
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

function normalizarSucursal(branchName) {
  if (!branchName) return 'Coquimbo';
  return BRANCH_MAP[branchName.trim()] || branchName.trim();
}

async function fetchTrucksByRut(rut) {
  let result = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const res = await gotruckApi.get('/trucks', {
      params: { page, per_page: perPage, owner_rut: rut }
    });

    const batch = Array.isArray(res.data) ? res.data : (res.data?.data || []);
    result = result.concat(batch);

    if (batch.length < perPage) break;
    page++;
  }

  return result;
}

async function syncFlota() {
  try {
    console.log('📡 Consultando flota propia en GoTruck por RUT...\n');

    const trucksMap = new Map(); // Evita duplicados si una patente apareciera repetida
    const resumenEmpresas = {};

    for (const emp of EMPRESAS_SAE) {
      const lista = await fetchTrucksByRut(emp.rut);
      resumenEmpresas[`${emp.nombre} (${emp.rut})`] = lista.length;

      for (const t of lista) {
        if (!t.disabled && t.truck) {
          const plate = String(t.truck).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (!trucksMap.has(plate)) {
            trucksMap.set(plate, t);
          }
        }
      }
    }

    const habilitados = Array.from(trucksMap.values());

    console.log('🏢 Conteo por Razón Social:', resumenEmpresas);
    console.log(`✅ Total flota propia habilitada (únicas): ${habilitados.length}`);

    if (habilitados.length === 0) {
      console.log('⚠️ Llegaron 0 registros. Probablemente GoTruck espera el RUT sin guión o con puntos.');
      process.exit(0);
    }

    const resumenSucursales = {};
    const resumenTipos = { 'Vehículo': 0, 'Equipo': 0 };
    const conteoGoTruckTypes = {};

    const listaLimpia = habilitados.map(t => {
      const item = {
        plate: String(t.truck).trim().toUpperCase().replace(/[^A-Z0-9]/g, ''),
        type: t.is_machine ? 'Equipo' : 'Vehículo',
        brand: normalizarMarca(t.mark),
        branch: normalizarSucursal(t.branch_name),
        gotruckType: t.type || 'SIN_TIPO'
      };

      resumenSucursales[item.branch] = (resumenSucursales[item.branch] || 0) + 1;
      resumenTipos[item.type]++;
      conteoGoTruckTypes[item.gotruckType] = (conteoGoTruckTypes[item.gotruckType] || 0) + 1;
      return item;
    });

    console.log('📊 Distribución por tipo:', resumenTipos);
    console.log('🏷️ Códigos gotruckType:', conteoGoTruckTypes);
    console.log('📍 Distribución por sucursal:', resumenSucursales);
    console.log('🔎 Muestra de los primeros 5 registros:', listaLimpia.slice(0, 5));

    if (DRY_RUN) {
      console.log('\n🛑 MODO DRY_RUN ACTIVO: No se escribió nada en Neon. Cambia DRY_RUN = false para poblar.');
      process.exit(0);
    }

    // Inserción segura en Neon guardando IDs para posible rollback
    let insertados = 0;
    let existentes = 0;
    const insertedIds = [];

    for (const v of listaLimpia) {
      const { rows } = await db.query('SELECT id FROM vehicles WHERE plate = $1', [v.plate]);
      if (rows.length > 0) {
        existentes++;
        continue;
      }

      const insertRes = await db.query(
        'INSERT INTO vehicles (plate, type, brand, branch) VALUES ($1, $2, $3, $4) RETURNING id',
        [v.plate, v.type, v.brand, v.branch]
      );
      insertedIds.push(insertRes.rows[0].id);
      insertados++;
    }

    fs.writeFileSync(
      path.join(__dirname, 'last_sync_ids.json'),
      JSON.stringify(insertedIds, null, 2)
    );

    console.log(`\n🎉 Sincronización terminada: ${insertados} patentes nuevas insertadas, ${existentes} ya existían.`);
    console.log('💾 IDs guardados en backend/scripts/last_sync_ids.json.');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error sincronizando con GoTruck:', error.response?.data || error.message);
    process.exit(1);
  }
}

syncFlota();