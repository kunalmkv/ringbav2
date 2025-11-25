// API utility functions
// Simplified approach matching elocal project (which works perfectly on server)

const getBasePath = () => {
  const pathname = window.location.pathname;
  // If pathname includes /ringba-sync-dashboard, use it as base path
  if (pathname.includes('/ringba-sync-dashboard')) {
    return '/ringba-sync-dashboard';
  }
  return '';
};

export const BASE_PATH = getBasePath();
export const API_BASE_URL = window.location.origin + BASE_PATH;

// Debug logging
console.log('[Dashboard] Base path:', BASE_PATH);
console.log('[Dashboard] API base URL:', API_BASE_URL);
console.log('[Dashboard] Current pathname:', window.location.pathname);
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
  },
  // Google Ads Spend endpoints
  getGoogleAdsSpend: (startDate = null, endDate = null) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return fetchAPI(`/api/google-ads-spend?${params.toString()}`);
  },
  saveGoogleAdsSpend: (date, spendAmount, notes = null) => {
    return fetchAPI('/api/google-ads-spend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        date,
        spend_amount: spendAmount,
        notes
      })
    });
  },
  deleteGoogleAdsSpend: (date) => {
    return fetchAPI(`/api/google-ads-spend/${date}`, {
      method: 'DELETE'
    });
  }
};

