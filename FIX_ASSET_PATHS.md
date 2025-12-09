# Fix for Asset Path 404 Errors

## Problem
Assets are being requested from `/assets/...` but the server serves them at `/ringba-sync-dashboard/assets/...`

## Solution

### Step 1: Update vite.config.js Base Path

The `vite.config.js` has been updated to use the correct base path:
```javascript
base: '/ringba-sync-dashboard/',
```

### Step 2: Rebuild the Frontend

```bash
cd dashboard-react
npm run build
```

This will regenerate the `dashboard-build` directory with correct asset paths.

### Step 3: Verify the Build

Check that `dashboard-build/index.html` has correct asset paths:
```bash
cat dashboard-build/index.html | grep assets
```

Should show:
```html
<script type="module" crossorigin src="/ringba-sync-dashboard/assets/index-XXXXX.js"></script>
<link rel="stylesheet" crossorigin href="/ringba-sync-dashboard/assets/index-XXXXX.css">
```

### Step 4: Restart Backend Server

```bash
# If using PM2
pm2 restart dashboard-server

# If using systemd
sudo systemctl restart ringba-dashboard

# If running manually
# Stop and restart node dashboard-server.js
```

### Step 5: Clear Browser Cache

- Hard refresh: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
- Or clear browser cache completely

## Alternative: If Using Root Path on Subdomain

If you want to serve at root `/` on the subdomain (not `/ringba-sync-dashboard/`):

1. Update `vite.config.js`:
   ```javascript
   base: '/',
   ```

2. Update `dashboard-server.js` to serve at root:
   ```javascript
   app.use('/', express.static(DASHBOARD_BUILD_DIR));
   ```

3. Rebuild and restart.

## Verification

After rebuilding, check:
1. Browser console - no 404 errors
2. Network tab - assets load with 200 status
3. Dashboard displays correctly


