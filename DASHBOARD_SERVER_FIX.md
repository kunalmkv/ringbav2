# Dashboard Server Fix - Complete Step-by-Step Guide

## Root Cause Analysis

After analyzing the working `elocal` project, I found the key differences:

1. **API Base URL Detection**: The elocal project uses a simple, reliable method
2. **Nginx Configuration**: Uses static file serving with API proxying
3. **Path Handling**: The frontend correctly detects `/ringba-sync-dashboard` path

## The Problem

The ringbav2 dashboard is trying to use complex config.js loading, but:
- The config.js path might not be correct on the server
- The API base URL detection is inconsistent
- Nginx might not be configured correctly

## Solution: Match elocal's Working Approach

### Step 1: Fix API Base URL Detection (Simplified)

The elocal project uses this simple, reliable approach:

```javascript
const getBasePath = () => {
  const pathname = window.location.pathname;
  if (pathname.includes('/ringba-sync-dashboard')) {
    return '/ringba-sync-dashboard';
  }
  return '';
};

export const API_BASE_URL = window.location.origin + BASE_PATH;
```

This ensures API calls go to: `https://insidefi.co/ringba-sync-dashboard/api/...`

### Step 2: Verify Nginx Configuration

The nginx config should have:

1. **Static file serving** for `/ringba-sync-dashboard`:
```nginx
location /ringba-sync-dashboard {
    alias /var/www/ringba-sync-dashboard;
    index index.html;
    try_files $uri $uri/ /ringba-sync-dashboard/index.html;
}
```

2. **API proxying** for `/ringba-sync-dashboard/api`:
```nginx
location /ringba-sync-dashboard/api {
    rewrite ^/ringba-sync-dashboard/api(/.*)$ /api$1 break;
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
}
```

### Step 3: Verify Backend Server

The Node.js server should:
- Be running on port 3000
- Have API endpoints at `/api/*`
- Not try to serve static files (nginx does that)

## Implementation Steps

### Step 1: Update API Utility (Match elocal)

Replace the complex config.js logic with the simple elocal approach.

### Step 2: Rebuild Frontend

Build the React app with the simplified API detection.

### Step 3: Copy Files to Server

Copy build files to `/var/www/ringba-sync-dashboard/`

### Step 4: Verify Nginx Config

Ensure nginx is configured correctly (see Step 2 above).

### Step 5: Test

1. Test static files: `curl -I https://insidefi.co/ringba-sync-dashboard/`
2. Test API: `curl https://insidefi.co/ringba-sync-dashboard/api/payout-comparison`
3. Check browser console for API calls

