#!/bin/bash

# Quick deployment script for frontend changes
# Usage: ./deploy-frontend.sh

set -e

echo "=========================================="
echo "Frontend Deployment Script"
echo "=========================================="
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Step 1: Build React frontend
echo "Step 1: Building React frontend..."
cd dashboard-react

# Check if node_modules exists, if not install
if [ ! -d "node_modules" ]; then
    echo "  Installing dependencies..."
    npm install
fi

# Build
echo "  Running build..."
npm run build

cd ..

# Step 2: Verify build output
echo ""
echo "Step 2: Verifying build output..."
if [ ! -d "dashboard-build" ]; then
    echo "  ❌ ERROR: dashboard-build directory not found!"
    exit 1
fi

if [ ! -f "dashboard-build/index.html" ]; then
    echo "  ❌ ERROR: index.html not found in build output!"
    exit 1
fi

BUILD_FILES=$(find dashboard-build/assets -name "*.js" -o -name "*.css" | wc -l)
echo "  ✓ Build complete! Found $BUILD_FILES asset files"

# Step 3: Check if new columns are in build
echo ""
echo "Step 3: Checking for new columns in build..."
if grep -rq "Cost Per Call\|Net\|Net Profit" dashboard-build/assets/*.js 2>/dev/null; then
    echo "  ✓ New columns found in build!"
else
    echo "  ⚠️  Warning: New columns not found in build (might be minified)"
fi

# Step 4: Restart server (if PM2 is available)
echo ""
echo "Step 4: Restarting server..."
if command -v pm2 &> /dev/null; then
    # Check if dashboard process exists
    if pm2 list | grep -q "dashboard"; then
        echo "  Restarting PM2 process 'dashboard'..."
        pm2 restart dashboard
        echo "  ✓ Server restarted via PM2"
    else
        echo "  ⚠️  No PM2 process named 'dashboard' found"
        echo "  Please restart your server manually:"
        echo "    pm2 restart <process-name>"
        echo "    OR"
        echo "    npm run dashboard"
        echo "    OR"
        echo "    node dashboard-server.js"
    fi
else
    echo "  ⚠️  PM2 not found. Please restart your server manually:"
    echo "    npm run dashboard"
    echo "    OR"
    echo "    node dashboard-server.js"
fi

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "IMPORTANT: Clear your browser cache!"
echo "  - Chrome/Edge: Press Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)"
echo "  - Firefox: Press Ctrl+Shift+Delete and clear cache"
echo "  - Safari: Press Cmd+Option+E"
echo ""
echo "Then refresh the dashboard page to see your changes."
echo ""


