"""Video and 3D overlay compositing engine."""

import numpy as np
import cv2
import moderngl
from typing import Optional, Tuple
from moderngl import Context
from .heart_renderer import HeartRenderer


class OverlayEngine:
    """Composites video frames with 3D heart overlay."""
    
    def __init__(self, ctx: Context, width: int, height: int):
        """
        Initialize overlay engine.
        
        Args:
            ctx: ModernGL context
            width: Video width
            height: Video height
        """
        self.ctx = ctx
        self.width = width
        self.height = height
        
        # Heart renderer (shelved for now)
        self.heart_renderer = HeartRenderer(ctx, width, height)
        
        # Chest position for simple circle overlay (2D screen coordinates)
        self.chest_position_2d: Optional[Tuple[int, int]] = None
        
        # Heartbeat animation scale (1.0 = normal, >1.0 = expanded)
        self.beat_scale = 1.0
        
        # Framebuffer for rendering (not used for simple circle, but kept for future)
        self.fbo: Optional[moderngl.Framebuffer] = None
        self.color_texture: Optional[moderngl.Texture] = None
        self.depth_texture: Optional[moderngl.Texture] = None
        
        self._setup_framebuffer()
    
    def _setup_framebuffer(self):
        """Setup framebuffer for off-screen rendering."""
        # Create color texture
        self.color_texture = self.ctx.texture((self.width, self.height), 4)  # RGBA
        self.color_texture.filter = (moderngl.LINEAR, moderngl.LINEAR)
        
        # Create depth texture
        self.depth_texture = self.ctx.depth_texture((self.width, self.height))
        self.depth_texture.filter = (moderngl.LINEAR, moderngl.LINEAR)
        
        # Create framebuffer
        self.fbo = self.ctx.framebuffer(
            color_attachments=[self.color_texture],
            depth_attachment=self.depth_texture
        )
    
    def load_heart_model(self, model_path):
        """Load heart model."""
        return self.heart_renderer.load_model(model_path)
    
    def set_heart_transform(self, transform_matrix: np.ndarray):
        """Set heart transformation matrix."""
        self.heart_renderer.set_transform(transform_matrix)
    
    def set_heart_beat_scale(self, scale: float):
        """Set heart beat animation scale."""
        self.heart_renderer.set_beat_scale(scale)
    
    def set_view(self, eye: np.ndarray, target: np.ndarray, up: np.ndarray = np.array([0, 0, 1])):
        """Set camera view."""
        self.heart_renderer.set_view(eye, target, up)
    
    def set_chest_position_2d(self, x: int, y: int):
        """
        Set chest position in 2D screen coordinates for simple circle overlay.
        
        Args:
            x: X coordinate in pixels
            y: Y coordinate in pixels
        """
        self.chest_position_2d = (x, y)
    
    def set_beat_scale(self, scale: float):
        """
        Set heartbeat animation scale.
        
        Args:
            scale: Scale factor (1.0 = normal, >1.0 = expanded)
        """
        self.beat_scale = scale
    
    def composite_frame(self, video_frame: np.ndarray) -> np.ndarray:
        """
        Composite video frame with simple red circle overlay at chest position.
        
        Args:
            video_frame: Input video frame (BGR format)
        
        Returns:
            Composited frame (BGR format)
        """
        if video_frame is None:
            return None
        
        # Make a copy to draw on
        result = video_frame.copy()
        
        # Draw simple red heart shape at chest position if available
        if self.chest_position_2d is not None:
            x, y = self.chest_position_2d
            
            # Ensure coordinates are within frame bounds
            height, width = video_frame.shape[:2]
            x = max(0, min(width - 1, x))
            y = max(0, min(height - 1, y))
            
            # Draw heart shape with beat animation
            # Base size scales with beat_scale (1.0 = normal, >1.0 = expanded)
            # Heart is 3x bigger (was 40, now 120)
            base_size = 120
            animated_size = int(base_size * self.beat_scale)
            self._draw_heart(result, int(x), int(y), size=animated_size)
        
        return result
    
    def _draw_heart(self, img: np.ndarray, center_x: int, center_y: int, size: int = 40):
        """
        Draw a simple heart shape at the given position.
        
        Args:
            img: Image to draw on (BGR format)
            center_x: X coordinate of heart center
            center_y: Y coordinate of heart center
            size: Size of the heart (approximate width/height)
        """
        scale = size / 40.0  # Normalize to size parameter
        radius = int(8 * scale)
        
        # Draw two circles for the top lobes of the heart
        # Left circle
        left_circle_center = (center_x - int(8 * scale), center_y - int(5 * scale))
        cv2.circle(img, left_circle_center, radius, (0, 0, 255), -1)  # Filled red
        
        # Right circle
        right_circle_center = (center_x + int(8 * scale), center_y - int(5 * scale))
        cv2.circle(img, right_circle_center, radius, (0, 0, 255), -1)  # Filled red
        
        # Draw triangle for the bottom point of the heart
        # Points of the triangle (inverted V)
        triangle_pts = np.array([
            [center_x, center_y + int(12 * scale)],  # Bottom point
            [center_x - int(12 * scale), center_y + int(2 * scale)],  # Left point
            [center_x + int(12 * scale), center_y + int(2 * scale)]  # Right point
        ], dtype=np.int32)
        cv2.fillPoly(img, [triangle_pts], (0, 0, 255))  # Filled red
        
        # Draw red outline for visibility
        cv2.circle(img, left_circle_center, radius, (0, 0, 255), 2)
        cv2.circle(img, right_circle_center, radius, (0, 0, 255), 2)
        cv2.polylines(img, [triangle_pts], isClosed=True, color=(0, 0, 255), thickness=2)
    
    def resize(self, width: int, height: int):
        """
        Resize overlay engine.
        
        Args:
            width: New width
            height: New height
        """
        self.width = width
        self.height = height
        
        # Recreate framebuffer
        self._setup_framebuffer()
        
        # Resize heart renderer
        self.heart_renderer.resize(width, height)

