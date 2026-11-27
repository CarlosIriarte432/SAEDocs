// frontend/js/config.js
const AppConfig = (() => {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  const API_BASE_URL = isLocalhost 
    ? 'http://localhost:3000/api' 
    : 'https://saedocs.onrender.com/api';

  return {
    API_BASE_URL,
    URL_AUTH: `${API_BASE_URL}/auth/login`,
    URL_ADMIN: `${API_BASE_URL}/admin/vehicles`,
    URL_DOCS_UPLOAD: `${API_BASE_URL}/documents/upload`,
    URL_DOC_UPDATE: (docId) => `${API_BASE_URL}/documents/${docId}`,
    URL_AUDIT_LOGS: `${API_BASE_URL}/admin/audit-logs`,
    URL_STATS: `${API_BASE_URL}/vehicles/dashboard-stats`,
    URL_ADMIN_USERS: `${API_BASE_URL}/admin/users`,
    URL_ADMIN_USER_ID: (id) => `${API_BASE_URL}/admin/users/${id}`,
    URL_SEARCH: (plate) => `${API_BASE_URL}/vehicles/${plate}`
  };
})();