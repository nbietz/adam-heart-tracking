#!/bin/bash
# Diagnostic and fix script for MediaPipe on M2 Mac
# Run this on the M2 Mac to diagnose and fix MediaPipe issues

set -e

echo "=========================================="
echo "MediaPipe Diagnostic and Fix Script"
echo "=========================================="
echo ""

# Activate venv if in project directory
if [ -d "venv" ]; then
    source venv/bin/activate
    echo "✓ Virtual environment activated"
else
    echo "⚠️  No venv found, using system Python"
fi

echo ""
echo "Python version:"
python --version

echo ""
echo "Python architecture:"
python -c "import platform; print(platform.machine())"

echo ""
echo "Current MediaPipe installation:"
pip list | grep mediapipe || echo "  No mediapipe found"

echo ""
echo "Attempting to fix..."
echo ""

# Clean uninstall
echo "1. Uninstalling existing MediaPipe packages..."
pip uninstall -y mediapipe mediapipe-silicon 2>/dev/null || true

# Clear pip cache
echo "2. Clearing pip cache..."
pip cache purge 2>/dev/null || true

# Try installing an older version that has solutions module
echo "3. Installing MediaPipe 0.10.8 (known to work with solutions module)..."
pip install --no-cache-dir --no-compile mediapipe==0.10.8

echo ""
echo "4. Verifying installation..."
if python -c "import mediapipe.solutions.pose" 2>/dev/null; then
    echo "✓ SUCCESS! MediaPipe is working"
    python -c "import mediapipe.solutions.pose; print('  solutions.pose imported successfully')"
    python -c "import mediapipe; print('  Version:', mediapipe.__version__)"
else
    echo "✗ Still failing with 0.10.8"
    echo ""
    echo "Trying 0.10.7..."
    pip uninstall -y mediapipe
    pip install --no-cache-dir --no-compile mediapipe==0.10.7
    
    if python -c "import mediapipe.solutions.pose" 2>/dev/null; then
        echo "✓ SUCCESS with 0.10.7!"
    else
        echo "✗ 0.10.7 also failed"
        echo ""
        echo "Checking what's available in the package:"
        python -c "import mediapipe; print('Available:', dir(mediapipe))" 2>&1 || true
        echo ""
        echo "The ARM64 build of MediaPipe 0.10.31 may not include solutions module."
        echo "You may need to use an older version or wait for a fix."
    fi
fi
