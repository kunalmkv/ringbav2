// API Configuration
// This file can be edited on the server to point to the correct backend API URL
// After editing, the frontend will automatically use this configuration

// Set the API base URL for your backend server
// Since database is on the same server, use the server's hostname with port 3000
// Examples:
//   - If backend is on same server, port 3000: window.API_BASE_URL = 'http://localhost:3000';
//   - If backend is on different server: window.API_BASE_URL = 'http://your-server-ip:3000';
//   - If using reverse proxy: window.API_BASE_URL = '/api'; (relative path)

// Auto-detect: Use same hostname as the frontend, port 3000
// This works when both frontend and backend are on the same server
(function() {
  if (typeof window !== 'undefined' && !window.API_BASE_URL) {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    // Use same hostname, port 3000 for backend API
    window.API_BASE_URL = protocol + '//' + hostname + ':3000';
    console.log('[Config] Auto-detected API URL:', window.API_BASE_URL);
  }
})();

// Uncomment to override auto-detection:
// window.API_BASE_URL = 'http://localhost:3000';

