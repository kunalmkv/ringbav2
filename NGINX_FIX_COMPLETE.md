# Complete Nginx Fix for 502 and Blank Page

## Problem 1: 502 Bad Gateway

The issue is that nginx is trying to proxy to `http://127.0.0.1:3000/api` but the backend might not be running, OR there's a conflict with the `/api/` location block.

## Problem 2: Blank Page

Assets are now correctly referenced with base path, but there might be other issues.

## Complete Fix

### Fix 1: Update Nginx API Location Block

The current config has `proxy_pass http://127.0.0.1:3000/api;` which should work, but let's use the upstream and fix the path handling:

```nginx
location /ringba-sync-dashboard/api {
    # Use rewrite to properly handle the path
    rewrite ^/ringba-sync-dashboard/api(.*)$ /api$1 break;
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
- Use `rewrite` with `break` to properly strip the prefix
- Use `proxy_pass http://ringba-sync-dashboard;` (upstream) instead of direct IP
- Remove the `/api` from proxy_pass since rewrite handles it

### Fix 2: Ensure Location Block Order

Make sure the `/ringba-sync-dashboard/api` location comes AFTER `/ringba-sync-dashboard` but BEFORE `/api/`:

```nginx
# 1. Static files FIRST
location /ringba-sync-dashboard { ... }

# 2. Dashboard API SECOND (before /api/)
location /ringba-sync-dashboard/api { ... }

# 3. Other API routes
location /api/ { ... }
```

### Fix 3: Verify Backend is Running

```bash
# Check if backend is running
curl http://127.0.0.1:3000/api/payout-comparison

# If not working, check:
pm2 status
# Or
ps aux | grep dashboard-server
```

### Fix 4: Check Nginx Error Logs

```bash
sudo tail -f /var/log/nginx/insidefi.error.log
```

Look for connection refused or timeout errors.

