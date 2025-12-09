# Fix for 404 Errors on Server

## Problem
The UI works locally but shows a white screen with 404 errors on the server. This is caused by a mismatch between:
- **Nginx config**: Serves static files at root `/` for subdomain `ringba.insidefi.co`
- **Vite build config**: Was set to `base: '/ringba-sync-dashboard/'` which references assets with that prefix

## Solution Applied

### 1. Updated `vite.config.js`
Changed the base path from `/ringba-sync-dashboard/` to `/` to match nginx root serving:
```javascript
base: '/',  // Changed from '/ringba-sync-dashboard/'
```

### 2. Updated `dashboard-react/src/utils/api.js`
Updated API base path detection to work correctly at root:
```javascript
const getBasePath = () => {
  const pathname = window.location.pathname;
  // If pathname includes /ringba-sync-dashboard, use it as base path (for path-based serving)
  // Otherwise, serve at root (for subdomain at root like ringba.insidefi.co)
  if (pathname.includes('/ringba-sync-dashboard')) {
    return '/ringba-sync-dashboard';
  }
  // For subdomain at root, return empty string so API calls go to /api
  return '';
};
```

## Deployment Steps

### On Your Local Machine:
1. **Rebuild the frontend** with the new base path:
   ```bash
   cd ringbav2/dashboard-react
   npm run build
   ```

2. **Upload the built files** to the server:
   ```bash
   # The build output is in ringbav2/dashboard-build/
   # Upload all files from dashboard-build/ to /var/www/ringba-sync-dashboard/ on server
   ```

### On the Server:
1. **Verify nginx config** is correct (should already be set):
   - File: `/etc/nginx/sites-available/ringba.insidefi.co` (or similar)
   - Should serve static files at root `/` from `/var/www/ringba-sync-dashboard`
   - API routes should proxy `/api` to `http://127.0.0.1:3000`

2. **Restart nginx** (if config was changed):
   ```bash
   sudo nginx -t  # Test config
   sudo systemctl reload nginx  # Reload nginx
   ```

3. **Restart the dashboard server** (if needed):
   ```bash
   # If using PM2 or similar
   pm2 restart dashboard-server
   
   # Or if running directly
   cd /path/to/ringbav2
   npm run dashboard
   ```

## Verification

After deployment, check:
1. **Browser console**: Should not show 404 errors for assets
2. **Network tab**: Assets should load from root `/assets/...` not `/ringba-sync-dashboard/assets/...`
3. **API calls**: Should go to `/api/...` and work correctly
4. **UI**: Should load and display correctly

## Current Configuration Summary

- **Nginx**: Serves static files at root `/` from `/var/www/ringba-sync-dashboard`
- **Vite build**: Uses `base: '/'` so assets reference `/assets/...`
- **API**: Calls go to `/api/...` which nginx proxies to Node.js server on port 3000
- **Node.js server**: Handles `/api/*` routes and has fallback routes for `/ringba-sync-dashboard/*`

## Troubleshooting

If you still see 404 errors:

1. **Check browser console** for exact 404 paths
2. **Verify build output**: Assets should be in `dashboard-build/assets/` with no path prefix in HTML
3. **Check nginx error logs**: `sudo tail -f /var/log/nginx/ringba.error.log`
4. **Verify file permissions**: `/var/www/ringba-sync-dashboard` should be readable by nginx user
5. **Clear browser cache**: Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)


