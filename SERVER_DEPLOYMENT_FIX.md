# Server Deployment Fix - Blank Page Issue

## Problem
Server homepage is blank, but local works fine.

## Root Causes
1. Build files not copied to server
2. Incorrect file permissions
3. Nginx not serving static files correctly
4. Assets not accessible

## Complete Fix Steps

### Step 1: Rebuild Frontend (if needed)
```bash
cd /path/to/ringbav2/dashboard-react
npm run build
```

This creates files in `ringbav2/dashboard-build/`

### Step 2: Copy Build Files to Server

**On your local machine:**
```bash
# From your local machine, copy files to server
scp -r /path/to/ringbav2/dashboard-build/* user@your-server:/var/www/ringba-sync-dashboard/
```

**OR on the server:**
```bash
# If you have the files on server already
cd /path/to/ringbav2
sudo cp -r dashboard-build/* /var/www/ringba-sync-dashboard/
```

### Step 3: Set Correct Permissions
```bash
sudo chown -R www-data:www-data /var/www/ringba-sync-dashboard
sudo chmod -R 755 /var/www/ringba-sync-dashboard
```

### Step 4: Verify Files Exist
```bash
# Check index.html exists
ls -la /var/www/ringba-sync-dashboard/index.html

# Check assets directory exists
ls -la /var/www/ringba-sync-dashboard/assets/

# Should see files like:
# - index-D_qHQMUi.js
# - index-Cz6NS20i.css
```

### Step 5: Test Asset Loading
```bash
# Test HTML
curl http://localhost/ringba-sync-dashboard/ | head -20

# Test JavaScript asset (replace with actual filename from assets/)
curl -I http://localhost/ringba-sync-dashboard/assets/index-D_qHQMUi.js

# Should return 200 OK
```

### Step 6: Verify Nginx Configuration

Your nginx config should have:

```nginx
location /ringba-sync-dashboard {
    alias /var/www/ringba-sync-dashboard;
    index index.html;
    
    # SPA routing - serve index.html for all routes
    try_files $uri $uri/ /ringba-sync-dashboard/index.html;
    
    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }
    
    # Don't cache HTML files
    location ~* \.html$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }
}
```

### Step 7: Test and Reload Nginx
```bash
# Test config
sudo nginx -t

# If OK, reload
sudo systemctl reload nginx
```

### Step 8: Check Browser Console

1. Open: `https://insidefi.co/ringba-sync-dashboard/`
2. Press F12 (DevTools)
3. **Console Tab** - Check for:
   - 404 errors for assets
   - JavaScript errors
   - Network errors

4. **Network Tab** - Check:
   - Are assets loading? (status should be 200)
   - Which files are failing? (404 errors)
   - Check the actual URLs being requested

### Step 9: Common Issues and Fixes

#### Issue: Assets return 404
**Fix:** 
- Verify files exist: `ls -la /var/www/ringba-sync-dashboard/assets/`
- Check nginx error log: `sudo tail -f /var/log/nginx/insidefi.error.log`
- Verify alias path in nginx config

#### Issue: HTML loads but page is blank
**Fix:**
- Check browser console for JavaScript errors
- Verify API calls are working: `curl https://insidefi.co/ringba-sync-dashboard/api/payout-comparison`
- Check if React is loading: Look for `[Dashboard]` messages in console

#### Issue: Permission denied
**Fix:**
```bash
sudo chown -R www-data:www-data /var/www/ringba-sync-dashboard
sudo chmod -R 755 /var/www/ringba-sync-dashboard
```

## Quick Diagnostic Commands

```bash
# 1. Check files exist
ls -la /var/www/ringba-sync-dashboard/
ls -la /var/www/ringba-sync-dashboard/assets/

# 2. Test HTML
curl http://localhost/ringba-sync-dashboard/ | grep -E "(script|link)"

# 3. Test asset
curl -I http://localhost/ringba-sync-dashboard/assets/index-D_qHQMUi.js

# 4. Check nginx error log
sudo tail -20 /var/log/nginx/insidefi.error.log

# 5. Check nginx access log
sudo tail -20 /var/log/nginx/insidefi.access.log
```

## Expected Results

After fixes:
- ✅ `curl http://localhost/ringba-sync-dashboard/` returns HTML
- ✅ `curl -I http://localhost/ringba-sync-dashboard/assets/index-*.js` returns 200
- ✅ Browser shows dashboard (not blank)
- ✅ Console shows no 404 errors
- ✅ Assets load (200 status in Network tab)

