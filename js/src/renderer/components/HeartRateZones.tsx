/**
 * Heart rate zones bar graph component.
 * Displays five heart rate zones with current heart rate indicator.
 */

import React, { useMemo } from 'react';
import '../styles/ecg-theme.css';

interface HeartRateZone {
  name: string;
  min: number;
  max: number;
  color: string;
  description: string;
}

interface HeartRateZonesProps {
  heartRate: number | null;
  age?: number; // Optional age for calculating max heart rate (default: 30)
  color?: string; // User-specific color
  positionOffset?: number; // Offset for multiple displays (0, 1, 2, ...)
}

export const HeartRateZones: React.FC<HeartRateZonesProps> = ({
  heartRate,
  age = 30,
  color = '#00ff41', // Default ECG green
  positionOffset = 0
}) => {
  // Calculate max heart rate (220 - age)
  const maxHeartRate = useMemo(() => 220 - age, [age]);

  // Define the five heart rate zones
  const zones: HeartRateZone[] = useMemo(() => [
    {
      name: 'Recovery',
      min: Math.round(maxHeartRate * 0.50),
      max: Math.round(maxHeartRate * 0.60),
      color: '#4a90e2', // Blue
      description: '50-60%'
    },
    {
      name: 'Fat Burn',
      min: Math.round(maxHeartRate * 0.60),
      max: Math.round(maxHeartRate * 0.70),
      color: '#7ed321', // Green
      description: '60-70%'
    },
    {
      name: 'Aerobic',
      min: Math.round(maxHeartRate * 0.70),
      max: Math.round(maxHeartRate * 0.80),
      color: '#f5a623', // Orange
      description: '70-80%'
    },
    {
      name: 'Anaerobic',
      min: Math.round(maxHeartRate * 0.80),
      max: Math.round(maxHeartRate * 0.90),
      color: '#ff6b6b', // Red
      description: '80-90%'
    },
    {
      name: 'Maximum',
      min: Math.round(maxHeartRate * 0.90),
      max: maxHeartRate,
      color: '#bd10e0', // Purple
      description: '90-100%'
    }
  ], [maxHeartRate]);

  // Find which zone the current heart rate is in
  const currentZone = useMemo(() => {
    if (!heartRate || heartRate <= 0) return null;
    return zones.findIndex(zone => heartRate >= zone.min && heartRate <= zone.max);
  }, [heartRate, zones]);

  // Calculate percentage of max heart rate for current heart rate
  const currentPercentage = useMemo(() => {
    if (!heartRate || heartRate <= 0) return 0;
    return Math.min((heartRate / maxHeartRate) * 100, 100);
  }, [heartRate, maxHeartRate]);

  // Don't render if no heart rate
  if (!heartRate || heartRate <= 0) {
    return null;
  }

  // Position offset: stack displays horizontally with spacing
  const leftOffset = 20 + (positionOffset * 420); // 420px spacing between displays

  return (
    <div
      className="ecg-panel"
      style={{
        position: 'absolute',
        bottom: 120,
        left: leftOffset,
        padding: '15px 20px',
        borderRadius: '5px',
        zIndex: 100,
        minWidth: '300px',
        maxWidth: '400px',
        borderColor: color
      }}
    >
      <div className="ecg-label" style={{ fontSize: '12px', marginBottom: '15px', textTransform: 'uppercase', letterSpacing: '1px', color }}>
        Heart Rate Zones
      </div>

      {/* Zone bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {zones.map((zone, index) => {
          const isActive = currentZone === index;
          const zoneWidth = ((zone.max - zone.min) / maxHeartRate) * 100;
          const zoneStart = (zone.min / maxHeartRate) * 100;
          
          // Calculate how much of this zone is filled by current heart rate
          let fillPercentage = 0;
          if (isActive && heartRate) {
            const zoneRange = zone.max - zone.min;
            const positionInZone = heartRate - zone.min;
            fillPercentage = (positionInZone / zoneRange) * 100;
          } else if (currentZone !== null && index < currentZone) {
            fillPercentage = 100; // Zones before current are fully filled
          }

          return (
            <div key={zone.name} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '2px',
                      backgroundColor: zone.color,
                      boxShadow: isActive ? `0 0 8px ${zone.color}` : 'none',
                      transition: 'box-shadow 0.3s ease'
                    }}
                  />
                  <span
                    className="ecg-text"
                    style={{
                      fontSize: '11px',
                      fontWeight: isActive ? 700 : 400,
                      color: isActive ? zone.color : 'var(--ecg-text)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    {zone.name}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span
                    className="ecg-text"
                    style={{
                      fontSize: '10px',
                      opacity: 0.7,
                      fontFamily: 'monospace'
                    }}
                  >
                    {zone.min}-{zone.max} BPM
                  </span>
                  {isActive && (
                    <span
                      className="ecg-value"
                      style={{
                        fontSize: '12px',
                        color: color, // Use user's color instead of zone color
                        fontWeight: 700,
                        textShadow: `0 0 8px ${color}`
                      }}
                    >
                      ●
                    </span>
                  )}
                </div>
              </div>
              
              {/* Bar container */}
              <div
                style={{
                  width: '100%',
                  height: '20px',
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '3px',
                  position: 'relative',
                  overflow: 'hidden',
                  border: `1px solid ${isActive ? zone.color : 'rgba(255, 255, 255, 0.1)'}`,
                  boxShadow: isActive ? `inset 0 0 10px rgba(0, 0, 0, 0.5)` : 'none'
                }}
              >
                {/* Zone background */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${zoneStart}%`,
                    width: `${zoneWidth}%`,
                    height: '100%',
                    backgroundColor: zone.color,
                    opacity: 0.2,
                    transition: 'opacity 0.3s ease'
                  }}
                />
                
                {/* Fill indicator */}
                {fillPercentage > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${zoneStart}%`,
                      width: `${(fillPercentage / 100) * zoneWidth}%`,
                      height: '100%',
                      backgroundColor: zone.color,
                      opacity: isActive ? 0.8 : 0.4,
                      transition: 'all 0.3s ease',
                      boxShadow: isActive ? `0 0 10px ${zone.color}` : 'none'
                    }}
                  />
                )}
                
                {/* Current heart rate indicator line */}
                {isActive && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${currentPercentage}%`,
                      width: '2px',
                      height: '100%',
                      backgroundColor: color, // Use user's color
                      boxShadow: `0 0 8px ${color}`,
                      zIndex: 10
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Current heart rate info */}
      <div
        style={{
          marginTop: '15px',
          paddingTop: '15px',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <span className="ecg-text" style={{ fontSize: '10px', opacity: 0.7, color }}>
          Current: {heartRate} BPM
        </span>
        <span className="ecg-text" style={{ fontSize: '10px', opacity: 0.7, color }}>
          {currentPercentage.toFixed(0)}% of max ({maxHeartRate} BPM)
        </span>
      </div>
    </div>
  );
};

