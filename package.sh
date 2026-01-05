#!/bin/bash
# Packaging script for Health Check-in Mirror System
# Creates a macOS .app bundle using PyInstaller

set -e  # Exit on error

echo "=========================================="
echo "Health Check-in Mirror System - Packaging"
echo "=========================================="

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Error: Virtual environment not found. Please create it first:"
    echo "  python3 -m venv venv"
    echo "  source venv/bin/activate"
    echo "  pip install -r requirements.txt"
    exit 1
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install PyInstaller if not already installed
echo "Checking for PyInstaller..."
if ! python -c "import PyInstaller" 2>/dev/null; then
    echo "Installing PyInstaller..."
    pip install pyinstaller
else
    echo "PyInstaller already installed."
fi

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf build dist __pycache__

# Build the app
echo "Building application bundle..."
echo "This may take several minutes..."
pyinstaller build_app.spec

# Check if build was successful
if [ -d "dist/HealthCheckInMirror.app" ]; then
    echo ""
    echo "=========================================="
    echo "✓ Build successful!"
    echo "=========================================="
    echo ""
    echo "App bundle created at: dist/HealthCheckInMirror.app"
    echo ""
    echo "To test the app:"
    echo "  open dist/HealthCheckInMirror.app"
    echo ""
    echo "To create a DMG for distribution:"
    echo "  hdiutil create -volname \"Health Check-in Mirror\" -srcfolder dist/HealthCheckInMirror.app -ov -format UDZO dist/HealthCheckInMirror.dmg"
    echo ""
    
    # Get app size
    APP_SIZE=$(du -sh dist/HealthCheckInMirror.app | cut -f1)
    echo "App bundle size: $APP_SIZE"
    echo ""
    
    # Check architecture
    if [ -f "dist/HealthCheckInMirror.app/Contents/MacOS/HealthCheckInMirror" ]; then
        ARCH=$(file dist/HealthCheckInMirror.app/Contents/MacOS/HealthCheckInMirror | grep -o "x86_64\|arm64\|universal")
        echo "Architecture: $ARCH"
        if [ "$ARCH" = "x86_64" ]; then
            echo ""
            echo "⚠️  NOTE: This is an Intel (x86_64) build."
            echo "   It will run on Apple Silicon via Rosetta 2, but for best performance,"
            echo "   build on the Apple Silicon Mac directly."
        elif [ "$ARCH" = "arm64" ]; then
            echo ""
            echo "✓ This is an Apple Silicon (ARM64) build - native performance on M-series Macs."
        elif [ "$ARCH" = "universal" ]; then
            echo ""
            echo "✓ This is a universal binary - runs natively on both Intel and Apple Silicon."
        fi
        echo ""
    fi
else
    echo ""
    echo "=========================================="
    echo "✗ Build failed!"
    echo "=========================================="
    echo "Check the output above for errors."
    exit 1
fi

