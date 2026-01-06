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
  color?: string; // User-specific color
}

export const HeartOverlay: React.FC<HeartOverlayProps> = ({
  chestPosition2d,
  beatScale,
  width,
  height,
  cameraFrameWidth,
  cameraFrameHeight,
  color = '#00ff41' // Default ECG green
}) => {
  if (!chestPosition2d) {
    return null;
  }

  let { x, y } = chestPosition2d;
  
  // Scale position from camera frame coordinates to overlay canvas coordinates
  // Account for object-fit: cover scaling which may crop the video
  if (cameraFrameWidth && cameraFrameHeight && cameraFrameWidth > 0 && cameraFrameHeight > 0) {
    // Calculate aspect ratios
    const videoAspect = cameraFrameWidth / cameraFrameHeight;
    const viewportAspect = width / height;
    
    let scale: number;
    let offsetX = 0;
    let offsetY = 0;
    
    if (videoAspect > viewportAspect) {
      // Video is wider than viewport - cropped on left/right (letterboxing)
      // Scale based on height, video fills height
      scale = height / cameraFrameHeight;
      const scaledWidth = cameraFrameWidth * scale;
      offsetX = (scaledWidth - width) / 2; // Center the cropped video
    } else {
      // Video is taller than viewport - cropped on top/bottom (pillarboxing)
      // Scale based on width, video fills width
      scale = width / cameraFrameWidth;
      const scaledHeight = cameraFrameHeight * scale;
      offsetY = (scaledHeight - height) / 2; // Center the cropped video
    }
    
    // Scale coordinates and account for cropping offset
    x = x * scale - offsetX;
    y = y * scale - offsetY;
  }
  
  // Validate coordinates are within bounds
  if (x < 0 || x > width || y < 0 || y > height) {
    return null;
  }
  
  // Calculate animated size based on beat scale
  // beatScale is 0.0-0.3, convert to 1.0-1.2 for animation
  const baseSize = 80; // Base font size in pixels
  const animatedSize = baseSize * (1.0 + beatScale * 0.2);
  
  // Convert hex color to rgba for glow effect
  const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
  
  const glowColor1 = hexToRgba(color, 0.8);
  const glowColor2 = hexToRgba(color, 0.6);
  const glowColor3 = hexToRgba(color, 0.4);
  
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
        filter: `drop-shadow(0 0 10px ${glowColor1}) drop-shadow(0 0 20px ${glowColor2}) drop-shadow(0 0 30px ${glowColor3})`
      }}
    >
      ❤️
    </div>
  );
};

