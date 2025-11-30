# Subdomain Deployment Guide for Ringba Dashboard

This guide provides step-by-step instructions for hosting the React frontend dashboard on a new subdomain.

## Prerequisites

- Server with Node.js 18+ installed
- Nginx installed and configured
- PostgreSQL database accessible
- Domain/subdomain DNS configured
- SSH access to the server
- PM2 or similar process manager (recommended)

---

## Step 1: Prepare the Build

### 1.1 Build the React Application

On your local machine or server, navigate to the dashboard-react directory and build:

```bash
cd /path/to/ringbav2/dashboard-react
npm install
npm run build
```

This will create the production build in `../dashboard-build` directory.

### 1.2 Verify Build Output

Check that the build was successful:

```bash
ls -la ../dashboard-build
# Should see: index.html, assets/, config.js
```

---

## Step 2: Server Setup

### 2.1 Upload Files to Server

Upload the following to your server:

1. **Build files**: Upload the entire `dashboard-build` directory
2. **Backend server**: Upload `dashboard-server.js`
3. **Environment file**: Upload `.env` (or create one on server)

**Recommended server directory structure:**
```
/home/your-user/
├── ringba-dashboard/
│   ├── dashboard-build/          # React build output
│   ├── dashboard-server.js       # Express backend
│   └── .env                      # Environment variables
```

### 2.2 Install Dependencies on Server

```bash
cd /home/your-user/ringba-dashboard
npm install express pg dotenv cors
```

Or if you have the full project:
```bash
cd /path/to/ringbav2
npm install
```

---

## Step 3: Configure Environment Variables

Create or update `.env` file on the server:

```bash
# Database Configuration
POSTGRES_HOST=your-db-host
POSTGRES_PORT=5432
POSTGRES_DB_NAME=your-database-name
POSTGRES_USER_NAME=your-db-user
POSTGRES_PASSWORD=your-db-password
DB_SSL=true

# Ringba API (if needed for backend)
RINGBA_ACCOUNT_ID=your-account-id
RINGBA_API_TOKEN=your-api-token

# Dashboard Server Port
DASHBOARD_PORT=3000

# Server URL (for CORS if needed)
SERVER_URL=https://your-subdomain.example.com
```

---

## Step 4: Configure Nginx

### 4.1 Create Nginx Configuration

Create a new nginx configuration file for your subdomain:

```bash
sudo nano /etc/nginx/sites-available/dashboard-subdomain
```

### 4.2 Nginx Configuration Template

Replace `your-subdomain.example.com` with your actual subdomain:

```nginx
server {
    listen 80;
    server_name your-subdomain.example.com;

    # Redirect HTTP to HTTPS (recommended)
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-subdomain.example.com;

    # SSL Certificate Configuration
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    
    # SSL Configuration (recommended settings)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/dashboard-access.log;
    error_log /var/log/nginx/dashboard-error.log;

    # Root directory for static files
    root /home/your-user/ringba-dashboard/dashboard-build;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;

    # API Proxy - Forward API requests to Node.js backend
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # CORS headers (if needed)
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
        
        if ($request_method = OPTIONS) {
            return 204;
        }
    }

    # Serve static files from dashboard-build
    location / {
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
        
        # Don't cache HTML
        location ~* \.html$ {
            expires -1;
            add_header Cache-Control "no-store, no-cache, must-revalidate, private";
        }
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
```

### 4.3 Enable the Site

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/dashboard-subdomain /etc/nginx/sites-enabled/

# Test nginx configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

---

## Step 5: Update Vite Configuration (if needed)

If your subdomain will be at the root (e.g., `https://dashboard.example.com`), update `vite.config.js`:

```javascript
export default defineConfig({
  plugins: [react()],
  base: '/',  // Change from '/ringba-sync-dashboard/' to '/'
  build: {
    outDir: '../dashboard-build',
    emptyOutDir: true
  },
  // ... rest of config
});
```

If your subdomain uses a path (e.g., `https://example.com/dashboard`), keep the base path:

```javascript
base: '/dashboard/',  // Update to match your path
```

**Important**: After changing the base path, rebuild the application:
```bash
cd dashboard-react
npm run build
```

---

## Step 6: Update API Configuration

The API automatically detects the path, but if you need to override, update `dashboard-react/public/config.js`:

```javascript
// For production subdomain at root
window.API_BASE_URL = 'https://your-subdomain.example.com';

// Or for subdomain with path
window.API_BASE_URL = 'https://your-subdomain.example.com/dashboard';
```

Rebuild after making changes.

---

## Step 7: Start the Backend Server

### 7.1 Using PM2 (Recommended)

```bash
# Install PM2 globally (if not already installed)
npm install -g pm2

# Start the dashboard server
cd /home/your-user/ringba-dashboard
pm2 start dashboard-server.js --name "ringba-dashboard"

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### 7.2 Using systemd (Alternative)

Create a systemd service file:

```bash
sudo nano /etc/systemd/system/ringba-dashboard.service
```

Add the following:

```ini
[Unit]
Description=Ringba Dashboard Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/home/your-user/ringba-dashboard
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dashboard-server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable ringba-dashboard
sudo systemctl start ringba-dashboard
sudo systemctl status ringba-dashboard
```

### 7.3 Manual Start (Testing)

```bash
cd /home/your-user/ringba-dashboard
node dashboard-server.js
```

---

## Step 8: Configure DNS

### 8.1 Add DNS Record

Add an A record or CNAME for your subdomain:

**A Record:**
```
Type: A
Name: dashboard (or your-subdomain)
Value: your-server-ip
TTL: 3600
```

**CNAME (if using a subdomain service):**
```
Type: CNAME
Name: dashboard
Value: your-main-domain.com
TTL: 3600
```

### 8.2 Verify DNS

```bash
# Check DNS propagation
dig your-subdomain.example.com
nslookup your-subdomain.example.com
```

---

## Step 9: SSL Certificate (HTTPS)

### 9.1 Using Let's Encrypt (Free)

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-subdomain.example.com

# Auto-renewal (already configured by certbot)
sudo certbot renew --dry-run
```

### 9.2 Using Existing Certificate

If you have your own SSL certificate, update the nginx config with the paths:

```nginx
ssl_certificate /path/to/certificate.crt;
ssl_certificate_key /path/to/private.key;
```

---

## Step 10: Testing

### 10.1 Test Backend API

```bash
# Test health endpoint
curl http://localhost:3000/api/health

# Test from server
curl https://your-subdomain.example.com/api/health
```

### 10.2 Test Frontend

1. Open browser: `https://your-subdomain.example.com`
2. Check browser console for errors
3. Verify API calls are working
4. Test all dashboard features

### 10.3 Common Issues

**502 Bad Gateway:**
- Check if backend server is running: `pm2 list` or `systemctl status ringba-dashboard`
- Check nginx error logs: `sudo tail -f /var/log/nginx/dashboard-error.log`
- Verify port 3000 is accessible

**404 Not Found:**
- Check nginx root directory path
- Verify build files are in correct location
- Check nginx configuration syntax

**CORS Errors:**
- Verify CORS headers in nginx config
- Check API base URL in frontend config
- Ensure backend CORS settings allow your domain

**Blank Page:**
- Check browser console for JavaScript errors
- Verify base path in vite.config.js matches nginx location
- Check that assets are loading correctly

---

## Step 11: Maintenance

### 11.1 Update Frontend

```bash
# On local machine
cd dashboard-react
npm run build

# Upload new build files to server
scp -r dashboard-build/* user@server:/home/your-user/ringba-dashboard/dashboard-build/

# Or use rsync
rsync -avz dashboard-build/ user@server:/home/your-user/ringba-dashboard/dashboard-build/
```

### 11.2 Update Backend

```bash
# On server
cd /home/your-user/ringba-dashboard
# Update dashboard-server.js if needed
pm2 restart ringba-dashboard
```

### 11.3 View Logs

```bash
# PM2 logs
pm2 logs ringba-dashboard

# Systemd logs
sudo journalctl -u ringba-dashboard -f

# Nginx logs
sudo tail -f /var/log/nginx/dashboard-access.log
sudo tail -f /var/log/nginx/dashboard-error.log
```

---

## Step 12: Security Checklist

- [ ] SSL certificate installed and working
- [ ] Firewall configured (only allow 80, 443, and SSH)
- [ ] Database credentials secured in .env
- [ ] .env file has proper permissions (600)
- [ ] Nginx security headers configured
- [ ] Regular backups of database
- [ ] PM2 or systemd auto-restart configured
- [ ] Monitoring/logging set up

---

## Quick Reference Commands

```bash
# Build frontend
cd dashboard-react && npm run build

# Start backend (PM2)
pm2 start dashboard-server.js --name ringba-dashboard

# Restart backend
pm2 restart ringba-dashboard

# View logs
pm2 logs ringba-dashboard

# Reload nginx
sudo systemctl reload nginx

# Test nginx config
sudo nginx -t

# Check server status
pm2 status
systemctl status ringba-dashboard
```

---

## Support

If you encounter issues:

1. Check server logs (PM2, systemd, nginx)
2. Check browser console for frontend errors
3. Verify all environment variables are set
4. Test API endpoints directly
5. Verify DNS and SSL certificate

---

## Notes

- The dashboard automatically detects the API path based on the URL
- If you change the base path, rebuild the frontend
- Keep the backend server running (use PM2 or systemd)
- Regular updates require rebuilding and uploading the frontend
- Database connection must be accessible from the server

