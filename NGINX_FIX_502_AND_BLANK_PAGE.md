# Complete Fix for 502 Bad Gateway and Blank Page

## Problem Analysis

1. **502 Bad Gateway**: Nginx can't proxy to backend
2. **Blank Page**: Frontend not loading (even locally)

## Root Causes

### 502 Issue
The current nginx config uses `proxy_pass http://127.0.0.1:3000/api;` which can cause path issues. Need to use `rewrite` + upstream.

### Blank Page Issue
Even though assets have correct paths, there might be:
- JavaScript errors preventing render
- API calls failing
- Assets not accessible

## Complete Fix

### Step 1: Fix Nginx Configuration

**Replace the `/ringba-sync-dashboard/api` location block** in `/etc/nginx/sites-enabled/insidefi.co`:

```nginx
location /ringba-sync-dashboard/api {
    # Rewrite to strip /ringba-sync-dashboard prefix
    rewrite ^/ringba-sync-dashboard/api(.*)$ /api$1 break;
    
    # Proxy to upstream (NOT with /api path - rewrite handles it)
    proxy_pass http://ringba-sync-dashboard;
    
    proxy_http_version 1.1;
    
    # WebSocket support
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    
    # Standard proxy headers
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Port $server_port;
    
    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
    
    # Don't buffer responses
    proxy_buffering off;
    
    # CORS headers
    add_header Access-Control-Allow-Origin * always;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
    
    # Handle preflight requests
    if ($request_method = 'OPTIONS') {
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
        add_header Content-Length 0;
        add_header Content-Type text/plain;
        return 204;
    }
}
```

**Key Changes:**
- ✅ Use `rewrite` with `break` to strip prefix
- ✅ Use `proxy_pass http://ringba-sync-dashboard;` (NO `/api` path)
- ✅ Rewrite handles the path transformation

### Step 2: Test and Reload Nginx

```bash
# Test config
sudo nginx -t

# If OK, reload
sudo systemctl reload nginx

# Watch error log
sudo tail -f /var/log/nginx/insidefi.error.log
```

### Step 3: Verify Backend is Running on Server

```bash
# Test backend directly
curl http://127.0.0.1:3000/api/payout-comparison

# If not working, check:
ps aux | grep dashboard-server
pm2 status

# Start if needed:
cd /path/to/ringbav2
npm run dashboard
```

### Step 4: Test API Through Nginx

```bash
# Should now return JSON, not 502
curl http://localhost/ringba-sync-dashboard/api/payout-comparison
```

### Step 5: Fix Blank Page - Copy Build Files

```bash
# Copy new build (with correct base path) to server
sudo cp -r /path/to/ringbav2/dashboard-build/* /var/www/ringba-sync-dashboard/

# Set permissions
sudo chown -R www-data:www-data /var/www/ringba-sync-dashboard
sudo chmod -R 755 /var/www/ringba-sync-dashboard
```

### Step 6: Verify Assets Exist and Load

```bash
# Check assets exist
ls -la /var/www/ringba-sync-dashboard/assets/

# Test asset loading
curl -I http://localhost/ringba-sync-dashboard/assets/index-D_qHQMUi.js
# Should return 200 OK

# Test HTML
curl http://localhost/ringba-sync-dashboard/ | grep -E "(script|link)"
# Should show paths with /ringba-sync-dashboard/assets/
```

### Step 7: Debug Blank Page in Browser

1. Open: `https://insidefi.co/ringba-sync-dashboard/`
2. Press F12 (DevTools)
3. **Console Tab** - Check for:
   - Red errors (screenshot these)
   - Messages starting with `[Dashboard]`
   - Any import/module errors

4. **Network Tab** - Check:
   - Are assets loading? (status 200)
   - Are API calls working? (status 200)
   - Any 404 or 502 errors?

5. **Elements Tab** - Check:
   - Is `<div id="root">` present?
   - Is it empty or does it have content?

## Troubleshooting

### If Still Getting 502:

1. **Check backend is accessible:**
   ```bash
   curl http://127.0.0.1:3000/api/health
   ```

2. **Check nginx error log:**
   ```bash
   sudo tail -20 /var/log/nginx/insidefi.error.log
   ```
   Look for: "connection refused", "timeout", "upstream"

3. **Verify upstream definition:**
   ```bash
   grep "upstream ringba-sync-dashboard" /etc/nginx/sites-enabled/insidefi.co
   ```
   Should show: `server 127.0.0.1:3000;`

4. **Test rewrite manually:**
   ```bash
   # The rewrite should convert:
   # /ringba-sync-dashboard/api/payout-comparison
   # To: /api/payout-comparison
   ```

### If Still Getting Blank Page:

1. **Check browser console for specific errors**
2. **Verify HTML is served:**
   ```bash
   curl http://localhost/ringba-sync-dashboard/ | head -20
   ```

3. **Check asset paths in HTML:**
   ```bash
   curl http://localhost/ringba-sync-dashboard/ | grep -E "assets/"
   ```
   Should show: `/ringba-sync-dashboard/assets/...`

4. **Test asset directly:**
   ```bash
   curl -I http://localhost/ringba-sync-dashboard/assets/index-D_qHQMUi.js
   ```

5. **Check if React is loading:**
   - Open browser console
   - Type: `window.React` (should not be undefined)
   - Check for module loading errors

## Expected Results After Fix

✅ `curl http://localhost/ringba-sync-dashboard/api/payout-comparison` returns JSON  
✅ Browser shows dashboard (not blank)  
✅ Assets load (200 status in Network tab)  
✅ API calls work (200 status)  
✅ Data displays in table  
✅ Console shows `[Dashboard]` messages (no errors)

## Quick Test Commands

```bash
# 1. Test backend
curl http://127.0.0.1:3000/api/health

# 2. Test nginx API proxy
curl http://localhost/ringba-sync-dashboard/api/health

# 3. Test HTML
curl http://localhost/ringba-sync-dashboard/ | head -10

# 4. Test asset
curl -I http://localhost/ringba-sync-dashboard/assets/index-D_qHQMUi.js
```

All should return 200 OK (except HTML which should return HTML content).

