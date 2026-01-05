#!/bin/bash
# Build script for M2 Mac - only builds, doesn't sync
# Run this on the M2 Mac after syncing code from Intel Mac
#
# This script:
# - Sets up virtual environment if needed
# - Installs dependencies
# - Builds native ARM64 app bundle

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Building on Apple Silicon (M2)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Get script directory (project root)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if we're on Apple Silicon
ARCH=$(uname -m)
if [ "$ARCH" != "arm64" ]; then
    echo -e "${YELLOW}⚠️  Warning: This script is designed for Apple Silicon (arm64)${NC}"
    echo "   Current architecture: $ARCH"
    echo "   Continuing anyway..."
    echo ""
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo -e "${BLUE}Creating virtual environment...${NC}"
    python3 -m venv venv
    echo -e "${GREEN}✓ Virtual environment created${NC}"
else
    echo -e "${GREEN}✓ Virtual environment found${NC}"
fi

# Activate virtual environment
echo -e "${BLUE}Activating virtual environment...${NC}"
source venv/bin/activate

# Upgrade pip
echo -e "${BLUE}Upgrading pip...${NC}"
pip install -q --upgrade pip

# Install/update dependencies
echo -e "${BLUE}Installing dependencies (this may take a few minutes)...${NC}"
if [ -f "requirements.txt" ]; then
    pip install -q -r requirements.txt
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${RED}✗ requirements.txt not found!${NC}"
    exit 1
fi

# Install PyInstaller if needed
if ! python -c "import PyInstaller" 2>/dev/null; then
    echo -e "${BLUE}Installing PyInstaller...${NC}"
    pip install -q pyinstaller
    echo -e "${GREEN}✓ PyInstaller installed${NC}"
else
    echo -e "${GREEN}✓ PyInstaller found${NC}"
fi

# Clean previous builds
echo -e "${BLUE}Cleaning previous builds...${NC}"
rm -rf build dist
echo -e "${GREEN}✓ Build directories cleaned${NC}"

# Build the app
echo ""
echo -e "${BLUE}Building application bundle...${NC}"
echo -e "${YELLOW}This may take several minutes...${NC}"
echo ""

if [ -f "build_app.spec" ]; then
    pyinstaller build_app.spec
else
    echo -e "${RED}✗ build_app.spec not found!${NC}"
    exit 1
fi

# Check result
if [ -d "dist/HealthCheckInMirror.app" ]; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✓ Build successful!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${BLUE}App bundle:${NC} dist/HealthCheckInMirror.app"
    
    # Check architecture
    if [ -f "dist/HealthCheckInMirror.app/Contents/MacOS/HealthCheckInMirror" ]; then
        ARCH_INFO=$(file dist/HealthCheckInMirror.app/Contents/MacOS/HealthCheckInMirror)
        echo -e "${BLUE}Architecture:${NC}"
        echo "  $ARCH_INFO"
        
        if echo "$ARCH_INFO" | grep -q "arm64"; then
            echo -e "${GREEN}✓ Native Apple Silicon build - optimal performance!${NC}"
        elif echo "$ARCH_INFO" | grep -q "x86_64"; then
            echo -e "${YELLOW}⚠️  This is an Intel build (x86_64)${NC}"
            echo "   It will run via Rosetta 2, but for best performance,"
            echo "   ensure you're using a native Python installation."
        elif echo "$ARCH_INFO" | grep -q "universal"; then
            echo -e "${GREEN}✓ Universal binary - runs on both Intel and Apple Silicon${NC}"
        fi
    fi
    
    APP_SIZE=$(du -sh dist/HealthCheckInMirror.app | cut -f1)
    echo -e "${BLUE}Size:${NC} $APP_SIZE"
    echo ""
    echo -e "${BLUE}To test:${NC}"
    echo "  open dist/HealthCheckInMirror.app"
    echo ""
else
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}✗ Build failed!${NC}"
    echo -e "${RED}========================================${NC}"
    echo "Check the output above for errors."
    exit 1
fi

