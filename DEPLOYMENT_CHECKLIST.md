# Quick Deployment Checklist

Use this checklist when deploying the dashboard to a new subdomain.

## Pre-Deployment

- [ ] DNS record added for subdomain (A or CNAME)
- [ ] Server has Node.js 18+ installed
- [ ] Server has Nginx installed
- [ ] Server has PostgreSQL access
- [ ] SSL certificate ready (or Let's Encrypt configured)

## Build & Upload

- [ ] Frontend built: `cd dashboard-react && npm run build`
- [ ] Build files uploaded to server
- [ ] Backend server file (`dashboard-server.js`) uploaded
- [ ] Environment file (`.env`) created on server

## Server Configuration

- [ ] Dependencies installed: `npm install express pg dotenv cors`
- [ ] Environment variables configured in `.env`
- [ ] Nginx configuration created
- [ ] Nginx configuration tested: `sudo nginx -t`
- [ ] Nginx site enabled and reloaded

## Backend Setup

- [ ] Backend server started (PM2 or systemd)
- [ ] Backend health check working: `curl http://localhost:3000/api/health`
- [ ] Database connection verified

## SSL & DNS

- [ ] SSL certificate installed (Let's Encrypt or custom)
- [ ] DNS propagation verified: `dig your-subdomain.example.com`
- [ ] HTTPS working: `curl https://your-subdomain.example.com/api/health`

## Frontend Configuration

- [ ] Base path updated in `vite.config.js` (if needed)
- [ ] Frontend rebuilt after config changes
- [ ] Static files served correctly by Nginx

## Testing

- [ ] Frontend loads: `https://your-subdomain.example.com`
- [ ] API endpoints working (check browser console)
- [ ] All dashboard features functional
- [ ] No console errors in browser
- [ ] Mobile responsive (if applicable)

## Post-Deployment

- [ ] PM2 auto-start configured: `pm2 startup && pm2 save`
- [ ] Monitoring/logging set up
- [ ] Backup strategy in place
- [ ] Documentation updated with new URL

## Troubleshooting Commands

```bash
# Check backend status
pm2 status
pm2 logs ringba-dashboard

# Check nginx status
sudo systemctl status nginx
sudo tail -f /var/log/nginx/dashboard-error.log

# Test API
curl https://your-subdomain.example.com/api/health

# Check DNS
dig your-subdomain.example.com
```


