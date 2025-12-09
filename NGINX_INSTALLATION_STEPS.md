# Step-by-Step Nginx Configuration Installation Guide

Complete guide for installing the nginx configuration for `ringba.insidefi.co` subdomain.

---

## Prerequisites

- SSH access to your server
- Root or sudo access
- Nginx installed on the server
- Dashboard build files ready

---

## Step 1: Prepare the Configuration File

### Option A: Use the Provided Config File (Recommended)

The configuration file is already created: `nginx-dashboard-subdomain-correct.conf`

**Location on your local machine:**
```
/Users/rajeev/Desktop/adstia/elocal-scrapper/ringbav2/nginx-dashboard-subdomain-correct.conf
```

### Option B: Create Manually

If you need to create it manually, copy the content from `nginx-dashboard-subdomain-correct.conf`

---

## Step 2: Update Configuration File (if needed)

Before uploading, you may want to update the dashboard build path:

```bash
# On your local machine, edit the file
nano nginx-dashboard-subdomain-correct.conf
```

**Update this line** (around line 77):
```nginx
root /var/www/ringba/dashboard-build;  # Change to your actual path
```

**Common paths:**
- `/var/www/ringba/dashboard-build`
- `/var/www/ringba/dashboard/dashboard-build`
- `/home/your-user/ringba-dashboard/dashboard-build`

**Note:** The `server_name` is already set to `ringba.insidefi.co` - no need to change it.

---

## Step 3: Upload Configuration File to Server

### Method 1: Using SCP (from your local machine)

```bash
# From your local machine (in the ringbav2 directory)
scp nginx-dashboard-subdomain-correct.conf user@your-server-ip:/tmp/ringba-nginx.conf
```

**Replace:**
- `user` with your SSH username
- `your-server-ip` with your server's IP address

**Example:**
```bash
scp nginx-dashboard-subdomain-correct.conf root@123.45.67.89:/tmp/ringba-nginx.conf
```

### Method 2: Using SFTP

1. Connect via SFTP client (FileZilla, WinSCP, etc.)
2. Navigate to `/tmp/` on server
3. Upload `nginx-dashboard-subdomain-correct.conf`

### Method 3: Create Directly on Server

```bash
# SSH into your server
ssh user@your-server-ip

# Create the file
sudo nano /tmp/ringba-nginx.conf
# Paste the configuration content
# Save and exit (Ctrl+X, then Y, then Enter)
```

---

## Step 4: SSH into Your Server

```bash
ssh user@your-server-ip
# Or if using root:
ssh root@your-server-ip
```

---

## Step 5: Copy Configuration to Nginx Sites-Available

```bash
# Copy the config file to nginx sites-available directory
sudo cp /tmp/ringba-nginx.conf /etc/nginx/sites-available/ringba.insidefi.co
```

**File location:** `/etc/nginx/sites-available/ringba.insidefi.co`

**Why this location?**
- `/etc/nginx/sites-available/` - Stores all available site configurations
- `/etc/nginx/sites-enabled/` - Contains symbolic links to enabled sites
- This is the standard nginx directory structure

---

## Step 6: Verify the Configuration File

```bash
# Check if file was copied correctly
sudo cat /etc/nginx/sites-available/ringba.insidefi.co | head -20

# You should see the nginx configuration content
```

---

## Step 7: Create Symbolic Link to Enable the Site

```bash
# Create symbolic link to enable the site
sudo ln -s /etc/nginx/sites-available/ringba.insidefi.co /etc/nginx/sites-enabled/ringba.insidefi.co
```

**What this does:**
- Creates a symbolic link (shortcut) from `sites-enabled` to `sites-available`
- Nginx only serves sites that are in `sites-enabled`
- This allows you to easily enable/disable sites

**Verify the link:**
```bash
# Check if link was created
ls -la /etc/nginx/sites-enabled/ | grep ringba

# Should show: ringba.insidefi.co -> /etc/nginx/sites-available/ringba.insidefi.co
```

---

## Step 8: Test Nginx Configuration

**IMPORTANT:** Always test before reloading!

```bash
# Test nginx configuration syntax
sudo nginx -t
```

**Expected output if successful:**
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

**If there are errors:**
- Fix the errors in the configuration file
- Run `sudo nginx -t` again
- Don't reload nginx until test passes!

---

## Step 9: Verify Dashboard Build Directory Exists

```bash
# Check if dashboard build directory exists
ls -la /var/www/ringba/dashboard-build

# If directory doesn't exist, create it:
sudo mkdir -p /var/www/ringba/dashboard-build
sudo chown -R www-data:www-data /var/www/ringba/dashboard-build
```

**If using a different path:**
- Update the path in the config file (Step 2)
- Create the directory if it doesn't exist
- Ensure proper permissions

---

## Step 10: Upload Dashboard Build Files

**If you haven't already uploaded the build files:**

```bash
# On your local machine
cd dashboard-react
npm run build

# Upload build files to server
scp -r dashboard-build/* user@your-server-ip:/var/www/ringba/dashboard-build/
```

**Or using rsync (better for updates):**
```bash
rsync -avz dashboard-build/ user@your-server-ip:/var/www/ringba/dashboard-build/
```

**Verify files on server:**
```bash
# On server
ls -la /var/www/ringba/dashboard-build/
# Should see: index.html, assets/, config.js, etc.
```

---

## Step 11: Reload Nginx

```bash
# Reload nginx to apply changes
sudo systemctl reload nginx

# Or restart nginx (if reload doesn't work)
sudo systemctl restart nginx
```

**Check nginx status:**
```bash
sudo systemctl status nginx
```

---

## Step 12: Verify Backend Server is Running

The nginx config expects the dashboard backend on port 3000.

```bash
# Check if backend is running
pm2 list
# OR
ps aux | grep "dashboard-server"

# Test backend directly
curl http://localhost:3000/api/health
```

**If backend is not running:**
```bash
# Start the backend server
cd /path/to/dashboard
pm2 start dashboard-server.js --name ringba-dashboard
pm2 save
```

---

## Step 13: Test the Configuration

### Test Static Files:
```bash
curl -I http://ringba.insidefi.co/
# Should return: HTTP/1.1 200 OK
```

### Test API:
```bash
curl http://ringba.insidefi.co/api/health
# Should return JSON response
```

### Test from Browser:
1. Open: `http://ringba.insidefi.co/` (or `https://` if SSL is configured)
2. Check browser console (F12) for errors
3. Verify dashboard loads correctly

---

## Step 14: Configure DNS (if not done)

**Add DNS A Record:**
```
Type: A
Name: ringba
Value: your-server-ip
TTL: 3600
```

**Or CNAME (if using Cloudflare):**
```
Type: CNAME
Name: ringba
Value: insidefi.co
TTL: Auto
```

**Verify DNS:**
```bash
dig ringba.insidefi.co
nslookup ringba.insidefi.co
```

---

## Step 15: Configure SSL (if using Cloudflare)

If you're using Cloudflare (like your main domain):
- Cloudflare automatically handles HTTPS
- No additional SSL configuration needed
- Just ensure Cloudflare proxy is enabled (orange cloud)

If you need direct SSL:
```bash
# Using Let's Encrypt
sudo certbot --nginx -d ringba.insidefi.co
```

---

## File Locations Summary

### Configuration Files:
```
Local machine:
  /Users/rajeev/Desktop/adstia/elocal-scrapper/ringbav2/nginx-dashboard-subdomain-correct.conf

Server:
  /etc/nginx/sites-available/ringba.insidefi.co  (main config)
  /etc/nginx/sites-enabled/ringba.insidefi.co    (symbolic link)
```

### Dashboard Build Files:
```
Server:
  /var/www/ringba/dashboard-build/  (or your custom path)
    ├── index.html
    ├── assets/
    └── config.js
```

### Log Files:
```
Server:
  /var/log/nginx/dashboard.access.log  (access logs)
  /var/log/nginx/dashboard.error.log   (error logs)
```

---

## Common Commands Reference

```bash
# Edit configuration
sudo nano /etc/nginx/sites-available/ringba.insidefi.co

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

# Restart nginx
sudo systemctl restart nginx

# Check nginx status
sudo systemctl status nginx

# View error logs
sudo tail -f /var/log/nginx/dashboard.error.log

# View access logs
sudo tail -f /var/log/nginx/dashboard.access.log

# Disable site (remove link)
sudo rm /etc/nginx/sites-enabled/ringba.insidefi.co
sudo systemctl reload nginx

# Re-enable site
sudo ln -s /etc/nginx/sites-available/ringba.insidefi.co /etc/nginx/sites-enabled/
sudo systemctl reload nginx
```

---

## Troubleshooting

### 502 Bad Gateway
```bash
# Check if backend is running
pm2 list
curl http://localhost:3000/api/health

# Check nginx error log
sudo tail -f /var/log/nginx/dashboard.error.log
```

### 404 Not Found
```bash
# Verify build files exist
ls -la /var/www/ringba/dashboard-build/

# Check nginx config path
sudo nginx -t
```

### Permission Denied
```bash
# Fix permissions
sudo chown -R www-data:www-data /var/www/ringba/dashboard-build
sudo chmod -R 755 /var/www/ringba/dashboard-build
```

### Configuration Test Fails
```bash
# Check syntax errors
sudo nginx -t

# Common issues:
# - Missing semicolon
# - Wrong path
# - Invalid directive
```

---

## Quick Installation Script

If you prefer a one-liner (after uploading config to `/tmp/`):

```bash
sudo cp /tmp/ringba-nginx.conf /etc/nginx/sites-available/ringba.insidefi.co && \
sudo ln -s /etc/nginx/sites-available/ringba.insidefi.co /etc/nginx/sites-enabled/ && \
sudo nginx -t && \
sudo systemctl reload nginx && \
echo "Configuration installed successfully!"
```

---

## Verification Checklist

- [ ] Configuration file uploaded to server
- [ ] File copied to `/etc/nginx/sites-available/ringba.insidefi.co`
- [ ] Symbolic link created in `/etc/nginx/sites-enabled/`
- [ ] Nginx configuration test passed (`sudo nginx -t`)
- [ ] Dashboard build files uploaded to server
- [ ] Backend server running on port 3000
- [ ] Nginx reloaded successfully
- [ ] DNS configured (A or CNAME record)
- [ ] Static files accessible: `curl -I http://ringba.insidefi.co/`
- [ ] API accessible: `curl http://ringba.insidefi.co/api/health`
- [ ] Dashboard loads in browser

---

## Next Steps After Installation

1. **Monitor logs** for the first few hours
2. **Test all dashboard features**
3. **Set up monitoring** (optional)
4. **Configure backups** (optional)
5. **Document the setup** for your team

---

## Support

If you encounter issues:
1. Check nginx error logs: `sudo tail -f /var/log/nginx/dashboard.error.log`
2. Check backend logs: `pm2 logs ringba-dashboard`
3. Verify all file paths are correct
4. Ensure backend is running on port 3000
5. Test each component individually


