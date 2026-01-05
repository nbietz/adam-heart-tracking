"""Frame processing pipeline."""

import numpy as np
from typing import Optional, Callable, Union
from .camera import Camera
from .qt_camera import QtCamera


class FrameProcessor:
    """Processes video frames through a pipeline."""
    
    def __init__(self, camera: Union[Camera, QtCamera]):
        """
        Initialize frame processor.
        
        Args:
            camera: Camera instance to read frames from (Camera or QtCamera)
        """
        self.camera = camera
        self.processors: list[Callable[[np.ndarray], np.ndarray]] = []
    
    def add_processor(self, processor: Callable[[np.ndarray], np.ndarray]):
        """
        Add a frame processing function to the pipeline.
        
        Args:
            processor: Function that takes a frame and returns a processed frame
        """
        self.processors.append(processor)
    
    def process_frame(self, frame: np.ndarray) -> np.ndarray:
        """
        Process a frame through all registered processors.
        
        Args:
            frame: Input frame
        
        Returns:
            Processed frame
        """
        processed = frame.copy()
        for processor in self.processors:
            processed = processor(processed)
        return processed
    
    def get_frame(self) -> Optional[np.ndarray]:
        """
        Get and process a frame from the camera.
        
        Returns:
            Processed frame or None if capture failed
        """
        success, frame = self.camera.read()
        if not success or frame is None:
            return None
        
        return self.process_frame(frame)

