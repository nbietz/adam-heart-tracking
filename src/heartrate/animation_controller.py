"""Heart beat animation controller."""

import time
import math
from typing import Optional
from ..utils.config import Config


class AnimationController:
    """Controls heart beat animation based on heart rate."""
    
    def __init__(self):
        """Initialize animation controller."""
        self.start_time = time.time()
        self.current_bpm: Optional[int] = None
        self.target_bpm: Optional[int] = None
        self.beat_scale = 1.0
        self.animation_smoothing = Config.ANIMATION_SMOOTHING
        self.last_heartbeat_time: Optional[float] = None
        self.heartbeat_pulse_start: Optional[float] = None
        self.pulse_duration = 0.3  # Pulse animation duration in seconds
    
    def update_bpm(self, bpm: Optional[int]):
        """
        Update target BPM for animation.
        
        Args:
            bpm: Beats per minute (None to stop animation)
        """
        self.target_bpm = bpm
    
    def trigger_heartbeat(self):
        """
        Trigger a heartbeat pulse animation.
        Called on each heartbeat notification from the H10.
        """
        import time
        self.last_heartbeat_time = time.time()
        self.heartbeat_pulse_start = time.time()
    
    def get_beat_scale(self, current_time: Optional[float] = None) -> float:
        """
        Get current heartbeat scale factor.
        Uses real-time heartbeat triggers if available, otherwise falls back to BPM-based animation.
        
        Args:
            current_time: Current time (default: time.time())
        
        Returns:
            Scale factor (1.0 = normal, >1.0 = expanded)
        """
        if current_time is None:
            current_time = time.time()
        
        # If we have a recent heartbeat pulse, use that for animation
        if self.heartbeat_pulse_start is not None:
            pulse_elapsed = current_time - self.heartbeat_pulse_start
            
            if pulse_elapsed < self.pulse_duration:
                # Create a pulse animation: quick expansion, then slow contraction
                # Use a curve that peaks early and decays
                progress = pulse_elapsed / self.pulse_duration
                
                if progress < 0.3:
                    # Quick expansion (first 30% of pulse)
                    pulse = math.sin(progress * math.pi / 0.3) * Config.HEART_BEAT_SCALE_AMPLITUDE
                else:
                    # Slow contraction (remaining 70%)
                    decay_progress = (progress - 0.3) / 0.7
                    pulse = math.cos(decay_progress * math.pi / 2) * Config.HEART_BEAT_SCALE_AMPLITUDE
                
                self.beat_scale = 1.0 + pulse
                return self.beat_scale
            else:
                # Pulse finished, reset
                self.heartbeat_pulse_start = None
        
        # Fallback to BPM-based continuous animation if no recent heartbeat
        # Smooth BPM transition
        if self.target_bpm is not None:
            if self.current_bpm is None:
                self.current_bpm = self.target_bpm
            else:
                # Smooth interpolation
                diff = self.target_bpm - self.current_bpm
                self.current_bpm += diff * self.animation_smoothing
        
        if self.current_bpm is None or self.current_bpm <= 0:
            self.beat_scale = 1.0
            return 1.0
        
        # Calculate beat phase (0 to 2π) for continuous animation
        elapsed = current_time - self.start_time
        beat_interval = 60.0 / self.current_bpm
        phase = (elapsed % beat_interval) / beat_interval * 2.0 * math.pi
        
        # Create heartbeat pulse using sine wave
        # Pulse shape: quick expansion, slow contraction
        if phase < math.pi:
            # Expansion phase (first half)
            pulse = math.sin(phase) * Config.HEART_BEAT_SCALE_AMPLITUDE
        else:
            # Contraction phase (second half) - slower
            pulse = math.sin(phase) * Config.HEART_BEAT_SCALE_AMPLITUDE * 0.5
        
        # Scale factor: 1.0 + pulse
        self.beat_scale = 1.0 + pulse
        
        return self.beat_scale
    
    def reset(self):
        """Reset animation state."""
        self.start_time = time.time()
        self.current_bpm = None
        self.target_bpm = None
        self.beat_scale = 1.0
        self.last_heartbeat_time = None
        self.heartbeat_pulse_start = None

