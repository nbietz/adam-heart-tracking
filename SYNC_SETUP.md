# Setting Up Cross-Platform Development Sync

This guide explains how to sync source code from your Intel Mac (development) to your M2 Mac (testing) without cross-contaminating build directories.

## Overview

- **Intel Mac**: Primary development machine
- **M2 Mac**: Testing and building native ARM64 apps
- **Sync Method**: macOS File Sharing (SMB)
- **What Syncs**: Source code only (excludes `venv/`, `build/`, `dist/`, etc.)

## Manual Setup Steps

### Step 1: Enable File Sharing on M2 Mac

1. Open **System Settings** (or System Preferences on older macOS)
2. Go to **General > Sharing**
3. Enable **File Sharing**
4. Note your **Computer Name** (e.g., "nbietz-M2-Mac")
5. Click **Options...** and ensure **Share files and folders using SMB** is checked
6. Add your user account if needed

**Optional**: Share a specific folder:
- Click the **+** button under Shared Folders
- Select a folder (e.g., create a "Shared" folder in your home directory)
- Set permissions (Read & Write for your user)

### Step 2: Connect from Intel Mac

**Option A: Via Finder (Recommended)**

1. Open **Finder**
2. In the sidebar, click **Network** (or press `Cmd+Shift+K`)
3. Find your M2 Mac in the list
4. Double-click to connect
5. Enter your M2 Mac username and password
6. Select the shared folder
7. The folder will mount at `/Volumes/[FolderName]`

**Option B: Via Connect to Server**

1. In Finder, press `Cmd+K` (or Go > Connect to Server)
2. Enter: `smb://[M2_MAC_NAME]/[SHARED_FOLDER]`
   - Replace `[M2_MAC_NAME]` with your M2 Mac's Computer Name
   - Replace `[SHARED_FOLDER]` with the folder name (e.g., "Shared")
   - Example: `smb://nbietz-M2-Mac/Shared`
3. Click **Connect**
4. Enter credentials
5. Select the shared folder

**Option C: Find IP Address (Alternative)**

If hostname doesn't work, use IP address:

1. On M2 Mac, open Terminal and run:
   ```bash
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```
2. Look for your local network IP (e.g., `192.168.1.100`)
3. Connect using: `smb://192.168.1.100/Shared`

### Step 3: Configure Sync Script

1. Open `sync_to_m2.sh` in a text editor
2. Update these variables (lines 18-22):

   ```bash
   M2_MAC_NAME="YOUR_M2_MAC_NAME"  # e.g., "nbietz-M2-Mac"
   SHARED_FOLDER="Shared"            # Your shared folder name
   PROJECT_NAME="adam-heart-tracking"
   ```

3. Or set `REMOTE_PATH` directly (line 30) if you know the exact path:
   ```bash
   REMOTE_PATH="/Volumes/Shared/adam-heart-tracking"
   ```

### Step 4: Make Scripts Executable

On Intel Mac:
```bash
chmod +x sync_to_m2.sh
```

On M2 Mac (after first sync):
```bash
chmod +x build_on_m2.sh
```

## Workflow

### Daily Development (Intel Mac)

1. Make code changes
2. Test locally
3. Sync to M2 Mac:
   ```bash
   ./sync_to_m2.sh
   ```

### Testing on M2 Mac

**Option 1: Run directly (faster for testing)**
```bash
cd /Volumes/Shared/adam-heart-tracking
./run_on_m2.sh
```
This runs the Python app directly without building a bundle - much faster for iterative testing!

**Option 2: Build app bundle (for distribution)**
```bash
cd /Volumes/Shared/adam-heart-tracking
./build_on_m2.sh
open dist/HealthCheckInMirror.app
```
This creates a standalone `.app` bundle for distribution.

## What Gets Synced

**Included** (source code):
- `src/` - All source code
- `assets/` - Model files, shaders
- `requirements.txt` - Dependencies
- `build_app.spec` - Build configuration
- `package.sh`, `build_on_m2.sh` - Scripts
- Documentation files

**Excluded** (build artifacts):
- `venv/` - Virtual environment (each Mac has its own)
- `build/` - PyInstaller build files
- `dist/` - Built app bundles
- `__pycache__/` - Python cache
- `*.pyc` - Compiled Python files
- `.camera_mapping.json` - Local camera cache
- `.DS_Store` - macOS metadata

## Troubleshooting

### "Remote path not found"

- Ensure File Sharing is enabled on M2 Mac
- Mount the shared folder in Finder first
- Check that `M2_MAC_NAME` and `SHARED_FOLDER` are correct
- Try using IP address instead of hostname

### "Permission denied"

- Check file sharing permissions on M2 Mac
- Ensure your user has Read & Write access
- Try reconnecting to the shared folder

### "Connection timeout"

- Ensure both Macs are on the same network
- Check firewall settings
- Try using IP address instead of hostname

### Sync is slow

- Large files (like OBJ models) sync every time
- Consider excluding large assets if they don't change often
- Use wired network if possible

### Build fails on M2 Mac

- Ensure virtual environment is set up: `python3 -m venv venv`
- Install dependencies: `pip install -r requirements.txt`
- Check that Python is native ARM64: `python3 -c "import platform; print(platform.machine())"`

## Alternative: Direct rsync (No File Sharing)

If you prefer not to use File Sharing, you can use rsync directly over SSH:

1. Enable **Remote Login** on M2 Mac (System Settings > General > Sharing)
2. Uncomment the rsync command at the bottom of `sync_to_m2.sh`
3. Update `M2_USER`, `M2_IP`, and `M2_PROJECT_PATH`
4. Ensure SSH keys are set up (or use password authentication)

## Tips

- **Auto-mount**: Add the shared folder to Login Items to mount automatically
- **Fast sync**: Only changed files are transferred (rsync is efficient)
- **Clean builds**: Each Mac maintains separate build directories
- **Version control**: Consider using Git for additional backup and versioning

