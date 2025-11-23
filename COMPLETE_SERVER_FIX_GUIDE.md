# Complete Server Fix Guide - Step by Step

## Root Cause Analysis

After analyzing the working `elocal` project, I identified the key differences:

1. **API Base URL**: elocal uses a simple, reliable path detection method
2. **Nginx Configuration**: Uses static file serving with proper API proxying
3. **No Complex Config Loading**: elocal doesn't use external config.js files

## The Problem

The ringbav2 dashboard was using:
- Complex config.js loading logic
- Inconsistent API base URL detection
- Potential timing issues with config loading

## Solution: Match elocal's Working Approach

I've updated the code to match elocal's simple, reliable approach.

---

## Step-by-Step Fix Instructions

### Step 1: Update Frontend Code (Already Done)

✅ **Completed**: I've updated `dashboard-react/src/utils/api.js` to use the same simple approach as elocal:

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

### Step 2: Rebuild Frontend

```bash
cd /path/to/ringbav2/dashboard-react
npm run build
```

This creates updated build files in `dashboard-build/` directory.

### Step 3: Copy Build Files to Server

```bash
# On your local machine or server
sudo cp -r /path/to/ringbav2/dashboard-build/* /var/www/ringba-sync-dashboard/

# Set correct permissions
sudo chown -R www-data:www-data /var/www/ringba-sync-dashboard
sudo chmod -R 755 /var/www/ringba-sync-dashboard
```

### Step 4: Verify Nginx Configuration

Edit your nginx config file (usually `/etc/nginx/sites-enabled/insidefi.co`):

**IMPORTANT**: The API location block MUST be placed AFTER the static file location block.

```nginx
# Static files - MUST come first
location /ringba-sync-dashboard {
    alias /var/www/ringba-sync-dashboard;
    index index.html;
    try_files $uri $uri/ /ringba-sync-dashboard/index.html;
    
    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }
    
    # Don't cache HTML
    location ~* \.html$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }
}

# API routes - MUST come after static location
location /ringba-sync-dashboard/api {
    rewrite ^/ringba-sync-dashboard/api(/.*)$ /api$1 break;
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}
```

### Step 5: Test Nginx Configuration

```bash
# Test nginx config syntax
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx
```

### Step 6: Verify Backend Server is Running

```bash
# Check if dashboard server is running on port 3000
curl http://localhost:3000/api/health

# Should return JSON: {"status":"healthy","database":"connected",...}

# Check PM2 status (if using PM2)
pm2 status

# View dashboard logs
pm2 logs dashboard
```

### Step 7: Test Through Nginx

```bash
# Test static files
curl -I http://localhost/ringba-sync-dashboard/

# Test API endpoint
curl http://localhost/ringba-sync-dashboard/api/payout-comparison

# Should return JSON data
```

### Step 8: Test in Browser

1. Open: `https://insidefi.co/ringba-sync-dashboard/`
2. Open browser console (F12)
3. Check for these logs:
   - `[Dashboard] Base path: /ringba-sync-dashboard`
   - `[Dashboard] API base URL: https://insidefi.co/ringba-sync-dashboard`
   - `[Dashboard API] Fetching: https://insidefi.co/ringba-sync-dashboard/api/payout-comparison?...`
   - `[PayoutComparison] Data Array Length: 13`

4. Check Network tab:
   - Look for API call to `/ringba-sync-dashboard/api/payout-comparison`
   - Should return status 200
   - Response should contain JSON with `data` array

---

## Troubleshooting

### Issue: Blank Page

**Check:**
1. Browser console for JavaScript errors
2. Network tab for failed asset loads
3. Nginx error log: `sudo tail -f /var/log/nginx/error.log`

**Fix:**
- Verify files exist: `ls -la /var/www/ringba-sync-dashboard/`
- Check file permissions
- Verify nginx config syntax

### Issue: API Returns 502 Bad Gateway

**Check:**
1. Backend server is running: `curl http://localhost:3000/api/health`
2. PM2 status: `pm2 status`
3. Server logs: `pm2 logs dashboard`

**Fix:**
- Start backend server: `cd /path/to/ringbav2 && npm run dashboard`
- Or with PM2: `pm2 start dashboard-server.js --name dashboard`

### Issue: API Returns 404

**Check:**
1. Nginx rewrite rule is correct
2. API location block is AFTER static location block
3. Test API directly: `curl http://localhost:3000/api/payout-comparison`

**Fix:**
- Verify nginx config order (static files first, then API)
- Check rewrite rule: `rewrite ^/ringba-sync-dashboard/api(/.*)$ /api$1 break;`

### Issue: Data Not Loading (API works but frontend shows nothing)

**Check:**
1. Browser console for API calls
2. Check API response in Network tab
3. Look for JavaScript errors

**Fix:**
- Clear browser cache (Ctrl+Shift+R or Cmd+Shift+R)
- Check console logs for `[Dashboard] API base URL`
- Verify API response contains `{"data": [...]}`

---

## Verification Checklist

- [ ] Frontend code updated (simplified API detection)
- [ ] Frontend rebuilt (`npm run build`)
- [ ] Build files copied to `/var/www/ringba-sync-dashboard/`
- [ ] File permissions set correctly
- [ ] Nginx config updated (static files first, API second)
- [ ] Nginx config tested (`nginx -t`)
- [ ] Nginx reloaded (`systemctl reload nginx`)
- [ ] Backend server running on port 3000
- [ ] API works directly: `curl http://localhost:3000/api/payout-comparison`
- [ ] API works through nginx: `curl http://localhost/ringba-sync-dashboard/api/payout-comparison`
- [ ] Browser console shows correct API base URL
- [ ] Browser Network tab shows successful API calls
- [ ] Data displays in the table

---

## Key Differences from Previous Approach

1. **Simplified API Detection**: No external config.js, no complex loading logic
2. **Direct Path Detection**: Uses `window.location.pathname` directly
3. **Matches elocal**: Uses the exact same approach as the working elocal project
4. **No Timing Issues**: API detection happens synchronously when module loads

---

## Files Changed

1. `dashboard-react/src/utils/api.js` - Simplified to match elocal
2. `dashboard-react/index.html` - Removed embedded config (not needed)
3. `dashboard-react/src/components/PayoutComparison.jsx` - Removed delay in useEffect

---

## Next Steps After Fix

Once everything is working:

1. Monitor logs: `pm2 logs dashboard`
2. Set up PM2 auto-start: `pm2 startup && pm2 save`
3. Test all API endpoints
4. Verify data loads correctly
5. Test date filtering functionality

---

## Summary

The fix simplifies the API base URL detection to match the working elocal project. The key is:
- Simple path detection: `if (pathname.includes('/ringba-sync-dashboard'))`
- Direct API URL: `window.location.origin + '/ringba-sync-dashboard'`
- No external config files needed
- No timing issues

This approach is proven to work on the server (as seen in elocal project).

