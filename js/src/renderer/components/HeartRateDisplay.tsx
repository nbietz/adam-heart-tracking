/**
 * Heart rate display component.
 */

import React, { useState, useEffect, useRef } from 'react';
import '../styles/ecg-theme.css';

interface HeartRateDisplayProps {
  heartRate: number | null;
  isConnected: boolean;
  deviceName: string | null;
}

export const HeartRateDisplay: React.FC<HeartRateDisplayProps> = ({
  heartRate,
  isConnected,
  deviceName
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

  return (
    <div
      className="ecg-panel"
      style={{
        position: 'absolute',
        top: 20,
        right: 20,
        padding: '15px 20px',
        borderRadius: '5px',
        zIndex: 100,
        minWidth: '220px',
        width: '220px'
      }}
    >
      {deviceName && isConnected && (
        <div className="ecg-label" style={{ fontSize: '10px', marginBottom: '10px', opacity: 0.8 }}>
          {deviceName}
        </div>
      )}
      {heartRate !== null ? (
        <div className="ecg-value" style={{ fontSize: '64px', fontWeight: 900, display: 'flex', alignItems: 'center', lineHeight: 1, position: 'relative', paddingRight: '60px' }}>
          <span>{heartRate}</span>
          <span
            style={{
              fontSize: '48px',
              display: 'inline-block',
              position: 'absolute',
              right: '0px',
              transform: `scale(${heartScale})`,
              transition: 'transform 0.1s ease-out',
              filter: 'drop-shadow(0 0 10px rgba(0, 255, 65, 0.8))',
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

