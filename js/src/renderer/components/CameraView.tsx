/**
 * Camera view component.
 */

import React, { useEffect, useRef } from 'react';
import { CameraService } from '../services/camera-service';

interface CameraViewProps {
  cameraService: CameraService | null;
  isCameraActive: boolean;
  onFrameReady?: (imageData: ImageData | null) => void;
}

export const CameraView: React.FC<CameraViewProps> = ({
  cameraService,
  isCameraActive,
  onFrameReady
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backgroundVideoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastProcessTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!cameraService) {
      // Stop frame loop if no camera service
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const videoElement = cameraService.getVideoElement();
    if (videoElement && videoRef.current) {
      videoRef.current.srcObject = videoElement.srcObject;
    }
  }, [cameraService]);

  // Handle background video looping
  useEffect(() => {
    const bgVideo = backgroundVideoRef.current;
    if (!bgVideo) return;

    console.log('[CameraView] Video effect triggered, isCameraActive:', isCameraActive);
    console.log('[CameraView] Video element:', bgVideo);
    console.log('[CameraView] Video src:', bgVideo.src);
    console.log('[CameraView] Video readyState:', bgVideo.readyState);
    console.log('[CameraView] window.location.protocol:', typeof window !== 'undefined' ? window.location.protocol : 'undefined');
    console.log('[CameraView] window.location.href:', typeof window !== 'undefined' ? window.location.href : 'undefined');

    if (!isCameraActive) {
      // Play and loop background video when camera is inactive
      // Determine correct video path based on dev/prod mode
      const isDev = typeof window !== 'undefined' && window.location.protocol === 'http:';
      const videoSrc = isDev 
        ? 'http://localhost:8080/assets/video/Scene-01-Full-Male.mp4'
        : '../assets/video/Scene-01-Full-Male.mp4';
      
      // Always set the src to ensure it's correct (especially if Electron converted it to file://)
      const currentSrc = bgVideo.src || '';
      // In production (file://), we need to use a relative path from dist/renderer to dist/assets
      // In dev (http://), use the full localhost URL
      const needsUpdate = isDev 
        ? (!currentSrc.includes('localhost:8080') || currentSrc.includes('file://'))
        : (currentSrc.includes('file:///assets') || !currentSrc.includes('Scene-01-Full-Male.mp4'));
      
      console.log('[CameraView] isDev:', isDev);
      console.log('[CameraView] currentSrc:', currentSrc);
      console.log('[CameraView] needsUpdate:', needsUpdate);
      console.log('[CameraView] videoSrc:', videoSrc);
      
      if (needsUpdate) {
        console.log('[CameraView] ✓ Setting video src to:', videoSrc);
        console.log('[CameraView] Current src was:', currentSrc);
        bgVideo.src = videoSrc;
      } else {
        console.log('[CameraView] ✗ Not updating video src (already correct)');
      }
      
      // Set video playback rate to 75% (0.75) and scale to 90%
      bgVideo.playbackRate = 0.75;
      
      // Reload video to ensure it plays
      const tryPlay = () => {
        console.log('[CameraView] Attempting to play video, readyState:', bgVideo.readyState);
        bgVideo.load();
        bgVideo.playbackRate = 0.75; // Ensure playback rate is set after load
        const playPromise = bgVideo.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            console.log('[CameraView] Video playing successfully');
          }).catch((error) => {
            console.error('[CameraView] Error playing background video:', error);
            console.error('[CameraView] Video src:', bgVideo.src);
            console.error('[CameraView] Video readyState:', bgVideo.readyState);
            console.error('[CameraView] Video error:', bgVideo.error);
            console.error('[CameraView] Video networkState:', bgVideo.networkState);
          });
        }
      };
      
      if (bgVideo.readyState >= 2) {
        // Video already loaded
        console.log('[CameraView] Video already loaded, playing immediately');
        tryPlay();
      } else {
        // Wait for video to load
        console.log('[CameraView] Waiting for video to load');
        bgVideo.addEventListener('loadeddata', () => {
          console.log('[CameraView] Video loadeddata event fired');
          tryPlay();
        }, { once: true });
        bgVideo.addEventListener('error', (e) => {
          console.error('[CameraView] Video error event:', e);
          console.error('[CameraView] Video error details:', bgVideo.error);
        }, { once: true });
        bgVideo.load();
      }
    } else {
      // Pause background video when camera is active
      console.log('[CameraView] Pausing video (camera active)');
      bgVideo.pause();
    }

    // Set up loop event listener
    const handleEnded = () => {
      console.log('[CameraView] Video ended, looping');
      if (bgVideo && !isCameraActive) {
        bgVideo.currentTime = 0;
        bgVideo.playbackRate = 0.75; // Ensure playback rate is maintained on loop
        bgVideo.play().catch((error) => {
          console.error('[CameraView] Error looping background video:', error);
        });
      }
    };

    bgVideo.addEventListener('ended', handleEnded);
    
    // Set playback rate when video can play
    const handleCanPlay = () => {
      bgVideo.playbackRate = 0.75;
    };
    bgVideo.addEventListener('canplay', handleCanPlay);

    return () => {
      bgVideo.removeEventListener('ended', handleEnded);
      bgVideo.removeEventListener('canplay', handleCanPlay);
    };
  }, [isCameraActive]);

  // Separate effect for frame capture loop - depends on isCameraActive
  useEffect(() => {
    if (!cameraService || !isCameraActive) {
      // Stop frame loop if camera is not active
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      // Clear canvas when camera stops
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
      return;
    }

    // Start frame capture loop
    const captureFrame = () => {
      if (!cameraService || !isCameraActive) {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        return;
      }

      if (cameraService.isActive()) {
        try {
          const imageData = cameraService.readFrame();
          
          // Draw to canvas for display FIRST (non-blocking)
          if (canvasRef.current && imageData) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) {
              canvasRef.current.width = imageData.width;
              canvasRef.current.height = imageData.height;
              ctx.putImageData(imageData, 0, 0);
            }
          }

          // Process frame in background (don't await - non-blocking)
          // Throttle to ~30 FPS to avoid overwhelming MediaPipe
          if (imageData && onFrameReady) {
            const now = Date.now();
            const minInterval = 1000 / 30; // 30 FPS max
            
            if (now - lastProcessTimeRef.current >= minInterval) {
              lastProcessTimeRef.current = now;
              // Fire and forget - don't block the frame loop
              Promise.resolve(onFrameReady(imageData)).catch((error: any) => {
                console.error('CameraView: Error in frame processing:', error);
              });
            }
          }
        } catch (error) {
          console.error('CameraView: Error reading frame:', error);
        }
      }

      animationFrameRef.current = requestAnimationFrame(captureFrame);
    };

    animationFrameRef.current = requestAnimationFrame(captureFrame);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [cameraService, isCameraActive, onFrameReady]);

  return (
    <div style={{ 
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: '#000'
    }}>
      {/* Background video - shown when camera is inactive */}
      {!isCameraActive && (
        <video
          ref={backgroundVideoRef}
          src={typeof window !== 'undefined' && window.location.protocol === 'http:'
            ? 'http://localhost:8080/assets/video/Scene-01-Full-Male.mp4'
            : '../assets/video/Scene-01-Full-Male.mp4'}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            position: 'absolute',
            top: 0,
            left: 0
          }}
          autoPlay
          loop
          muted
          playsInline
        />
      )}
      {/* Canvas for camera feed - shown when camera is active */}
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          display: isCameraActive ? 'block' : 'none'
        }}
      />
    </div>
  );
};

