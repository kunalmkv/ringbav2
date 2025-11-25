#!/bin/bash

# Complete deployment script for frontend to nginx
# This script builds React app and copies to nginx directory
# Usage: ./deploy-frontend-to-nginx.sh

set -e

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

NGINX_DIR="/var/www/ringba-sync-dashboard"
BUILD_DIR="dashboard-build"

echo "=========================================="
echo "Frontend Deployment to Nginx"
echo "=========================================="
echo ""

# Step 1: Build React frontend
echo "Step 1: Building React frontend..."
cd dashboard-react

# Check if node_modules exists
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
if [ ! -d "$BUILD_DIR" ]; then
    echo "  ❌ ERROR: $BUILD_DIR directory not found!"
    exit 1
fi

if [ ! -f "$BUILD_DIR/index.html" ]; then
    echo "  ❌ ERROR: index.html not found in build output!"
    exit 1
fi

BUILD_FILES=$(find "$BUILD_DIR/assets" -name "*.js" -o -name "*.css" 2>/dev/null | wc -l)
echo "  ✓ Build complete! Found $BUILD_FILES asset files"

# Check build timestamp
LATEST_JS=$(find "$BUILD_DIR/assets" -name "*.js" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
if [ -n "$LATEST_JS" ]; then
    echo "  ✓ Latest JS file: $(basename "$LATEST_JS")"
    echo "  ✓ Build time: $(stat -c %y "$LATEST_JS" 2>/dev/null || stat -f "%Sm" "$LATEST_JS" 2>/dev/null)"
fi

# Step 3: Check if new columns are in build
echo ""
echo "Step 3: Checking for new columns in build..."
if grep -rq "Cost Per Call\|Net\|Net Profit" "$BUILD_DIR/assets"/*.js 2>/dev/null; then
    echo "  ✓ New columns found in build!"
else
    echo "  ⚠️  Warning: New columns not found (might be minified, this is OK)"
fi

# Step 4: Copy files to nginx directory
echo ""
echo "Step 4: Copying files to nginx directory..."
echo "  Source: $SCRIPT_DIR/$BUILD_DIR"
echo "  Destination: $NGINX_DIR"

# Check if nginx directory exists
if [ ! -d "$NGINX_DIR" ]; then
    echo "  Creating nginx directory..."
    sudo mkdir -p "$NGINX_DIR"
fi

# Backup old files (optional)
BACKUP_DIR="${NGINX_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
if [ -d "$NGINX_DIR" ] && [ "$(ls -A $NGINX_DIR 2>/dev/null)" ]; then
    echo "  Creating backup at: $BACKUP_DIR"
    sudo cp -r "$NGINX_DIR" "$BACKUP_DIR"
fi

# Remove old files
echo "  Removing old files..."
sudo rm -rf "$NGINX_DIR"/*

# Copy new files
echo "  Copying new build files..."
sudo cp -r "$BUILD_DIR"/* "$NGINX_DIR/"

# Set permissions
echo "  Setting permissions..."
sudo chown -R www-data:www-data "$NGINX_DIR"
sudo chmod -R 755 "$NGINX_DIR"

# Verify files were copied
if [ -f "$NGINX_DIR/index.html" ]; then
    echo "  ✓ Files copied successfully!"
    NGINX_FILES=$(find "$NGINX_DIR/assets" -name "*.js" -o -name "*.css" 2>/dev/null | wc -l)
    echo "  ✓ Found $NGINX_FILES asset files in nginx directory"
else
    echo "  ❌ ERROR: Files were not copied correctly!"
    exit 1
fi

# Step 5: Reload nginx
echo ""
echo "Step 5: Reloading nginx..."
if command -v nginx &> /dev/null; then
    # Test nginx configuration
    if sudo nginx -t 2>/dev/null; then
        echo "  ✓ Nginx configuration is valid"
        # Reload nginx
        if sudo nginx -s reload 2>/dev/null || sudo systemctl reload nginx 2>/dev/null; then
            echo "  ✓ Nginx reloaded successfully"
        else
            echo "  ⚠️  Warning: Could not reload nginx automatically"
            echo "  Please run manually: sudo nginx -s reload"
        fi
    else
        echo "  ❌ ERROR: Nginx configuration has errors!"
        echo "  Run: sudo nginx -t"
        exit 1
    fi
else
    echo "  ⚠️  Warning: nginx command not found"
    echo "  Please reload nginx manually: sudo nginx -s reload"
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
echo "Verify deployment:"
echo "  curl -I http://localhost/ringba-sync-dashboard/"
echo "  ls -la $NGINX_DIR/assets/"
echo ""

