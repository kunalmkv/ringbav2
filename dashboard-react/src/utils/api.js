// API utility functions
const getBasePath = () => {
  // No base path needed - serving from root
  return '';
};

// Get API base URL
// Priority:
// 1. window.API_BASE_URL (set in config.js or index.html before app loads)
// 2. VITE_API_URL environment variable (set during build)
// 3. Auto-detect: use same origin with path prefix if available
// 4. Default: use current origin (for development)
const getApiBaseUrl = () => {
  // Check for window.API_BASE_URL (set by config.js or index.html)
  if (typeof window !== 'undefined' && window.API_BASE_URL) {
    console.log('[Dashboard] Using window.API_BASE_URL:', window.API_BASE_URL);
    return window.API_BASE_URL;
  }
  
  // Check for environment variable (set during build)
  if (import.meta.env.VITE_API_URL) {
    console.log('[Dashboard] Using VITE_API_URL:', import.meta.env.VITE_API_URL);
    return import.meta.env.VITE_API_URL;
  }
  
  // Auto-detect: Check if we're in a subdirectory and use that path
  const origin = window.location.origin;
  const pathname = window.location.pathname;
  
  // Check if pathname contains a known prefix (e.g., /ringba-sync-dashboard)
  if (pathname.includes('/ringba-sync-dashboard')) {
    const basePath = pathname.substring(0, pathname.lastIndexOf('/ringba-sync-dashboard') + '/ringba-sync-dashboard'.length);
    const apiUrl = origin + basePath;
    console.log('[Dashboard] Auto-detected API URL (with path prefix):', apiUrl);
    return apiUrl;
  }
  
  // Development/localhost: use current origin
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
  
  if (isLocalhost) {
    const devUrl = origin + getBasePath();
    console.log('[Dashboard] Using current origin (development):', devUrl);
    return devUrl;
  }
  
  // Production fallback: use same origin
  console.log('[Dashboard] Using current origin (production fallback):', origin);
  return origin;
};

export const BASE_PATH = getBasePath();
export const API_BASE_URL = getApiBaseUrl();

console.log('[Dashboard] Base path:', BASE_PATH);
console.log('[Dashboard] API base URL:', API_BASE_URL);
console.log('[Dashboard] Current origin:', window.location.origin);

// Fetch wrapper with error handling
const fetchAPI = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  console.log('[Dashboard API] Fetching:', url);
  console.log('[Dashboard API] Options:', options);
  
  // Add cache-busting headers and query parameter
  const cacheBuster = `_t=${Date.now()}`;
  const separator = url.includes('?') ? '&' : '?';
  const urlWithCacheBuster = `${url}${separator}${cacheBuster}`;
  
  // Merge options with cache-control headers
  const fetchOptions = {
    ...options,
    cache: 'no-store', // Prevent browser caching
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      ...options.headers
    }
  };
  
  try {
    const response = await fetch(urlWithCacheBuster, fetchOptions);
    console.log('[Dashboard API] Response status:', response.status);
    console.log('[Dashboard API] Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Dashboard API] Error response:', errorText);
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('[Dashboard API] Non-JSON response:', text);
      throw new Error(`Expected JSON but got ${contentType}`);
    }
    
    const data = await response.json();
    console.log('[Dashboard API] Parsed JSON data:', data);
    return data;
  } catch (error) {
    console.error('[Dashboard API] Fetch error:', error);
    console.error('[Dashboard API] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    throw error;
  }
};

// API endpoints
export const api = {
  health: () => fetchAPI('/api/health'),
  stats: () => fetchAPI('/api/stats'),
  history: (service = null, limit = 50) => {
    const params = new URLSearchParams();
    if (service) params.append('service', service);
    params.append('limit', limit.toString());
    return fetchAPI(`/api/history?${params.toString()}`);
  },
  activity: (limit = 20) => fetchAPI(`/api/activity?limit=${limit}`),
  ringbaLogs: (status = null, limit = 50) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    params.append('limit', limit.toString());
    return fetchAPI(`/api/ringba-logs?${params.toString()}`);
  },
  chargeback: (limit = null) => {
    // If limit is null/undefined, fetch all data; otherwise use the limit
    if (limit === null || limit === undefined) {
      return fetchAPI('/api/chargeback');
    }
    return fetchAPI(`/api/chargeback?limit=${limit}`);
  },
  serviceLogs: (service = null, sessionId = null, status = null, limit = 50) => {
    const params = new URLSearchParams();
    if (service) params.append('service', service);
    if (sessionId) params.append('session_id', sessionId);
    if (status) params.append('status', status);
    params.append('limit', limit.toString());
    return fetchAPI(`/api/service-logs?${params.toString()}`);
  },
  payoutComparison: (startDate = null, endDate = null) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return fetchAPI(`/api/payout-comparison?${params.toString()}`);
  }
};

