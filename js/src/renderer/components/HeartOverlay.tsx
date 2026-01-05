/**
 * 2D Heart overlay component.
 * Displays a heart emoji at the chest position.
 */

import React from 'react';

interface HeartOverlayProps {
  chestPosition2d: { x: number; y: number } | null;
  beatScale: number;
  width: number;
  height: number;
  cameraFrameWidth?: number;
  cameraFrameHeight?: number;
}

export const HeartOverlay: React.FC<HeartOverlayProps> = ({
  chestPosition2d,
  beatScale,
  width,
  height,
  cameraFrameWidth,
  cameraFrameHeight
}) => {
  if (!chestPosition2d) {
    return null;
  }

  let { x, y } = chestPosition2d;
  
  // Scale position from camera frame coordinates to overlay canvas coordinates
  if (cameraFrameWidth && cameraFrameHeight && cameraFrameWidth > 0 && cameraFrameHeight > 0) {
    const scaleX = width / cameraFrameWidth;
    const scaleY = height / cameraFrameHeight;
    x = x * scaleX;
    y = y * scaleY;
  }
  
  // Validate coordinates are within bounds
  if (x < 0 || x > width || y < 0 || y > height) {
    return null;
  }
  
  // Calculate animated size based on beat scale
  // beatScale is 0.0-0.3, convert to 1.0-1.2 for animation
  const baseSize = 80; // Base font size in pixels
  const animatedSize = baseSize * (1.0 + beatScale * 0.2);
  
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, -50%)',
        fontSize: `${animatedSize}px`,
        pointerEvents: 'none',
        zIndex: 10,
        lineHeight: 1,
        filter: 'drop-shadow(0 0 10px rgba(0, 255, 65, 0.8)) drop-shadow(0 0 20px rgba(0, 255, 65, 0.6)) drop-shadow(0 0 30px rgba(0, 255, 65, 0.4))'
      }}
    >
      ❤️
    </div>
  );
};

