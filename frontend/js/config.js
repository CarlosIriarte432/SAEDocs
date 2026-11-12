// frontend/js/config.js

// Función auto-ejecutable para detectar el entorno
const AppConfig = (() => {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  // Si estamos en localhost, usamos el servidor local de Node (Puerto 3000)
  // Si estamos en GitHub Pages (u otro dominio), apuntamos al backend en Render
  const API_BASE_URL = isLocalhost 
    ? 'http://localhost:3000/api' 
    : 'https://saedocs.onrender.com/api';

  return {
    API_BASE_URL,
    // Definimos sub-rutas de uso frecuente para mayor limpieza
    URL_AUTH: `${API_BASE_URL}/auth/login`,
    URL_ADMIN: `${API_BASE_URL}/admin/vehicles`,
    URL_DOCS_UPLOAD: `${API_BASE_URL}/documents/upload`,
    URL_STATS: `${API_BASE_URL}/vehicles/dashboard-stats`,
    URL_SEARCH: (plate) => `${API_BASE_URL}/vehicles/${plate}`
  };
})();