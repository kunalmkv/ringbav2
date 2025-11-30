# Fix for 404 Asset Errors

## Problem
Getting 404 errors for assets:
- `Failed to load resource: the server responded with a status of 404`
- `Refused to apply style from 'http://localhost:3000/assets/index-EfjHIPfS.css' because its MIME type ('text/html') is not a supported stylesheet MIME type`

## Root Cause
The built files now have correct paths (`/ringba-sync-dashboard/assets/...`), but the server needs to:
1. Serve static files correctly
2. Be restarted to pick up the new build

## Solution

### Step 1: Verify Build Files Exist

```bash
# Check if assets directory exists
ls -la dashboard-build/assets/

# Should see files like:
# index-V5xQim0G.js
# index-EfjHIPfS.css
# etc.
```

### Step 2: Verify Server Configuration

The `dashboard-server.js` should have:
```javascript
app.use('/ringba-sync-dashboard', express.static(DASHBOARD_BUILD_DIR));
```

This serves files from `dashboard-build/` at the `/ringba-sync-dashboard/` path.

### Step 3: Restart Backend Server

**If using PM2:**
```bash
pm2 restart dashboard-server
# OR
pm2 restart ringba-dashboard
# OR
pm2 restart all
```

**If using systemd:**
```bash
sudo systemctl restart ringba-dashboard
```

**If running manually:**
```bash
# Stop the current process (Ctrl+C)
# Then restart:
cd /path/to/ringbav2
node dashboard-server.js
```

### Step 4: Test Static File Serving

```bash
# Test if assets are accessible
curl -I http://localhost:3000/ringba-sync-dashboard/assets/index-EfjHIPfS.css

# Should return: HTTP/1.1 200 OK
# Content-Type: text/css
```

**If you get 404:**
- Check that `dashboard-build/assets/` directory exists
- Check that files are in the correct location
- Verify `DASHBOARD_BUILD_DIR` path in `dashboard-server.js`

### Step 5: Clear Browser Cache

After restarting the server:
1. Hard refresh: **Ctrl+Shift+R** (Windows/Linux) or **Cmd+Shift+R** (Mac)
2. Or clear browser cache completely
3. Open browser DevTools → Network tab → Check "Disable cache"

### Step 6: Verify Access

1. Open: `http://localhost:3000/ringba-sync-dashboard/`
2. Check browser console (F12) - should see no 404 errors
3. Check Network tab - assets should load with 200 status

## Common Issues

### Issue 1: Assets Directory Missing
**Symptom:** 404 for all assets
**Solution:** Rebuild frontend: `cd dashboard-react && npm run build`

### Issue 2: Wrong Base Path
**Symptom:** Assets requested from wrong path
**Solution:** 
- Check `vite.config.js` has `base: '/ringba-sync-dashboard/'`
- Rebuild: `npm run build`

### Issue 3: Server Not Restarted
**Symptom:** Old build still being served
**Solution:** Restart the backend server

### Issue 4: Wrong Directory Path
**Symptom:** Server can't find files
**Solution:** 
- Check `DASHBOARD_BUILD_DIR` in `dashboard-server.js`
- Verify path is correct: `join(__dirname, 'dashboard-build')`

## Verification Checklist

- [ ] `vite.config.js` has `base: '/ringba-sync-dashboard/'`
- [ ] Frontend rebuilt: `npm run build`
- [ ] `dashboard-build/assets/` directory exists with files
- [ ] Backend server restarted
- [ ] Browser cache cleared
- [ ] Assets accessible: `curl http://localhost:3000/ringba-sync-dashboard/assets/index-EfjHIPfS.css`
- [ ] Dashboard loads without 404 errors

## Quick Test Commands

```bash
# 1. Check build files
ls -la dashboard-build/assets/

# 2. Test asset serving
curl -I http://localhost:3000/ringba-sync-dashboard/assets/index-EfjHIPfS.css

# 3. Check server logs
pm2 logs dashboard-server --lines 20
# OR
sudo journalctl -u ringba-dashboard -n 20

# 4. Verify HTML
curl http://localhost:3000/ringba-sync-dashboard/ | grep assets
```

