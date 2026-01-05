"""MediaPipe pose estimation tracker."""

import cv2
import mediapipe as mp
import numpy as np
from typing import Optional, Tuple, List, Any
from ..utils.config import Config


class MediaPipeTracker:
    """MediaPipe pose estimation for body tracking."""
    
    def __init__(self):
        """Initialize MediaPipe pose estimation."""
        self.mp_pose = mp.solutions.pose
        self.mp_drawing = mp.solutions.drawing_utils
        
        self.pose = self.mp_pose.Pose(
            model_complexity=Config.MEDIAPIPE_MODEL_COMPLEXITY,
            min_detection_confidence=Config.MEDIAPIPE_MIN_DETECTION_CONFIDENCE,
            min_tracking_confidence=Config.MEDIAPIPE_MIN_TRACKING_CONFIDENCE,
            enable_segmentation=Config.MEDIAPIPE_ENABLE_SEGMENTATION,
            smooth_landmarks=Config.MEDIAPIPE_SMOOTH_LANDMARKS
        )
    
    def process(self, frame: np.ndarray) -> Optional[Any]:
        """
        Process a frame and detect pose landmarks.
        
        Args:
            frame: Input frame (BGR format)
        
        Returns:
            MediaPipe landmarks or None if no pose detected
        """
        # Convert BGR to RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Process frame
        results = self.pose.process(rgb_frame)
        
        if results.pose_landmarks:
            return results.pose_landmarks
        return None
    
    def get_world_landmarks(self, frame: np.ndarray) -> Optional[Any]:
        """
        Get 3D world landmarks from a frame.
        
        Args:
            frame: Input frame (BGR format)
        
        Returns:
            MediaPipe world landmarks or None if no pose detected
        """
        # Convert BGR to RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Process frame
        results = self.pose.process(rgb_frame)
        
        if results.pose_world_landmarks:
            return results.pose_world_landmarks
        return None
    
    def draw_landmarks(self, frame: np.ndarray, landmarks) -> np.ndarray:
        """
        Draw pose landmarks on a frame.
        
        Args:
            frame: Input frame
            landmarks: MediaPipe landmarks
        
        Returns:
            Frame with landmarks drawn
        """
        annotated_frame = frame.copy()
        if landmarks:
            self.mp_drawing.draw_landmarks(
                annotated_frame,
                landmarks,
                self.mp_pose.POSE_CONNECTIONS,
                landmark_drawing_spec=self.mp_drawing.DrawingSpec(
                    color=(0, 255, 0), thickness=2, circle_radius=2
                ),
                connection_drawing_spec=self.mp_drawing.DrawingSpec(
                    color=(0, 255, 0), thickness=2
                )
            )
        return annotated_frame
    
    def close(self):
        """Close MediaPipe pose estimation."""
        self.pose.close()

