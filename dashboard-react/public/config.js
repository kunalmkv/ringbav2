// API Configuration
// This file can be edited on the server to point to the correct backend API URL
// After editing, the frontend will automatically use this configuration

// Auto-detect: Use same origin with path prefix if available
// This works when both frontend and backend are served from the same domain
(function() {
  if (typeof window !== 'undefined' && !window.API_BASE_URL) {
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    
    // Check if we're in a subdirectory (e.g., /ringba-sync-dashboard)
    // If so, use that as the base path for API calls
    if (pathname.includes('/ringba-sync-dashboard')) {
      // Extract the base path (everything before the last segment)
      const basePath = pathname.substring(0, pathname.lastIndexOf('/'));
      window.API_BASE_URL = origin + basePath;
      console.log('[Config] Auto-detected API URL (with path prefix):', window.API_BASE_URL);
    } else {
      // No path prefix, use same origin
      window.API_BASE_URL = origin;
      console.log('[Config] Auto-detected API URL (same origin):', window.API_BASE_URL);
    }
  }
})();

// Uncomment to override auto-detection:
// window.API_BASE_URL = 'https://insidefi.co/ringba-sync-dashboard';
// OR if using direct port:
// window.API_BASE_URL = 'http://your-server-ip:3000';

