# Nginx Configuration for New Dashboard Subdomain

## Analysis of Your Existing Configuration

Based on your existing nginx configs, I've identified the following patterns:

### Your Existing Setup:
1. **Main domain (insidefi.co)**:
   - Serves static files at root `/` from `/var/www/ringba/client/dist`
   - Uses `root` directive for root path
   - API at `/api/` proxies to `backend_ringba` (port 3001)

2. **Path-based dashboard (/ringba-sync-dashboard)**:
   - Serves static files at `/ringba-sync-dashboard` from `/var/www/ringba-sync-dashboard`
   - Uses `alias` directive for path-based locations
   - API at `/ringba-sync-dashboard/api` with rewrite to strip prefix
   - Proxies to port 3000

### Key Patterns:
- **Root path**: Use `root` directive
- **Sub-path**: Use `alias` directive
- **API location**: Must be placed AFTER static location
- **Cloudflare**: HTTP on port 80, HTTPS handled by Cloudflare
- **Headers**: X-Forwarded-Proto set to `https` for Cloudflare
- **Caching**: 7 days for static assets, no cache for HTML/API

---

## Configuration Options

### Option 1: Root Deployment (Recommended for Subdomain)

**File**: `nginx-dashboard-subdomain-correct.conf`

**Use this if**: You want the dashboard at root `/` on the subdomain (e.g., `https://ringba.insidefi.co/`)

**Requirements**:
- Update `vite.config.js`: Change `base: '/ringba-sync-dashboard/'` to `base: '/'`
- Rebuild: `cd dashboard-react && npm run build`
- Upload build to: `/var/www/ringba/dashboard-build`

**Key Features**:
- Serves static files at root `/` using `root` directive
- API at `/api/` proxies to port 3000
- Matches your main domain's root pattern

---

### Option 2: Path-Based Deployment

**File**: `nginx-dashboard-subdomain-with-path.conf`

**Use this if**: You want to keep `base: '/ringba-sync-dashboard/'` in vite.config.js

**Requirements**:
- Keep `vite.config.js` as is: `base: '/ringba-sync-dashboard/'`
- Rebuild: `cd dashboard-react && npm run build`
- Upload build to: `/var/www/ringba/dashboard-build`

**Key Features**:
- Serves static files at `/ringba-sync-dashboard` using `alias` directive
- API at `/ringba-sync-dashboard/api` with rewrite pattern
- Matches your existing path-based pattern
- Accessible at: `https://ringba.insidefi.co/ringba-sync-dashboard/`

---

## Installation Steps

### Step 1: Choose Your Configuration

Decide whether you want:
- **Root deployment** (`/`) → Use `nginx-dashboard-subdomain-correct.conf`
- **Path deployment** (`/ringba-sync-dashboard/`) → Use `nginx-dashboard-subdomain-with-path.conf`

### Step 2: Update Configuration File

Edit the chosen config file and update:

```nginx
# Subdomain is already set to ringba.insidefi.co
server_name ringba.insidefi.co;

# Update to match your server's directory structure
root /var/www/ringba/dashboard-build;
# OR
alias /var/www/ringba/dashboard-build;
```

### Step 3: Install Configuration

```bash
# Copy config to nginx sites-available
sudo cp nginx-dashboard-subdomain-correct.conf /etc/nginx/sites-available/dashboard-subdomain

# Or if using path-based:
sudo cp nginx-dashboard-subdomain-with-path.conf /etc/nginx/sites-available/dashboard-subdomain

# Enable the site
sudo ln -s /etc/nginx/sites-available/dashboard-subdomain /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### Step 4: Update Vite Config (if using root deployment)

```bash
cd dashboard-react
# Edit vite.config.js: Change base from '/ringba-sync-dashboard/' to '/'
npm run build
```

### Step 5: Upload Build Files

```bash
# Upload build directory to server
scp -r dashboard-build/* user@server:/var/www/ringba/dashboard-build/
```

### Step 6: Start Backend Server

```bash
# On server, start dashboard backend
cd /path/to/dashboard
pm2 start dashboard-server.js --name ringba-dashboard
# OR
node dashboard-server.js
```

---

## Testing

### Test Static Files:
```bash
curl -I http://ringba.insidefi.co/
# Should return 200 OK
```

### Test API:
```bash
curl http://ringba.insidefi.co/api/health
# Should return JSON response
```

### Test from Browser:
1. Open: `http://ringba.insidefi.co/` (or `http://ringba.insidefi.co/ringba-sync-dashboard/` if using Option 2)
2. Check browser console for errors
3. Verify API calls work

---

## Comparison with Your Existing Config

| Feature | Your Main Domain | Your Path Config | New Subdomain (Root) | New Subdomain (Path) |
|---------|-----------------|------------------|---------------------|---------------------|
| Static Location | `/` | `/ringba-sync-dashboard` | `/` | `/ringba-sync-dashboard` |
| Directive | `root` | `alias` | `root` | `alias` |
| API Location | `/api/` | `/ringba-sync-dashboard/api` | `/api/` | `/ringba-sync-dashboard/api` |
| API Rewrite | None | `rewrite ... break;` | None | `rewrite ... break;` |
| Backend Port | 3001 | 3000 | 3000 | 3000 |
| Cache (assets) | 7d | 7d | 7d | 7d |

---

## Troubleshooting

### 502 Bad Gateway
- Check if backend is running: `pm2 list` or `ps aux | grep node`
- Check backend logs: `pm2 logs ringba-dashboard`
- Verify port 3000 is accessible: `curl http://localhost:3000/api/health`

### 404 Not Found
- Verify build files are in correct directory
- Check nginx error log: `sudo tail -f /var/log/nginx/dashboard.error.log`
- Verify `root` or `alias` path is correct

### Blank Page / Assets Not Loading
- Check browser console for 404 errors
- Verify vite `base` path matches nginx location
- Check that assets directory exists in build

### API Not Working
- Verify API location is AFTER static location in nginx config
- Check rewrite rule (if using path-based)
- Test API directly: `curl http://localhost:3000/api/health`

---

## Recommended: Root Deployment

For a dedicated subdomain, **root deployment (Option 1)** is recommended because:
- Cleaner URLs: `https://ringba.insidefi.co/` vs `https://ringba.insidefi.co/ringba-sync-dashboard/`
- Simpler configuration
- Better for SEO (if applicable)
- Matches your main domain pattern

Just remember to update `vite.config.js` base path and rebuild!

