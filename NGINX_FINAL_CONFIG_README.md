# Final Nginx Configuration for ringba.insidefi.co

## Analysis of Your Working Configuration

After analyzing your working `insidefi.co` configuration, I've created two nginx config files that match your exact patterns:

### Your Working Pattern:
- ✅ Uses `upstream ringba-sync-dashboard` on port 3000
- ✅ Static files at `/ringba-sync-dashboard` using `alias`
- ✅ API at `/ringba-sync-dashboard/api` with `rewrite` to strip prefix
- ✅ Proxy uses upstream name: `proxy_pass http://ringba-sync-dashboard;`
- ✅ Headers: `X-Forwarded-Proto $scheme` (not hardcoded https)
- ✅ Caching: 7d for assets, no cache for HTML
- ✅ CORS headers and OPTIONS handling

---

## Configuration Files

### Option 1: Root Deployment (Recommended)
**File:** `nginx-ringba-subdomain-final.conf`

**Accessible at:** `https://ringba.insidefi.co/`

**Features:**
- Serves static files at root `/` using `root` directive
- API at `/api` (no path prefix needed)
- Cleaner URLs for subdomain
- **Requires:** Update `vite.config.js` base to `/` and rebuild

**Installation:**
```bash
# 1. Update vite.config.js
cd dashboard-react
# Change: base: '/ringba-sync-dashboard/' to base: '/'
npm run build

# 2. Install nginx config
sudo cp nginx-ringba-subdomain-final.conf /etc/nginx/sites-available/ringba.insidefi.co
sudo ln -s /etc/nginx/sites-available/ringba.insidefi.co /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

### Option 2: Path-Based Deployment (No Changes Needed)
**File:** `nginx-ringba-subdomain-path.conf`

**Accessible at:** `https://ringba.insidefi.co/ringba-sync-dashboard/`

**Features:**
- **EXACTLY matches your working insidefi.co pattern**
- Serves static files at `/ringba-sync-dashboard` using `alias`
- API at `/ringba-sync-dashboard/api` with rewrite
- **No changes needed** to vite.config.js
- Works with existing build files

**Installation:**
```bash
# No vite.config.js changes needed - works as-is
sudo cp nginx-ringba-subdomain-path.conf /etc/nginx/sites-available/ringba.insidefi.co
sudo ln -s /etc/nginx/sites-available/ringba.insidefi.co /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Comparison with Your Working Config

| Feature | Your insidefi.co | Option 1 (Root) | Option 2 (Path) |
|---------|-----------------|-----------------|-----------------|
| **Static Location** | `/ringba-sync-dashboard` | `/` | `/ringba-sync-dashboard` |
| **Directive** | `alias` | `root` | `alias` ✅ |
| **API Location** | `/ringba-sync-dashboard/api` | `/api` | `/ringba-sync-dashboard/api` ✅ |
| **Rewrite** | `rewrite ^/ringba-sync-dashboard/api(.*)$ /api$1 break;` | None | ✅ Same |
| **Proxy Pass** | `proxy_pass http://ringba-sync-dashboard;` | ✅ Same | ✅ Same |
| **Upstream** | `upstream ringba-sync-dashboard` | ✅ Same | ✅ Same |
| **Headers** | `X-Forwarded-Proto $scheme` | ✅ Same | ✅ Same |
| **Caching** | 7d assets, no cache HTML | ✅ Same | ✅ Same |

---

## Recommendation

**Use Option 2** (`nginx-ringba-subdomain-path.conf`) because:
1. ✅ **EXACTLY matches your working pattern** - proven to work
2. ✅ **No vite.config.js changes needed** - works with existing build
3. ✅ **Same directory structure** - `/var/www/ringba-sync-dashboard`
4. ✅ **Same rewrite pattern** - identical to your working config
5. ✅ **Zero risk** - uses your exact working configuration

**Use Option 1** only if you want cleaner URLs and don't mind updating vite.config.js.

---

## Quick Installation (Option 2 - Recommended)

```bash
# 1. Upload config to server
scp nginx-ringba-subdomain-path.conf user@server:/tmp/

# 2. SSH into server
ssh user@server

# 3. Install configuration
sudo cp /tmp/nginx-ringba-subdomain-path.conf /etc/nginx/sites-available/ringba.insidefi.co
sudo ln -s /etc/nginx/sites-available/ringba.insidefi.co /etc/nginx/sites-enabled/

# 4. Test configuration
sudo nginx -t

# 5. Reload nginx
sudo systemctl reload nginx

# 6. Verify
curl -I http://ringba.insidefi.co/ringba-sync-dashboard/
curl http://ringba.insidefi.co/ringba-sync-dashboard/api/health
```

---

## File Locations

**On Server:**
```
/etc/nginx/sites-available/ringba.insidefi.co  ← Main config
/etc/nginx/sites-enabled/ringba.insidefi.co    ← Symbolic link
/var/www/ringba-sync-dashboard/                 ← Build files (same as your working setup)
```

**Logs:**
```
/var/log/nginx/ringba.access.log
/var/log/nginx/ringba.error.log
```

---

## Testing

### Test Static Files:
```bash
curl -I http://ringba.insidefi.co/ringba-sync-dashboard/
# Should return: HTTP/1.1 200 OK
```

### Test API:
```bash
curl http://ringba.insidefi.co/ringba-sync-dashboard/api/health
# Should return JSON response
```

### Test from Browser:
1. Open: `http://ringba.insidefi.co/ringba-sync-dashboard/`
2. Check browser console (F12) for errors
3. Verify dashboard loads correctly

---

## Key Differences from Previous Configs

✅ **Matches your exact working pattern:**
- Same upstream name: `ringba-sync-dashboard`
- Same rewrite pattern: `rewrite ^/ringba-sync-dashboard/api(.*)$ /api$1 break;`
- Same proxy_pass: `proxy_pass http://ringba-sync-dashboard;`
- Same headers: `X-Forwarded-Proto $scheme` (not hardcoded)
- Same caching: 7d for assets, no cache for HTML

✅ **Uses same directory:**
- `/var/www/ringba-sync-dashboard` (same as your working setup)

✅ **Same log file pattern:**
- `/var/log/nginx/ringba.access.log`
- `/var/log/nginx/ringba.error.log`

---

## Troubleshooting

If something doesn't work, compare with your working config:

```bash
# View your working config
cat /etc/nginx/sites-available/insidefi.co | grep -A 50 "ringba-sync-dashboard"

# View new config
cat /etc/nginx/sites-available/ringba.insidefi.co

# Compare patterns
```

The new config should be identical in structure, just with different `server_name`.

---

## Summary

**Recommended:** Use `nginx-ringba-subdomain-path.conf`

- ✅ Matches your working pattern exactly
- ✅ No code changes needed
- ✅ Same directory structure
- ✅ Proven to work (based on your working config)

Just install and it should work immediately!

