/**
 * Main App component.
 * Ported from src/ui/main_window.py
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CameraView } from './components/CameraView';
import { HeartOverlay } from './components/HeartOverlay';
import { HeartRateDisplay } from './components/HeartRateDisplay';
import { Controls } from './components/Controls';
import { CameraService } from './services/camera-service';
import { PoseTracker, PoseResults } from './services/pose-tracker';
import { ChestTracker } from './services/chest-tracker';
import { ANIMATION_SMOOTHING, HEART_BEAT_SCALE_AMPLITUDE } from './utils/config';

const App: React.FC = () => {
  // Services
  const [cameraService, setCameraService] = useState<CameraService | null>(null);
  const [poseTracker, setPoseTracker] = useState<PoseTracker | null>(null);
  const [chestTracker, setChestTracker] = useState<ChestTracker | null>(null);

  // State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [heartRate, setHeartRate] = useState<number | null>(null);
  const [isBLEConnected, setIsBLEConnected] = useState(false);
  const [deviceAddress, setDeviceAddress] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [discoveredDevices, setDiscoveredDevices] = useState<Array<{ name: string; address: string }>>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [initialScanComplete, setInitialScanComplete] = useState(false);
  const [chestPosition2d, setChestPosition2d] = useState<{ x: number; y: number } | null>(null);
  const [beatScale, setBeatScale] = useState(0.0);
  const cameraFrameSizeRef = useRef<{ width: number; height: number } | null>(null);

  // Animation state
  const currentBPMRef = useRef<number | null>(null);
  const targetBPMRef = useRef<number | null>(null);
  const heartbeatPulseStartRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const pulseDuration = 0.3; // seconds

  // Debug logging flags
  const poseDetectedLoggedRef = useRef(false);
  const chestPositionLoggedRef = useRef(false);
  const chestPositionNullLoggedRef = useRef(false);
  const noPoseLoggedRef = useRef(false);

  // Initialize services
  useEffect(() => {
    const cam = new CameraService();
    setCameraService(cam);

    // Initialize pose tracker
    const pose = new PoseTracker();
    setPoseTracker(pose);

    // Initialize chest tracker
    const chest = new ChestTracker();
    setChestTracker(chest);

    return () => {
      cam.stop();
      pose.close();
    };
  }, []);

  // Auto-start scanning on mount
  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }

    setIsScanning(true);
    window.electronAPI.bleStartScanning().then(() => {
      setIsScanning(false);
      setInitialScanComplete(true);
    }).catch((error) => {
      console.error('App: BLE scan error:', error);
      setIsScanning(false);
      setInitialScanComplete(true);
    });
  }, []);

  // Setup BLE event listeners
  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }

    window.electronAPI.onBLEDeviceDiscovered((device) => {
      setDiscoveredDevices((prev) => {
        // Avoid duplicates by address
        if (prev.find((d) => d.address === device.address)) {
          return prev;
        }
        return [...prev, device];
      });
    });

    window.electronAPI.onBLEConnected((address: string, deviceName?: string) => {
      setIsBLEConnected(true);
      setDeviceAddress(address);
      // Use provided device name or find from discovered devices
      if (deviceName) {
        setDeviceName(deviceName);
      } else {
        const device = discoveredDevices.find(d => d.address === address);
        if (device) {
          setDeviceName(device.name);
        }
      }
    });

    window.electronAPI.onBLEDisconnected(() => {
      setIsBLEConnected(false);
      setDeviceAddress(null);
      setDeviceName(null);
      setHeartRate(null); // Clear heart rate on disconnect
      setChestPosition2d(null); // Clear heart overlay on disconnect
    });

    window.electronAPI.onBLEHeartRate((hr) => {
      if (hr && hr > 0 && hr < 300) { // Sanity check
        setHeartRate(hr);
        targetBPMRef.current = hr;
        heartbeatPulseStartRef.current = Date.now() / 1000;
      }
    });

    window.electronAPI.onBLEError((error) => {
      console.error('App: BLE error:', error);
    });

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeAllListeners('ble:deviceDiscovered');
        window.electronAPI.removeAllListeners('ble:connected');
        window.electronAPI.removeAllListeners('ble:disconnected');
        window.electronAPI.removeAllListeners('ble:heartRate');
        window.electronAPI.removeAllListeners('ble:error');
      }
    };
  }, [discoveredDevices]);

  // Animation loop for heartbeat
  useEffect(() => {
    const animate = () => {
      const currentTime = Date.now() / 1000;

      // Handle heartbeat pulse
      if (heartbeatPulseStartRef.current !== null) {
        const pulseElapsed = currentTime - heartbeatPulseStartRef.current;

        if (pulseElapsed < pulseDuration) {
          const progress = pulseElapsed / pulseDuration;
          let pulse: number;

          if (progress < 0.3) {
            // Quick expansion
            pulse = Math.sin((progress * Math.PI) / 0.3) * HEART_BEAT_SCALE_AMPLITUDE;
          } else {
            // Slow contraction
            const decayProgress = (progress - 0.3) / 0.7;
            pulse = Math.cos((decayProgress * Math.PI) / 2) * HEART_BEAT_SCALE_AMPLITUDE;
          }

          setBeatScale(pulse);
        } else {
          heartbeatPulseStartRef.current = null;
        }
      }

      // Fallback to BPM-based animation
      if (heartbeatPulseStartRef.current === null && targetBPMRef.current !== null) {
        // Smooth BPM transition
        if (currentBPMRef.current === null) {
          currentBPMRef.current = targetBPMRef.current;
        } else {
          const diff = targetBPMRef.current - currentBPMRef.current;
          currentBPMRef.current += diff * ANIMATION_SMOOTHING;
        }

        if (currentBPMRef.current > 0) {
          const elapsed = (Date.now() - startTimeRef.current) / 1000;
          const beatInterval = 60.0 / currentBPMRef.current;
          const phase = ((elapsed % beatInterval) / beatInterval) * 2.0 * Math.PI;

          let pulse: number;
          if (phase < Math.PI) {
            pulse = Math.sin(phase) * HEART_BEAT_SCALE_AMPLITUDE;
          } else {
            pulse = Math.sin(phase) * HEART_BEAT_SCALE_AMPLITUDE * 0.5;
          }

          setBeatScale(pulse);
        } else {
          setBeatScale(0.0);
        }
      }

      requestAnimationFrame(animate);
    };

    const frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Handle frame processing - non-blocking
  const handleFrameReady = useCallback(async (imageData: ImageData | null) => {
    if (!isCameraActive) {
      // Clear heart overlay when camera is inactive
      setChestPosition2d(null);
      return;
    }
    
    if (!imageData || !poseTracker || !chestTracker) {
      return;
    }

    try {
      // Process pose (this is async but we don't block on it)
      const results: PoseResults = await poseTracker.process(imageData);

      // Check if we have pose landmarks
      const hasLandmarks = results.poseLandmarks && 
                          Array.isArray(results.poseLandmarks) && 
                          results.poseLandmarks.length > 0;

      if (hasLandmarks) {
        // Track chest position in 2D screen coordinates
        const chestPos2d = chestTracker.getChestPosition2d(
          results.poseLandmarks as any,
          imageData.width,
          imageData.height
        );

        if (chestPos2d) {
          // Store camera frame size for scaling
          cameraFrameSizeRef.current = { width: imageData.width, height: imageData.height };
          setChestPosition2d({ x: chestPos2d[0], y: chestPos2d[1] });
        } else {
          setChestPosition2d(null);
        }
      } else {
        setChestPosition2d(null);
      }
    } catch (error) {
      console.error('Error processing frame:', error);
      setChestPosition2d(null);
    }
  }, [poseTracker, chestTracker, isCameraActive]);

  // Clear heart overlay when camera is stopped
  useEffect(() => {
    if (!isCameraActive) {
      setChestPosition2d(null);
    }
  }, [isCameraActive]);

  // Clear heart overlay when heart rate monitor is disconnected or no active pulse
  useEffect(() => {
    if (!isBLEConnected || heartRate === null || heartRate === 0) {
      setChestPosition2d(null);
    }
  }, [isBLEConnected, heartRate]);

  // Get viewport dimensions
  const [viewport, setViewport] = useState({ width: 1920, height: 1080 });

  useEffect(() => {
    const updateViewport = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', backgroundColor: '#000' }}>
      {/* Camera View - fills entire screen */}
      <CameraView
        cameraService={cameraService}
        isCameraActive={isCameraActive}
        onFrameReady={handleFrameReady}
      />

      {/* Heart Overlay */}
      <HeartOverlay
        chestPosition2d={chestPosition2d}
        beatScale={beatScale}
        width={viewport.width}
        height={viewport.height}
        cameraFrameWidth={cameraFrameSizeRef.current?.width}
        cameraFrameHeight={cameraFrameSizeRef.current?.height}
      />

      {/* Heart Rate Display */}
      <HeartRateDisplay
        heartRate={heartRate}
        isConnected={isBLEConnected}
        deviceName={deviceName}
      />

      {/* Controls */}
      <Controls
        cameraService={cameraService}
        onCameraStart={() => setIsCameraActive(true)}
        onCameraStop={() => setIsCameraActive(false)}
        onBLEConnect={(address) => {
          setDeviceAddress(address);
          setIsBLEConnected(true);
          const device = discoveredDevices.find(d => d.address === address);
          if (device) {
            setDeviceName(device.name);
          }
        }}
        onBLEDisconnect={() => {
          setDeviceAddress(null);
          setDeviceName(null);
          setIsBLEConnected(false);
        }}
        isBLEConnected={isBLEConnected}
        discoveredDevices={discoveredDevices}
        isScanning={isScanning}
        initialScanComplete={initialScanComplete}
        onRescan={() => {
          setIsScanning(true);
          setInitialScanComplete(false);
          if (window.electronAPI) {
            window.electronAPI.bleStartScanning().then(() => {
              setIsScanning(false);
              setInitialScanComplete(true);
            }).catch((error) => {
              console.error('App: Rescan error:', error);
              setIsScanning(false);
              setInitialScanComplete(true);
            });
          }
        }}
        isCameraActive={isCameraActive}
      />

    </div>
  );
};

export default App;

