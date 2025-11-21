// API utility functions
const getBasePath = () => {
  // No base path needed - serving from root
  return '';
};

// Get API base URL
// Priority:
// 1. window.API_BASE_URL (set in index.html before app loads)
// 2. VITE_API_URL environment variable (set during build)
// 3. Auto-detect: if not localhost, use same hostname with port 3000
// 4. Default: use current origin (for development)
const getApiBaseUrl = () => {
  // Check for window.API_BASE_URL (can be set in index.html via script tag)
  if (typeof window !== 'undefined' && window.API_BASE_URL) {
    console.log('[Dashboard] Using window.API_BASE_URL:', window.API_BASE_URL);
    return window.API_BASE_URL;
  }
  
  // Check for environment variable (set during build)
  if (import.meta.env.VITE_API_URL) {
    console.log('[Dashboard] Using VITE_API_URL:', import.meta.env.VITE_API_URL);
    return import.meta.env.VITE_API_URL;
  }
  
  // Auto-detect: if served from a server (not localhost), assume backend is on port 3000
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
  
  if (!isLocalhost) {
    // Production: assume backend is on same host, port 3000
    const apiUrl = `${window.location.protocol}//${hostname}:3000`;
    console.log('[Dashboard] Auto-detected API URL (production):', apiUrl);
    return apiUrl;
  }
  
  // Development: use current origin
  const devUrl = window.location.origin + getBasePath();
  console.log('[Dashboard] Using current origin (development):', devUrl);
  return devUrl;
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
  
  try {
    const response = await fetch(url, options);
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

