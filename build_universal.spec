# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for Health Check-in Mirror System - Universal Binary.
Creates a macOS .app bundle that runs on both Intel and Apple Silicon Macs.

NOTE: This requires a universal Python installation (python.org universal2 build).
If you don't have universal Python, build on the target architecture instead.
"""

block_cipher = None

a = Analysis(
    ['src/main.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('assets', 'assets'),  # Include OBJ models and shaders
    ],
    hiddenimports=[
        # PyQt6 modules
        'PyQt6.QtCore',
        'PyQt6.QtGui',
        'PyQt6.QtWidgets',
        'PyQt6.QtMultimedia',
        'PyQt6.QtOpenGL',
        'PyQt6.QtOpenGLWidgets',
        # OpenCV
        'cv2',
        # MediaPipe
        'mediapipe',
        'mediapipe.python',
        'mediapipe.framework',
        # ModernGL
        'moderngl',
        # Trimesh
        'trimesh',
        # BLE
        'bleak',
        # NumPy
        'numpy',
        # OpenGL
        'OpenGL',
        'OpenGL.GL',
        # Standard library modules that might be needed
        'asyncio',
        'logging',
        'json',
        'pathlib',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'matplotlib',  # Not used
        'pandas',  # Not used
        'scipy',  # Not used
        'PIL',  # Not used
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='HealthCheckInMirror',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # No console window (GUI app)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch='universal2',  # Universal binary for both Intel and Apple Silicon
    codesign_identity=None,
    entitlements_file=None,
)

app = BUNDLE(
    exe,
    name='HealthCheckInMirror.app',
    icon=None,  # Can add .icns file path if you create one
    bundle_identifier='com.healthcheckinmirror.app',
    info_plist={
        'NSPrincipalClass': 'NSApplication',
        'NSHighResolutionCapable': 'True',
        'NSCameraUsageDescription': 'This app needs camera access for the health check-in mirror system.',
        'NSBluetoothAlwaysUsageDescription': 'This app needs Bluetooth access to connect to Polar H10 heart rate monitor.',
        'LSMinimumSystemVersion': '10.15',  # macOS Catalina or later
        'CFBundleShortVersionString': '1.0.0',
        'CFBundleVersion': '1.0.0',
    },
)

