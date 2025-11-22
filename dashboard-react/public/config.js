// API Configuration
// This file sets the API base URL for the dashboard
// It runs BEFORE the React app loads to ensure the URL is available

(function() {
  'use strict';
  
  // Only set if not already set (allows manual override)
  if (typeof window !== 'undefined' && !window.API_BASE_URL) {
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    
    console.log('[Config] ===== INITIALIZING API CONFIG =====');
    console.log('[Config] Origin:', origin);
    console.log('[Config] Pathname:', pathname);
    
    // Simple detection: if pathname contains /ringba-sync-dashboard, use it
    if (pathname.indexOf('/ringba-sync-dashboard') !== -1) {
      // Extract /ringba-sync-dashboard from pathname
      const basePath = '/ringba-sync-dashboard';
      window.API_BASE_URL = origin + basePath;
      console.log('[Config] ✓ Detected /ringba-sync-dashboard path');
      console.log('[Config] ✓ Set API_BASE_URL to:', window.API_BASE_URL);
    } else {
      // Localhost or root path - use same origin
      window.API_BASE_URL = origin;
      console.log('[Config] ✓ Using same origin (localhost/root):', window.API_BASE_URL);
    }
    
    console.log('[Config] Final API_BASE_URL:', window.API_BASE_URL);
    console.log('[Config] Test API URL:', window.API_BASE_URL + '/api/payout-comparison');
    console.log('[Config] ===== CONFIG COMPLETE =====');
  } else if (window.API_BASE_URL) {
    console.log('[Config] API_BASE_URL already set to:', window.API_BASE_URL);
  }
})();

// PRODUCTION SERVER OVERRIDE (uncomment for production):
// window.API_BASE_URL = 'https://insidefi.co/ringba-sync-dashboard';

