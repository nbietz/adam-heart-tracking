# Camera Access Debugging

## Root Cause Analysis

The camera wasn't showing up due to **two critical missing pieces**:

### 1. Missing Info.plist Configuration
- **Problem**: macOS requires `NSCameraUsageDescription` in the app's Info.plist to even prompt for camera access
- **Fix**: Added `extendInfo` section to `package.json` with camera permission descriptions
- **Note**: This only applies when the app is packaged. In development, Electron uses its own bundle.

### 2. Missing Permission Handlers
- **Problem**: Electron needs explicit permission handlers to grant camera/microphone access
- **Fix**: Added `setPermissionRequestHandler` and `setPermissionCheckHandler` in `main.ts`
- **Critical**: These handlers must be set up BEFORE any windows are created

## Changes Made

### `js/package.json`
- Added `extendInfo` section with:
  - `NSCameraUsageDescription`
  - `NSBluetoothAlwaysUsageDescription`
  - `NSMicrophoneUsageDescription`

### `js/src/main/main.ts`
- Imported `session` and `systemPreferences` from Electron
- Created `setupPermissions()` async function that:
  - **On macOS**: Explicitly requests camera permission using `systemPreferences.askForMediaAccess('camera')`
    - This triggers the macOS permission dialog
    - Checks current status first to avoid unnecessary prompts
  - Sets up `setPermissionRequestHandler` to auto-grant `"media"` permissions
    - **Important**: Electron uses `"media"` (not `"camera"`/`"microphone"`) as the permission type
  - Sets up `setPermissionCheckHandler` for logging
- Called `await setupPermissions()` BEFORE `createWindow()` in `app.whenReady()`

## Critical Fix: Permission Type

**Electron uses `"media"` as the permission type**, not separate `"camera"` and `"microphone"` permissions. This was causing TypeScript errors and the permission handlers weren't working correctly.

## Testing Steps

1. **Restart the dev server** (the permission handlers are set up at app startup)
2. **Check console logs** for:
   - `[Main] Permission handlers configured`
   - `[Main] Permission requested: camera`
   - `[Main] ✓ Granting camera permission`
3. **Check renderer logs** for:
   - `getDevices: Camera permission granted`
   - `getDevices: Total devices found: X`
   - `getDevices: Found video device: ...`

## macOS System Permissions

Even with these fixes, macOS may still require:
1. **System Settings → Privacy & Security → Camera**
   - Ensure Electron (or your app) has camera access
   - If denied, you may need to reset permissions:
     ```bash
     tccutil reset Camera com.github.Electron
     ```

2. **For Development Mode**:
   - The Electron.app bundle needs camera permissions
   - Check: System Settings → Privacy & Security → Camera → Electron
   - **Important**: In development, Electron uses its own bundle which may not have `NSCameraUsageDescription` in Info.plist
   - The `askForMediaAccess('camera')` call should still work and trigger the permission dialog
   - If no dialog appears, check console logs for permission status

## If Still Not Working

1. **Check if camera works in other apps** (FaceTime, Photo Booth)
2. **Check System Settings** for camera permissions
3. **Try the direct browser API test** (the "Request Permission & Refresh" button in Controls)
4. **Check console logs** for any permission errors
5. **Verify the camera is not in use** by another application

## Next Steps

If cameras still don't appear after these fixes:
- The issue may be with the camera enumeration itself
- Check if `enumerateDevices()` is returning devices but without labels
- Verify the camera service is being called correctly
- Check React state updates are working

