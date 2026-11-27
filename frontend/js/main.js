// ==========================================
// Variables Globales
// ==========================================
let globalFleetData = { alDia: [], porVencer: [], vencidos: [] };
let currentUserRole = 'lector'; // Por defecto restrictivo hasta validar el usuario
const DOC_TYPES = ['SOAP', 'Revisión Técnica', 'Permiso de Circulación', 'Padrón'];
const DOC_TYPE_IDS = {
  'SOAP': '1',
  'Revisión Técnica': '2',
  'Permiso de Circulación': '3',
  'Padrón': '4'
};

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  const storedUser = localStorage.getItem('saedocs_user');
  if (storedUser) {
    const user = JSON.parse(storedUser);
    currentUserRole = user.role || 'lector';
    document.getElementById('navUserName').textContent = user.name;
    if (user.role === 'admin' && document.getElementById('adminPanelBtn')) {
      document.getElementById('adminPanelBtn').classList.remove('hidden');
    }
  }

  // Cargar estadísticas si estamos en el dashboard
  if (document.getElementById('vista-aldia')) {
    loadDashboardStats();
  }
});

// ==========================================
// MOTOR DE BÚSQUEDA MÚLTIPLE
// ==========================================
document.getElementById('searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const rawInput = document.getElementById('plateInput').value;
  const errorMsg = document.getElementById('errorMsg');
  
  errorMsg.classList.add('hidden');
  document.getElementById('multiDashboardContainer').innerHTML = '';
  
  const plates = rawInput.split(',').map(p => p.trim().toUpperCase()).filter(p => p !== '');
  if (plates.length === 0) return;

  try {
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = 'Buscando... ⏳';
    btn.disabled = true;

    const fetchPromises = plates.map(plate => 
      fetch(AppConfig.URL_SEARCH(plate)).then(res => res.json())
    );

    const results = await Promise.allSettled(fetchPromises);
    
    const successfulVehicles = [];
    const failedPlates = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.success) {
        successfulVehicles.push(result.value.data);
      } else {
        failedPlates.push(plates[index]);
      }
    });

    if (successfulVehicles.length === 0) {
       throw new Error('No se encontró ninguna de las patentes ingresadas.');
    }

    if (failedPlates.length > 0) {
       errorMsg.innerHTML = `⚠️ <b>Atención:</b> No se encontraron: <span class="font-bold text-rose-700">${failedPlates.join(', ')}</span>`;
       errorMsg.classList.remove('hidden');
    }

    renderMultipleDashboards(successfulVehicles);
    
    btn.innerHTML = 'Buscar';
    btn.disabled = false;

  } catch (error) {
    errorMsg.textContent = error.message;
    errorMsg.classList.remove('hidden');
    e.target.querySelector('button[type="submit"]').innerHTML = 'Buscar';
    e.target.querySelector('button[type="submit"]').disabled = false;
  }
});

// ==========================================
// FÁBRICA DE DASHBOARDS DINÁMICOS
// ==========================================
function renderMultipleDashboards(vehiclesArray) {
  const container = document.getElementById('multiDashboardContainer');
  
  if (!window.vehiculosBuscados) window.vehiculosBuscados = {};
  if (!window.vehiculosGps) window.vehiculosGps = {};

  const canUpload = currentUserRole === 'admin' || currentUserRole === 'user';

  vehiclesArray.forEach((vehicleDocs, index) => {
    const vehicle = vehicleDocs[0];
    window.vehiculosBuscados[vehicle.plate] = vehicleDocs;

    // Buscamos el Certificado GPS más reciente de esta patente (si existe)
    const gpsDocs = vehicleDocs.filter(row => row.document_name === 'Certificado GPS' && row.cloudinary_url);
    const latestGps = gpsDocs.length > 0 ? gpsDocs[0] : null;
    window.vehiculosGps[vehicle.plate] = {
      vehicleId: vehicle.id,
      plate: vehicle.plate,
      doc: latestGps
    };
    
    const dashWrapper = document.createElement('div');
    dashWrapper.className = 'opacity-0 translate-y-4 transition-all duration-500 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden';
    
    const gpsBtnHtml = `
      <button onclick="manejarBotonCertificadoGPS('${vehicle.plate}', this)" class="bg-blue-50/60 text-blue-700 border border-blue-200 px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-100 transition-colors shadow-sm flex items-center justify-center gap-2 w-full sm:w-auto">
        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
        </svg>
        Certificado GPS
      </button>
    `;

    const uploadBtnHtml = canUpload
      ? `<button onclick="abrirModalSubida(${vehicle.id}, '${vehicle.plate}')" class="bg-blue-50 text-blue-700 border border-blue-200 px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-100 transition-colors shadow-sm w-full sm:w-auto">
            + Nuevo Documento
          </button>`
      : '';

    dashWrapper.innerHTML = `
      <div class="bg-slate-50 border-b border-slate-200 p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 class="text-3xl font-title text-slate-900 mb-1">Patente: ${vehicle.plate}</h2>
          <p class="text-slate-500 font-medium">${vehicle.type} • ${vehicle.brand || 'Sin Marca'} • <span class="text-slate-700">${vehicle.branch || 'Coquimbo'}</span></p>
        </div>
        <div class="flex flex-wrap gap-3 w-full sm:w-auto">
          ${gpsBtnHtml}
          ${uploadBtnHtml}
          <button onclick="descargarCarpetaZIP('${vehicle.plate}', this)" class="bg-slate-900 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors shadow-sm flex items-center justify-center gap-2 w-full sm:w-auto">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            Descargar
          </button>
        </div>
      </div>
      
      <div class="p-6">
        <div class="flex items-center justify-end mb-4 pr-2">
          <label class="relative inline-flex items-center cursor-pointer group">
            <input type="checkbox" onchange="toggleHistorial(this, 'grid-${vehicle.plate}')" class="sr-only peer">
            <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900 shadow-inner"></div>
            <span class="ml-3 text-sm font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Ver historial antiguo</span>
          </label>
        </div>
        <div id="grid-${vehicle.plate}" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Inyectado por JS -->
        </div>
      </div>
    `;

    container.appendChild(dashWrapper);
    inyectarTarjetasEnGrid(`grid-${vehicle.plate}`, vehicleDocs);

    setTimeout(() => {
      dashWrapper.classList.remove('opacity-0', 'translate-y-4');
    }, 100 * index);
  });
}

function inyectarTarjetasEnGrid(gridId, vehicleDocs) {
  const docsGrid = document.getElementById(gridId);
  const groupedDocs = {};
  DOC_TYPES.forEach(type => groupedDocs[type] = []);
  
  vehicleDocs.forEach(row => {
    if(row.document_name && groupedDocs[row.document_name] !== undefined) {
      groupedDocs[row.document_name].push(row);
    }
  });

  DOC_TYPES.forEach(type => {
    const col = document.createElement('div');
    col.className = 'flex flex-col gap-3 doc-column';
    const docs = groupedDocs[type];

    if (docs.length === 0) {
      col.appendChild(createEmptyCard(type));
    } else {
      col.appendChild(createDocCard(docs[0], type, true));
      
      if (docs.length > 1) {
        const historyContainer = document.createElement('div');
        historyContainer.className = 'history-container hidden flex-col gap-2 pl-3 border-l-2 border-slate-200 mt-1 ml-2 transition-all';
        
        for (let i = 1; i < docs.length; i++) {
           historyContainer.appendChild(createDocCard(docs[i], type, false));
        }
        col.appendChild(historyContainer);
      }
    }
    docsGrid.appendChild(col);
  });
}

function toggleHistorial(checkbox, gridId) {
  const grid = document.getElementById(gridId);
  const historyContainers = grid.querySelectorAll('.history-container');
  historyContainers.forEach(container => {
    if (checkbox.checked) {
      container.classList.remove('hidden');
      container.classList.add('flex');
    } else {
      container.classList.add('hidden');
      container.classList.remove('flex');
    }
  });
}

function createDocCard(doc, typeName, isLatest) {
  let statusConfig = { color: 'bg-emerald-50 border-emerald-200 text-emerald-700', badge: 'bg-emerald-100 text-emerald-800', text: 'Vigente' };
  
  let uploadDate = '--';
  if (doc.created_at) {
    const parsedDate = new Date(doc.created_at);
    if (!isNaN(parsedDate)) {
      uploadDate = parsedDate.toLocaleDateString('es-CL');
    }
  }

  let expText = 'No aplica';

  if (typeName !== 'Padrón' && doc.expiration_date) {
    const [y, m, d] = String(doc.expiration_date).split('T')[0].split('-');
    const expDate = new Date(Number(y), Number(m) - 1, Number(d));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = expDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    expText = expDate.toLocaleDateString('es-CL');

    if (diffDays <= 0) {
      statusConfig = { color: 'bg-rose-50 border-rose-200 text-rose-700', badge: 'bg-rose-100 text-rose-800', text: 'Vencido' };
    } else if (diffDays <= 30) {
      statusConfig = { color: 'bg-amber-50 border-amber-200 text-amber-800', badge: 'bg-amber-100 text-amber-900', text: `Vence en ${diffDays} días` };
    } else {
      statusConfig.text = 'Al día';
    }
  }

  const canEdit = currentUserRole === 'admin' || currentUserRole === 'user';
  const isoDate = doc.expiration_date ? String(doc.expiration_date).split('T')[0] : '';

  const card = document.createElement('div');
  if (isLatest) {
    card.className = `p-5 rounded-xl border shadow-sm ${statusConfig.color} flex flex-col justify-between transition-all min-h-48`;
    card.innerHTML = `
      <div class="flex justify-between items-start mb-2">
        <h3 class="font-bold text-lg leading-tight pr-2">${typeName}</h3>
        <span class="text-[11px] font-bold px-2 py-1 rounded-md text-center tracking-wide uppercase whitespace-nowrap ${statusConfig.badge}">${statusConfig.text}</span>
      </div>
      <div class="mt-auto space-y-1">
        <p class="text-[13px] opacity-80">Actualizado: <span class="font-semibold">${uploadDate}</span></p>
        ${typeName !== 'Padrón'
          ? `<p class="text-sm opacity-90">Vence: <span class="font-bold">${expText}</span></p>`
          : `<p class="text-sm opacity-90 font-bold">Documento Permanente</p>`
        }
        <div class="pt-3 mt-1 border-t border-current/10 flex items-center justify-between gap-2">
          <a href="${doc.cloudinary_url}" target="_blank" class="text-xs font-bold underline underline-offset-2 opacity-90 hover:opacity-100 whitespace-nowrap">Ver Archivo →</a>
          ${canEdit && doc.doc_id
            ? `<button onclick="abrirModalEdicion(${doc.doc_id}, '${doc.plate}', '${typeName}', '${isoDate}')" class="text-xs font-semibold underline underline-offset-2 opacity-75 hover:opacity-100 whitespace-nowrap">Editar documento</button>`
            : ''
          }
        </div>
      </div>
    `;
  } else {
    card.className = `p-3 rounded-lg border bg-white border-slate-200 text-slate-500 flex flex-col relative opacity-70 hover:opacity-100 transition-opacity`;
    card.innerHTML = `
      <div class="flex justify-between items-center mb-1.5">
        <span class="text-[11px] font-semibold uppercase tracking-wide">Anterior</span>
        <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">${statusConfig.text}</span>
      </div>
      <p class="text-[11px]">Subido: ${uploadDate}</p>
      ${typeName !== 'Padrón' ? `<p class="text-[11px]">Vencía: ${expText}</p>` : ''}
      <a href="${doc.cloudinary_url}" target="_blank" class="text-[11px] font-bold underline mt-1.5 text-blue-600">Revisar</a>
    `;
  }
  return card;
}

function createEmptyCard(typeName) {
  const card = document.createElement('div');
  card.className = `p-5 rounded-xl border shadow-sm bg-slate-50 border-slate-200 text-slate-400 flex flex-col justify-between h-48 border-dashed`;
  card.innerHTML = `
    <div class="flex justify-between items-start">
      <h3 class="font-bold text-lg leading-tight text-slate-600 pr-2">${typeName}</h3>
      <span class="text-[11px] font-bold px-2 py-1 rounded-md bg-rose-100 text-rose-800 uppercase tracking-wide whitespace-nowrap">Faltante</span>
    </div>
    <div class="mt-auto text-center">
      <p class="text-xs font-semibold uppercase tracking-widest opacity-60">Sin registro</p>
    </div>
  `;
  return card;
}

// ==========================================
// LÓGICA DE SUBIDA / EDICIÓN EN EL MISMO MODAL
// ==========================================
const uploadModal = document.getElementById('uploadModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const uploadForm = document.getElementById('uploadForm');
const uploadFeedback = document.getElementById('uploadFeedback');
const uploadSubmitBtn = document.getElementById('uploadSubmitBtn');
const docTypeSelect = document.getElementById('docTypeSelect');
const expirationDateInput = document.getElementById('expirationDate');
const expirationDateContainer = document.getElementById('expirationDateContainer');
const fileInput = document.getElementById('fileInput');

let editingDocId = null;

const datePickerInst = typeof flatpickr !== 'undefined'
  ? flatpickr('#expirationDate', {
      locale: 'es',
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'd/m/Y',
      altInputClass: 'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-slate-900 outline-none bg-white text-slate-800',
      allowInput: true
    })
  : null;

function setModalExpirationDate(isoDate) {
  if (datePickerInst) {
    if (isoDate) datePickerInst.setDate(isoDate, true, 'Y-m-d');
    else datePickerInst.clear();
  } else {
    expirationDateInput.value = isoDate || '';
  }
}

function abrirModalSubida(vehId, plate) {
  if (currentUserRole !== 'admin' && currentUserRole !== 'user') return;

  editingDocId = null;
  uploadForm.reset();
  setModalExpirationDate('');
  document.getElementById('modalVehicleId').value = vehId;
  document.querySelector('#uploadModal h3').textContent = `Subir Documento - ${plate}`;

  docTypeSelect.disabled = false;
  fileInput.required = true;
  expirationDateContainer.classList.remove('hidden');
  uploadSubmitBtn.innerHTML = 'Confirmar y Subir';
  uploadFeedback.classList.add('hidden');

  uploadModal.classList.remove('hidden');
}

function abrirModalEdicion(docId, plate, typeName, isoDate) {
  if (currentUserRole !== 'admin' && currentUserRole !== 'user') return;

  editingDocId = docId;
  uploadForm.reset();
  document.querySelector('#uploadModal h3').textContent = `Editar ${typeName} - ${plate}`;

  const typeId = DOC_TYPE_IDS[typeName] || '1';
  docTypeSelect.value = typeId;
  docTypeSelect.disabled = true;

  if (typeId === '4') {
    expirationDateContainer.classList.add('hidden');
    setModalExpirationDate('');
  } else {
    expirationDateContainer.classList.remove('hidden');
    setModalExpirationDate(isoDate);
  }

  fileInput.required = false;
  uploadSubmitBtn.innerHTML = 'Guardar Cambios';

  uploadFeedback.textContent = 'Deja el archivo vacío si solo deseas corregir la fecha.';
  uploadFeedback.className = 'text-xs font-medium text-slate-500 text-center mt-3 block';

  uploadModal.classList.remove('hidden');
}

closeModalBtn.addEventListener('click', () => {
  editingDocId = null;
  uploadModal.classList.add('hidden');
  uploadForm.reset();
  setModalExpirationDate('');
  docTypeSelect.disabled = false;
  fileInput.required = true;
  expirationDateContainer.classList.remove('hidden');
  uploadFeedback.classList.add('hidden');
});

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  uploadSubmitBtn.disabled = true;
  uploadSubmitBtn.innerHTML = editingDocId ? 'Guardando... ⏳' : 'Subiendo... ⏳';
  uploadFeedback.classList.add('hidden');

  const token = localStorage.getItem('saedocs_token');
  const formData = new FormData();
  const expDate = expirationDateInput.value;
  const selectedFile = fileInput.files[0];

  try {
    let url;
    let method;

    if (editingDocId) {
      if (!expDate && !selectedFile) {
        throw new Error('Debes modificar la fecha o seleccionar un archivo nuevo.');
      }
      if (expDate) formData.append('expiration_date', expDate);
      if (selectedFile) formData.append('file', selectedFile);

      url = AppConfig.URL_DOC_UPDATE(editingDocId);
      method = 'PUT';
    } else {
      formData.append('vehicle_id', document.getElementById('modalVehicleId').value);
      formData.append('document_type_id', docTypeSelect.value);
      formData.append('file', selectedFile);

      const user = JSON.parse(localStorage.getItem('saedocs_user'));
      formData.append('uploaded_by', user?.id || 1);
      if (expDate) formData.append('expiration_date', expDate);

      url = AppConfig.URL_DOCS_UPLOAD;
      method = 'POST';
    }

    const response = await fetch(url, {
      method,
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const rawText = await response.text();
    let result;
    try {
      result = JSON.parse(rawText);
    } catch {
      throw new Error(`Error del servidor (${response.status}): revisa la consola del backend.`);
    }

    if (!response.ok) throw new Error(result.error || 'Error al procesar el documento');

    uploadFeedback.textContent = editingDocId
      ? '¡Documento actualizado con éxito!'
      : '¡Documento subido con éxito!';
    uploadFeedback.className = 'text-sm font-bold text-emerald-600 text-center mt-3 block';

    setTimeout(() => {
      closeModalBtn.click();
      document.getElementById('searchForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }, 900);

    loadDashboardStats();

  } catch (error) {
    uploadFeedback.textContent = error.message;
    uploadFeedback.className = 'text-sm font-bold text-rose-600 text-center mt-3 block';
  } finally {
    uploadSubmitBtn.disabled = false;
    uploadSubmitBtn.innerHTML = editingDocId ? 'Guardar Cambios' : 'Confirmar y Subir';
  }
});

docTypeSelect.addEventListener('change', (e) => {
  if (e.target.value === '4') {
    expirationDateContainer.classList.add('hidden');
    setModalExpirationDate('');
  } else {
    expirationDateContainer.classList.remove('hidden');
  }
});

// ==========================================
// LÓGICA DE CERTIFICADO GPS (ADMIN VS LECTOR)
// ==========================================
let toastTimer = null;

function mostrarToast(mensaje, tipo = 'info') {
  const toast = document.getElementById('saedocsToast');
  if (!toast) return alert(mensaje);

  const estilos = {
    warning: 'bg-amber-50 border-amber-300 text-amber-900',
    error: 'bg-rose-50 border-rose-300 text-rose-900',
    success: 'bg-emerald-50 border-emerald-300 text-emerald-900',
    info: 'bg-slate-900 border-slate-800 text-white'
  };

  const iconos = {
    warning: '⚠️',
    error: '❌',
    success: '✅',
    info: 'ℹ️'
  };

  toast.className = `fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-xl shadow-lg border font-semibold text-sm flex items-center gap-2.5 transition-all ${estilos[tipo] || estilos.info}`;
  toast.innerHTML = `<span>${iconos[tipo] || ''}</span><span>${mensaje}</span>`;
  toast.classList.remove('hidden');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}

async function descargarArchivoGPS(plate, url, btnElement = null) {
  const originalHtml = btnElement ? btnElement.innerHTML : null;
  if (btnElement) {
    btnElement.disabled = true;
    btnElement.textContent = 'Descargando... ⏳';
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('No se pudo descargar el Certificado GPS.');
    const blob = await response.blob();
    const ext = url.split('.').pop().split(/[#?]/)[0] || 'pdf';
    saveAs(blob, `Certificado_GPS_${plate}.${ext}`);
  } catch (error) {
    mostrarToast(error.message, 'error');
  } finally {
    if (btnElement && originalHtml !== null) {
      btnElement.disabled = false;
      btnElement.innerHTML = originalHtml;
    }
  }
}

function manejarBotonCertificadoGPS(plate, btnElement) {
  const gpsInfo = window.vehiculosGps?.[plate];
  if (!gpsInfo) return;

  // Si es Admin, abrimos el menú para descargar, cargar o editar
  if (currentUserRole === 'admin') {
    abrirModalGPS(gpsInfo);
    return;
  }

  // Si es Lector (o no admin): descarga directa o aviso si no está cargado
  if (!gpsInfo.doc || !gpsInfo.doc.cloudinary_url) {
    mostrarToast('Documento no cargado', 'warning');
    return;
  }

  descargarArchivoGPS(plate, gpsInfo.doc.cloudinary_url, btnElement);
}

const gpsModal = document.getElementById('gpsModal');
const closeGpsModalBtn = document.getElementById('closeGpsModalBtn');
const gpsForm = document.getElementById('gpsForm');
const gpsFeedback = document.getElementById('gpsFeedback');
const gpsSubmitBtn = document.getElementById('gpsSubmitBtn');

function abrirModalGPS(gpsInfo) {
  if (!gpsModal) {
    alert('Falta agregar el modal #gpsModal en index.html.');
    return;
  }

  const { vehicleId, plate, doc } = gpsInfo;

  document.getElementById('gpsModalTitle').textContent = `Certificado GPS - ${plate}`;
  document.getElementById('gpsVehicleId').value = vehicleId;
  document.getElementById('gpsDocId').value = doc?.doc_id || '';
  gpsForm.reset();
  gpsFeedback.classList.add('hidden');

  const currentBox = document.getElementById('gpsCurrentBox');
  const fileLabel = document.getElementById('gpsFileLabel');

  if (doc && doc.cloudinary_url) {
    const fechaSubida = doc.created_at
      ? new Date(doc.created_at).toLocaleDateString('es-CL')
      : '--';

    currentBox.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">Cargado</span>
        <span class="text-xs text-slate-500">Subido: <strong class="text-slate-700">${fechaSubida}</strong></span>
      </div>
      <div class="flex items-center gap-2 mt-3">
        <button type="button" onclick="descargarArchivoGPS('${plate}', '${doc.cloudinary_url}', this)" class="flex-1 bg-slate-900 text-white text-xs font-bold py-2 px-3 rounded-lg hover:bg-slate-800 transition-colors">
          Descargar PDF
        </button>
        <a href="${doc.cloudinary_url}" target="_blank" class="px-3 py-2 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
          Ver →
        </a>
      </div>
    `;

    fileLabel.textContent = 'Editar / Reemplazar Certificado (PDF o Imagen)';
    gpsSubmitBtn.textContent = 'Reemplazar Certificado';
  } else {
    currentBox.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-rose-100 text-rose-800">Sin registro</span>
        <span class="text-xs text-slate-500">Documento no cargado</span>
      </div>
    `;

    fileLabel.textContent = 'Cargar Certificado GPS (PDF o Imagen)';
    gpsSubmitBtn.textContent = 'Subir Certificado GPS';
  }

  gpsModal.classList.remove('hidden');
}

closeGpsModalBtn?.addEventListener('click', () => {
  gpsModal.classList.add('hidden');
  gpsForm.reset();
  gpsFeedback.classList.add('hidden');
});

gpsForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = document.getElementById('gpsFileInput').files[0];
  if (!file) return;

  const existingDocId = document.getElementById('gpsDocId').value;
  const vehicleId = document.getElementById('gpsVehicleId').value;
  const token = localStorage.getItem('saedocs_token');

  gpsSubmitBtn.disabled = true;
  gpsSubmitBtn.textContent = existingDocId ? 'Reemplazando... ⏳' : 'Subiendo... ⏳';
  gpsFeedback.classList.add('hidden');

  const formData = new FormData();
  formData.append('file', file);

  try {
    let url;
    let method;

    if (existingDocId) {
      url = AppConfig.URL_DOC_UPDATE(existingDocId);
      method = 'PUT';
    } else {
      const user = JSON.parse(localStorage.getItem('saedocs_user'));
      formData.append('vehicle_id', vehicleId);
      formData.append('document_type_id', '5');
      formData.append('uploaded_by', user?.id || 1);
      url = AppConfig.URL_DOCS_UPLOAD;
      method = 'POST';
    }

    const response = await fetch(url, {
      method,
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Error al guardar el Certificado GPS.');

    gpsFeedback.textContent = existingDocId
      ? '¡Certificado GPS actualizado con éxito!'
      : '¡Certificado GPS subido con éxito!';
    gpsFeedback.className = 'text-sm font-bold text-emerald-600 text-center mt-3 block';

    setTimeout(() => {
      closeGpsModalBtn.click();
      document.getElementById('searchForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }, 900);
  } catch (error) {
    gpsFeedback.textContent = error.message;
    gpsFeedback.className = 'text-sm font-bold text-rose-600 text-center mt-3 block';
  } finally {
    gpsSubmitBtn.disabled = false;
    gpsSubmitBtn.textContent = existingDocId ? 'Reemplazar Certificado' : 'Subir Certificado GPS';
  }
});

// ==========================================
// DESCARGAR CARPETA ZIP INDIVIDUAL
// ==========================================
async function descargarCarpetaZIP(plate, btnElement) {
  const originalHtml = btnElement.innerHTML;
  btnElement.disabled = true;
  btnElement.innerHTML = 'Empaquetando... ⏳';
  btnElement.classList.add('opacity-75');

  try {
    const zip = new JSZip();
    const folderName = `SAE_${plate}`;
    const folder = zip.folder(folderName);
    
    const vehicleDocs = window.vehiculosBuscados[plate] || [];
    
    const groupedDocs = {};
    DOC_TYPES.forEach(t => groupedDocs[t] = []);
    vehicleDocs.forEach(row => {
      if(row.document_name && groupedDocs[row.document_name]) {
        groupedDocs[row.document_name].push(row);
      }
    });

    const fetchPromises = DOC_TYPES.map(async (type) => {
      const docs = groupedDocs[type];
      if (docs && docs.length > 0) {
        const latestDoc = docs[0]; 
        const url = latestDoc.cloudinary_url;
        const ext = url.split('.').pop().split(/[#?]/)[0] || 'pdf';
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Fallo al descargar ${type}`);
        const blob = await response.blob();
        
        folder.file(`${type}.${ext}`, blob);
      }
    });

    await Promise.all(fetchPromises);
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `Carpeta_${folderName}.zip`);

  } catch (error) {
    console.error('Error generando ZIP:', error);
    alert('Hubo un error al descargar los documentos. Revisa tu conexión a internet.');
  } finally {
    btnElement.disabled = false;
    btnElement.innerHTML = originalHtml;
    btnElement.classList.remove('opacity-75');
  }
}

// ==========================================
// LÓGICA DE NAVEGACIÓN (SIDEBAR)
// ==========================================
function cambiarVista(vistaDestino) {
  const vistas = ['buscador', 'aldia', 'porvencer', 'vencidos', 'flota', 'estadisticas'];  
  vistas.forEach(v => {
    document.getElementById(`vista-${v}`).classList.add('hidden');
    document.getElementById(`vista-${v}`).classList.remove('block');
  });
  document.getElementById(`vista-${vistaDestino}`).classList.remove('hidden');
  document.getElementById(`vista-${vistaDestino}`).classList.add('block');

  vistas.forEach(v => {
    const btn = document.getElementById(`btn-${v}`);
    btn.classList.remove('bg-slate-900', 'text-white', 'shadow-sm');
    btn.classList.add('text-slate-600', 'hover:bg-slate-50');
  });

  const btnActivo = document.getElementById(`btn-${vistaDestino}`);
  btnActivo.classList.remove('text-slate-600', 'hover:bg-slate-50');
  btnActivo.classList.add('bg-slate-900', 'text-white', 'shadow-sm');
}

document.getElementById('sidebarToggle')?.addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  const sidebarTexts = document.querySelectorAll('.sidebar-text');
  sidebar.classList.toggle('w-64');
  sidebar.classList.toggle('w-20');
  sidebarTexts.forEach(text => text.classList.toggle('hidden'));
});

// ==========================================
// LÓGICA DE ESTADÍSTICAS DEL DASHBOARD
// ==========================================
async function loadDashboardStats() {
  try {
    const token = localStorage.getItem('saedocs_token');
    
    const response = await fetch(AppConfig.URL_STATS, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const result = await response.json();
    
    if (result.success) {
      globalFleetData = result.data;
      renderDashboardTable('vista-aldia', result.data.alDia, 'emerald');
      renderDashboardTable('vista-porvencer', result.data.porVencer, 'amber');
      renderDashboardTable('vista-vencidos', result.data.vencidos, 'rose');
      renderFleetTree(); 
      renderEstadisticas(); 
    }
  } catch (error) {
    console.error("Error cargando estadísticas:", error);
  }
}

function renderDashboardTable(containerId, vehicles, colorBorder) {
  const container = document.querySelector(`#${containerId} div`);
  if (!container) return;

  if (vehicles.length === 0) {
    container.innerHTML = `<p class="py-6 text-slate-500 text-center font-medium">No hay vehículos en esta categoría.</p>`;
    return;
  }

  const isAlertTable = containerId === 'vista-vencidos' || containerId === 'vista-porvencer';
  const alertColorText = containerId === 'vista-vencidos' ? 'text-rose-600' : 'text-amber-600';
  const alertTitle = containerId === 'vista-vencidos' ? 'Doc. Vencido' : 'Doc. por Vencer';

  let html = `
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
            <th class="px-6 py-4 font-semibold">Patente</th>
            <th class="px-6 py-4 font-semibold">Tipo</th>
            <th class="px-6 py-4 font-semibold">Sucursal</th>
            <th class="px-6 py-4 font-semibold ${isAlertTable ? alertColorText : ''}">
              ${isAlertTable ? alertTitle : 'Marca'}
            </th>
            <th class="px-6 py-4 font-semibold text-right">Acción</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
  `;

  vehicles.forEach(v => {
    let columnContent = v.brand || 'Sin Marca';
    
    if (isAlertTable) {
      if (containerId === 'vista-vencidos') {
        let parts = [];
        if (v.alerts.expired.length > 0) parts.push(`<div><span class="font-bold">Vencidos:</span> <span class="text-slate-800 font-medium">${v.alerts.expired.join(' - ')}</span></div>`);
        if (v.alerts.missing.length > 0) parts.push(`<div><span class="font-bold">Faltan:</span> <span class="text-slate-800 font-medium">${v.alerts.missing.join(' - ')}</span></div>`);
        columnContent = parts.join('<div class="border-t border-rose-300 my-2 w-full"></div>');
      } else if (containerId === 'vista-porvencer') {
        columnContent = `<div><span class="font-bold">Por vencer:</span> <span class="text-slate-800 font-medium">${v.alerts.expiring.join(' - ')}</span></div>`;
      }
    }

    html += `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-6 py-4 font-bold text-slate-800 align-middle">${v.plate}</td>
        <td class="px-6 py-4 text-sm text-slate-600 align-middle">${v.type}</td>
        <td class="px-6 py-4 text-sm text-slate-600 font-medium align-middle">${v.branch || 'Coquimbo'}</td>
        <td class="px-6 py-4 text-sm ${isAlertTable ? alertColorText : 'text-slate-600'} align-middle">
          ${columnContent}
        </td>
        <td class="px-6 py-4 text-right align-middle">
          <button onclick="buscarDesdeTabla('${v.plate}')" class="text-blue-600 hover:text-blue-800 font-semibold text-sm px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
            Auditar Documentos &rarr;
          </button>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table></div>`;
  container.className = `bg-white rounded-2xl shadow-sm border-2 border-${colorBorder}-200 overflow-hidden`;
  container.innerHTML = html;
}

function buscarDesdeTabla(plate) {
  cambiarVista('buscador');
  document.getElementById('plateInput').value = plate;
  document.getElementById('searchForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
}

function renderFleetTree() {
  const treeContainer = document.getElementById('flotaTree');
  if(!treeContainer) return;

  const filterTipo = document.getElementById('filterTipo')?.value || 'ALL';
  const filterEstado = document.getElementById('filterEstado')?.value || 'ALL';
  const filterSucursal = document.getElementById('filterSucursal')?.value || 'ALL';

  let allVehicles = [];
  globalFleetData.alDia.forEach(v => allVehicles.push({...v, status: 'aldia', color: 'bg-emerald-500', icon: '🟢'}));
  globalFleetData.porVencer.forEach(v => allVehicles.push({...v, status: 'porvencer', color: 'bg-amber-400', icon: '🟡'}));
  globalFleetData.vencidos.forEach(v => allVehicles.push({...v, status: 'vencidos', color: 'bg-rose-500', icon: '🔴'}));

  if(filterEstado !== 'ALL') allVehicles = allVehicles.filter(v => v.status === filterEstado);
  if(filterTipo !== 'ALL') allVehicles = allVehicles.filter(v => v.type === filterTipo);
  if(filterSucursal !== 'ALL') allVehicles = allVehicles.filter(v => (v.branch || 'Coquimbo') === filterSucursal); 

  const grouped = allVehicles.reduce((acc, v) => {
    if(!acc[v.type]) acc[v.type] = [];
    acc[v.type].push(v);
    return acc;
  }, {});

  if(Object.keys(grouped).length === 0) {
    treeContainer.innerHTML = `<p class="text-slate-500 text-center py-8 font-medium">No hay vehículos con estos filtros.</p>`;
    return;
  }

  let html = '';
  for(const type in grouped) {
    html += `
      <div class="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div class="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center font-bold text-slate-700">
          <div class="flex items-center gap-2">
            <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
            ${type}
          </div>
          <span class="text-xs bg-slate-200 text-slate-700 px-2 py-1 rounded-md">${grouped[type].length} unidades</span>
        </div>
        <div class="divide-y divide-slate-100">
    `;
    
    grouped[type].forEach(v => {
      html += `
        <div class="p-3 hover:bg-slate-50 transition-colors flex items-center justify-between group cursor-pointer" onclick="buscarDesdeTabla('${v.plate}')">
          <div class="flex items-center gap-4 pl-2 sm:pl-4 border-l-2 border-transparent group-hover:border-blue-500 transition-all">
            <div class="w-3 h-3 rounded-full ${v.color} shadow-sm shrink-0"></div>
            <div>
              <span class="font-bold text-slate-800 text-sm block">${v.plate} <span class="text-slate-500 font-normal ml-1">- ${v.brand || 'Sin Marca'}</span></span>
              <span class="text-xs text-slate-500"><span class="font-medium text-slate-600">${v.branch || 'Coquimbo'}</span></span>
            </div>
          </div>
          <div class="flex items-center gap-3 pr-2">
            ${v.status === 'vencidos' ? '<span class="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded uppercase hidden sm:block">Revisar Docs</span>' : ''}
            <svg class="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
          </div>
        </div>
      `;
    });
    html += `</div></div>`;
  }
  
  treeContainer.innerHTML = html;
}

document.getElementById('filterTipo')?.addEventListener('change', renderFleetTree);
document.getElementById('filterEstado')?.addEventListener('change', renderFleetTree);
document.getElementById('filterSucursal')?.addEventListener('change', renderFleetTree);

// ==========================================
// EXPORTAR REPORTE EXCEL DEL DIRECTORIO
// ==========================================
function descargarExcelFlota() {
  const todosLosVehiculos = [
    ...globalFleetData.alDia,
    ...globalFleetData.porVencer,
    ...globalFleetData.vencidos
  ];

  if (todosLosVehiculos.length === 0) {
    alert("No hay datos de flota para exportar.");
    return;
  }

  const ordenSucursales = [
    'Coquimbo',
    'Alto Hospicio',
    'Calama',
    'La Portada',
    'La Negra',
    'Copiapó',
    'Lampa'
  ];

  const workbook = XLSX.utils.book_new();
  const sucursalesProcesadas = new Set();

  const obtenerEstadoDoc = (alerts, docName) => {
    if (alerts?.missing?.includes(docName)) return "Faltante";
    if (alerts?.expired?.includes(docName)) return "Vencido";
    if (alerts?.expiring?.includes(docName)) return "Por Vencer";
    return "Al día";
  };

  const armarFilas = (vehiculos) => vehiculos.map(v => {
    const alertas = v.alerts || {};
    return {
      "Patente": v.plate,
      "Tipo": v.type,
      "SOAP": obtenerEstadoDoc(alertas, "SOAP"),
      "Revisión Técnica": obtenerEstadoDoc(alertas, "Rev. Técnica"),
      "Permiso Circulación": obtenerEstadoDoc(alertas, "Permiso de circulación"),
      "Padrón": obtenerEstadoDoc(alertas, "Padrón")
    };
  });

  const aplicarColoresYFormato = (worksheet) => {
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell_ref = XLSX.utils.encode_cell({ c: C, r: 0 });
      if (worksheet[cell_ref]) {
        worksheet[cell_ref].s = {
          fill: { fgColor: { rgb: "FF0F172A" } },
          font: { bold: true, color: { rgb: "FFFFFFFF" } },
          alignment: { horizontal: "center", vertical: "center" }
        };
      }
    }

    for (let R = 1; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell_ref = XLSX.utils.encode_cell({ c: C, r: R });
        const cell = worksheet[cell_ref];
        
        if (!cell || !cell.v) continue;

        let bgColor = null;
        let textColor = "FF000000";

        if (cell.v === "Al día") { 
          bgColor = "FFDCFCE7"; textColor = "FF166534";
        } else if (cell.v === "Por Vencer") { 
          bgColor = "FFFEF08A"; textColor = "FF854D0E";
        } else if (cell.v === "Vencido" || cell.v === "Faltante") { 
          bgColor = "FFFECACA"; textColor = "FF991B1B";
        }

        if (bgColor) {
          cell.s = {
            fill: { fgColor: { rgb: bgColor } },
            font: { color: { rgb: textColor }, bold: true },
            alignment: { horizontal: "center", vertical: "center" }
          };
        } else {
          cell.s = { alignment: { horizontal: "center", vertical: "center" } };
        }
      }
    }
    
    worksheet['!cols'] = [
      { wch: 12 },
      { wch: 15 },
      { wch: 18 },
      { wch: 18 },
      { wch: 22 },
      { wch: 18 }
    ];
  };

  ordenSucursales.forEach(sucursal => {
    const vehiculosSucursal = todosLosVehiculos.filter(v => (v.branch || 'Coquimbo') === sucursal);
    if (vehiculosSucursal.length > 0) {
      const worksheet = XLSX.utils.json_to_sheet(armarFilas(vehiculosSucursal));
      aplicarColoresYFormato(worksheet);
      XLSX.utils.book_append_sheet(workbook, worksheet, sucursal);
    }
    sucursalesProcesadas.add(sucursal);
  });

  const otrosVehiculos = todosLosVehiculos.filter(v => !sucursalesProcesadas.has(v.branch || 'Coquimbo'));
  if (otrosVehiculos.length > 0) {
    const worksheet = XLSX.utils.json_to_sheet(armarFilas(otrosVehiculos));
    aplicarColoresYFormato(worksheet);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Otras");
  }

  const fecha = new Date().toLocaleDateString('es-CL').replace(/\//g, '-');
  XLSX.writeFile(workbook, `Reporte_SAEDocs_${fecha}.xlsx`, { cellStyles: true });
}

// ==========================================
// RENDERIZADO DE GRÁFICOS (CHART.JS)
// ==========================================
let chartGlobalInst = null;
let chartSucursalesInst = null;
let chartDocumentosInst = null;

function irADirectorioFiltrado(sucursal = 'ALL', estado = 'ALL') {
  cambiarVista('flota');
  const selTipo = document.getElementById('filterTipo');
  const selEstado = document.getElementById('filterEstado');
  const selSucursal = document.getElementById('filterSucursal');

  if (selTipo) selTipo.value = 'ALL';
  if (selEstado) selEstado.value = estado;
  if (selSucursal) selSucursal.value = sucursal;

  renderFleetTree();
}

function renderEstadisticas() {
  const ctxGlobal = document.getElementById('chartGlobal');
  const ctxSucursales = document.getElementById('chartSucursales');
  const ctxDocumentos = document.getElementById('chartDocumentos');
  if (!ctxGlobal || !ctxSucursales) return;

  // 1. Datos Globales + Tarjetas KPI
  const totalAlDia = globalFleetData.alDia.length;
  const totalPorVencer = globalFleetData.porVencer.length;
  const totalVencidos = globalFleetData.vencidos.length;
  const totalFlota = totalAlDia + totalPorVencer + totalVencidos;
  const pctCumplimiento = totalFlota > 0 ? Math.round((totalAlDia / totalFlota) * 100) : 0;

  const kpiTotal = document.getElementById('kpiTotalFlota');
  if (kpiTotal) {
    kpiTotal.textContent = totalFlota;
    document.getElementById('kpiCumplimiento').textContent = `${pctCumplimiento}%`;
    document.getElementById('kpiAlDiaSub').textContent = `${totalAlDia} de ${totalFlota} al día`;
    document.getElementById('kpiPorVencer').textContent = totalPorVencer;
    document.getElementById('kpiVencidos').textContent = totalVencidos;
  }

  const labelConfig = {
    color: '#ffffff',
    font: { weight: 'bold', size: 13 },
    textStrokeColor: 'rgba(0,0,0,0.2)',
    textStrokeWidth: 3,
    formatter: (value) => value > 0 ? value : ''
  };

  // --- GRÁFICO 1: DONA GLOBAL (Clickeable) ---
  if (chartGlobalInst) chartGlobalInst.destroy();
  chartGlobalInst = new Chart(ctxGlobal, {
    type: 'doughnut',
    plugins: [ChartDataLabels],
    data: {
      labels: ['Al Día', 'Por Vencer', 'Vencidos / Faltantes'],
      datasets: [{
        data: [totalAlDia, totalPorVencer, totalVencidos],
        backgroundColor: ['#10b981', '#fbbf24', '#f43f5e'],
        borderWidth: 0,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onHover: (event, elements) => {
        event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      onClick: (event, elements) => {
        if (!elements.length) return;
        const vistasPorIndice = ['aldia', 'porvencer', 'vencidos'];
        cambiarVista(vistasPorIndice[elements[0].index]);
      },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } },
        datalabels: labelConfig
      },
      cutout: '65%'
    }
  });

  // --- GRÁFICO 2: POR SUCURSAL (Ordenado de mayor a menor + Clickeable) ---
  const sucursalesMap = {};

  globalFleetData.alDia.forEach(v => {
    const b = v.branch || 'Coquimbo';
    if (!sucursalesMap[b]) sucursalesMap[b] = { alDia: 0, porVencer: 0, vencidos: 0 };
    sucursalesMap[b].alDia++;
  });
  globalFleetData.porVencer.forEach(v => {
    const b = v.branch || 'Coquimbo';
    if (!sucursalesMap[b]) sucursalesMap[b] = { alDia: 0, porVencer: 0, vencidos: 0 };
    sucursalesMap[b].porVencer++;
  });
  globalFleetData.vencidos.forEach(v => {
    const b = v.branch || 'Coquimbo';
    if (!sucursalesMap[b]) sucursalesMap[b] = { alDia: 0, porVencer: 0, vencidos: 0 };
    sucursalesMap[b].vencidos++;
  });

  const labelsSuc = Object.keys(sucursalesMap).sort((a, b) => {
    const totalA = sucursalesMap[a].alDia + sucursalesMap[a].porVencer + sucursalesMap[a].vencidos;
    const totalB = sucursalesMap[b].alDia + sucursalesMap[b].porVencer + sucursalesMap[b].vencidos;
    return totalB - totalA;
  });

  const dataAlDia = labelsSuc.map(l => sucursalesMap[l].alDia);
  const dataPorVencer = labelsSuc.map(l => sucursalesMap[l].porVencer);
  const dataVencidos = labelsSuc.map(l => sucursalesMap[l].vencidos);

  if (chartSucursalesInst) chartSucursalesInst.destroy();
  chartSucursalesInst = new Chart(ctxSucursales, {
    type: 'bar',
    plugins: [ChartDataLabels],
    data: {
      labels: labelsSuc,
      datasets: [
        { label: 'Al Día', data: dataAlDia, backgroundColor: '#10b981', borderRadius: 4 },
        { label: 'Por Vencer', data: dataPorVencer, backgroundColor: '#fbbf24', borderRadius: 4 },
        { label: 'Vencidos / Faltantes', data: dataVencidos, backgroundColor: '#f43f5e', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onHover: (event, elements) => {
        event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      onClick: (event, elements) => {
        if (!elements.length) return;
        const sucursalElegida = labelsSuc[elements[0].index];
        irADirectorioFiltrado(sucursalElegida, 'ALL');
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, border: { display: false } }
      },
      plugins: {
        legend: { display: false },
        datalabels: labelConfig
      }
    }
  });

  // --- GRÁFICO 3: DESGLOSE POR TIPO DE DOCUMENTO ---
  if (!ctxDocumentos) return;

  const todosVehiculos = [
    ...globalFleetData.alDia,
    ...globalFleetData.porVencer,
    ...globalFleetData.vencidos
  ];

  const docDefinitions = [
    { label: 'SOAP', keys: ['SOAP'] },
    { label: 'Revisión Técnica', keys: ['Rev. Técnica', 'Revisión Técnica'] },
    { label: 'Permiso de Circulación', keys: ['Permiso de circulación', 'Permiso de Circulación'] },
    { label: 'Padrón', keys: ['Padrón'] }
  ];

  const docStats = docDefinitions.map(def => {
    let alDia = 0, porVencer = 0, vencido = 0, faltante = 0;

    todosVehiculos.forEach(v => {
      const alerts = v.alerts || {};
      const match = (arr) => Array.isArray(arr) && def.keys.some(k => arr.includes(k));

      if (match(alerts.missing)) faltante++;
      else if (match(alerts.expired)) vencido++;
      else if (match(alerts.expiring)) porVencer++;
      else alDia++;
    });

    return { label: def.label, alDia, porVencer, vencido, faltante };
  });

  if (chartDocumentosInst) chartDocumentosInst.destroy();
  chartDocumentosInst = new Chart(ctxDocumentos, {
    type: 'bar',
    plugins: [ChartDataLabels],
    data: {
      labels: docStats.map(d => d.label),
      datasets: [
        { label: 'Al Día', data: docStats.map(d => d.alDia), backgroundColor: '#10b981', borderRadius: 4 },
        { label: 'Por Vencer', data: docStats.map(d => d.porVencer), backgroundColor: '#fbbf24', borderRadius: 4 },
        { label: 'Vencido', data: docStats.map(d => d.vencido), backgroundColor: '#f43f5e', borderRadius: 4 },
        { label: 'Faltante (Sin subir)', data: docStats.map(d => d.faltante), backgroundColor: '#94a3b8', borderRadius: 4 }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { color: '#f1f5f9' }, border: { display: false } },
        y: { stacked: true, grid: { display: false }, border: { display: false } }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, padding: 16 },
          onHover: (event) => {
            event.native.target.style.cursor = 'pointer';
          },
          onLeave: (event) => {
            event.native.target.style.cursor = 'default';
          }
        },
        datalabels: labelConfig
      }
    }
  });
}

function cerrarSesion() {
  localStorage.removeItem('saedocs_token');
  localStorage.removeItem('saedocs_user');
  window.location.href = 'login.html';
}