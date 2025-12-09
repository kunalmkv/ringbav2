# Complete Step-by-Step Deployment Guide for Frontend Changes

## Understanding the Setup

Based on your nginx configuration:
- **Nginx serves static files** directly from `/var/www/ringba-sync-dashboard/` on the server
- **React build** creates files in `dashboard-build/` directory (locally or on server)
- **Files must be copied** from `dashboard-build/` to `/var/www/ringba-sync-dashboard/`
- **Nginx caches JS/CSS files for 7 days** - this is why old files might still show
- **API calls** are proxied to Express server (port 3000)

## Complete Deployment Steps

### Step 1: Build the React Frontend

**On the server**, navigate to your project directory:

```bash
cd /path/to/elocal-scrapper/ringbav2
cd dashboard-react
npm install  # Only if dependencies changed
npm run build
cd ..
```

**Verify build output:**
```bash
ls -la dashboard-build/
ls -la dashboard-build/assets/
```

You should see:
- `index.html`
- `assets/` directory with `.js` and `.css` files

**Check build timestamp:**
```bash
ls -lt dashboard-build/assets/*.js | head -1
```

The most recent file should be from just now.

### Step 2: Copy Build Files to Nginx Directory

**Copy files from `dashboard-build/` to `/var/www/ringba-sync-dashboard/`:**

```bash
# Remove old files first (optional, but recommended)
sudo rm -rf /var/www/ringba-sync-dashboard/*

# Copy new build files
sudo cp -r dashboard-build/* /var/www/ringba-sync-dashboard/

# Set correct permissions
sudo chown -R www-data:www-data /var/www/ringba-sync-dashboard
sudo chmod -R 755 /var/www/ringba-sync-dashboard
```

**Verify files were copied:**
```bash
ls -la /var/www/ringba-sync-dashboard/
ls -la /var/www/ringba-sync-dashboard/assets/
```

**Check file timestamps:**
```bash
ls -lt /var/www/ringba-sync-dashboard/assets/*.js | head -1
```

The files should have current timestamps.

### Step 3: Verify New Files Contain Your Changes

**Check if new columns are in the built files:**
```bash
# Search for your new column names (might be minified)
grep -r "Cost Per Call\|Net\|Net Profit" /var/www/ringba-sync-dashboard/assets/*.js
```

If you see the column names, the build is correct.

### Step 4: Clear Nginx Cache and Reload

**Nginx caches JS/CSS files for 7 days. You need to clear this:**

```bash
# Option 1: Reload nginx (recommended)
sudo nginx -s reload
# OR
sudo systemctl reload nginx

# Option 2: Restart nginx (if reload doesn't work)
sudo systemctl restart nginx

# Verify nginx is running
sudo systemctl status nginx
```

**Test nginx configuration:**
```bash
sudo nginx -t
```

Should show: `nginx: configuration file /etc/nginx/nginx.conf test is successful`

### Step 5: Clear Browser Cache (CRITICAL!)

**Browsers cache JavaScript and CSS files aggressively. You MUST clear cache:**

#### Chrome/Edge:
1. Open Developer Tools (Press `F12`)
2. Right-click the **refresh button** (next to address bar)
3. Select **"Empty Cache and Hard Reload"**
4. OR Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)

#### Firefox:
1. Press `Ctrl+Shift+Delete` (Windows/Linux) or `Cmd+Shift+Delete` (Mac)
2. Select **"Cached Web Content"**
3. Time range: **"Everything"**
4. Click **"Clear Now"**
5. Refresh the page

#### Safari:
1. Press `Cmd+Option+E` to clear cache
2. OR: Safari menu → Preferences → Advanced → Check "Show Develop menu"
3. Develop menu → Empty Caches
4. Refresh the page

### Step 6: Verify Changes Are Live

**1. Check which files nginx is serving:**
```bash
# Check the actual JS file being served
curl -I http://localhost/ringba-sync-dashboard/assets/index-*.js

# Check file modification time
stat /var/www/ringba-sync-dashboard/assets/*.js
```

**2. Open browser Developer Tools:**
- Press `F12` to open Developer Tools
- Go to **Network** tab
- Check **"Disable cache"** checkbox (important!)
- Refresh the page (`Ctrl+R` or `Cmd+R`)

**3. In Network tab, look for:**
- New `.js` files being loaded (not cached)
- File sizes and timestamps
- Status should be `200` (not `304 Not Modified`)

**4. Check Console tab:**
- Look for any JavaScript errors
- Should see no errors related to your new columns

**5. Verify columns appear:**
- Look for: "Cost Per Call", "Net", "Net Profit" columns
- They should be at the end of the table

### Step 7: Force Cache Invalidation (If Still Not Working)

If files are still cached, you can force nginx to serve new files:

**Option 1: Temporarily disable caching in nginx:**

Edit nginx config (usually `/etc/nginx/sites-enabled/insidefi.co` or similar):

```nginx
# Temporarily change cache settings
location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map)$ {
    expires -1;  # Changed from 7d to -1 (no cache)
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    add_header Pragma "no-cache";
    access_log off;
}
```

Then:
```bash
sudo nginx -t
sudo nginx -s reload
```

**Option 2: Add version query parameter to HTML:**

Edit `/var/www/ringba-sync-dashboard/index.html` and add version to asset URLs (not recommended, but works).

**Option 3: Rename asset files (Vite does this automatically):**

Vite already adds hashes to filenames (e.g., `index-CSe88Qhu.js`), so new builds create new filenames. If you see the same filename, the build wasn't copied correctly.

## Troubleshooting

### Issue: Still seeing old columns

**Check 1: Verify files were copied:**
```bash
# Check file modification time
stat /var/www/ringba-sync-dashboard/assets/*.js

# Should show recent timestamp (within last few minutes)
```

**Check 2: Verify nginx is serving from correct location:**
```bash
# Check nginx config
sudo grep -r "ringba-sync-dashboard" /etc/nginx/

# Should show: alias /var/www/ringba-sync-dashboard;
```

**Check 3: Check browser is loading new files:**
- Open Developer Tools → Network tab
- Look at the `.js` file being loaded
- Check the file size and timestamp
- If it shows `304 Not Modified`, the browser is using cache

**Check 4: Verify build contains new code:**
```bash
# Search for new column names in build
grep -i "cost per call" /var/www/ringba-sync-dashboard/assets/*.js
grep -i "net profit" /var/www/ringba-sync-dashboard/assets/*.js
```

If not found, the build didn't include your changes.

### Issue: Build fails

```bash
cd dashboard-react
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Issue: Permission denied when copying

```bash
# Use sudo
sudo cp -r dashboard-build/* /var/www/ringba-sync-dashboard/
sudo chown -R www-data:www-data /var/www/ringba-sync-dashboard
```

### Issue: Nginx won't reload

```bash
# Check for syntax errors
sudo nginx -t

# Check nginx error log
sudo tail -f /var/log/nginx/error.log

# Restart instead of reload
sudo systemctl restart nginx
```

## Quick Deployment Script

Create this script on your server:

```bash
#!/bin/bash
# deploy-frontend-to-nginx.sh

set -e

PROJECT_DIR="/path/to/elocal-scrapper/ringbav2"
NGINX_DIR="/var/www/ringba-sync-dashboard"

echo "Building React frontend..."
cd "$PROJECT_DIR/dashboard-react"
npm run build
cd ..

echo "Copying files to nginx directory..."
sudo rm -rf "$NGINX_DIR"/*
sudo cp -r dashboard-build/* "$NGINX_DIR/"
sudo chown -R www-data:www-data "$NGINX_DIR"
sudo chmod -R 755 "$NGINX_DIR"

echo "Reloading nginx..."
sudo nginx -s reload

echo "Deployment complete!"
echo "Remember to clear browser cache (Ctrl+Shift+R)"
```

Make it executable:
```bash
chmod +x deploy-frontend-to-nginx.sh
./deploy-frontend-to-nginx.sh
```

## Summary Checklist

- [ ] Build React app: `cd dashboard-react && npm run build`
- [ ] Verify build output exists: `ls -la dashboard-build/`
- [ ] Copy files to nginx: `sudo cp -r dashboard-build/* /var/www/ringba-sync-dashboard/`
- [ ] Set permissions: `sudo chown -R www-data:www-data /var/www/ringba-sync-dashboard`
- [ ] Reload nginx: `sudo nginx -s reload`
- [ ] Clear browser cache: `Ctrl+Shift+R` (or equivalent)
- [ ] Verify in browser: Check Network tab for new files
- [ ] Verify columns appear: Look for "Cost Per Call", "Net", "Net Profit"

## Key Points to Remember

1. **Nginx serves from `/var/www/ringba-sync-dashboard/`** - not from `dashboard-build/`
2. **Always copy files** after building
3. **Nginx caches for 7 days** - reload nginx after copying
4. **Browser caches aggressively** - always clear cache
5. **Vite creates new filenames** - if you see same filename, files weren't copied
6. **Check Network tab** in browser DevTools to verify new files are loading


