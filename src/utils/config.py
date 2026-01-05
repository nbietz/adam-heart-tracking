"""Configuration management for the health check-in mirror system."""

import os
from pathlib import Path


class Config:
    """Application configuration."""
    
    # Project paths
    PROJECT_ROOT = Path(__file__).parent.parent.parent
    ASSETS_DIR = PROJECT_ROOT / "assets"
    MODELS_DIR = ASSETS_DIR / "models"
    SHADERS_DIR = ASSETS_DIR / "shaders"
    
    # Model files
    # Using midpoly as low-poly (better performance) and highpoly as high-poly (better detail)
    HEART_LOW_POLY = MODELS_DIR / "detailed-human-heart-anatomy" / "[OBJ] human_heart_midpoly_obj" / "human_heart_midpoly_obj.obj"
    HEART_HIGH_POLY = MODELS_DIR / "detailed-human-heart-anatomy" / "[OBJ] human_heart_highpoly_obj" / "human_heart_highpoly_obj.obj"
    
    # Texture files (optional, for future use)
    HEART_TEXTURE_DIR = MODELS_DIR / "detailed-human-heart-anatomy" / "Extras"
    HEART_DIFFUSE_TEXTURE = HEART_TEXTURE_DIR / "heart_diffuse.jpg"
    HEART_DIFFUSE_TEXTURE_2 = HEART_TEXTURE_DIR / "heart_diffuse_2.jpg"
    HEART_DISPLACEMENT_MAP = HEART_TEXTURE_DIR / "heart_displacement_map.jpg"
    
    # MediaPipe configuration
    MEDIAPIPE_MODEL_COMPLEXITY = 1  # 0, 1, or 2
    MEDIAPIPE_MIN_DETECTION_CONFIDENCE = 0.5
    MEDIAPIPE_MIN_TRACKING_CONFIDENCE = 0.5
    MEDIAPIPE_ENABLE_SEGMENTATION = False
    MEDIAPIPE_SMOOTH_LANDMARKS = True
    
    # Video configuration
    CAMERA_INDEX = 0  # Default camera index
    VIDEO_WIDTH = 1920  # Logitech Brio supports up to 1920x1080
    VIDEO_HEIGHT = 1080
    VIDEO_FPS = 30
    MIRROR_HORIZONTAL = True  # Flip video horizontally for mirror effect
    
    # 3D rendering configuration
    HEART_SCALE = 0.15  # Scale factor for heart model (meters) - reasonable size for overlay
    HEART_OFFSET_Z = 0.05  # Offset forward from chest (meters)
    RENDER_FPS_TARGET = 60
    
    # Heart rate configuration
    POLAR_H10_SERVICE_UUID = "0000180d-0000-1000-8000-00805f9b34fb"  # Heart Rate Service
    POLAR_H10_CHARACTERISTIC_UUID = "00002a37-0000-1000-8000-00805f9b34fb"  # Heart Rate Measurement
    HEART_RATE_SCAN_TIMEOUT = 10.0  # seconds
    
    # Animation configuration
    HEART_BEAT_SCALE_AMPLITUDE = 0.3  # 30% scale change for heartbeat (more pronounced)
    ANIMATION_SMOOTHING = 0.1  # Smoothing factor for BPM changes
    
    @classmethod
    def ensure_directories(cls):
        """Ensure all required directories exist."""
        cls.MODELS_DIR.mkdir(parents=True, exist_ok=True)
        cls.SHADERS_DIR.mkdir(parents=True, exist_ok=True)

