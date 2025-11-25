# Complete Steps to Deploy Frontend Changes to Server

## Overview
When you make changes to the React frontend (like adding new columns), you need to rebuild the frontend and restart the server for changes to be visible.

## Step-by-Step Deployment Process

### Step 1: Navigate to Project Directory
```bash
cd /path/to/elocal-scrapper/ringbav2
```

### Step 2: Build the React Frontend
```bash
cd dashboard-react
npm install  # Only needed if dependencies changed
npm run build
cd ..
```

**What this does:**
- Compiles React components to JavaScript
- Bundles all assets (JS, CSS, images)
- Outputs to `../dashboard-build/` directory
- Creates optimized production build

**Expected output:**
```
✓ built in X.XXs
```

### Step 3: Verify Build Output
```bash
ls -la dashboard-build/
```

You should see:
- `index.html`
- `assets/` directory with `.js` and `.css` files
- `config.js` (if exists)

### Step 4: Check Build Files Have New Changes
```bash
# Check if the built JS file contains your new column names
grep -r "Cost Per Call\|Net\|Net Profit" dashboard-build/assets/*.js
```

If you see the column names, the build is correct.

### Step 5: Restart the Dashboard Server

#### Option A: If using PM2 (Recommended for Production)
```bash
pm2 restart dashboard
# OR if process name is different
pm2 restart dashboard-server
# OR find the process
pm2 list
pm2 restart <process-id>
```

#### Option B: If using npm script
```bash
# Stop the current server (Ctrl+C if running in terminal)
# Then start again
npm run dashboard
```

#### Option C: If running directly with node
```bash
# Stop the current server (Ctrl+C if running in terminal)
# Then start again
node dashboard-server.js
```

#### Option D: If using systemd service
```bash
sudo systemctl restart dashboard
# OR
sudo systemctl restart ringba-dashboard
```

### Step 6: Verify Server is Running
```bash
# Check if server is responding
curl http://localhost:3000/api/health

# Check server logs
pm2 logs dashboard
# OR
tail -f logs/dashboard.log
```

### Step 7: Clear Browser Cache
**IMPORTANT:** Browsers cache JavaScript and CSS files. You MUST clear cache:

#### Chrome/Edge:
1. Open Developer Tools (F12)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"
4. OR Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)

#### Firefox:
1. Press `Ctrl+Shift+Delete` (Windows/Linux) or `Cmd+Shift+Delete` (Mac)
2. Select "Cached Web Content"
3. Click "Clear Now"
4. Refresh the page

#### Safari:
1. Press `Cmd+Option+E` to clear cache
2. OR Safari menu → Preferences → Advanced → Check "Show Develop menu"
3. Develop menu → Empty Caches
4. Refresh the page

### Step 8: Verify Changes in Browser
1. Open the dashboard URL: `http://your-server/ringba-sync-dashboard/`
2. Open Developer Tools (F12)
3. Go to Network tab
4. Refresh the page
5. Check that new JS/CSS files are loaded (not cached)
6. Look for your new columns: "Cost Per Call", "Net", "Net Profit"

## Troubleshooting

### Issue: Changes still not visible after rebuild

**Solution 1: Check build output directory**
```bash
# Verify files are in correct location
ls -la dashboard-build/assets/
# Check file modification times
stat dashboard-build/assets/*.js
```

**Solution 2: Check server is serving correct directory**
```bash
# Check dashboard-server.js line 17
grep "DASHBOARD_BUILD_DIR" dashboard-server.js
# Should show: const DASHBOARD_BUILD_DIR = join(__dirname, 'dashboard-build');
```

**Solution 3: Force rebuild (delete old build)**
```bash
rm -rf dashboard-build/*
cd dashboard-react
npm run build
cd ..
```

**Solution 4: Check browser console for errors**
- Open Developer Tools (F12)
- Go to Console tab
- Look for JavaScript errors
- Check Network tab for 404 errors on assets

**Solution 5: Verify server logs**
```bash
# Check if server is serving the new files
pm2 logs dashboard --lines 50
# Look for requests to new asset files
```

**Solution 6: Check file permissions**
```bash
# Ensure build files are readable
chmod -R 755 dashboard-build/
```

### Issue: Server won't start

**Check for errors:**
```bash
node dashboard-server.js
# Look for error messages
```

**Check port is available:**
```bash
# Check if port 3000 is in use
lsof -i :3000
# OR
netstat -tulpn | grep 3000
```

**Check database connection:**
```bash
# Verify .env file has correct DB credentials
cat .env | grep DB_
```

### Issue: Build fails

**Clear node_modules and reinstall:**
```bash
cd dashboard-react
rm -rf node_modules package-lock.json
npm install
npm run build
```

## Quick Deployment Script

You can create a script to automate this:

```bash
#!/bin/bash
# deploy-frontend.sh

echo "Building React frontend..."
cd dashboard-react
npm run build
cd ..

echo "Build complete. Files in dashboard-build/"

echo "Restarting server..."
pm2 restart dashboard

echo "Deployment complete!"
echo "Remember to clear browser cache (Ctrl+Shift+R)"
```

Save as `deploy-frontend.sh`, make executable:
```bash
chmod +x deploy-frontend.sh
./deploy-frontend.sh
```

## Summary Checklist

- [ ] Navigate to `ringbav2/dashboard-react`
- [ ] Run `npm run build`
- [ ] Verify `dashboard-build/` has new files
- [ ] Restart dashboard server (PM2/systemd/npm/node)
- [ ] Clear browser cache (Ctrl+Shift+R)
- [ ] Verify new columns appear in browser
- [ ] Check browser console for errors

## Notes

- **Always rebuild** after making React component changes
- **Always restart server** after rebuilding
- **Always clear browser cache** to see new assets
- Build output goes to `dashboard-build/` (configured in `vite.config.js`)
- Server serves from `dashboard-build/` (configured in `dashboard-server.js`)

