#!/bin/bash
# Sync source code to M2 Mac for building
# Run this from the Intel Mac (development machine)
#
# SETUP REQUIRED:
# 1. Enable File Sharing on both Macs (System Settings > General > Sharing)
# 2. On M2 Mac, share a folder (or use your home directory)
# 3. On Intel Mac, connect to M2 Mac via Finder > Network or:
#    open smb://M2_MAC_NAME/Shared
# 4. Update M2_MAC_NAME and SHARED_FOLDER below

set -e

# ============================================================================
# CONFIGURATION - UPDATE THESE FOR YOUR SETUP
# ============================================================================

# Option 1: Use M2 Mac's hostname or IP address
# Find hostname: System Settings > General > Sharing > Computer Name
# Or use IP: ifconfig | grep "inet " (look for your local network IP)
M2_MAC_NAME="admins-mac-mini.lan"  # e.g., "nbietz-M2-Mac" or "192.168.1.100"

# Option 2: Shared folder name on M2 Mac
# This is the folder you shared in File Sharing settings
SHARED_FOLDER="shared-code"  # Common names: "Shared", "Public", or a custom folder name

# Option 3: Project folder name on M2 Mac
PROJECT_NAME="adam-heart-tracking"

# ============================================================================
# Alternative: Direct path if already mounted
# ============================================================================
# If you've already mounted the M2 Mac's shared folder, uncomment and set:
# REMOTE_PATH="/Volumes/${SHARED_FOLDER}/${PROJECT_NAME}"
# Or use a custom path:
# REMOTE_PATH="/Users/YOUR_M2_USERNAME/Shared/${PROJECT_NAME}"

# ============================================================================
# Script logic - no changes needed below
# ============================================================================

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Sync to M2 Mac${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Get script directory (project root)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if REMOTE_PATH is set (direct path)
if [ -z "${REMOTE_PATH:-}" ]; then
    # Try to construct path from configuration
    REMOTE_PATH="/Volumes/${SHARED_FOLDER}/${PROJECT_NAME}"
fi

# Check if base mount point exists
BASE_MOUNT="/Volumes/${SHARED_FOLDER}"
if [ ! -d "$BASE_MOUNT" ]; then
    echo -e "${YELLOW}⚠️  Shared folder not mounted: $BASE_MOUNT${NC}"
    echo ""
    echo -e "${BLUE}Setup Instructions:${NC}"
    echo ""
    echo "1. On M2 Mac:"
    echo "   - Open System Settings > General > Sharing"
    echo "   - Enable 'File Sharing'"
    echo "   - Note the Computer Name (e.g., 'nbietz-M2-Mac')"
    echo "   - Share a folder (or use Public folder)"
    echo ""
    echo "2. On Intel Mac (this Mac):"
    echo "   - Open Finder"
    echo "   - Press Cmd+K (or Go > Connect to Server)"
    echo "   - Enter: smb://${M2_MAC_NAME}/${SHARED_FOLDER}"
    echo "   - Or find M2 Mac in Finder > Network"
    echo "   - Connect and mount the shared folder"
    echo ""
    echo "3. Update this script:"
    echo "   - Set M2_MAC_NAME (line 18)"
    echo "   - Set SHARED_FOLDER (line 22)"
    echo "   - Or set REMOTE_PATH directly (line 30)"
    echo ""
    echo -e "${YELLOW}Alternative: Use rsync over network directly${NC}"
    echo "   Uncomment and configure the rsync command at the bottom of this script"
    echo ""
    exit 1
fi

# Create remote directory if it doesn't exist
if [ ! -d "$REMOTE_PATH" ]; then
    echo -e "${BLUE}Creating remote directory: $REMOTE_PATH${NC}"
    mkdir -p "$REMOTE_PATH"
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Directory created${NC}"
    else
        echo -e "${RED}✗ Failed to create directory${NC}"
        echo "   Check permissions on the shared folder"
        exit 1
    fi
fi

echo -e "${GREEN}Remote path ready: $REMOTE_PATH${NC}"
echo ""

# Sync files using rsync
echo -e "${BLUE}Syncing source files...${NC}"
echo "  From: $SCRIPT_DIR"
echo "  To:   $REMOTE_PATH"
echo ""

rsync -av --delete \
    --exclude-from=.rsyncignore \
    --exclude='.rsyncignore' \
    --exclude='sync_to_m2.sh' \
    --include='run_on_m2.sh' \
    "$SCRIPT_DIR/" "$REMOTE_PATH/"

echo ""
echo -e "${GREEN}✓ Sync complete!${NC}"
echo ""
echo -e "${BLUE}Next steps on M2 Mac:${NC}"
echo "  1. Navigate to: $REMOTE_PATH"
echo ""
echo -e "${BLUE}Quick test (run directly):${NC}"
echo "  ./run_on_m2.sh"
echo ""
echo -e "${BLUE}Or build app bundle:${NC}"
echo "  ./build_on_m2.sh"
echo ""

# ============================================================================
# Alternative: Direct rsync over network (uncomment and configure)
# ============================================================================
# If you prefer to sync directly without mounting, uncomment below:
#
# M2_USER="your_m2_username"
# M2_IP="192.168.1.100"  # M2 Mac's IP address
# M2_PROJECT_PATH="/Users/${M2_USER}/Shared/${PROJECT_NAME}"
#
# rsync -av --delete \
#     --exclude-from=.rsyncignore \
#     --exclude='.rsyncignore' \
#     --exclude='sync_to_m2.sh' \
#     "$SCRIPT_DIR/" "${M2_USER}@${M2_IP}:${M2_PROJECT_PATH}/"

