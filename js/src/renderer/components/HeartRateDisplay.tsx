/**
 * Heart rate display component.
 */

import React, { useState, useEffect, useRef } from 'react';
import '../styles/ecg-theme.css';

interface HeartRateDisplayProps {
  heartRate: number | null;
  isConnected: boolean;
  deviceName?: string | null;
  color?: string; // User-specific color
  positionOffset?: number; // Offset for multiple displays (0, 1, 2, ...)
}

export const HeartRateDisplay: React.FC<HeartRateDisplayProps> = ({
  heartRate,
  isConnected,
  deviceName,
  color = '#00ff41', // Default ECG green
  positionOffset = 0
}) => {
  const [heartScale, setHeartScale] = useState(1.0);
  const startTimeRef = useRef<number>(Date.now());
  const currentHeartRateRef = useRef<number | null>(null);
  const cycleStartTimeRef = useRef<number>(Date.now());
  const currentBeatIntervalRef = useRef<number>(1000); // Default 60 BPM

  useEffect(() => {
    // Update target heart rate without restarting animation
    if (heartRate && heartRate > 0) {
      currentHeartRateRef.current = heartRate;
      currentBeatIntervalRef.current = 60000 / heartRate;
    } else {
      currentHeartRateRef.current = null;
    }
  }, [heartRate]);

  useEffect(() => {
    let animationFrameId: number | null = null;

    const animate = () => {
      const now = Date.now();
      
      // Check if we have a valid heart rate
      if (!currentHeartRateRef.current || currentHeartRateRef.current <= 0) {
        setHeartScale(1.0);
        animationFrameId = requestAnimationFrame(animate);
        return;
      }
      
      // Use current beat interval (which updates smoothly)
      const beatInterval = currentBeatIntervalRef.current;
      
      // Calculate elapsed time since cycle start
      const elapsed = now - cycleStartTimeRef.current;
      
      // If we've completed a cycle, start a new one with updated frequency
      if (elapsed >= beatInterval) {
        cycleStartTimeRef.current = now - (elapsed % beatInterval);
      }
      
      // Calculate phase within current cycle
      const phase = ((elapsed % beatInterval) / beatInterval) * 2.0 * Math.PI;

      // Pulse animation: quick expansion, slow contraction (more subtle)
      let scale: number;
      if (phase < Math.PI) {
        // Quick expansion (first half of beat) - reduced from 0.3 to 0.15
        scale = 1.0 + Math.sin(phase) * 0.15;
      } else {
        // Slow contraction (second half of beat) - reduced from 0.15 to 0.08, min scale ~0.92
        scale = 1.0 + Math.sin(phase) * 0.08;
      }

      setHeartScale(scale);
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []); // Empty dependency array - animation runs continuously, checks refs on each frame

  // Don't render if not connected and no heart rate
  if (!isConnected && heartRate === null) {
    return null;
  }

  // Convert hex color to rgba for glow effect
  const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const glowColor = hexToRgba(color, 0.8);
  
  // Position offset: stack displays vertically with spacing
  const topOffset = 20 + (positionOffset * 180); // 180px spacing between displays

  return (
    <div
      className="ecg-panel"
      style={{
        position: 'absolute',
        top: topOffset,
        right: 20,
        padding: '15px 20px',
        borderRadius: '5px',
        zIndex: 100,
        minWidth: '220px',
        width: '220px',
        borderColor: color
      }}
    >
      {deviceName && isConnected && (
        <div className="ecg-label" style={{ fontSize: '10px', marginBottom: '10px', opacity: 0.8, color }}>
          {deviceName}
        </div>
      )}
      {heartRate !== null ? (
        <div className="ecg-value" style={{ fontSize: '64px', fontWeight: 900, display: 'flex', alignItems: 'center', lineHeight: 1, position: 'relative', paddingRight: '60px', color }}>
          <span>{heartRate}</span>
          <span
            style={{
              fontSize: '48px',
              display: 'inline-block',
              position: 'absolute',
              right: '0px',
              transform: `scale(${heartScale})`,
              transition: 'transform 0.1s ease-out',
              filter: `drop-shadow(0 0 10px ${glowColor})`,
              transformOrigin: 'center center',
              width: '48px',
              textAlign: 'center'
            }}
          >
            ❤️
          </span>
        </div>
      ) : null}
    </div>
  );
};

