#!/bin/bash

# Deployment script for dashboard to server
# Usage: ./deploy-to-server.sh [server-user@server-ip]

set -e

SERVER_PATH="/var/www/ringba-sync-dashboard"
LOCAL_BUILD_DIR="./dashboard-build"

echo "=== Dashboard Deployment Script ==="
echo ""

# Check if build directory exists
if [ ! -d "$LOCAL_BUILD_DIR" ]; then
    echo "❌ Error: Build directory not found: $LOCAL_BUILD_DIR"
    echo "   Run: cd dashboard-react && npm run build"
    exit 1
fi

# Check if index.html exists
if [ ! -f "$LOCAL_BUILD_DIR/index.html" ]; then
    echo "❌ Error: index.html not found in build directory"
    exit 1
fi

echo "✓ Build directory found"
echo "✓ Files to deploy:"
ls -lh "$LOCAL_BUILD_DIR" | grep -E "(index.html|assets|config.js)"
echo ""

# If server argument provided, use SCP
if [ -n "$1" ]; then
    SERVER="$1"
    echo "Deploying to server: $SERVER"
    echo ""
    
    # Create directory on server
    echo "Creating directory on server..."
    ssh "$SERVER" "sudo mkdir -p $SERVER_PATH && sudo chown -R \$USER:\$USER $SERVER_PATH"
    
    # Copy files
    echo "Copying files..."
    scp -r "$LOCAL_BUILD_DIR"/* "$SERVER:$SERVER_PATH/"
    
    # Set permissions
    echo "Setting permissions..."
    ssh "$SERVER" "sudo chown -R www-data:www-data $SERVER_PATH && sudo chmod -R 755 $SERVER_PATH"
    
    echo ""
    echo "✓ Deployment complete!"
    echo ""
    echo "Verify on server:"
    echo "  ssh $SERVER 'ls -la $SERVER_PATH/'"
    echo "  ssh $SERVER 'ls -la $SERVER_PATH/assets/'"
else
    echo "Local deployment mode"
    echo ""
    echo "To deploy to server, use:"
    echo "  ./deploy-to-server.sh user@server-ip"
    echo ""
    echo "OR manually copy files:"
    echo "  scp -r $LOCAL_BUILD_DIR/* user@server:$SERVER_PATH/"
    echo "  ssh user@server 'sudo chown -R www-data:www-data $SERVER_PATH'"
    echo "  ssh user@server 'sudo chmod -R 755 $SERVER_PATH'"
fi

echo ""
echo "After deployment, test:"
echo "  curl http://localhost/ringba-sync-dashboard/ | head -20"
echo "  curl -I http://localhost/ringba-sync-dashboard/assets/index-D_qHQMUi.js"

