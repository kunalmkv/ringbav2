#!/bin/bash

# Script to update dashboard-server.js on the server and restart it
# Usage: ./update-dashboard-server.sh [server-user] [server-ip] [server-path]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
SERVER_USER=${1:-"root"}
SERVER_IP=${2:-""}
SERVER_PATH=${3:-"/var/www/ringba/dashboard"}

if [ -z "$SERVER_IP" ]; then
    echo -e "${RED}Error: Server IP is required${NC}"
    echo "Usage: ./update-dashboard-server.sh [user] [server-ip] [server-path]"
    echo "Example: ./update-dashboard-server.sh root 123.45.67.89 /var/www/ringba/dashboard"
    exit 1
fi

echo -e "${GREEN}=== Dashboard Server Update Script ===${NC}"
echo "Server: $SERVER_USER@$SERVER_IP"
echo "Path: $SERVER_PATH"
echo ""

# Step 1: Upload dashboard-server.js
echo -e "${YELLOW}Step 1: Uploading dashboard-server.js...${NC}"
scp dashboard-server.js "$SERVER_USER@$SERVER_IP:$SERVER_PATH/dashboard-server.js"
echo -e "${GREEN}✓ File uploaded${NC}"
echo ""

# Step 2: Verify endpoint exists
echo -e "${YELLOW}Step 2: Verifying endpoint exists in uploaded file...${NC}"
ssh "$SERVER_USER@$SERVER_IP" "grep -n 'ringba-campaign-summary' $SERVER_PATH/dashboard-server.js" || {
    echo -e "${RED}✗ Endpoint not found in file!${NC}"
    exit 1
}
echo -e "${GREEN}✓ Endpoint found${NC}"
echo ""

# Step 3: Restart server
echo -e "${YELLOW}Step 3: Restarting backend server...${NC}"
echo "Checking if using PM2 or systemd..."

# Check for PM2
if ssh "$SERVER_USER@$SERVER_IP" "command -v pm2 > /dev/null 2>&1 && pm2 list | grep -q dashboard"; then
    echo "Detected PM2 - restarting..."
    ssh "$SERVER_USER@$SERVER_IP" "pm2 restart dashboard-server || pm2 restart ringba-dashboard || pm2 restart all"
    echo -e "${GREEN}✓ PM2 restarted${NC}"
elif ssh "$SERVER_USER@$SERVER_IP" "systemctl is-active --quiet ringba-dashboard 2>/dev/null"; then
    echo "Detected systemd - restarting..."
    ssh "$SERVER_USER@$SERVER_IP" "sudo systemctl restart ringba-dashboard"
    echo -e "${GREEN}✓ systemd service restarted${NC}"
else
    echo -e "${YELLOW}⚠ Could not detect process manager${NC}"
    echo "Please restart manually:"
    echo "  PM2: pm2 restart dashboard-server"
    echo "  systemd: sudo systemctl restart ringba-dashboard"
    echo "  Manual: Stop and restart node dashboard-server.js"
fi
echo ""

# Step 4: Test endpoint
echo -e "${YELLOW}Step 4: Testing endpoint...${NC}"
sleep 2  # Wait for server to restart

if ssh "$SERVER_USER@$SERVER_IP" "curl -s http://localhost:3000/api/ringba-campaign-summary | head -c 100"; then
    echo ""
    echo -e "${GREEN}✓ Endpoint is responding!${NC}"
else
    echo -e "${RED}✗ Endpoint test failed${NC}"
    echo "Check server logs:"
    echo "  pm2 logs dashboard-server"
    echo "  OR"
    echo "  sudo journalctl -u ringba-dashboard -n 20"
fi
echo ""

echo -e "${GREEN}=== Update Complete ===${NC}"
echo ""
echo "Next steps:"
echo "1. Clear browser cache (Ctrl+Shift+R)"
echo "2. Refresh the dashboard page"
echo "3. Check browser console for errors"
echo "4. Verify Ringba Dashboard table loads data"


