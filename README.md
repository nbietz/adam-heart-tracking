# Health Check-in Mirror System

A real-time health check-in mirror system that displays a mirrored webcam feed with a 3D heart model tracked to the user's chest, animated by real-time heart rate data from a Polar H10 monitor.

## Features

- Real-time video mirroring with horizontal flip
- MediaPipe pose estimation for body tracking
- 3D heart model overlay on chest with 6DOF tracking (position + rotation)
- Real-time heart rate visualization from Polar H10 Bluetooth monitor
- Heart beat animation synchronized with actual heart rate

## Requirements

- Python 3.8+
- macOS (primary) or Windows
- Logitech Brio webcam (or compatible USB webcam)
- Polar H10 heart rate monitor (Bluetooth)

## Installation

1. Create a virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Heart model files should be in `assets/models/detailed-human-heart-anatomy/`:
   - `[OBJ] human_heart_midpoly_obj/human_heart_midpoly_obj.obj` (used as low-poly, recommended for performance)
   - `[OBJ] human_heart_highpoly_obj/human_heart_highpoly_obj.obj` (used as high-poly, optional)
   - Texture files are in `Extras/` directory (optional, for future texture support)

## Usage

**Important:** Always activate the virtual environment before running the application:

```bash
source venv/bin/activate  # On Windows: venv\Scripts\activate
python src/main.py
```

Or in one command:
```bash
source venv/bin/activate && python src/main.py
```

## Packaging for Distribution

To create a standalone macOS application bundle (.app) for distribution:

```bash
./package.sh
```

This will create `dist/HealthCheckInMirror.app` which can be shared with other Macs.

**See [PACKAGING.md](PACKAGING.md) for detailed packaging instructions.**

## Project Structure

```
adam-heart-tracking/
├── src/                    # Source code
│   ├── main.py            # Application entry point
│   ├── video/             # Video capture and processing
│   ├── pose/              # Pose estimation
│   ├── rendering/         # 3D rendering
│   ├── heartrate/         # Heart rate monitoring
│   ├── ui/                # User interface
│   └── utils/             # Utilities
├── assets/                # Assets (models, shaders)
└── requirements.txt       # Python dependencies
```

## Development

The project is organized into three phases:

1. **Phase 1**: Video mirroring and pose tracking
2. **Phase 2**: 3D heart model rendering and tracking
3. **Phase 3**: Heart rate integration and animation

## Cross-Platform Development (Intel + Apple Silicon)

If you're developing on an Intel Mac but need to test/build on an Apple Silicon Mac:

1. **Set up file sharing** (see [SYNC_SETUP.md](SYNC_SETUP.md))
2. **Sync code from Intel Mac**:
   ```bash
   ./sync_to_m2.sh
   ```
3. **Build on M2 Mac**:
   ```bash
   ./build_on_m2.sh
   ```

This keeps build artifacts (`venv/`, `build/`, `dist/`) separate on each machine while syncing source code.

**See [SYNC_SETUP.md](SYNC_SETUP.md) for detailed setup instructions.**

## License

MIT

