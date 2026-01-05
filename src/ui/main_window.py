"""Main application window."""

from PyQt6.QtWidgets import QMainWindow, QWidget, QVBoxLayout, QPushButton, QLabel, QComboBox, QHBoxLayout, QApplication, QGraphicsDropShadowEffect
from PyQt6.QtCore import Qt, QTimer, QThread, pyqtSignal, QSize, QEvent
from PyQt6.QtGui import QImage, QPixmap, QFont, QFontMetrics, QColor
from PyQt6.QtMultimedia import QMediaDevices, QCameraDevice
import cv2
import numpy as np
import asyncio
import logging
from pathlib import Path
from typing import Optional

# Set up logging
logger = logging.getLogger(__name__)
from .opengl_widget import OpenGLWidget
from ..video.camera import Camera  # Legacy - kept for compatibility
from ..video.qt_camera import QtCamera  # New device-identity based camera
from ..video.frame_processor import FrameProcessor
from ..pose.mediapipe_tracker import MediaPipeTracker
from ..pose.chest_tracker import ChestTracker
from ..heartrate.polar_h10 import PolarH10
from ..heartrate.hr_parser import HeartRateParser
from ..heartrate.animation_controller import AnimationController
from ..utils.config import Config


class BLEThread(QThread):
    """Thread for running async BLE operations."""
    
    heart_rate_received = pyqtSignal(int)
    devices_discovered = pyqtSignal(list)  # Emit list of discovered devices
    connection_status = pyqtSignal(bool, str)  # Emit (connected, address) when connection status changes
    
    def __init__(self, parent=None):
        """Initialize BLE thread."""
        super().__init__(parent)
        self.polar_h10: Optional[PolarH10] = None
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.should_connect = False
        self.should_scan = False
        self.target_address: Optional[str] = None
    
    def run(self):
        """Run async event loop."""
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        # Create Polar H10 client
        self.polar_h10 = PolarH10(on_heart_rate=self._on_heart_rate)
        
        # Start scanning by default
        if self.should_scan:
            # Start continuous scanning in background
            self.loop.create_task(self._continuous_scan())
        
        # Connect immediately if requested
        if self.should_connect and self.target_address:
            self.loop.create_task(self._connect_to_device(self.target_address))
        
        # Keep event loop running to handle all async operations
        self.loop.run_forever()
    
    def _on_heart_rate(self, heart_rate: int):
        """Handle heart rate callback."""
        self.heart_rate_received.emit(heart_rate)
    
    async def _continuous_scan(self):
        """Continuously scan for Polar H10 devices."""
        while self.should_scan and not self.should_connect:
            try:
                devices = await self.polar_h10.scan_for_all_devices(timeout=2.0)
                if devices:
                    self.devices_discovered.emit(devices)
                await asyncio.sleep(3.0)  # Wait 3 seconds between scans
            except Exception as e:
                print(f"Error in continuous scan: {e}")
                await asyncio.sleep(3.0)
    
    async def _connect_to_device(self, address: str):
        """Connect to a specific device."""
        if await self.polar_h10.connect(address):
            # Emit connection status
            self.connection_status.emit(True, address)
            # Keep running while connected
            while self.polar_h10.is_connected:
                await asyncio.sleep(1)
            # Emit disconnection status
            self.connection_status.emit(False, address)
    
    def start_scanning(self):
        """Start continuous scanning for devices."""
        self.should_scan = True
        if not self.isRunning():
            self.start()
        else:
            # If already running, restart with scanning
            if self.loop:
                self.should_scan = True
                asyncio.run_coroutine_threadsafe(self._continuous_scan(), self.loop)
    
    def stop_scanning(self):
        """Stop continuous scanning."""
        self.should_scan = False
    
    def connect_to_device(self, address: str):
        """Connect to a specific device by address."""
        self.should_connect = True
        self.should_scan = False
        self.target_address = address
        
        # Ensure thread is running
        if not self.isRunning():
            self.start()
            # Wait a moment for thread to start and event loop to initialize
            import time
            time.sleep(0.2)
        
        # Schedule connection in the event loop
        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self._connect_to_device(address), self.loop)
        else:
            # If loop isn't running yet, wait a bit more and try again
            import time
            time.sleep(0.1)
            if self.loop and self.loop.is_running():
                asyncio.run_coroutine_threadsafe(self._connect_to_device(address), self.loop)
    
    def stop_connection(self):
        """Stop BLE connection."""
        if self.polar_h10 and self.loop and self.polar_h10.is_connected:
            # Emit disconnection status before disconnecting
            if self.polar_h10.device_address:
                self.connection_status.emit(False, self.polar_h10.device_address)
            asyncio.run_coroutine_threadsafe(self.polar_h10.disconnect(), self.loop)
    
    def stop(self):
        """Stop thread."""
        try:
            # Stop scanning first
            self.should_scan = False
            # Stop connection
            self.stop_connection()
            # Stop the event loop
            if self.loop and self.loop.is_running():
                # Cancel all pending tasks
                try:
                    pending = asyncio.all_tasks(self.loop)
                    for task in pending:
                        task.cancel()
                except Exception:
                    pass
                # Schedule loop stop
                self.loop.call_soon_threadsafe(self.loop.stop)
        except Exception as e:
            print(f"Error stopping BLE thread: {e}")
        finally:
            self.wait(2000)  # Wait up to 2 seconds for thread to finish


class MainWindow(QMainWindow):
    """Main application window."""
    
    def __init__(self):
        """Initialize main window."""
        super().__init__()
        
        self.setWindowTitle("Health Check-in Mirror System")
        # Portrait orientation - typical portrait display is 1080x1920 or similar
        self.setMinimumSize(600, 1000)
        # Make main window background transparent
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        
        # Initialize components (camera will be set after device selection)
        # Using QtCamera for device-identity based selection (not index-based)
        self.camera: Optional[QtCamera] = None
        self.frame_processor: Optional[FrameProcessor] = None
        self.pose_tracker = MediaPipeTracker()
        self.chest_tracker = ChestTracker()
        
        # Heart rate components
        self.hr_parser = HeartRateParser()
        self.animation_controller = AnimationController()
        
        # BLE thread for Polar H10
        self.ble_thread = BLEThread()
        self.ble_thread.heart_rate_received.connect(self.on_heart_rate_received)
        self.ble_thread.devices_discovered.connect(self.on_devices_discovered)
        self.ble_thread.connection_status.connect(self.on_connection_status)
        
        # Track discovered devices
        self.discovered_devices = {}  # address -> device info
        
        # Video display label - will fill height, center horizontally
        self.video_label = QLabel()
        self.video_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.video_label.setStyleSheet("background-color: transparent;")
        self.video_label.setScaledContents(False)  # We'll handle scaling manually
        # Set size policy to allow proper sizing
        from PyQt6.QtWidgets import QSizePolicy
        self.video_label.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        # Make video label transparent so overlays show through
        self.video_label.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.video_label.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        
        # OpenGL widget for 3D rendering overlay (will be positioned over video)
        # Create as separate widget, not child of video_label, so it can be properly sized
        self.opengl_widget = OpenGLWidget()
        self.opengl_widget.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        # Make widget match video label size
        self.opengl_widget.setMinimumSize(640, 480)
        # Widget will be shown after OpenGL initializes
        
        # 3D heart model loading disabled - using 2D overlay instead
        self.heart_model_path = None
        
        # Controls - styled as web buttons with bevel
        # Define button_style first so it can be used by refresh_button
        button_style = """
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #4a4a4a, stop:1 #2a2a2a);
                border: 2px solid #555;
                border-radius: 8px;
                color: white;
                padding: 12px 24px;
                font-size: 14px;
                font-weight: bold;
                min-width: 120px;
                min-height: 40px;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #5a5a5a, stop:1 #3a3a3a);
                border: 2px solid #666;
                box-shadow: 0 0 15px rgba(100, 150, 255, 0.6),
                            0 0 25px rgba(100, 150, 255, 0.4);
            }
            QPushButton:pressed {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #2a2a2a, stop:1 #4a4a4a);
                border: 2px solid #444;
                box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.5);
            }
            QPushButton:disabled {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #2a2a2a, stop:1 #1a1a1a);
                border: 2px solid #333;
                color: #666;
            }
        """
        
        self.start_button = QPushButton("Start Camera")
        self.start_button.clicked.connect(self.toggle_camera)
        self.start_button.setStyleSheet(button_style)
        
        self.stop_button = QPushButton("Stop Camera")
        self.stop_button.clicked.connect(self.stop_camera)
        self.stop_button.setEnabled(False)
        self.stop_button.setStyleSheet(button_style)
        
        # Heart rate controls
        self.disconnect_hr_button = QPushButton("Disconnect HR")
        self.disconnect_hr_button.clicked.connect(self.disconnect_heart_rate)
        self.disconnect_hr_button.setEnabled(False)
        self.disconnect_hr_button.setStyleSheet(button_style)
        
        # Camera selection - overlay buttons
        self.camera_combo = QComboBox()
        self.camera_combo.setMinimumWidth(200)
        self.camera_combo.setStyleSheet("""
            QComboBox {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #4a4a4a, stop:1 #2a2a2a);
                border: 2px solid #555;
                border-radius: 8px;
                color: white;
                padding: 8px 16px;
                font-size: 14px;
                min-width: 200px;
                min-height: 36px;
            }
            QComboBox:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #5a5a5a, stop:1 #3a3a3a);
                border: 2px solid #666;
            }
            QComboBox::drop-down {
                border: none;
            }
            QComboBox QAbstractItemView {
                background-color: #2a2a2a;
                color: white;
                selection-background-color: #4a4a4a;
            }
        """)
        self.refresh_camera_list()
        self.camera_combo.currentIndexChanged.connect(self.on_camera_selected)
        
        refresh_button = QPushButton("Refresh")
        refresh_button.clicked.connect(self.refresh_camera_list)
        refresh_button.setStyleSheet(button_style)
        
        # Heart rate display - overlay in upper left corner
        # Hospital monitor style: bright green with strong glow
        self.hr_label = QLabel("--")
        self.hr_label.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
        # Large font with hospital monitor styling
        font = QFont("Arial", 72, QFont.Weight.Bold)
        self.hr_label.setFont(font)
        # Hospital monitor green: bright cyan-green (#00FF41)
        self.hr_label.setStyleSheet("""
            QLabel {
                color: #00FF41;
                background-color: transparent;
                padding: 20px 20px 35px 20px;
            }
        """)
        
        # Create strong glow effect for hospital monitor look
        # Multiple layered glows for maximum visibility
        glow = QGraphicsDropShadowEffect()
        glow.setColor(QColor(0, 255, 65, 255))  # Bright green glow
        glow.setBlurRadius(30)  # Large blur radius for strong glow
        glow.setXOffset(0)
        glow.setYOffset(0)
        self.hr_label.setGraphicsEffect(glow)
        
        # Discovered devices list - overlay widget
        self.devices_label = QLabel("Scanning for Polar H10 devices...")
        self.devices_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.devices_label.setStyleSheet("""
            QLabel {
                color: white;
                background-color: rgba(0, 0, 0, 0.6);
                border-radius: 8px;
                padding: 8px;
                font-size: 12px;
            }
        """)
        self.devices_widget = QWidget()
        self.devices_widget.setStyleSheet("background-color: transparent;")
        self.devices_layout = QVBoxLayout()
        self.devices_layout.setContentsMargins(0, 0, 0, 0)
        self.devices_layout.setSpacing(8)
        self.devices_widget.setLayout(self.devices_layout)
        
        # Style device connect buttons
        device_button_style = button_style.replace("min-width: 120px;", "min-width: 180px;")
        
        # Layout - overlay everything on video
        central_widget = QWidget()
        central_widget.setStyleSheet("background-color: transparent;")
        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        
        # Video container fills entire window (transparent background)
        video_container = QWidget()
        video_container.setStyleSheet("background-color: transparent;")
        video_container.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        video_container_layout = QVBoxLayout()
        video_container_layout.setContentsMargins(0, 0, 0, 0)
        video_container_layout.addWidget(self.video_label)
        video_container.setLayout(video_container_layout)
        layout.addWidget(video_container)
        
        # Overlay widgets on top of video
        # Heart rate label - upper left
        self.hr_label.setParent(video_container)
        self.hr_label.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        # Raise heart rate label above video
        self.hr_label.raise_()
        
        # Control buttons container - bottom overlay
        controls_container = QWidget(video_container)
        controls_container.setStyleSheet("background-color: transparent;")
        controls_container.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        controls_layout = QVBoxLayout()
        controls_layout.setContentsMargins(20, 20, 20, 20)
        controls_layout.setSpacing(12)
        
        # Camera selection row
        camera_row = QHBoxLayout()
        camera_row.setSpacing(12)
        camera_row.addWidget(self.camera_combo)
        camera_row.addWidget(refresh_button)
        camera_row.addStretch()
        controls_layout.addLayout(camera_row)
        
        # Button row
        button_row = QHBoxLayout()
        button_row.setSpacing(12)
        button_row.addWidget(self.start_button)
        button_row.addWidget(self.stop_button)
        button_row.addWidget(self.disconnect_hr_button)
        button_row.addStretch()
        controls_layout.addLayout(button_row)
        
        # Devices section
        devices_row = QHBoxLayout()
        devices_row.addWidget(self.devices_label)
        devices_row.addStretch()
        controls_layout.addLayout(devices_row)
        controls_layout.addWidget(self.devices_widget)
        
        controls_container.setLayout(controls_layout)
        
        # CRITICAL: Set proper z-ordering - video must be behind overlays
        # First, ensure video label is at the bottom
        self.video_label.lower()
        self.video_label.stackUnder(self.hr_label)
        self.video_label.stackUnder(controls_container)
        
        # Then raise overlays above video
        self.hr_label.raise_()
        controls_container.raise_()
        
        # Force update to ensure z-ordering is applied
        QApplication.processEvents()
        
        # Add OpenGL widget as overlay (stacked on top)
        self.opengl_widget.setParent(video_container)
        self.opengl_widget.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.opengl_widget.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        self.opengl_widget.setGeometry(0, 0, 640, 480)
        self.opengl_widget.lower()  # Keep OpenGL widget behind overlays
        self.opengl_widget.show()
        QApplication.processEvents()
        self.opengl_widget.hide()
        
        central_widget.setLayout(layout)
        self.setCentralWidget(central_widget)
        
        # Store reference to video container for resize handling
        self.video_container = video_container
        self.controls_container = controls_container
        self.button_style = button_style  # Store for later use
        self.device_button_style = device_button_style  # Store for later use
        
        # Install event filters for resize handling
        self.video_container.installEventFilter(self)
        self.video_label.installEventFilter(self)
        
        # Position overlay widgets initially
        QTimer.singleShot(100, self._update_overlay_positions)  # Delay to ensure geometry is set
        
        # Start continuous scanning for Polar H10 devices
        self.ble_thread.start_scanning()
        
        # Initialize camera with first available device (if any)
        # Uses QCameraDevice (device-identity based) instead of numeric indices
        if self.camera_combo.count() > 0:
            item_data = self.camera_combo.itemData(0)
            # item_data should be a QCameraDevice object (device-identity based)
            if item_data is not None and isinstance(item_data, QCameraDevice):
                try:
                    device_name = item_data.description()
                    device_id = item_data.id()
                    logger.info(f"Initializing camera with first available device: '{device_name}' (ID: {device_id})")
                    self.camera = QtCamera(camera_device=item_data)
                    self.frame_processor = FrameProcessor(self.camera)
                    print(f"Initialized with camera: Device '{device_name}' (ID: {device_id})")
                except Exception as e:
                    logger.error(f"Error initializing camera with first device: {e}")
                    print(f"Error initializing camera: {e}")
            else:
                logger.debug("No valid camera device found in combo box for initialization")
        
        # Update timer
        self.update_timer = QTimer()
        self.update_timer.timeout.connect(self.update_frame)
        self.is_running = False
        
        # Camera view setup (will be updated based on actual camera)
        self.camera_eye = np.array([0, 0, 0], dtype=np.float32)
        self.camera_target = np.array([0, 0, -1], dtype=np.float32)
        self.camera_up = np.array([0, 1, 0], dtype=np.float32)
    
    def refresh_camera_list(self):
        """
        Refresh the list of available cameras using QMediaDevices.
        Uses device-identity based selection (QCameraDevice) instead of numeric indices.
        This ensures stable camera selection across reboots and hot-plugging on macOS.
        """
        self.camera_combo.clear()
        
        try:
            # Get cameras using Qt's QMediaDevices (device-identity based, not index-based)
            devices = QMediaDevices.videoInputs()
            
            if not devices:
                self.camera_combo.addItem("No cameras found", None)
                self.camera_combo.setEnabled(False)
                logger.warning("No Qt camera devices found")
            else:
                logger.info(f"Enumerating {len(devices)} camera devices:")
                
                # Filter to only FaceTime and Logitech BRIO (as per requirements)
                target_devices = []
                for device in devices:
                    device_name = device.description()
                    device_id = device.id()
                    
                    # Filter: Only include FaceTime and Logitech BRIO
                    is_facetime = "FaceTime" in device_name and "Built-in" in device_name
                    is_logitech_brio = "Logitech" in device_name and "BRIO" in device_name
                    
                    if is_facetime or is_logitech_brio:
                        target_devices.append(device)
                        logger.info(f"  Found target device: '{device_name}' (ID: {device_id})")
                
                if not target_devices:
                    self.camera_combo.addItem("No target cameras found (FaceTime/Logitech BRIO)", None)
                    self.camera_combo.setEnabled(False)
                    logger.warning("FaceTime HD Camera or Logitech BRIO not found")
                else:
                    # Add each QCameraDevice to the combo box
                    # Store the QCameraDevice object itself as itemData (device-identity based)
                    for device in target_devices:
                        device_name = device.description()
                        device_id = device.id()
                        
                        # Display name for user
                        display_name = device_name
                        
                        # Store QCameraDevice object as itemData (this is the source of truth)
                        # This ensures we use device identity, not numeric indices
                        self.camera_combo.addItem(display_name, device)
                        logger.info(f"  Added to UI: '{device_name}' (ID: {device_id})")
                    
                    self.camera_combo.setEnabled(True)
                    logger.info(f"Camera list refreshed: {len(target_devices)} devices available")
                    
        except Exception as e:
            logger.error(f"Error refreshing camera list: {e}")
            import traceback
            traceback.print_exc()
            self.camera_combo.addItem("Error enumerating cameras", None)
            self.camera_combo.setEnabled(False)
    
    def on_camera_selected(self, index: int):
        """
        Handle camera selection change.
        Uses QCameraDevice (device-identity based) instead of numeric indices.
        This ensures the selected label always matches the actual camera opened.
        """
        if self.camera_combo.count() == 0:
            return
        
        # Get the QCameraDevice object stored in the combo box itemData
        # This is the source of truth - device identity, not numeric index
        camera_device: QCameraDevice = self.camera_combo.itemData(index)
        
        if camera_device is None:
            logger.warning("No camera device selected")
            return
        
        # Get device info for logging
        device_name = camera_device.description()
        device_id = camera_device.id()
        
        logger.info(f"Camera selection changed: '{device_name}' (ID: {device_id})")
        print(f"Selected camera: '{device_name}' (ID: {device_id})")
        
        # Stop current camera if running
        if self.is_running:
            self.stop_camera()
        
        # Close old camera if exists
        if self.camera is not None:
            self.camera.close()
        
        # Create new QtCamera instance using the QCameraDevice
        # This uses device identity, not numeric indices, ensuring stable selection
        try:
            logger.info(f"Creating QtCamera instance for device: '{device_name}' (ID: {device_id})")
            print(f"Creating camera instance: '{device_name}' (ID: {device_id})")
            
            self.camera = QtCamera(camera_device=camera_device)
            self.frame_processor = FrameProcessor(self.camera)
            
            logger.info(f"Camera instance created successfully: '{device_name}' (ID: {device_id})")
            print(f"Camera instance created: '{device_name}' (ID: {device_id})")
            
            # Log verification: selected device matches what will be opened
            logger.info(
                f"VERIFICATION: Selected device '{device_name}' (ID: {device_id}) "
                f"will be opened using QCameraDevice (device-identity based, not index-based)"
            )
            
        except Exception as e:
            logger.error(f"Error creating camera instance: {e}")
            import traceback
            traceback.print_exc()
            print(f"Error creating camera: {e}")
    
    def toggle_camera(self):
        """Start or stop camera."""
        if not self.is_running:
            self.start_camera()
        else:
            self.stop_camera()
    
    def start_camera(self):
        """Start camera capture."""
        print("DEBUG: start_camera() called")
        if self.camera is None:
            print("Error: No camera selected")
            logger.warning("Cannot start camera: no camera device selected")
            return
        
        # Log which device is being opened (device-identity based)
        if hasattr(self.camera, 'camera_device'):
            device_name = self.camera.camera_device.description()
            device_id = self.camera.camera_device.id()
            logger.info(f"Opening camera device: '{device_name}' (ID: {device_id})")
            print(f"Opening camera: '{device_name}' (ID: {device_id})")
        
        if not self.camera.open():
            device_info = "unknown"
            if hasattr(self.camera, 'camera_device'):
                device_info = f"'{self.camera.camera_device.description()}' (ID: {self.camera.camera_device.id()})"
            print(f"Error: Could not open camera device {device_info}")
            logger.error(f"Failed to open camera device: {device_info}")
            print("Try selecting a different camera from the dropdown")
            return
        
        print("DEBUG: Camera opened successfully, starting update timer")
        
        # Setup camera view
        # MediaPipe uses Z-up coordinate system, camera at origin looking forward
        width, height = self.camera.get_resolution()
        self.camera_eye = np.array([0, 0, 0], dtype=np.float32)  # Camera at origin
        self.camera_target = np.array([0, 0, -1], dtype=np.float32)  # Looking forward (negative Z)
        self.camera_up = np.array([0, 1, 0], dtype=np.float32)  # Y-up for OpenGL view
        
        self.is_running = True
        self.start_button.setEnabled(False)
        self.stop_button.setEnabled(True)
        self.update_timer.start(33)  # ~30 FPS
        print("DEBUG: Update timer started")
        
        # Load heart model if available and OpenGL context is ready (non-blocking)
        # Force OpenGL widget to initialize if not already done (needed for 2D overlay)
        if self.opengl_widget.overlay_engine is None or not hasattr(self.opengl_widget, '_initialized') or not self.opengl_widget._initialized:
            print("OpenGL overlay engine not initialized yet, forcing initialization...")
            # Make widget visible and force an update to trigger initializeGL
            self.opengl_widget.show()
            self.opengl_widget.update()
            # Process events to allow initializeGL to be called
            from PyQt6.QtWidgets import QApplication
            QApplication.processEvents()
            # Give it a moment for OpenGL to initialize
            QTimer.singleShot(100, lambda: None)
            QApplication.processEvents()
            
            # Debug: check if overlay engine was created
            if self.opengl_widget.overlay_engine is None:
                print("ERROR: Overlay engine still not initialized after forcing initialization")
            else:
                print("Overlay engine initialized successfully")
    
    def stop_camera(self):
        """Stop camera capture."""
        self.is_running = False
        self.update_timer.stop()
        self.camera.close()
        self.start_button.setEnabled(True)
        self.stop_button.setEnabled(False)
        self.video_label.clear()
        self.opengl_widget.set_frame(None)
    
    def update_frame(self):
        """Update video frame display."""
        if not self.is_running:
            return
        
        # Get frame from camera
        success, frame = self.camera.read()
        if not success or frame is None:
            return
        
        if frame.size == 0:
            return
        
        # Debug: Print frame info occasionally (first frame only)
        if not hasattr(self, '_first_frame_logged'):
            print(f"DEBUG: First frame received: {frame.shape}, dtype: {frame.dtype}")
            self._first_frame_logged = True
        
        # Process pose estimation - get both normalized and world landmarks
        normalized_landmarks = self.pose_tracker.process(frame)
        world_landmarks = self.pose_tracker.get_world_landmarks(frame)
        
        # Track chest using simplified 2D tracking
        if normalized_landmarks:
            try:
                # Get frame dimensions
                height, width = frame.shape[:2]
                
                # Get 2D chest position in screen coordinates
                chest_pos_2d = self.chest_tracker.get_chest_position_2d(
                    normalized_landmarks, width, height
                )
                
                if chest_pos_2d is not None:
                    # Set chest position for simple circle overlay
                    if self.opengl_widget.overlay_engine is not None:
                        self.opengl_widget.overlay_engine.set_chest_position_2d(
                            int(chest_pos_2d[0]), int(chest_pos_2d[1])
                        )
                else:
                    # Clear chest position if tracking fails
                    if self.opengl_widget.overlay_engine is not None:
                        self.opengl_widget.overlay_engine.chest_position_2d = None
            except Exception as e:
                print(f"Error tracking chest: {e}")
                import traceback
                traceback.print_exc()
                # Continue without heart overlay if tracking fails
        else:
            # No pose detected - clear heart position
            if self.opengl_widget.overlay_engine is not None:
                self.opengl_widget.overlay_engine.chest_position_2d = None
        
        # Update heart beat animation (only if we have valid BPM data)
        if not self.hr_parser.is_stale():
            beat_scale = self.animation_controller.get_beat_scale()
            # Update both 3D renderer (for future use) and 2D overlay
            self.opengl_widget.set_heart_beat_scale(beat_scale)
            if self.opengl_widget.overlay_engine is not None:
                self.opengl_widget.overlay_engine.set_beat_scale(beat_scale)
        else:
            # No heart rate data, use normal scale
            self.opengl_widget.set_heart_beat_scale(1.0)
            if self.opengl_widget.overlay_engine is not None:
                self.opengl_widget.overlay_engine.set_beat_scale(1.0)
        
        # Composite video with simple circle overlay
        frame_to_display = frame
        if self.opengl_widget.overlay_engine is not None:
            try:
                # Composite the video frame with the simple circle overlay
                composited = self.opengl_widget.overlay_engine.composite_frame(frame)
                if composited is not None:
                    frame_to_display = composited
                else:
                    # Debug: overlay returned None
                    if not hasattr(self, '_overlay_none_warned'):
                        print("WARNING: overlay_engine.composite_frame() returned None")
                        self._overlay_none_warned = True
            except Exception as e:
                print(f"Error compositing frame: {e}")
                import traceback
                traceback.print_exc()
                # Fall back to raw video if compositing fails
                frame_to_display = frame
        else:
            # Debug: overlay engine not initialized
            if not hasattr(self, '_overlay_missing_warned'):
                print("WARNING: overlay_engine is None - overlay not initialized")
                self._overlay_missing_warned = True
        
        # Display video frame in label
        try:
            height, width = frame_to_display.shape[:2]
            if width == 0 or height == 0:
                print(f"Warning: Invalid frame dimensions: {width}x{height}")
                return
            
            rgb_frame = cv2.cvtColor(frame_to_display, cv2.COLOR_BGR2RGB)
            q_image = QImage(
                rgb_frame.data,
                width,
                height,
                rgb_frame.strides[0],
                QImage.Format.Format_RGB888
            )
            
            if q_image.isNull():
                print("Warning: Failed to create QImage from frame")
                return
            
            pixmap = QPixmap.fromImage(q_image)
            
            if pixmap.isNull():
                print("Warning: Failed to create QPixmap from QImage")
                return
            
            # Scale video to fill height, center horizontally (crop left/right edges)
            label_size = self.video_label.size()
            if label_size.width() > 0 and label_size.height() > 0:
                # Calculate scaling to fill height exactly
                pixmap_height = pixmap.height()
                pixmap_width = pixmap.width()
                
                if pixmap_height > 0 and pixmap_width > 0:
                    # Scale to fill height exactly (maintaining aspect ratio)
                    # This will make the width wider if needed, and QLabel will center it
                    scaled_pixmap = pixmap.scaledToHeight(
                        label_size.height(),
                        Qt.TransformationMode.SmoothTransformation
                    )
                    
                    # Set pixmap - QLabel with AlignCenter will center it horizontally
                    # If scaled width > label width, left/right edges will be cropped
                    self.video_label.setPixmap(scaled_pixmap)
                    # Ensure alignment is center (already set, but make sure)
                    self.video_label.setAlignment(Qt.AlignmentFlag.AlignCenter | Qt.AlignmentFlag.AlignTop)
                else:
                    # Fallback to normal scaling
                    scaled_pixmap = pixmap.scaled(
                        label_size,
                        Qt.AspectRatioMode.KeepAspectRatio,
                        Qt.TransformationMode.SmoothTransformation
                    )
                    self.video_label.setPixmap(scaled_pixmap)
                
                # CRITICAL: Keep video behind overlays on every frame update
                self._ensure_video_behind_overlays()
                
                # Update OpenGL widget position to match video label (only if visible and ready)
                # But keep it hidden - we're compositing in the video label instead
                if self.opengl_widget.isVisible() and self.opengl_widget.overlay_engine is not None:
                    # Hide the OpenGL widget - we're compositing directly into the video
                    self.opengl_widget.hide()
            else:
                # Label not sized yet, just set the pixmap directly
                self.video_label.setPixmap(pixmap)
                # Still ensure proper z-ordering
                self._ensure_video_behind_overlays()
        except Exception as e:
            print(f"Error displaying video frame: {e}")
            import traceback
            traceback.print_exc()
        
        # Update OpenGL overlay with the same frame (for 3D heart rendering)
        # The overlay engine will render the 3D heart, then we composite it
        self.opengl_widget.set_frame(frame)
    
    def on_heart_rate_received(self, heart_rate: int):
        """
        Handle heart rate data received from BLE.
        Each notification represents a heartbeat, so trigger a pulse animation.
        
        Args:
            heart_rate: Heart rate in BPM
        """
        try:
            # Validate heart rate (reasonable range: 30-220 BPM)
            if heart_rate < 30 or heart_rate > 220:
                return
            
            # Parse and smooth heart rate
            bpm = self.hr_parser.update(heart_rate)
            
            # Update animation controller with BPM
            self.animation_controller.update_bpm(bpm)
            
            # Trigger a heartbeat pulse animation on each notification
            # Each notification from H10 represents an actual heartbeat
            self.animation_controller.trigger_heartbeat()
            
            # Update UI - just show the number
            self.hr_label.setText(f"{bpm}")
        except Exception as e:
            print(f"Error processing heart rate: {e}")
    
    def on_devices_discovered(self, devices: list):
        """Handle discovered devices."""
        # Update discovered devices
        for device in devices:
            address = device['address']
            if address not in self.discovered_devices:
                self.discovered_devices[address] = device
                # Add button for this device
                device_button = QPushButton(f"Connect: {device['name']}")
                device_button.device_address = address  # Store address for later reference
                device_button.clicked.connect(lambda checked, addr=address: self.connect_to_device(addr))
                # Style device buttons using stored style
                if hasattr(self, 'device_button_style'):
                    device_button.setStyleSheet(self.device_button_style)
                self.devices_layout.addWidget(device_button)
        
        # Update label
        if devices:
            self.devices_label.setText(f"Found {len(self.discovered_devices)} Polar H10 device(s)")
        else:
            self.devices_label.setText("Scanning for Polar H10 devices...")
    
    def connect_to_device(self, address: str):
        """Connect to a specific Polar H10 device."""
        self.ble_thread.connect_to_device(address)
        self.devices_label.setText(f"Connecting to device...")
    
    def on_connection_status(self, connected: bool, address: str):
        """Handle connection status changes."""
        if connected:
            self.disconnect_hr_button.setEnabled(True)
            device_name = self.discovered_devices.get(address, {}).get('name', 'Polar H10')
            self.devices_label.setText(f"Connected to {device_name}")
            # Hide/disable connect buttons for this device
            for i in range(self.devices_layout.count()):
                widget = self.devices_layout.itemAt(i).widget()
                if widget and hasattr(widget, 'device_address') and widget.device_address == address:
                    widget.setEnabled(False)
                    widget.setText(f"✓ Connected: {device_name}")
        else:
            self.disconnect_hr_button.setEnabled(False)
            self.devices_label.setText("Scanning for Polar H10 devices...")
            # Re-enable connect buttons
            for i in range(self.devices_layout.count()):
                widget = self.devices_layout.itemAt(i).widget()
                if widget and hasattr(widget, 'device_address') and widget.device_address == address:
                    device_name = self.discovered_devices.get(address, {}).get('name', 'Polar H10')
                    widget.setEnabled(True)
                    widget.setText(f"Connect: {device_name}")
    
    def _ensure_video_behind_overlays(self):
        """Ensure video label stays behind overlay widgets."""
        if hasattr(self, 'video_label') and hasattr(self, 'hr_label') and hasattr(self, 'controls_container'):
            # Use stackUnder to explicitly set video behind overlays
            self.video_label.stackUnder(self.hr_label)
            self.video_label.stackUnder(self.controls_container)
            # Also lower it to be safe
            self.video_label.lower()
            # Raise overlays
            self.hr_label.raise_()
            self.controls_container.raise_()
    
    def _update_overlay_positions(self):
        """Update positions of overlay widgets."""
        if not hasattr(self, 'video_container'):
            return
        
        container_rect = self.video_container.geometry()
        if container_rect.width() == 0 or container_rect.height() == 0:
            return
        
        # Calculate controls height
        controls_height = self.controls_container.sizeHint().height()
        if controls_height == 0:
            controls_height = 200  # Default height
        
        # Position controls container at bottom (always visible)
        self.controls_container.setGeometry(
            0,
            container_rect.height() - controls_height,
            container_rect.width(),
            controls_height
        )
        
        # Position video label to fill remaining space (above controls)
        video_label_height = container_rect.height() - controls_height
        self.video_label.setGeometry(
            0,
            0,
            container_rect.width(),
            video_label_height
        )
        
        # Position heart rate label in upper left (over video)
        # Increased height to prevent bottom cutoff, extra padding at bottom
        self.hr_label.setGeometry(20, 20, 300, 140)
        
        # Ensure proper z-ordering: video at bottom, overlays on top
        self._ensure_video_behind_overlays()
        
        # Position OpenGL widget to match video label
        self.opengl_widget.setGeometry(self.video_label.geometry())
    
    def eventFilter(self, obj, event):
        """Handle resize events for video container."""
        if obj == self.video_container and event.type() == QEvent.Type.Resize:
            # Update overlay positions
            self._update_overlay_positions()
        elif obj == self.video_label and event.type() == QEvent.Type.Resize:
            # Update OpenGL widget geometry to match video label
            if self.opengl_widget.isVisible():
                self.opengl_widget.setGeometry(self.video_label.geometry())
        return super().eventFilter(obj, event)
    
    def disconnect_heart_rate(self):
        """Stop heart rate monitoring."""
        self.ble_thread.stop_connection()
        self.disconnect_hr_button.setEnabled(False)
        self.hr_parser.reset()
        self.animation_controller.reset()
        self.hr_label.setText("--")
        self.devices_label.setText("Scanning for Polar H10 devices...")
    
    def closeEvent(self, event):
        """Handle window close event."""
        try:
            # Stop update timer first to prevent new frame processing
            if hasattr(self, 'update_timer') and self.update_timer.isActive():
                self.update_timer.stop()
            
            # Stop camera
            if self.camera is not None:
                try:
                    self.camera.close()
                except Exception as e:
                    print(f"Error closing camera: {e}")
            
            # Stop heart rate monitoring and disconnect
            try:
                self.disconnect_heart_rate()
            except Exception as e:
                print(f"Error disconnecting heart rate: {e}")
            
            # Stop BLE thread gracefully
            if self.ble_thread.isRunning():
                try:
                    # Stop scanning
                    self.ble_thread.stop_scanning()
                    # Disconnect if connected
                    self.ble_thread.stop_connection()
                    # Stop the event loop
                    if self.ble_thread.loop and self.ble_thread.loop.is_running():
                        self.ble_thread.loop.call_soon_threadsafe(self.ble_thread.loop.stop)
                    # Quit the thread
                    self.ble_thread.quit()
                    # Wait for thread to finish (with timeout)
                    if not self.ble_thread.wait(2000):  # 2 second timeout
                        print("Warning: BLE thread did not finish in time")
                        self.ble_thread.terminate()  # Force terminate if needed
                        self.ble_thread.wait(1000)
                except Exception as e:
                    print(f"Error stopping BLE thread: {e}")
                    import traceback
                    traceback.print_exc()
            
            # Close pose tracker
            try:
                if hasattr(self.pose_tracker, 'close'):
                    self.pose_tracker.close()
            except Exception as e:
                print(f"Error closing pose tracker: {e}")
            
            # Give a moment for cleanup
            from PyQt6.QtWidgets import QApplication
            QApplication.processEvents()
            
        except Exception as e:
            print(f"Error during cleanup: {e}")
            import traceback
            traceback.print_exc()
        
        event.accept()

