"""Heart rate data parsing and processing."""

from typing import Optional
from collections import deque
import time


class HeartRateParser:
    """Parses and processes heart rate data."""
    
    def __init__(self, smoothing_window: int = 5):
        """
        Initialize heart rate parser.
        
        Args:
            smoothing_window: Number of recent values to average for smoothing
        """
        self.smoothing_window = smoothing_window
        self.recent_values = deque(maxlen=smoothing_window)
        self.current_bpm: Optional[int] = None
        self.last_update_time: Optional[float] = None
    
    def update(self, heart_rate: int) -> int:
        """
        Update with new heart rate value.
        
        Args:
            heart_rate: Raw heart rate value (beats per minute)
        
        Returns:
            Smoothed heart rate value
        """
        self.recent_values.append(heart_rate)
        self.last_update_time = time.time()
        
        # Calculate smoothed average
        if len(self.recent_values) > 0:
            self.current_bpm = int(sum(self.recent_values) / len(self.recent_values))
        else:
            self.current_bpm = heart_rate
        
        return self.current_bpm
    
    def get_bpm(self) -> Optional[int]:
        """
        Get current BPM value.
        
        Returns:
            Current BPM or None if no data received
        """
        return self.current_bpm
    
    def get_beat_interval(self) -> Optional[float]:
        """
        Get time interval between beats in seconds.
        
        Returns:
            Beat interval in seconds or None if no BPM data
        """
        if self.current_bpm is None or self.current_bpm <= 0:
            return None
        
        return 60.0 / self.current_bpm
    
    def is_stale(self, timeout: float = 5.0) -> bool:
        """
        Check if heart rate data is stale.
        
        Args:
            timeout: Timeout in seconds
        
        Returns:
            True if data is stale (no updates within timeout)
        """
        if self.last_update_time is None:
            return True
        
        return (time.time() - self.last_update_time) > timeout
    
    def reset(self):
        """Reset parser state."""
        self.recent_values.clear()
        self.current_bpm = None
        self.last_update_time = None

