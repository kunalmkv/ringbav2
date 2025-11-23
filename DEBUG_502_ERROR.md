# Debugging 502 Bad Gateway Error

## Problem
Getting 502 Bad Gateway when accessing: `http://localhost/ringba-sync-dashboard/api/payout-comparison`

## Root Cause
502 error means nginx cannot connect to the backend server on port 3000.

## Step-by-Step Debugging

### Step 1: Check if Backend Server is Running

```bash
# Check if process is running
ps aux | grep "dashboard-server"

# Check if port 3000 is listening
netstat -tlnp | grep 3000
# OR
ss -tlnp | grep 3000
# OR
lsof -i :3000
```

**Expected Output**: Should show a process listening on port 3000

### Step 2: Test Backend Server Directly

```bash
# Test if backend responds directly (bypass nginx)
curl http://127.0.0.1:3000/api/payout-comparison
# OR
curl http://localhost:3000/api/payout-comparison
```

**If this works**: Backend is running, issue is with nginx proxy
**If this fails**: Backend is not running or not listening correctly

### Step 3: Check PM2 Status (if using PM2)

```bash
pm2 status
pm2 logs dashboard
```

### Step 4: Check Backend Server Logs

```bash
# If running with PM2
pm2 logs dashboard --lines 50

# If running directly
# Check the terminal where you started the server
```

### Step 5: Verify Backend Server Configuration

Check that `dashboard-server.js` is configured to listen on:
- Host: `0.0.0.0` (all interfaces) or `127.0.0.1` (localhost only)
- Port: `3000`

### Step 6: Check Nginx Error Logs

```bash
sudo tail -f /var/log/nginx/insidefi.error.log
```

Look for connection refused errors or timeout errors.

## Common Solutions

### Solution 1: Start the Backend Server

```bash
cd /path/to/ringbav2
npm run dashboard
```

Or with PM2:
```bash
cd /path/to/ringbav2
pm2 start dashboard-server.js --name dashboard
pm2 save
```

### Solution 2: Check Server is Listening on Correct Interface

The server should listen on `0.0.0.0` or `127.0.0.1` (not just localhost).

Check `dashboard-server.js`:
```javascript
app.listen(PORT, '0.0.0.0', () => {
  // Should listen on 0.0.0.0 (all interfaces)
});
```

### Solution 3: Check Firewall

```bash
# Check if firewall is blocking
sudo ufw status
sudo iptables -L -n | grep 3000
```

### Solution 4: Check Port is Not in Use

```bash
# Check what's using port 3000
sudo lsof -i :3000
# OR
sudo netstat -tlnp | grep 3000
```

If another process is using it, either:
- Stop that process
- Change dashboard server port in `.env`: `DASHBOARD_PORT=3001`
- Update nginx config to use new port

### Solution 5: Verify Database Connection

The backend might be failing to start due to database connection issues:

```bash
# Check backend logs for database errors
pm2 logs dashboard | grep -i "database\|error\|failed"
```

### Solution 6: Test Backend Health Endpoint

```bash
# Test health endpoint
curl http://127.0.0.1:3000/api/health

# Should return: {"status":"healthy","database":"connected",...}
```

## Quick Fix Commands

```bash
# 1. Check if running
pm2 status

# 2. If not running, start it
cd /path/to/ringbav2
pm2 start dashboard-server.js --name dashboard

# 3. Check logs
pm2 logs dashboard

# 4. Test directly
curl http://127.0.0.1:3000/api/health

# 5. Test through nginx
curl http://localhost/ringba-sync-dashboard/api/health
```

## Verification

After fixing, verify:

1. Backend responds directly: `curl http://127.0.0.1:3000/api/health` ✓
2. Backend responds through nginx: `curl http://localhost/ringba-sync-dashboard/api/health` ✓
3. No 502 errors in nginx error log ✓

