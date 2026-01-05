#!/bin/bash
# Run the application directly on M2 Mac (no build required)
# Run this on the M2 Mac after syncing code from Intel Mac

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Running Health Check-in Mirror${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Get script directory (project root)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo -e "${BLUE}Creating virtual environment...${NC}"
    python3 -m venv venv
    echo -e "${GREEN}✓ Virtual environment created${NC}"
fi

# Activate virtual environment
echo -e "${BLUE}Activating virtual environment...${NC}"
source venv/bin/activate

# Check if dependencies are installed
# Check for key dependencies that might be missing
MISSING_DEPS=false
if ! python -c "import PyQt6" 2>/dev/null; then
    MISSING_DEPS=true
elif ! python -c "import mediapipe" 2>/dev/null; then
    MISSING_DEPS=true
elif ! python -c "import mediapipe.solutions.pose" 2>/dev/null; then
    MISSING_DEPS=true
elif ! python -c "import cv2" 2>/dev/null; then
    MISSING_DEPS=true
fi

if [ "$MISSING_DEPS" = true ]; then
    echo -e "${BLUE}Installing/updating dependencies (this may take a few minutes)...${NC}"
    pip install -q --upgrade pip
    
    # Check if we're on Apple Silicon and use appropriate requirements file
    ARCH=$(uname -m)
    if [ "$ARCH" = "arm64" ] && [ -f "requirements_m2.txt" ]; then
        echo -e "${BLUE}Using Apple Silicon optimized requirements...${NC}"
        pip install -q -r requirements_m2.txt
    else
        pip install -q -r requirements.txt
    fi
    echo -e "${GREEN}✓ Dependencies installed${NC}"
    
    # Verify MediaPipe installation
    echo -e "${BLUE}Verifying MediaPipe installation...${NC}"
    
    # Check if we're on Apple Silicon
    ARCH=$(uname -m)
    if [ "$ARCH" = "arm64" ]; then
        # On Apple Silicon, check for mediapipe-silicon
        if python -c "import mediapipe.solutions.pose" 2>/dev/null; then
            echo -e "${GREEN}✓ MediaPipe Silicon verified${NC}"
        else
            echo -e "${YELLOW}⚠️  MediaPipe verification failed${NC}"
            echo -e "${BLUE}Checking if mediapipe-silicon is installed...${NC}"
            
            # mediapipe-silicon 0.9.x doesn't have solutions module - try regular mediapipe
            echo -e "${BLUE}mediapipe-silicon is missing solutions module${NC}"
            echo -e "${BLUE}Switching to regular mediapipe (now supports Apple Silicon)...${NC}"
            
            # Uninstall mediapipe-silicon
            pip uninstall -y mediapipe-silicon 2>/dev/null || true
            pip uninstall -y mediapipe 2>/dev/null || true
            
            # Install regular mediapipe (works on Apple Silicon now)
            echo -e "${BLUE}Installing regular mediapipe...${NC}"
            pip install -q mediapipe
            
            if python -c "import mediapipe.solutions.pose" 2>/dev/null; then
                echo -e "${GREEN}✓ MediaPipe installed and verified${NC}"
            else
                echo -e "${RED}✗ MediaPipe installation failed${NC}"
                echo ""
                echo "Try manually:"
                echo "  pip uninstall mediapipe mediapipe-silicon"
                echo "  pip install mediapipe"
                echo "  python -c 'import mediapipe.solutions.pose'"
                exit 1
            fi
        fi
    else
        # On Intel, use regular mediapipe
        if python -c "import mediapipe.solutions.pose" 2>/dev/null; then
            echo -e "${GREEN}✓ MediaPipe verified${NC}"
        else
            echo -e "${YELLOW}⚠️  MediaPipe verification failed - trying to reinstall...${NC}"
            pip install -q --force-reinstall mediapipe
            if python -c "import mediapipe.solutions.pose" 2>/dev/null; then
                echo -e "${GREEN}✓ MediaPipe reinstalled successfully${NC}"
            else
                echo -e "${RED}✗ MediaPipe installation failed${NC}"
                exit 1
            fi
        fi
    fi
else
    echo -e "${GREEN}✓ Dependencies found${NC}"
fi

# Check architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    echo -e "${GREEN}✓ Running on Apple Silicon (native)${NC}"
else
    echo -e "${YELLOW}⚠️  Architecture: $ARCH${NC}"
fi

echo ""
echo -e "${BLUE}Starting application...${NC}"
echo ""

# Run the application
python src/main.py

