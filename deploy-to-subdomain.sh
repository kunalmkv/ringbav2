#!/bin/bash

# Deployment script for Ringba Dashboard to subdomain
# Usage: ./deploy-to-subdomain.sh [subdomain] [server-user] [server-ip] [server-path]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SUBDOMAIN=${1:-"dashboard"}
SERVER_USER=${2:-"root"}
SERVER_IP=${3:-""}
SERVER_PATH=${4:-"/home/$SERVER_USER/ringba-dashboard"}

if [ -z "$SERVER_IP" ]; then
    echo -e "${RED}Error: Server IP is required${NC}"
    echo "Usage: ./deploy-to-subdomain.sh [subdomain] [server-user] [server-ip] [server-path]"
    exit 1
fi

echo -e "${GREEN}=== Ringba Dashboard Deployment ===${NC}"
echo "Subdomain: $SUBDOMAIN"
echo "Server: $SERVER_USER@$SERVER_IP"
echo "Path: $SERVER_PATH"
echo ""

# Step 1: Build frontend
echo -e "${YELLOW}Step 1: Building frontend...${NC}"
cd dashboard-react
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi
npm run build
cd ..

if [ ! -d "dashboard-build" ]; then
    echo -e "${RED}Error: Build directory not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Frontend built successfully${NC}"
echo ""

# Step 2: Create deployment package
echo -e "${YELLOW}Step 2: Preparing deployment package...${NC}"
TEMP_DIR=$(mktemp -d)
cp -r dashboard-build "$TEMP_DIR/"
cp dashboard-server.js "$TEMP_DIR/"
echo -e "${GREEN}✓ Deployment package prepared${NC}"
echo ""

# Step 3: Upload to server
echo -e "${YELLOW}Step 3: Uploading files to server...${NC}"
ssh "$SERVER_USER@$SERVER_IP" "mkdir -p $SERVER_PATH"
scp -r "$TEMP_DIR/dashboard-build" "$SERVER_USER@$SERVER_IP:$SERVER_PATH/"
scp "$TEMP_DIR/dashboard-server.js" "$SERVER_USER@$SERVER_IP:$SERVER_PATH/"

# Cleanup temp directory
rm -rf "$TEMP_DIR"

echo -e "${GREEN}✓ Files uploaded successfully${NC}"
echo ""

# Step 4: Install dependencies on server
echo -e "${YELLOW}Step 4: Installing server dependencies...${NC}"
ssh "$SERVER_USER@$SERVER_IP" "cd $SERVER_PATH && npm install express pg dotenv cors --save"
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 5: Instructions
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo ""
echo "Next steps:"
echo "1. Create .env file on server:"
echo "   ssh $SERVER_USER@$SERVER_IP"
echo "   cd $SERVER_PATH"
echo "   nano .env"
echo ""
echo "2. Configure Nginx (see SUBDOMAIN_DEPLOYMENT_GUIDE.md)"
echo ""
echo "3. Start the backend server:"
echo "   pm2 start $SERVER_PATH/dashboard-server.js --name ringba-dashboard"
echo "   pm2 save"
echo ""
echo "4. Test the deployment:"
echo "   curl https://$SUBDOMAIN/api/health"
echo ""
echo -e "${YELLOW}For detailed instructions, see SUBDOMAIN_DEPLOYMENT_GUIDE.md${NC}"


