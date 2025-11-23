# Complete Fix Steps for 502 and Blank Page

## Issues
1. 502 Bad Gateway when accessing API through nginx
2. Blank page on both local and server

## Root Causes

### Issue 1: 502 Bad Gateway
The nginx `proxy_pass` configuration might not be working correctly. The backend is running (verified with direct curl), but nginx can't proxy it.

### Issue 2: Blank Page
Assets are now correctly referenced with base path, but there might be JavaScript errors or the page isn't loading correctly.

## Complete Fix Steps

### Step 1: Fix Nginx API Location Block

Edit `/etc/nginx/sites-enabled/insidefi.co` and replace the `/ringba-sync-dashboard/api` location block with:

```nginx
location /ringba-sync-dashboard/api {
    # Use rewrite to properly strip the prefix
    rewrite ^/ringba-sync-dashboard/api(.*)$ /api$1 break;
    proxy_pass http://ringba-sync-dashboard;  # Use upstream name
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
- Use `rewrite` with `break` to strip prefix
- Use `proxy_pass http://ringba-sync-dashboard;` (upstream) instead of direct IP
- Remove `/api` from proxy_pass since rewrite handles it

### Step 2: Test and Reload Nginx

```bash
# Test nginx config
sudo nginx -t

# If OK, reload
sudo systemctl reload nginx

# Check error logs
sudo tail -f /var/log/nginx/insidefi.error.log
```

### Step 3: Verify Backend is Running on Server

```bash
# Test backend directly (on server)
curl http://127.0.0.1:3000/api/payout-comparison

# Check if process is running
ps aux | grep dashboard-server
# OR
pm2 status

# If not running, start it
cd /path/to/ringbav2
npm run dashboard
# OR
pm2 start dashboard-server.js --name dashboard
```

### Step 4: Test API Through Nginx

```bash
# Test API through nginx
curl http://localhost/ringba-sync-dashboard/api/payout-comparison

# Should return JSON data, not 502
```

### Step 5: Copy New Build Files

```bash
# Copy build files to server
sudo cp -r /path/to/ringbav2/dashboard-build/* /var/www/ringba-sync-dashboard/

# Set permissions
sudo chown -R www-data:www-data /var/www/ringba-sync-dashboard
sudo chmod -R 755 /var/www/ringba-sync-dashboard
```

### Step 6: Verify Assets Load

```bash
# Check if assets exist
ls -la /var/www/ringba-sync-dashboard/assets/

# Test asset loading
curl -I http://localhost/ringba-sync-dashboard/assets/index-D_qHQMUi.js
# Should return 200 OK
```

### Step 7: Test in Browser

1. Open: `https://insidefi.co/ringba-sync-dashboard/`
2. Open DevTools (F12)
3. **Console Tab:**
   - Check for errors
   - Should see: `[Dashboard] Base path: /ringba-sync-dashboard`
   - Should see: `[Dashboard] API base URL: https://insidefi.co/ringba-sync-dashboard`

4. **Network Tab:**
   - Check that assets load: `/ringba-sync-dashboard/assets/index-*.js` (200)
   - Check that API calls work: `/ringba-sync-dashboard/api/payout-comparison` (200)

## Troubleshooting

### If Still Getting 502:

1. **Check backend is running:**
   ```bash
   curl http://127.0.0.1:3000/api/health
   ```

2. **Check nginx can reach backend:**
   ```bash
   # From nginx server, test connection
   curl http://127.0.0.1:3000/api/health
   ```

3. **Check nginx error log:**
   ```bash
   sudo tail -20 /var/log/nginx/insidefi.error.log
   ```
   Look for "connection refused" or "timeout" errors

4. **Verify upstream is correct:**
   ```bash
   # Check if upstream is defined
   grep "upstream ringba-sync-dashboard" /etc/nginx/sites-enabled/insidefi.co
   ```

### If Still Getting Blank Page:

1. **Check browser console for errors**
2. **Verify assets load:**
   ```bash
   curl -I http://localhost/ringba-sync-dashboard/assets/index-D_qHQMUi.js
   ```

3. **Check HTML is served:**
   ```bash
   curl http://localhost/ringba-sync-dashboard/ | head -20
   ```

4. **Verify base path in HTML:**
   ```bash
   grep "ringba-sync-dashboard/assets" /var/www/ringba-sync-dashboard/index.html
   ```

## Expected Results

After fixes:
- ✅ `curl http://localhost/ringba-sync-dashboard/api/payout-comparison` returns JSON
- ✅ Browser shows dashboard (not blank page)
- ✅ Assets load correctly (200 status)
- ✅ API calls work (200 status)
- ✅ Data displays in table

