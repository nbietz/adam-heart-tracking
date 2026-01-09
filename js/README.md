# Health Check-in Mirror System - JavaScript/Electron Version

This is the JavaScript/Electron migration of the Health Check-in Mirror System, designed to run natively on Apple Silicon M2/M3 processors.

## Technology Stack

- **Electron**: Desktop application framework
- **React**: UI framework
- **TypeScript**: Type safety
- **MediaPipe.js**: Pose estimation
- **Three.js**: 3D rendering
- **@abandonware/noble**: Bluetooth Low Energy

## Setup

1. Install Node.js (v18 or higher)
2. Install dependencies:
   ```bash
   npm install
   ```

## Development

```bash
npm run dev
```

This will:
- Compile TypeScript
- Start webpack dev server
- Launch Electron in development mode

## Build

```bash
npm run build
```

## Run

```bash
npm start
```

## Package for Distribution

```bash
npm run package:mac
```

This creates a macOS universal binary (Intel + Apple Silicon) in the `dist/` directory.

## Project Structure

- `src/main/`: Electron main process (Node.js)
- `src/renderer/`: React application (browser process)
- `src/renderer/services/`: Core services (camera, pose tracking, rendering, etc.)
- `src/renderer/components/`: React UI components
- `src/renderer/utils/`: Utility functions and configuration

## Notes

- The heart model should be in `assets/models/detailed-human-heart-anatomy/`
- Camera permissions may be required on macOS
- BLE permissions may be required on macOS


