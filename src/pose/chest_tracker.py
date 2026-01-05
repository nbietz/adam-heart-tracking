"""Chest position and rotation tracking from pose landmarks."""

import numpy as np
from typing import Optional, Tuple, Any
import mediapipe as mp
from ..utils.math_utils import (
    calculate_chest_position,
    calculate_chest_rotation,
    create_transform_matrix
)
from ..utils.config import Config


class ChestTracker:
    """Tracks chest position and rotation from MediaPipe pose landmarks."""
    
    # MediaPipe pose landmark indices
    LEFT_SHOULDER = 11
    RIGHT_SHOULDER = 12
    LEFT_HIP = 23
    RIGHT_HIP = 24
    NOSE = 0
    
    def __init__(self, smoothing_factor: float = 0.7):
        """
        Initialize chest tracker.
        
        Args:
            smoothing_factor: Smoothing factor for position (0-1). Higher = more smoothing, less jitter.
        """
        self.last_position: Optional[np.ndarray] = None
        self.last_rotation: Optional[np.ndarray] = None
        self.last_position_2d: Optional[np.ndarray] = None  # For 2D tracking
        self.smoothing_factor = smoothing_factor  # 0.7 = 70% old, 30% new
    
    def extract_landmark_2d(
        self,
        landmarks: Any,
        index: int
    ) -> Optional[np.ndarray]:
        """
        Extract 2D normalized coordinates of a landmark (for 2D tracking).
        
        Args:
            landmarks: MediaPipe normalized landmarks (0-1 range)
            index: Landmark index
        
        Returns:
            2D position as numpy array [x, y] or None if not visible
        """
        if index >= len(landmarks.landmark):
            return None
        
        landmark = landmarks.landmark[index]
        
        # Visibility threshold
        if landmark.visibility < 0.5:
            return None
        
        # Return normalized coordinates (0-1 range, origin at top-left)
        return np.array([landmark.x, landmark.y], dtype=np.float32)
    
    def extract_landmark_3d(
        self,
        landmarks: Any,
        index: int
    ) -> Optional[np.ndarray]:
        """
        Extract 3D world coordinates of a landmark.
        
        Args:
            landmarks: MediaPipe world landmarks
            index: Landmark index
        
        Returns:
            3D position as numpy array [x, y, z] or None if not visible
        """
        if index >= len(landmarks.landmark):
            return None
        
        landmark = landmarks.landmark[index]
        
        # MediaPipe world landmarks are in meters with origin at hip center
        # Visibility threshold
        if landmark.visibility < 0.5:
            return None
        
        return np.array([landmark.x, landmark.y, landmark.z], dtype=np.float32)
    
    def track_chest(
        self,
        world_landmarks: Any
    ) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
        """
        Track chest position and rotation from world landmarks.
        
        Args:
            world_landmarks: MediaPipe world landmarks
        
        Returns:
            Tuple of (position, rotation_matrix). Both are None if tracking fails.
        """
        # Extract required landmarks
        left_shoulder = self.extract_landmark_3d(world_landmarks, self.LEFT_SHOULDER)
        right_shoulder = self.extract_landmark_3d(world_landmarks, self.RIGHT_SHOULDER)
        left_hip = self.extract_landmark_3d(world_landmarks, self.LEFT_HIP)
        right_hip = self.extract_landmark_3d(world_landmarks, self.RIGHT_HIP)
        
        # Check if we have all required landmarks
        if left_shoulder is None or right_shoulder is None:
            # Use last known position if available
            return self.last_position, self.last_rotation
        
        # Calculate chest position
        new_position = calculate_chest_position(
            left_shoulder,
            right_shoulder,
            offset_z=Config.HEART_OFFSET_Z
        )
        
        # Apply exponential smoothing to position
        if self.last_position is not None:
            position = (self.smoothing_factor * self.last_position + 
                       (1.0 - self.smoothing_factor) * new_position)
        else:
            position = new_position
        
        # Calculate rotation if we have hip data
        if left_hip is not None and right_hip is not None:
            new_rotation = calculate_chest_rotation(
                left_shoulder,
                right_shoulder,
                left_hip,
                right_hip
            )
        else:
            # Fallback: use shoulder line only
            shoulder_vec = right_shoulder - left_shoulder
            if np.linalg.norm(shoulder_vec) > 0:
                # Simple rotation from shoulder line
                forward = np.array([0, 0, -1])  # Towards camera
                up = np.array([0, 1, 0])
                from ..utils.math_utils import rotation_matrix_from_vectors
                new_rotation = rotation_matrix_from_vectors(forward, up)
            else:
                new_rotation = np.eye(3, dtype=np.float32)
        
        # Apply smoothing to rotation (spherical linear interpolation would be better, but this is simpler)
        if self.last_rotation is not None:
            # Simple linear interpolation of rotation matrix (not perfect but works for small changes)
            rotation = (self.smoothing_factor * self.last_rotation + 
                       (1.0 - self.smoothing_factor) * new_rotation)
            # Re-orthonormalize the rotation matrix
            # Use SVD to ensure it's a valid rotation matrix
            U, _, Vt = np.linalg.svd(rotation)
            rotation = U @ Vt
            if np.linalg.det(rotation) < 0:
                U[:, -1] *= -1
                rotation = U @ Vt
        else:
            rotation = new_rotation
        
        # Update last known values
        self.last_position = position
        self.last_rotation = rotation
        
        return position, rotation
    
    def get_chest_position_2d(
        self,
        normalized_landmarks: Any,
        frame_width: int,
        frame_height: int
    ) -> Optional[np.ndarray]:
        """
        Get 2D heart position in screen coordinates (anatomically adjusted).
        
        Args:
            normalized_landmarks: MediaPipe normalized landmarks (0-1 range)
            frame_width: Video frame width in pixels
            frame_height: Video frame height in pixels
        
        Returns:
            2D position as numpy array [x, y] in screen coordinates, or None if tracking fails
        """
        # Extract shoulder and hip landmarks in normalized coordinates
        left_shoulder_2d = self.extract_landmark_2d(normalized_landmarks, self.LEFT_SHOULDER)
        right_shoulder_2d = self.extract_landmark_2d(normalized_landmarks, self.RIGHT_SHOULDER)
        left_hip_2d = self.extract_landmark_2d(normalized_landmarks, self.LEFT_HIP)
        right_hip_2d = self.extract_landmark_2d(normalized_landmarks, self.RIGHT_HIP)
        
        if left_shoulder_2d is None or right_shoulder_2d is None:
            return None
        
        # Calculate chest center in normalized coordinates (0-1)
        chest_center_normalized = (left_shoulder_2d + right_shoulder_2d) / 2.0
        
        # Convert to screen coordinates
        # MediaPipe normalized: (0,0) = top-left, (1,1) = bottom-right
        chest_x = chest_center_normalized[0] * frame_width
        chest_y = chest_center_normalized[1] * frame_height
        
        # Adjust position to be anatomically correct for heart location:
        # 1. Move lower (down) - heart is below the shoulder center
        # 2. Move slightly to the left (from person's perspective, so right side of screen)
        if left_hip_2d is not None and right_hip_2d is not None:
            # Calculate distance from shoulders to hips to determine how far down to move
            shoulder_y = chest_y
            hip_center_y = ((left_hip_2d[1] + right_hip_2d[1]) / 2.0) * frame_height
            torso_height = hip_center_y - shoulder_y
            
            # Move down by ~25% of torso height (heart is in upper chest, below shoulders)
            chest_y = chest_y + (torso_height * 0.25)
        else:
            # Fallback: move down by a fixed percentage of shoulder width
            shoulder_width = abs((right_shoulder_2d[0] - left_shoulder_2d[0]) * frame_width)
            chest_y = chest_y + (shoulder_width * 0.3)
        
        # Move slightly to the left (from person's perspective)
        # The heart is slightly left of center, so move right on screen (increase x)
        # But actually, from the camera's perspective, the person's left is on the right side of screen
        # So we want to move slightly to the right (increase x) to position on person's left side
        shoulder_width = abs((right_shoulder_2d[0] - left_shoulder_2d[0]) * frame_width)
        chest_x = chest_x + (shoulder_width * 0.15)  # Move right by 15% of shoulder width
        
        # Apply smoothing
        chest_pos_2d = np.array([chest_x, chest_y], dtype=np.float32)
        if self.last_position_2d is not None:
            chest_pos_2d = (self.smoothing_factor * self.last_position_2d + 
                           (1.0 - self.smoothing_factor) * chest_pos_2d)
        
        self.last_position_2d = chest_pos_2d
        return chest_pos_2d
    
    def get_transform_matrix(
        self,
        world_landmarks: Any
    ) -> Optional[np.ndarray]:
        """
        Get 4x4 transformation matrix for chest position and rotation.
        
        Args:
            world_landmarks: MediaPipe world landmarks
        
        Returns:
            4x4 transformation matrix or None if tracking fails
        """
        position, rotation = self.track_chest(world_landmarks)
        
        if position is None or rotation is None:
            return None
        
        return create_transform_matrix(
            position,
            rotation,
            scale=Config.HEART_SCALE
        )
    
    def get_transform_matrix_2d(
        self,
        normalized_landmarks: Any,
        frame_width: int,
        frame_height: int
    ) -> Optional[np.ndarray]:
        """
        Get 4x4 transformation matrix for 2D chest position (simplified, no rotation).
        
        Args:
            normalized_landmarks: MediaPipe normalized landmarks (0-1 range)
            frame_width: Video frame width in pixels
            frame_height: Video frame height in pixels
        
        Returns:
            4x4 transformation matrix or None if tracking fails
        """
        chest_pos_2d = self.get_chest_position_2d(normalized_landmarks, frame_width, frame_height)
        
        if chest_pos_2d is None:
            return None
        
        # Convert 2D screen position to 3D world position
        # MediaPipe normalized: (0,0) = top-left, (1,1) = bottom-right
        # OpenGL world: origin at camera, looking down negative Z
        
        # chest_pos_2d is in screen pixel coordinates
        # Convert to normalized coordinates (0-1) first
        norm_x = chest_pos_2d[0] / frame_width  # 0 to 1
        norm_y = chest_pos_2d[1] / frame_height  # 0 to 1
        
        # Convert normalized to NDC (-1 to 1)
        # X: left to right maps to -1 to 1
        # Y: top to bottom maps to 1 to -1 (flip Y for OpenGL)
        ndc_x = norm_x * 2.0 - 1.0  # 0 to 1 -> -1 to 1
        ndc_y = 1.0 - norm_y * 2.0  # 0 to 1 -> 1 to -1 (flip Y)
        
        # Convert NDC to world coordinates at fixed depth
        # For perspective projection with FOV=60, at distance d:
        # The view frustum width at distance d is: 2 * d * tan(FOV/2)
        # So NDC coordinate -1 to 1 maps to -d*tan(FOV/2) to d*tan(FOV/2)
        viewing_distance = 1.0  # meters (typical distance from camera)
        fov_rad = np.radians(60.0)  # Match the projection FOV
        # Account for aspect ratio - width is wider than height
        aspect = frame_width / frame_height
        world_scale_x = viewing_distance * np.tan(fov_rad / 2.0) * aspect  # Scale for X (width)
        world_scale_y = viewing_distance * np.tan(fov_rad / 2.0)  # Scale for Y (height)
        
        world_x = ndc_x * world_scale_x
        world_y = ndc_y * world_scale_y
        world_z = -viewing_distance  # Fixed depth, in front of camera (negative Z is forward)
        
        # TEMPORARY: Force heart to center of screen for testing
        # This will help us verify the rendering pipeline works
        world_x = 0.0
        world_y = 0.0
        world_z = -1.0
        
        position = np.array([world_x, world_y, world_z], dtype=np.float32)
        
        # No rotation for now - just identity rotation
        rotation = np.eye(3, dtype=np.float32)
        
        return create_transform_matrix(
            position,
            rotation,
            scale=Config.HEART_SCALE
        )
    
    def reset(self):
        """Reset tracking state."""
        self.last_position = None
        self.last_rotation = None
        self.last_position_2d = None

