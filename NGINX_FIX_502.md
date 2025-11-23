# Fix 502 Bad Gateway Error

## Problem
- ✅ Backend works: `curl http://localhost:3000/api/payout-comparison` returns data
- ❌ Nginx proxy fails: `curl http://localhost/ringba-sync-dashboard/api/payout-comparison` returns 502

## Root Cause
The nginx rewrite rule might not be working correctly with proxy_pass.

## Solution

The issue is likely with the rewrite rule. Try one of these fixes:

### Fix Option 1: Use proxy_pass with trailing slash (Recommended)

Change the API location block to:

```nginx
location /ringba-sync-dashboard/api {
    # Remove the rewrite, use proxy_pass with trailing slash
    proxy_pass http://127.0.0.1:3000/api;
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

**Key Change**: Removed `rewrite` and changed `proxy_pass http://127.0.0.1:3000;` to `proxy_pass http://127.0.0.1:3000/api;`

### Fix Option 2: Fix the rewrite rule

If you want to keep the rewrite, try this:

```nginx
location /ringba-sync-dashboard/api {
    # Use a simpler rewrite pattern
    rewrite ^/ringba-sync-dashboard/api(.*)$ /api$1 break;
    proxy_pass http://127.0.0.1:3000;
    # ... rest of config
}
```

**Key Change**: Changed `(/.*)$` to `(.*)$` and removed the leading slash in the replacement

### Fix Option 3: Use location with trailing slash

```nginx
location /ringba-sync-dashboard/api/ {
    rewrite ^/ringba-sync-dashboard/api/(.*)$ /api/$1 break;
    proxy_pass http://127.0.0.1:3000;
    # ... rest of config
}
```

## Testing After Fix

1. **Test nginx config**:
   ```bash
   sudo nginx -t
   ```

2. **Reload nginx**:
   ```bash
   sudo systemctl reload nginx
   ```

3. **Test API through nginx**:
   ```bash
   curl http://localhost/ringba-sync-dashboard/api/payout-comparison
   ```

4. **Check nginx error log**:
   ```bash
   sudo tail -f /var/log/nginx/insidefi.error.log
   ```

## Recommended Fix

I recommend **Fix Option 1** - it's the simplest and most reliable. Just change:
- `proxy_pass http://127.0.0.1:3000;` 
- To: `proxy_pass http://127.0.0.1:3000/api;`

And remove the rewrite line entirely.

