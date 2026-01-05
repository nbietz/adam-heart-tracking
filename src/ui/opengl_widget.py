"""OpenGL widget for 3D rendering overlay."""

from PyQt6.QtOpenGLWidgets import QOpenGLWidget
from PyQt6.QtOpenGL import QOpenGLVersionProfile
from PyQt6.QtGui import QImage, QPainter, QSurfaceFormat
from PyQt6.QtCore import Qt, QTimer
import numpy as np
import cv2
import moderngl
from typing import Optional
from ..rendering.overlay_engine import OverlayEngine


class OpenGLWidget(QOpenGLWidget):
    """OpenGL widget for rendering video and 3D overlays."""
    
    def __init__(self, parent=None):
        """Initialize OpenGL widget."""
        # Set OpenGL format to request 4.1 Core profile
        format = QSurfaceFormat()
        format.setVersion(4, 1)  # Request OpenGL 4.1
        format.setProfile(QSurfaceFormat.OpenGLContextProfile.CoreProfile)
        format.setSamples(4)  # 4x MSAA for smoother rendering
        format.setSwapBehavior(QSurfaceFormat.SwapBehavior.DoubleBuffer)
        format.setDepthBufferSize(24)  # 24-bit depth buffer
        
        # Must call super().__init__() first, then set format
        super().__init__(parent)
        self.setFormat(format)
        
        # Make widget transparent so video shows through
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        
        self.current_frame: Optional[np.ndarray] = None
        self.overlay_engine: Optional[OverlayEngine] = None
        self.ctx: Optional[moderngl.Context] = None
        self._initialized = False
        
        # Setup update timer
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.update)
        self.timer.start(33)  # ~30 FPS
    
    def initializeGL(self):
        """Initialize OpenGL context."""
        try:
            # Get the Qt OpenGL context
            qt_context = self.context()
            if qt_context is None:
                print("Error: No Qt OpenGL context available")
                return
            
            # For QOpenGLWidget, the context is already current in initializeGL()
            # The context is automatically made current when initializeGL() is called
            
            # Check what version we actually got (PyQt6 compatible way)
            try:
                # Try to get version info from format
                format = qt_context.format()
                major = format.majorVersion()
                minor = format.minorVersion()
                profile = format.profile()
                profile_name = "Core" if profile == QSurfaceFormat.OpenGLContextProfile.CoreProfile else "Compatibility"
                print(f"OpenGL Version: {major}.{minor} ({profile_name} Profile)")
            except Exception as e:
                print(f"Could not get OpenGL version info: {e}")
                print("Continuing with default OpenGL context...")
            
            # Create ModernGL context from existing Qt context
            # ModernGL can use the existing OpenGL context from QOpenGLWidget
            try:
                # Try to create ModernGL context that shares with Qt's context
                # The context should already be current in initializeGL()
                self.ctx = moderngl.create_context(require=330)  # ModernGL needs at least 3.3
                print(f"ModernGL context created, version: {self.ctx.version_code // 100}.{(self.ctx.version_code % 100) // 10}")
            except (ValueError, Exception) as e1:
                try:
                    # Try without version requirement
                    self.ctx = moderngl.create_context()
                    if self.ctx:
                        print(f"ModernGL context created (no version requirement), version: {self.ctx.version_code // 100}.{(self.ctx.version_code % 100) // 10}")
                except Exception as e2:
                    print(f"Error creating ModernGL context: {e1}, {e2}")
                    import traceback
                    traceback.print_exc()
                    self.ctx = None
                    return
            
            if self.ctx is None:
                print("Warning: Could not create ModernGL context")
                return
            
            # Get widget size
            width = self.width()
            height = self.height()
            if width > 0 and height > 0:
                # Initialize overlay engine
                self.overlay_engine = OverlayEngine(self.ctx, width, height)
                self._initialized = True
                print("3D rendering initialized successfully!")
            else:
                print(f"Warning: OpenGLWidget has invalid size: {width}x{height}")
        except Exception as e:
            print(f"Error initializing OpenGL context: {e}")
            import traceback
            traceback.print_exc()
            self.ctx = None
            self.overlay_engine = None
            self._initialized = False
    
    def resizeGL(self, width: int, height: int):
        """Handle widget resize."""
        if self.overlay_engine is not None:
            self.overlay_engine.resize(width, height)
    
    def paintGL(self):
        """Paint OpenGL scene."""
        # Only render 3D heart overlay - video is displayed in QLabel
        if self.ctx is not None and self.overlay_engine is not None and self.current_frame is not None:
            # Render the 3D heart overlay
            # The overlay engine will render to its framebuffer
            # We don't need to display it here since we composite in main_window
            pass
        else:
            # Clear to transparent if no rendering
            # Use ModernGL context if available, otherwise skip
            if self.ctx is not None:
                self.ctx.clear(0.0, 0.0, 0.0, 0.0)  # Clear with transparent black
    
    def set_frame(self, frame: np.ndarray):
        """
        Set the current video frame to display.
        
        Args:
            frame: Video frame (BGR format)
        """
        self.current_frame = frame
        self.update()
    
    def set_heart_transform(self, transform_matrix: np.ndarray):
        """Set heart transformation matrix."""
        if self.overlay_engine is not None:
            self.overlay_engine.set_heart_transform(transform_matrix)
    
    def set_heart_beat_scale(self, scale: float):
        """Set heart beat animation scale."""
        if self.overlay_engine is not None:
            self.overlay_engine.set_heart_beat_scale(scale)
    
    def set_view(self, eye: np.ndarray, target: np.ndarray, up: np.ndarray = np.array([0, 0, 1])):
        """Set camera view."""
        if self.overlay_engine is not None:
            self.overlay_engine.set_view(eye, target, up)
    
    def load_heart_model(self, model_path):
        """Load heart model."""
        import logging
        logger = logging.getLogger(__name__)
        
        if self.ctx is None:
            logger.error("OpenGL context is None, cannot load heart model")
            return False
        
        if self.overlay_engine is not None:
            # Ensure OpenGL context is current before loading model
            # For QOpenGLWidget, we need to make the context current
            self.makeCurrent()
            try:
                success = self.overlay_engine.load_heart_model(model_path)
                if success:
                    # logger.info(f"Successfully loaded heart model in OpenGL widget")  # 3D model disabled
                    # Set a default transform so heart is visible
                    import numpy as np
                    default_transform = np.eye(4, dtype=np.float32)
                    # Position heart slightly in front of camera
                    default_transform[2, 3] = -0.5  # Move back 0.5 units
                    self.overlay_engine.set_heart_transform(default_transform)
                else:
                    logger.error(f"Failed to load heart model in OpenGL widget")
                return success
            finally:
                self.doneCurrent()
        else:
            logger.error("Cannot load heart model: overlay engine not initialized")
            return False

