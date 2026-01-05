/**
 * Application configuration.
 * Ported from src/utils/config.py
 */

// Project paths
// Assets are now in js/assets/ directory
// In development with webpack dev server, we serve from /assets
// In production Electron, we use relative paths from dist/

// Detect if we're in development (webpack dev server)
const isDev = typeof window !== 'undefined' && window.location.protocol === 'http:';

export const ASSETS_DIR = 'assets';
export const MODELS_DIR = `${ASSETS_DIR}/models`;

// Model files - use webpack dev server path in dev, relative path in production
export const HEART_LOW_POLY = isDev 
  ? '/assets/models/detailed-human-heart-anatomy/[OBJ] human_heart_midpoly_obj/human_heart_midpoly_obj.obj'
  : '../assets/models/detailed-human-heart-anatomy/[OBJ] human_heart_midpoly_obj/human_heart_midpoly_obj.obj';

export const HEART_HIGH_POLY = isDev
  ? '/assets/models/detailed-human-heart-anatomy/[OBJ] human_heart_highpoly_obj/human_heart_highpoly_obj.obj'
  : '../assets/models/detailed-human-heart-anatomy/[OBJ] human_heart_highpoly_obj/human_heart_highpoly_obj.obj';

// Texture files (optional, for future use)
export const HEART_TEXTURE_DIR = `${MODELS_DIR}/detailed-human-heart-anatomy/Extras`;
export const HEART_DIFFUSE_TEXTURE = `${HEART_TEXTURE_DIR}/heart_diffuse.jpg`;
export const HEART_DIFFUSE_TEXTURE_2 = `${HEART_TEXTURE_DIR}/heart_diffuse_2.jpg`;
export const HEART_DISPLACEMENT_MAP = `${HEART_TEXTURE_DIR}/heart_displacement_map.jpg`;

// MediaPipe configuration
export const MEDIAPIPE_MODEL_COMPLEXITY = 1; // 0, 1, or 2
export const MEDIAPIPE_MIN_DETECTION_CONFIDENCE = 0.5;
export const MEDIAPIPE_MIN_TRACKING_CONFIDENCE = 0.5;
export const MEDIAPIPE_ENABLE_SEGMENTATION = false;
export const MEDIAPIPE_SMOOTH_LANDMARKS = true;

// Video configuration
export const CAMERA_INDEX = 0; // Default camera index
export const VIDEO_WIDTH = 1920; // Logitech Brio supports up to 1920x1080
export const VIDEO_HEIGHT = 1080;
export const VIDEO_FPS = 30;
export const MIRROR_HORIZONTAL = true; // Flip video horizontally for mirror effect

// 3D rendering configuration
export const HEART_SCALE = 0.15; // Scale factor for heart model (meters)
export const HEART_OFFSET_Z = 0.05; // Offset forward from chest (meters)
export const RENDER_FPS_TARGET = 60;

// Heart rate configuration
export const POLAR_H10_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb'; // Heart Rate Service
export const POLAR_H10_CHARACTERISTIC_UUID = '00002a37-0000-1000-8000-00805f9b34fb'; // Heart Rate Measurement
export const HEART_RATE_SCAN_TIMEOUT = 10.0; // seconds

// Animation configuration
export const HEART_BEAT_SCALE_AMPLITUDE = 0.3; // 30% scale change for heartbeat
export const ANIMATION_SMOOTHING = 0.1; // Smoothing factor for BPM changes

