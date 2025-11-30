# Troubleshooting: 404 Error for Ringba Dashboard API

## Problem
- ✅ Payout Comparison table works fine
- ❌ Ringba Dashboard table shows: `Cannot GET /api/ringba-campaign-summary`

## Root Cause
The backend server (`dashboard-server.js`) on your server doesn't have the `/api/ringba-campaign-summary` endpoint, or the server needs to be restarted.

---

## Solution Steps

### Step 1: Verify Backend Server is Running

```bash
# SSH into your server
ssh user@your-server-ip

# Check if dashboard server is running
pm2 list
# OR
ps aux | grep dashboard-server

# Check what port it's running on
netstat -tlnp | grep 3000
# OR
ss -tlnp | grep 3000
```

### Step 2: Check if Endpoint Exists in Server Code

```bash
# On server, check if the endpoint exists
grep -n "ringba-campaign-summary" /path/to/dashboard-server.js

# Should show:
# 471:app.get('/api/ringba-campaign-summary', async (req, res) => {
```

**If the endpoint doesn't exist**, you need to update the server code.

### Step 3: Update Backend Server Code

```bash
# On your local machine
cd /Users/rajeev/Desktop/adstia/elocal-scrapper/ringbav2

# Upload the updated dashboard-server.js to server
scp dashboard-server.js user@server:/path/to/dashboard/dashboard-server.js

# On server, verify the file was updated
grep -n "ringba-campaign-summary" /path/to/dashboard/dashboard-server.js
```

### Step 4: Restart Backend Server

**If using PM2:**
```bash
# On server
pm2 restart dashboard-server
# OR
pm2 restart ringba-dashboard
# OR (if you know the process name)
pm2 restart all

# Check logs
pm2 logs dashboard-server
```

**If using systemd:**
```bash
# On server
sudo systemctl restart ringba-dashboard
sudo systemctl status ringba-dashboard
```

**If running manually:**
```bash
# Stop the current process (Ctrl+C or kill)
# Then restart
cd /path/to/dashboard
node dashboard-server.js
```

### Step 5: Test the Endpoint Directly

```bash
# Test from server
curl http://localhost:3000/api/ringba-campaign-summary

# Should return JSON data, not 404
```

**If you get 404:**
- The endpoint doesn't exist in the code → Update code (Step 3)
- The server didn't restart → Restart server (Step 4)

**If you get JSON data:**
- The endpoint works → Check nginx configuration (Step 6)

### Step 6: Test Through Nginx

```bash
# Test through nginx (from server or local machine)
curl http://ringba.insidefi.co/ringba-sync-dashboard/api/ringba-campaign-summary

# Should return JSON data
```

**If you get 404 through nginx but it works directly:**
- Nginx routing issue → Check nginx config

**If you get 404 both ways:**
- Backend issue → Continue with steps above

### Step 7: Check Nginx Configuration

```bash
# On server, check nginx config
sudo cat /etc/nginx/sites-available/ringba.insidefi.co | grep -A 20 "api"

# Should show the API location block
```

**Verify the API location block:**
```nginx
location /ringba-sync-dashboard/api {
    rewrite ^/ringba-sync-dashboard/api(.*)$ /api$1 break;
    proxy_pass http://ringba-sync-dashboard;
    # ... rest of config
}
```

### Step 8: Check Backend Logs

```bash
# PM2 logs
pm2 logs dashboard-server --lines 50

# Look for:
# - Server startup messages
# - API request logs
# - Error messages
```

---

## Quick Fix Commands

### If using PM2:
```bash
# 1. Upload updated file
scp dashboard-server.js user@server:/path/to/dashboard/

# 2. Restart PM2
ssh user@server
pm2 restart dashboard-server
pm2 logs dashboard-server --lines 20
```

### If using systemd:
```bash
# 1. Upload updated file
scp dashboard-server.js user@server:/path/to/dashboard/

# 2. Restart service
ssh user@server
sudo systemctl restart ringba-dashboard
sudo journalctl -u ringba-dashboard -n 20
```

---

## Verification Checklist

- [ ] Backend server is running on port 3000
- [ ] `/api/ringba-campaign-summary` endpoint exists in `dashboard-server.js`
- [ ] Backend server has been restarted after code update
- [ ] Direct test works: `curl http://localhost:3000/api/ringba-campaign-summary`
- [ ] Nginx test works: `curl http://ringba.insidefi.co/ringba-sync-dashboard/api/ringba-campaign-summary`
- [ ] Browser console shows successful API call (not 404)

---

## Common Issues

### Issue 1: Endpoint Missing in Server Code
**Symptom:** `grep` doesn't find the endpoint
**Solution:** Upload the latest `dashboard-server.js` file

### Issue 2: Server Not Restarted
**Symptom:** Endpoint exists but still returns 404
**Solution:** Restart the backend server

### Issue 3: Wrong Port
**Symptom:** Server running on different port
**Solution:** Check `DASHBOARD_PORT` in `.env` or update nginx upstream

### Issue 4: Nginx Routing Issue
**Symptom:** Works directly but not through nginx
**Solution:** Check nginx config and reload: `sudo nginx -t && sudo systemctl reload nginx`

---

## Testing Commands

```bash
# 1. Test backend directly
curl http://localhost:3000/api/ringba-campaign-summary

# 2. Test through nginx (with path)
curl http://ringba.insidefi.co/ringba-sync-dashboard/api/ringba-campaign-summary

# 3. Test health endpoint (should work)
curl http://ringba.insidefi.co/ringba-sync-dashboard/api/health

# 4. Test payout-comparison (working endpoint)
curl http://ringba.insidefi.co/ringba-sync-dashboard/api/payout-comparison
```

---

## Expected Results

**Working endpoint (payout-comparison):**
```json
{"data":[...],"total":10}
```

**Fixed endpoint (ringba-campaign-summary):**
```json
{"data":[...],"total":5}
```

**404 Error (before fix):**
```html
<!DOCTYPE html>
<html>
<body>
<pre>Cannot GET /api/ringba-campaign-summary</pre>
</body>
</html>
```

---

## Next Steps After Fix

1. **Clear browser cache** (Ctrl+Shift+R or Cmd+Shift+R)
2. **Refresh the dashboard page**
3. **Check browser console** - should show successful API calls
4. **Verify data loads** in Ringba Dashboard table

---

## Still Not Working?

If the issue persists after following all steps:

1. **Check server logs:**
   ```bash
   pm2 logs dashboard-server --lines 100
   sudo tail -f /var/log/nginx/ringba.error.log
   ```

2. **Verify file paths:**
   ```bash
   ls -la /path/to/dashboard/dashboard-server.js
   ```

3. **Check environment variables:**
   ```bash
   cat /path/to/dashboard/.env | grep DASHBOARD_PORT
   ```

4. **Test all endpoints:**
   ```bash
   curl http://localhost:3000/api/health
   curl http://localhost:3000/api/payout-comparison
   curl http://localhost:3000/api/ringba-campaign-summary
   ```

