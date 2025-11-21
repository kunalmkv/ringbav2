# Dashboard Deployment Guide

## Problem
When serving the frontend statically from `/var/www/html/`, the frontend cannot connect to the backend API because it's trying to call APIs from the same origin (the web server) instead of the Node.js backend server.

## Solution
The frontend has been updated to automatically detect the backend API URL. You have two options:

### Option 1: Configure API URL via config.js (Recommended)

1. After copying build files to `/var/www/html/`, edit the `config.js` file:
   ```bash
   sudo nano /var/www/html/config.js
   ```

2. Uncomment and set your backend API URL:
   ```javascript
   // If backend is on same server, port 3000:
   window.API_BASE_URL = 'http://localhost:3000';
   
   // OR if backend is on different server:
   window.API_BASE_URL = 'http://your-server-ip:3000';
   
   // OR if using reverse proxy (recommended for production):
   window.API_BASE_URL = '/api';
   ```

3. Save the file and refresh the browser.

### Option 2: Use Reverse Proxy (Best for Production)

Set up a reverse proxy in your web server (Apache/Nginx) to forward `/api/*` requests to the Node.js backend:

#### For Nginx:
```nginx
location /api {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

#### For Apache:
```apache
ProxyPass /api http://localhost:3000/api
ProxyPassReverse /api http://localhost:3000/api
```

Then set in `config.js`:
```javascript
window.API_BASE_URL = '/api';
```

## Steps to Deploy

1. **Build the frontend:**
   ```bash
   cd ringbav2/dashboard-react
   npm run build
   ```

2. **Copy build files to web server:**
   ```bash
   sudo cp -r ringbav2/dashboard-build/* /var/www/html/
   ```

3. **Edit config.js on the server:**
   ```bash
   sudo nano /var/www/html/config.js
   ```
   Uncomment and set `window.API_BASE_URL` to your backend server URL.

4. **Start the backend server:**
   ```bash
   cd ringbav2
   npm run dashboard
   ```
   Or run it as a service using PM2:
   ```bash
   pm2 start dashboard-server.js --name dashboard
   ```

5. **Verify:**
   - Open browser console (F12)
   - Check the logs for `[Dashboard] API base URL: ...`
   - Verify it's pointing to the correct backend URL
   - Test API calls in the Network tab

## Troubleshooting

### Frontend loads but no data appears:
1. Check browser console for API errors
2. Verify `config.js` has the correct API URL
3. Ensure backend server is running on the specified port
4. Check CORS settings in `dashboard-server.js`
5. Check firewall rules if backend is on different server

### CORS errors:
- The backend is configured to allow all origins (`origin: '*'`)
- If you need to restrict it, edit `dashboard-server.js` and update the CORS configuration

### API calls failing:
- Check that the backend server is running: `curl http://localhost:3000/api/payout-comparison`
- Verify the API URL in browser console logs
- Check network tab in browser DevTools for request/response details

