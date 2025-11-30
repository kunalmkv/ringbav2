#!/bin/bash

# Installation script for nginx dashboard configuration
# Usage: ./nginx-dashboard-install.sh [subdomain] [dashboard-path]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SUBDOMAIN=${1:-"ringba.insidefi.co"}
DASHBOARD_PATH=${2:-"/var/www/ringba/dashboard-build"}

echo -e "${GREEN}=== Nginx Dashboard Configuration Installer ===${NC}"
echo "Subdomain: $SUBDOMAIN"
echo "Dashboard Path: $DASHBOARD_PATH"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root or with sudo${NC}"
    exit 1
fi

# Extract domain from subdomain
DOMAIN=$(echo $SUBDOMAIN | cut -d'.' -f2-)
CONFIG_FILE="/etc/nginx/sites-available/dashboard-${SUBDOMAIN%%.*}"

echo -e "${YELLOW}Step 1: Creating nginx configuration...${NC}"

# Create configuration file
cat > "$CONFIG_FILE" <<EOF
# Nginx Configuration for Ringba Dashboard Subdomain
# Auto-generated configuration

upstream dashboard_backend {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name $SUBDOMAIN;

    access_log /var/log/nginx/dashboard.access.log;
    error_log  /var/log/nginx/dashboard.error.log;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json application/javascript;

    # API Proxy
    location /api/ {
        proxy_pass http://dashboard_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Cookie \$http_cookie;
        proxy_cookie_path / /;
        proxy_cookie_domain off;
        
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
        
        if (\$request_method = OPTIONS) {
            add_header Access-Control-Allow-Origin * always;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
            add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
            add_header Access-Control-Max-Age 1728000;
            add_header Content-Type 'text/plain charset=UTF-8';
            add_header Content-Length 0;
            return 204;
        }
        
        add_header Cache-Control "no-store, no-cache, must-revalidate, private" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
    }

    # Serve static files
    location / {
        root $DASHBOARD_PATH;
        try_files \$uri \$uri/ /index.html;
        
        location ~* \.html\$ {
            root $DASHBOARD_PATH;
            expires -1;
            add_header Cache-Control "no-store, no-cache, must-revalidate, private";
            add_header Pragma "no-cache";
        }
    }

    # Cache static assets
    location ~* \.(?:js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map)\$ {
        root $DASHBOARD_PATH;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Health check
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    # Deny hidden files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
EOF

echo -e "${GREEN}✓ Configuration file created: $CONFIG_FILE${NC}"
echo ""

# Check if dashboard path exists
if [ ! -d "$DASHBOARD_PATH" ]; then
    echo -e "${YELLOW}Warning: Dashboard path does not exist: $DASHBOARD_PATH${NC}"
    echo "You may need to create it and upload your dashboard build files."
    read -p "Create directory now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        mkdir -p "$DASHBOARD_PATH"
        chown -R www-data:www-data "$DASHBOARD_PATH" 2>/dev/null || true
        echo -e "${GREEN}✓ Directory created${NC}"
    fi
fi

# Enable site
echo -e "${YELLOW}Step 2: Enabling nginx site...${NC}"
if [ -L "/etc/nginx/sites-enabled/dashboard-${SUBDOMAIN%%.*}" ]; then
    echo "Site already enabled, removing old link..."
    rm "/etc/nginx/sites-enabled/dashboard-${SUBDOMAIN%%.*}"
fi

ln -s "$CONFIG_FILE" "/etc/nginx/sites-enabled/dashboard-${SUBDOMAIN%%.*}"
echo -e "${GREEN}✓ Site enabled${NC}"
echo ""

# Test nginx configuration
echo -e "${YELLOW}Step 3: Testing nginx configuration...${NC}"
if nginx -t; then
    echo -e "${GREEN}✓ Nginx configuration is valid${NC}"
else
    echo -e "${RED}✗ Nginx configuration has errors${NC}"
    exit 1
fi
echo ""

# Reload nginx
echo -e "${YELLOW}Step 4: Reloading nginx...${NC}"
if systemctl reload nginx; then
    echo -e "${GREEN}✓ Nginx reloaded successfully${NC}"
else
    echo -e "${RED}✗ Failed to reload nginx${NC}"
    exit 1
fi
echo ""

echo -e "${GREEN}=== Installation Complete ===${NC}"
echo ""
echo "Next steps:"
echo "1. Update DNS to point $SUBDOMAIN to your server IP"
echo "2. Upload dashboard build files to: $DASHBOARD_PATH"
echo "3. Start the dashboard backend server on port 3000"
echo "4. Test: curl http://$SUBDOMAIN/api/health"
echo ""
echo -e "${YELLOW}Configuration file: $CONFIG_FILE${NC}"
echo -e "${YELLOW}Dashboard path: $DASHBOARD_PATH${NC}"

