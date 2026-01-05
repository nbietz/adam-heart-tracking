"""
Qt-based camera capture using QCameraDevice for device-identity based selection.
This replaces index-based camera selection with device-identity based selection,
which is stable across reboots and hot-plugging on macOS.
"""

import cv2
import numpy as np
import logging
from typing import Optional, Tuple
from ..utils.config import Config

# Set up logging
logger = logging.getLogger(__name__)

# Import Qt multimedia components
try:
    from PyQt6.QtMultimedia import QCamera, QCameraDevice, QMediaCaptureSession, QVideoSink
    from PyQt6.QtCore import QObject, pyqtSignal, QSize
    from PyQt6.QtGui import QImage
    QT_MULTIMEDIA_AVAILABLE = True
except ImportError:
    QT_MULTIMEDIA_AVAILABLE = False
    logger.error("Qt Multimedia not available - cannot use QtCamera")


class QtCamera(QObject):
    """
    Camera wrapper using Qt's QCamera with QCameraDevice for device-identity based selection.
    Converts Qt video frames to OpenCV format (numpy arrays) for compatibility with existing pipeline.
    
    This class ensures that camera selection is based on device identity (QCameraDevice.id())
    rather than numeric indices, which are not stable on macOS.
    """
    
    def __init__(self, camera_device: QCameraDevice = None, width: int = None, height: int = None):
        """
        Initialize Qt-based camera capture.
        
        Args:
            camera_device: QCameraDevice instance (source of truth for device identity)
            width: Video width (default from config)
            height: Video height (default from config)
        """
        super().__init__()
        
        if not QT_MULTIMEDIA_AVAILABLE:
            raise RuntimeError("Qt Multimedia not available")
        
        if camera_device is None:
            raise ValueError("camera_device must be provided - cannot use numeric indices")
        
        self.camera_device = camera_device
        self.width = width if width is not None else Config.VIDEO_WIDTH
        self.height = height if height is not None else Config.VIDEO_HEIGHT
        self.mirror = Config.MIRROR_HORIZONTAL
        
        # Qt camera components
        self.camera: Optional[QCamera] = None
        self.capture_session: Optional[QMediaCaptureSession] = None
        self.video_sink: Optional[QVideoSink] = None
        
        # Frame storage (latest frame from video sink)
        self.latest_frame: Optional[np.ndarray] = None
        self.frame_ready = False
        
        # Device info for logging
        device_id = self.camera_device.id()
        device_name = self.camera_device.description()
        logger.info(
            f"QtCamera initialized: device='{device_name}' "
            f"(ID: {device_id}), resolution={self.width}x{self.height}"
        )
    
    def open(self) -> bool:
        """
        Open camera using the QCameraDevice.
        This uses device identity, not numeric indices, ensuring stable selection.
        """
        if self.camera is not None:
            self.close()
        
        device_name = self.camera_device.description()
        device_id = self.camera_device.id()
        logger.info(f"Opening Qt camera: device='{device_name}' (ID: {device_id})")
        
        try:
            # Create QCamera with the QCameraDevice (device-identity based, not index-based)
            self.camera = QCamera(self.camera_device)
            
            # Create capture session
            self.capture_session = QMediaCaptureSession()
            self.capture_session.setCamera(self.camera)
            
            # Create video sink to receive frames
            self.video_sink = QVideoSink()
            self.video_sink.videoFrameChanged.connect(self._on_video_frame)
            self.capture_session.setVideoSink(self.video_sink)
            
            # Set camera format/resolution if possible
            # Note: QCameraDevice may have format constraints
            formats = self.camera_device.videoFormats()
            if formats:
                # Try to find a format matching our desired resolution
                best_format = None
                for fmt in formats:
                    res = fmt.resolution()
                    if res.width() == self.width and res.height() == self.height:
                        best_format = fmt
                        break
                    elif res.width() >= self.width and res.height() >= self.height:
                        if best_format is None or res.width() < best_format.resolution().width():
                            best_format = fmt
                
                if best_format:
                    self.camera.setCameraFormat(best_format)
                    actual_res = best_format.resolution()
                    self.width = actual_res.width()
                    self.height = actual_res.height()
                    logger.info(f"Set camera format: {self.width}x{self.height}")
                else:
                    # Use first available format
                    self.camera.setCameraFormat(formats[0])
                    actual_res = formats[0].resolution()
                    self.width = actual_res.width()
                    self.height = actual_res.height()
                    logger.info(f"Using default format: {self.width}x{self.height}")
            
            # Start camera
            self.camera.start()
            
            # Verify camera is active
            if self.camera.isActive():
                logger.info(f"Qt camera opened successfully: '{device_name}' (ID: {device_id})")
                return True
            else:
                logger.error(f"Qt camera failed to start: '{device_name}'")
                return False
                
        except Exception as e:
            logger.error(f"Error opening Qt camera: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def _on_video_frame(self, frame):
        """
        Callback when a new video frame is available from Qt.
        Converts Qt QVideoFrame to OpenCV format (numpy array).
        """
        try:
            # Convert QVideoFrame to QImage
            image = frame.toImage()
            if image.isNull():
                return
            
            # Convert QImage to numpy array (BGR format for OpenCV)
            width = image.width()
            height = image.height()
            
            # Convert QImage to RGB888 format first
            rgb_image = image.convertToFormat(QImage.Format.Format_RGB888)
            if rgb_image.isNull():
                return
            
            # Get image data as bytes
            ptr = rgb_image.bits()
            ptr.setsize(rgb_image.sizeInBytes())
            
            # Create numpy array from bytes (RGB format)
            arr = np.frombuffer(ptr, dtype=np.uint8).reshape((height, width, 3))
            
            # Convert RGB to BGR (OpenCV format)
            bgr_frame = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
            
            # Apply horizontal mirroring if enabled
            if self.mirror:
                bgr_frame = cv2.flip(bgr_frame, 1)
            
            # Store latest frame
            self.latest_frame = bgr_frame
            self.frame_ready = True
            
        except Exception as e:
            logger.debug(f"Error converting Qt frame to OpenCV format: {e}")
            import traceback
            traceback.print_exc()
    
    def read(self) -> Tuple[bool, Optional[np.ndarray]]:
        """
        Read a frame from the camera.
        Returns the latest frame received from Qt's video sink.
        
        Returns:
            Tuple of (success, frame). Frame is None on failure.
        """
        if self.camera is None or not self.camera.isActive():
            return False, None
        
        if not self.frame_ready or self.latest_frame is None:
            return False, None
        
        # Return latest frame and reset ready flag
        frame = self.latest_frame.copy()
        self.frame_ready = False
        
        return True, frame
    
    def close(self):
        """Close camera connection."""
        if self.camera is not None:
            self.camera.stop()
            self.camera = None
        
        if self.capture_session is not None:
            self.capture_session = None
        
        if self.video_sink is not None:
            self.video_sink = None
        
        self.latest_frame = None
        self.frame_ready = False
        logger.info("Qt camera closed")
    
    def get_resolution(self) -> Tuple[int, int]:
        """Get current video resolution."""
        return (self.width, self.height)
    
    def is_open(self) -> bool:
        """Check if camera is open and active."""
        return self.camera is not None and self.camera.isActive()
    
    def __enter__(self):
        """Context manager entry."""
        self.open()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()

