// --- Variables de Estado ---
let currentVehicleDocs = [];
let currentVehicleId = null;
let showHistory = false;


document.addEventListener('DOMContentLoaded', () => {
  const storedUser = localStorage.getItem('saedocs_user');
  
  if (storedUser) {
    const user = JSON.parse(storedUser);
    document.getElementById('navUserName').textContent = user.name;
    
    if (user.role === 'admin' && document.getElementById('adminPanelBtn')) {
      document.getElementById('adminPanelBtn').classList.remove('hidden');
    }
  }

  // Ejecutamos el analizador de flota al cargar la página (solo si estamos en el dashboard)
  if (document.getElementById('vista-aldia')) {
    loadDashboardStats();
  }
});

// Orden estricto de las 4 columnas
const DOC_TYPES = ['SOAP', 'Revisión Técnica', 'Permiso de Circulación', 'Padrón'];

// --- Event Listeners principales ---
document.getElementById('historyToggle').addEventListener('change', (e) => {
  showHistory = e.target.checked;
  renderDocumentsGrid(); // Re-renderizar al cambiar el switch
});

document.getElementById('searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const plate = document.getElementById('plateInput').value.trim().toUpperCase();
  const errorMsg = document.getElementById('errorMsg');
  const dashboard = document.getElementById('vehicleDashboard');

  errorMsg.classList.add('hidden');
  dashboard.classList.add('hidden');
  dashboard.classList.remove('opacity-100');

  if (!plate) return;

  try {
    const response = await fetch(`http://localhost:3000/api/vehicles/${plate}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Error buscando el vehículo');

    currentVehicleDocs = result.data;
    renderDashboardHeader();
    renderDocumentsGrid();
    
  } catch (error) {
    errorMsg.textContent = error.message;
    errorMsg.classList.remove('hidden');
  }
});

// --- Lógica de Renderizado ---
function renderDashboardHeader() {
  const vehicle = currentVehicleDocs[0];
  currentVehicleId = vehicle.id; 

  document.getElementById('vehPlate').textContent = `Patente: ${vehicle.plate}`;
  document.getElementById('vehDetails').textContent = `${vehicle.type} ${vehicle.internal_number ? `• N° ${vehicle.internal_number}` : ''}`;
  
  const dashboard = document.getElementById('vehicleDashboard');
  dashboard.classList.remove('hidden');
  setTimeout(() => dashboard.classList.add('opacity-100'), 50);
}

function renderDocumentsGrid() {
  const docsGrid = document.getElementById('documentsGrid');
  docsGrid.innerHTML = ''; // Limpiar grilla

  // 1. Agrupar documentos por tipo
  const groupedDocs = {};
  DOC_TYPES.forEach(type => groupedDocs[type] = []);
  
  currentVehicleDocs.forEach(row => {
    if(row.document_name && groupedDocs[row.document_name] !== undefined) {
      groupedDocs[row.document_name].push(row);
    }
  });

  // 2. Renderizar las 4 columnas en orden
  DOC_TYPES.forEach(type => {
    const col = document.createElement('div');
    col.className = 'flex flex-col gap-3';
    const docs = groupedDocs[type];

    if (docs.length === 0) {
      // Si no tiene el documento subido
      col.appendChild(createEmptyCard(type));
    } else {
      // Mostrar siempre el más reciente arriba (índice 0)
      col.appendChild(createDocCard(docs[0], type, true));
      
      // Si el switch está activo y hay historial, apilar los antiguos debajo
      if (showHistory && docs.length > 1) {
        const historyContainer = document.createElement('div');
        historyContainer.className = 'flex flex-col gap-2 pl-3 border-l-2 border-slate-200 mt-1 ml-2';
        
        for (let i = 1; i < docs.length; i++) {
           historyContainer.appendChild(createDocCard(docs[i], type, false));
        }
        col.appendChild(historyContainer);
      }
    }
    docsGrid.appendChild(col);
  });
}

// --- Constructores de UI ---
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
    const expDate = new Date(doc.expiration_date);
    const today = new Date();
    today.setHours(0,0,0,0);
    expDate.setHours(0,0,0,0);
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

  const card = document.createElement('div');
  
  if (isLatest) {
    // 👉 CAMBIO AQUÍ: Usamos h-48 para obligar a que todas midan exactamente lo mismo
    card.className = `p-5 rounded-xl border shadow-sm ${statusConfig.color} flex flex-col justify-between transition-all h-48`;
    card.innerHTML = `
      <div class="flex justify-between items-start mb-2">
        <h3 class="font-bold text-lg leading-tight pr-2">${typeName}</h3>
        <span class="text-[11px] font-bold px-2 py-1 rounded-md text-center tracking-wide uppercase whitespace-nowrap ${statusConfig.badge}">${statusConfig.text}</span>
      </div>
      <div class="mt-auto space-y-1">
        <p class="text-[13px] opacity-80">Actualizado: <span class="font-semibold">${uploadDate}</span></p>
        ${typeName !== 'Padrón' ? `<p class="text-sm opacity-90">Vence: <span class="font-bold">${expText}</span></p>` : `<p class="text-sm opacity-90 font-bold">Documento Permanente</p>`}
        <div class="pt-2">
           <a href="${doc.cloudinary_url}" target="_blank" class="text-sm font-bold underline underline-offset-2 opacity-90 hover:opacity-100 flex items-center gap-1">Ver Archivo →</a>
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
  // 👉 CAMBIO AQUÍ: También le ponemos h-48 y justify-between para que cuadre con las demás
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

// --- Copiar aquí debajo la lógica del UploadModal que ya tenías ---
const uploadModal = document.getElementById('uploadModal');
const openUploadBtn = document.getElementById('openUploadBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const uploadForm = document.getElementById('uploadForm');
const uploadFeedback = document.getElementById('uploadFeedback');
const uploadSubmitBtn = document.getElementById('uploadSubmitBtn');

openUploadBtn.addEventListener('click', () => {
  document.getElementById('modalVehicleId').value = currentVehicleId;
  uploadModal.classList.remove('hidden');
});

closeModalBtn.addEventListener('click', () => {
  uploadModal.classList.add('hidden');
  uploadForm.reset();
  uploadFeedback.classList.add('hidden');
});

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  uploadSubmitBtn.disabled = true;
  uploadSubmitBtn.innerHTML = 'Subiendo... ⏳';
  uploadFeedback.classList.add('hidden');

  const formData = new FormData();
  formData.append('vehicle_id', document.getElementById('modalVehicleId').value);
  formData.append('document_type_id', document.getElementById('docTypeSelect').value);
  formData.append('file', document.getElementById('fileInput').files[0]);
  formData.append('uploaded_by', 1); 

  const expDate = document.getElementById('expirationDate').value;
  if (expDate) formData.append('expiration_date', expDate);

  try {
    const response = await fetch('http://localhost:3000/api/documents/upload', {
      method: 'POST',
      body: formData 
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Error al subir documento');

    uploadFeedback.textContent = '¡Documento subido con éxito!';
    uploadFeedback.className = 'text-sm font-bold text-emerald-600 text-center mt-3 block';
    
    setTimeout(() => {
      closeModalBtn.click();
      document.getElementById('searchForm').dispatchEvent(new Event('submit'));
    }, 1000);

    loadDashboardStats();

  } catch (error) {
    uploadFeedback.textContent = error.message;
    uploadFeedback.className = 'text-sm font-bold text-red-600 text-center mt-3 block';
  } finally {
    uploadSubmitBtn.disabled = false;
    uploadSubmitBtn.innerHTML = 'Confirmar y Subir';
  }
});

// --- Lógica del Botón Descargar Carpeta (ZIP) ---
const downloadFolderBtn = document.getElementById('downloadFolderBtn');

if (downloadFolderBtn) {
  downloadFolderBtn.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const originalHtml = btn.innerHTML;
    
    // Cambiar estado visual mientras empaqueta
    btn.disabled = true;
    btn.innerHTML = 'Empaquetando... ⏳';
    btn.classList.add('opacity-75');

    try {
      const zip = new JSZip();
      
      // Creamos una carpeta dentro del ZIP con la patente (Ej: SAE_CJBB63)
      const folderName = `SAE_${currentVehicleDocs[0].plate}`;
      const folder = zip.folder(folderName);

      // Agrupamos para obtener solo el más reciente de cada tipo (igual que en la grilla)
      const groupedDocs = {};
      DOC_TYPES.forEach(t => groupedDocs[t] = []);
      currentVehicleDocs.forEach(row => {
        if(row.document_name && groupedDocs[row.document_name]) {
          groupedDocs[row.document_name].push(row);
        }
      });

      // Mapeamos las descargas en paralelo para que sea ultra rápido
      const fetchPromises = DOC_TYPES.map(async (type) => {
        const docs = groupedDocs[type];
        if (docs && docs.length > 0) {
          const latestDoc = docs[0]; 
          const url = latestDoc.cloudinary_url;
          
          // Extraemos la extensión real (ej: pdf, png, jpg) de Cloudinary
          const ext = url.split('.').pop().split(/[#?]/)[0] || 'pdf';
          
          // Descargamos el archivo a la memoria del navegador
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Fallo al descargar ${type}`);
          const blob = await response.blob();
          
          // Guardamos en el ZIP con el nombre bonito (Ej: SOAP.pdf)
          folder.file(`${type}.${ext}`, blob);
        }
      });

      // Esperamos a que todos los documentos se descarguen
      await Promise.all(fetchPromises);

      // Generamos el archivo .zip final y forzamos la descarga
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `Carpeta_${folderName}.zip`);

    } catch (error) {
      console.error('Error generando ZIP:', error);
      alert('Hubo un error al descargar los documentos. Revisa tu conexión.');
    } finally {
      // Restauramos el botón a la normalidad
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      btn.classList.remove('opacity-75');
    }
  });
}

// --- Inicialización de Sesión ---
document.addEventListener('DOMContentLoaded', () => {
  const storedUser = localStorage.getItem('saedocs_user');
  
  if (storedUser) {
    const user = JSON.parse(storedUser);
    document.getElementById('navUserName').textContent = user.name;
    
    // Si el usuario es admin, mostramos el botón del panel
    if (user.role === 'admin') {
      document.getElementById('adminPanelBtn').classList.remove('hidden');
    }
  }
});

// --- Lógica de Navegación del Sidebar ---
function cambiarVista(vistaDestino) {
  const vistas = ['buscador', 'aldia', 'porvencer', 'vencidos'];
  
  // 1. Mostrar/Ocultar secciones
  vistas.forEach(v => {
    document.getElementById(`vista-${v}`).classList.add('hidden');
    document.getElementById(`vista-${v}`).classList.remove('block');
  });
  document.getElementById(`vista-${vistaDestino}`).classList.remove('hidden');
  document.getElementById(`vista-${vistaDestino}`).classList.add('block');

  // 2. Reiniciar colores (remueve activo, añade inactivo)
  vistas.forEach(v => {
    const btn = document.getElementById(`btn-${v}`);
    btn.classList.remove('bg-slate-900', 'text-white', 'shadow-sm');
    btn.classList.add('text-slate-600', 'hover:bg-slate-50');
  });

  // 3. Pintar botón activo
  const btnActivo = document.getElementById(`btn-${vistaDestino}`);
  btnActivo.classList.remove('text-slate-600', 'hover:bg-slate-50');
  btnActivo.classList.add('bg-slate-900', 'text-white', 'shadow-sm');
}

// --- Lógica del Botón Colapsar Sidebar ---
document.addEventListener('DOMContentLoaded', () => {
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const sidebarTexts = document.querySelectorAll('.sidebar-text');

  if(sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      // Intercambia el ancho entre 64 (256px) y 20 (80px)
      sidebar.classList.toggle('w-64');
      sidebar.classList.toggle('w-20');
      
      // Oculta/Muestra el texto
      sidebarTexts.forEach(text => {
        text.classList.toggle('hidden');
      });
    });
  }
});

// ==========================================
// LÓGICA DE ESTADÍSTICAS DEL DASHBOARD
// ==========================================
async function loadDashboardStats() {
  try {
    const token = localStorage.getItem('saedocs_token');
    const response = await fetch('http://127.0.0.1:3000/api/vehicles/dashboard-stats', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    if (result.success) {
      renderDashboardTable('vista-aldia', result.data.alDia, 'emerald');
      renderDashboardTable('vista-porvencer', result.data.porVencer, 'amber');
      renderDashboardTable('vista-vencidos', result.data.vencidos, 'rose');
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

 // Detectamos si es tabla de alerta y definimos el título exacto
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
            <th class="px-6 py-4 font-semibold ${isAlertTable ? alertColorText : ''}">
              ${isAlertTable ? alertTitle : 'N° Interno'}
            </th>
            <th class="px-6 py-4 font-semibold text-right">Acción</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
  `;

  vehicles.forEach(v => {
    let columnContent = v.internal_number || '-';
    
    if (isAlertTable) {
      if (containerId === 'vista-vencidos') {
        let parts = [];
        
        if (v.alerts.expired.length > 0) {
          parts.push(`<div><span class="font-bold">Vencidos:</span> <span class="text-slate-800 font-medium">${v.alerts.expired.join(' - ')}</span></div>`);
        }
        if (v.alerts.missing.length > 0) {
          parts.push(`<div><span class="font-bold">Faltan:</span> <span class="text-slate-800 font-medium">${v.alerts.missing.join(' - ')}</span></div>`);
        }
        
        // Unimos los bloques con una línea divisoria continua
        columnContent = parts.join('<div class="border-t border-rose-300 my-2 w-full"></div>');
        
      } else if (containerId === 'vista-porvencer') {
        columnContent = `<div><span class="font-bold">Por vencer:</span> <span class="text-slate-800 font-medium">${v.alerts.expiring.join(' - ')}</span></div>`;
      }
    }

    html += `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-6 py-4 font-bold text-slate-800 align-middle">${v.plate}</td>
        <td class="px-6 py-4 text-sm text-slate-600 align-middle">${v.type}</td>
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

// Interconecta la tabla con el buscador principal
function buscarDesdeTabla(plate) {
  cambiarVista('buscador');
  document.getElementById('plateInput').value = plate;
  
  // Simulamos un submit en el formulario de búsqueda
  const event = new Event('submit', { cancelable: true, bubbles: true });
  document.getElementById('searchForm').dispatchEvent(event);
}

// --- Lógica de Sesión ---
function cerrarSesion() {
  localStorage.removeItem('saedocs_token');
  localStorage.removeItem('saedocs_user');
  window.location.href = 'login.html';
}