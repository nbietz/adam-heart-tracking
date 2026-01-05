# Packaging Guide for Health Check-in Mirror System

This guide explains how to package the application for distribution on macOS.

## Prerequisites

1. **Virtual Environment**: Ensure you have a virtual environment set up with all dependencies installed:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. **PyInstaller**: Will be installed automatically by the packaging script, or install manually:
   ```bash
   pip install pyinstaller
   ```

## Quick Start

Simply run the packaging script:

```bash
./package.sh
```

This will:
1. Activate your virtual environment
2. Install PyInstaller if needed
3. Clean previous builds
4. Build the application bundle
5. Create `dist/HealthCheckInMirror.app`

## Manual Build

If you prefer to build manually:

```bash
source venv/bin/activate
pip install pyinstaller
pyinstaller build_app.spec
```

## Testing the App Bundle

After building, test the app:

```bash
open dist/HealthCheckInMirror.app
```

**Important**: Test on a clean Mac (or your other Mac) to ensure all dependencies are bundled correctly.

## Creating a DMG for Distribution

To create a disk image for easy distribution:

```bash
hdiutil create -volname "Health Check-in Mirror" \
  -srcfolder dist/HealthCheckInMirror.app \
  -ov -format UDZO \
  dist/HealthCheckInMirror.dmg
```

This creates `dist/HealthCheckInMirror.dmg` which can be shared.

## What Gets Bundled

The spec file (`build_app.spec`) includes:
- All Python dependencies (PyQt6, OpenCV, MediaPipe, etc.)
- Assets folder (OBJ models, shaders)
- Required system libraries
- MediaPipe models (bundled automatically)

## Troubleshooting

### App crashes on launch
- Check Console.app for error messages
- Try running from terminal: `dist/HealthCheckInMirror.app/Contents/MacOS/HealthCheckInMirror`
- Verify all dependencies are in the bundle

### Missing assets
- Ensure `assets/` folder exists in project root
- Check that `build_app.spec` includes the assets in `datas`

### Camera/Bluetooth permissions
- The app requests permissions on first launch
- User must grant Camera and Bluetooth permissions in System Settings

### Large file size
- Expected: 200-500 MB due to MediaPipe, OpenCV, and PyQt6
- This is normal for bundled Python applications

## Building for Different Architectures

### Intel vs Apple Silicon

**Current build**: The default `build_app.spec` builds for the architecture of the build machine.

**Options for cross-platform compatibility:**

1. **Build on Apple Silicon Mac** (Recommended - Simplest)
   - Transfer the project to your M2 Mac
   - Run `./package.sh` on the M2 Mac
   - This creates a native ARM64 build that runs optimally on Apple Silicon

2. **Universal Binary** (Build once, runs on both)
   - Requires a universal Python installation (python.org universal2 build)
   - Use `build_universal.spec` instead:
     ```bash
     pyinstaller build_universal.spec
     ```
   - Creates a larger bundle (~2x size) but works on both architectures

3. **Rosetta 2** (Intel build on Apple Silicon)
   - The Intel build will run on Apple Silicon via Rosetta 2
   - Works but with performance overhead
   - Some native libraries may have compatibility issues

**Recommendation**: Build directly on the Apple Silicon Mac for best performance.

## Distribution Checklist

Before sharing:
- [ ] Test on a clean Mac (without development environment)
- [ ] Test on the target architecture (Intel or Apple Silicon)
- [ ] Verify camera access works
- [ ] Verify Bluetooth/Polar H10 connection works
- [ ] Check that heart rate display appears correctly
- [ ] Verify pose tracking works
- [ ] Test both FaceTime and Logitech BRIO cameras

## Notes

- The app bundle is not code-signed (for App Store distribution, you'd need to add code signing)
- Gatekeeper may warn on first launch - user can right-click and select "Open"
- For production distribution, consider code signing and notarization
- Architecture: Check with `file dist/HealthCheckInMirror.app/Contents/MacOS/HealthCheckInMirror`

