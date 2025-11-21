# Dashboard Deployment Fix - Direct Database Access

## Problem Fixed
The frontend was not loading data because it couldn't connect to the backend API when served statically from `/var/www/html/`.

## Solution Implemented

### 1. Auto-Detection of API URL
The `config.js` file now automatically detects the backend API URL:
- Uses the same hostname as the frontend
- Points to port 3000 for the backend API
- Works automatically when both frontend and backend are on the same server

### 2. Server Configuration
- Dashboard server now listens on all interfaces (`0.0.0.0:3000`)
- Database connection is tested on startup
- CORS is configured to allow all origins

### 3. Direct Database Access
The dashboard server connects directly to PostgreSQL and serves data from:
- `elocal_call_data` table
- `ringba_campaign_summary` table

## Deployment Steps

### Step 1: Copy Build Files to Server
```bash
sudo cp -r /path/to/ringbav2/dashboard-build/* /var/www/html/
```

### Step 2: Start Backend Server
The backend server must be running on port 3000 to serve API requests:

```bash
cd /path/to/ringbav2
npm run dashboard
```

Or run as a service using PM2:
```bash
pm2 start dashboard-server.js --name dashboard
pm2 save
pm2 startup
```

### Step 3: Verify Database Connection
The server will automatically test the database connection on startup. Check the logs for:
```
✓ Database connection successful. Server time: ...
```

### Step 4: Configure Firewall (if needed)
If accessing from outside the server, ensure port 3000 is open:
```bash
sudo ufw allow 3000/tcp
```

### Step 5: Test the Dashboard
1. Open your browser and navigate to your server's IP/domain
2. Open browser console (F12)
3. Check for logs:
   - `[Config] Auto-detected API URL: http://your-server-ip:3000`
   - `[Dashboard] API base URL: http://your-server-ip:3000`
4. Check Network tab for API calls to `/api/payout-comparison`

## Manual Configuration (Optional)

If auto-detection doesn't work, you can manually set the API URL:

1. Edit `/var/www/html/config.js`:
   ```bash
   sudo nano /var/www/html/config.js
   ```

2. Uncomment and set the API URL:
   ```javascript
   window.API_BASE_URL = 'http://your-server-ip:3000';
   // OR if backend is on localhost:
   window.API_BASE_URL = 'http://localhost:3000';
   ```

## Troubleshooting

### Data Not Loading
1. **Check if backend server is running:**
   ```bash
   ps aux | grep dashboard-server
   ```

2. **Test API endpoint directly:**
   ```bash
   curl http://localhost:3000/api/payout-comparison
   ```

3. **Check browser console:**
   - Open DevTools (F12)
   - Look for errors in Console tab
   - Check Network tab for failed API requests

4. **Verify database connection:**
   - Check server logs for database connection errors
   - Verify `.env` file has correct database credentials

### CORS Errors
- The server is configured to allow all origins
- If you see CORS errors, check that the backend server is running

### Port Already in Use
If port 3000 is already in use:
1. Change the port in `.env`: `DASHBOARD_PORT=3001`
2. Update `config.js` to use the new port

## API Endpoints

The dashboard uses these API endpoints:
- `GET /api/payout-comparison?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` - Main data endpoint
- `GET /api/health` - Health check

## Database Tables Used

- `elocal_call_data` - eLocal call data with payouts and revenue
- `ringba_campaign_summary` - Ringba campaign summary with RPC data

## Notes

- The backend server must be running for the frontend to load data
- Both frontend and backend can be on the same server
- Database connection uses environment variables from `.env` file
- The server listens on all interfaces (0.0.0.0) to allow external connections

