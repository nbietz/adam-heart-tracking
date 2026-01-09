/**
 * Main App component.
 * Ported from src/ui/main_window.py
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CameraView } from './components/CameraView';
import { HeartOverlay } from './components/HeartOverlay';
import { HeartRateDisplay } from './components/HeartRateDisplay';
import { HeartRateZones } from './components/HeartRateZones';
import { Controls } from './components/Controls';
import { CameraService } from './services/camera-service';
import { PoseTracker, PoseResults } from './services/pose-tracker';
import { UserTracker, User } from './services/user-tracker';
import { ANIMATION_SMOOTHING, HEART_BEAT_SCALE_AMPLITUDE } from './utils/config';

// Helper function to convert ImageData to HTMLImageElement/Canvas
function imageDataToCanvas(imageData: ImageData): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.putImageData(imageData, 0, 0);
    }
    resolve(canvas);
  });
}

// Helper function to calculate the center x-coordinate of a pose
function calculatePoseCenterX(landmarks: any[]): number {
  // Use shoulders (11, 12) or hips (23, 24) to calculate center
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  if (leftShoulder && rightShoulder && leftShoulder.visibility > 0.5 && rightShoulder.visibility > 0.5) {
    return (leftShoulder.x + rightShoulder.x) / 2;
  }
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  if (leftHip && rightHip && leftHip.visibility > 0.5 && rightHip.visibility > 0.5) {
    return (leftHip.x + rightHip.x) / 2;
  }
  return landmarks[0]?.x || 0.5;  // Fallback to nose
}

const App: React.FC = () => {
  // Services
  const [cameraService, setCameraService] = useState<CameraService | null>(null);
  const [poseTracker, setPoseTracker] = useState<PoseTracker | null>(null);
  const userTrackerRef = useRef<UserTracker | null>(null);

  // State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [discoveredDevices, setDiscoveredDevices] = useState<Array<{ name: string; address: string }>>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [initialScanComplete, setInitialScanComplete] = useState(false);
  const [connectingDevices, setConnectingDevices] = useState<Set<string>>(new Set());
  const cameraFrameSizeRef = useRef<{ width: number; height: number } | null>(null);

  // Animation state per user
  const userBeatScalesRef = useRef<Map<number, number>>(new Map());
  const userSmoothedBeatScalesRef = useRef<Map<number, number>>(new Map()); // Smoothed beat scales
  const userBPMRefs = useRef<Map<number, { current: number | null; target: number | null; pulseStart: number | null }>>(new Map());
  const startTimeRef = useRef<number>(Date.now());
  const pulseDuration = 0.3; // seconds
  const BEAT_SCALE_SMOOTHING = 0.15; // Smoothing factor for beat scale changes (lower = smoother)

  // Initialize services
  useEffect(() => {
    const cam = new CameraService();
    setCameraService(cam);

    // Initialize pose tracker
    const pose = new PoseTracker();
    setPoseTracker(pose);

    // Initialize user tracker
    const userTracker = new UserTracker();
    userTrackerRef.current = userTracker;

    // Update users state when user tracker changes
    const updateUsers = () => {
      setUsers(userTracker.getUsers());
    };
    
    // Poll for user changes (could be improved with events)
    const userUpdateInterval = setInterval(updateUsers, 100);

    return () => {
      cam.stop();
      pose.close();
      clearInterval(userUpdateInterval);
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
      const tracker = userTrackerRef.current;
      if (!tracker) return;

      // Remove from connecting set
      setConnectingDevices(prev => {
        const next = new Set(prev);
        next.delete(address);
        return next;
      });

      // Find device name
      const name = deviceName || discoveredDevices.find(d => d.address === address)?.name || 'Polar H10';
      
      // Check if device is already assigned to a user
      const existingUser = tracker.getUserByDevice(address);
      if (existingUser) {
        // Device already assigned, just update name if needed
        if (existingUser.deviceName !== name) {
          tracker.assignDevice(existingUser.userId, address, name);
        }
        setUsers(tracker.getUsers());
        return;
      }
      
      // Try to find a user without a device to reassign
      const usersWithoutDevices = tracker.getUsersWithoutDevices();
      if (usersWithoutDevices.length > 0) {
        // Reassign device to existing user without a device
        const userToReassign = usersWithoutDevices[0];
        tracker.assignDevice(userToReassign.userId, address, name);
        console.log(`[App] Reassigned device ${name} (${address}) to existing User ${userToReassign.userId}`);
        setUsers(tracker.getUsers());
        return;
      }
      
      // Check if we can add a new user (max 2 users)
      const currentUsers = tracker.getUsers();
      if (currentUsers.length >= 2) {
        console.warn(`[App] Maximum number of users (2) reached. Cannot connect device ${name} (${address})`);
        // Show user-friendly message
        alert('Maximum of 2 users supported. Please disconnect a user before connecting another device.');
        return;
      }
      
      // Create a new user when a device connects
      // User 1 = first device, User 2 = second device
      const userId = tracker.addUser(address, name);
      if (userId === null) {
        console.error(`[App] Failed to create user for device ${name} (${address})`);
        alert('Failed to create user. Maximum number of users may have been reached.');
        return;
      }
      tracker.assignDevice(userId, address, name);
      console.log(`[App] Created User ${userId} for device ${name} (${address})`);
      setUsers(tracker.getUsers());
    });

    window.electronAPI.onBLEDisconnected((address?: string) => {
      const tracker = userTrackerRef.current;
      if (!tracker) return;

      // Remove from connecting set if it was connecting
      if (address) {
        setConnectingDevices(prev => {
          const next = new Set(prev);
          next.delete(address);
          return next;
        });
      }

      if (address) {
        // Disconnect specific device - unassign device but keep the user
        // Only unassign if the device is still assigned (to avoid double-unassign)
        const user = tracker.getUserByDevice(address);
        if (user && user.deviceAddress === address) {
          tracker.unassignDevice(user.userId);
        }
      } else {
        // Disconnect all - unassign all devices but keep users
        const usersWithDevices = tracker.getUsersWithDevices();
        for (const user of usersWithDevices) {
          tracker.unassignDevice(user.userId);
        }
      }
      setUsers(tracker.getUsers());
    });

    window.electronAPI.onBLEHeartRate((hr: number, address?: string) => {
      if (!hr || hr <= 0 || hr >= 300) return; // Sanity check
      
      const tracker = userTrackerRef.current;
      if (!tracker || !address) return;

      // Update heart rate for user with this device
      tracker.updateHeartRate(address, hr);
      
      // Update animation state for this user
      const user = tracker.getUserByDevice(address);
      if (user) {
        let bpmState = userBPMRefs.current.get(user.userId);
        if (!bpmState) {
          bpmState = { current: null, target: null, pulseStart: null };
          userBPMRefs.current.set(user.userId, bpmState);
        }
        bpmState.target = hr;
        bpmState.pulseStart = Date.now() / 1000;
      }
      
      setUsers(tracker.getUsers());
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

  // Animation loop for heartbeat (per user)
  useEffect(() => {
    const animate = () => {
      const currentTime = Date.now() / 1000;
      const tracker = userTrackerRef.current;
      if (!tracker) {
        requestAnimationFrame(animate);
        return;
      }

        // Update beat scales for all users
      const currentUsers = tracker.getUsers();
      for (const user of currentUsers) {
        const bpmState = userBPMRefs.current.get(user.userId);
        if (!bpmState) {
          userBeatScalesRef.current.set(user.userId, 0.0);
          userSmoothedBeatScalesRef.current.set(user.userId, 0.0);
          continue;
        }

        let beatScale = 0.0;

        // Handle heartbeat pulse
        if (bpmState.pulseStart !== null) {
          const pulseElapsed = currentTime - bpmState.pulseStart;

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

            beatScale = pulse;
          } else {
            bpmState.pulseStart = null;
          }
        }

        // Fallback to BPM-based animation
        if (bpmState.pulseStart === null && bpmState.target !== null) {
          // Smooth BPM transition
          if (bpmState.current === null) {
            bpmState.current = bpmState.target;
          } else {
            const diff = bpmState.target - bpmState.current;
            bpmState.current += diff * ANIMATION_SMOOTHING;
          }

          if (bpmState.current > 0) {
            const elapsed = (Date.now() - startTimeRef.current) / 1000;
            const beatInterval = 60.0 / bpmState.current;
            const phase = ((elapsed % beatInterval) / beatInterval) * 2.0 * Math.PI;

            let pulse: number;
            if (phase < Math.PI) {
              pulse = Math.sin(phase) * HEART_BEAT_SCALE_AMPLITUDE;
            } else {
              pulse = Math.sin(phase) * HEART_BEAT_SCALE_AMPLITUDE * 0.5;
            }

            beatScale = pulse;
          } else {
            beatScale = 0.0;
          }
        }

        // Store raw beat scale
        userBeatScalesRef.current.set(user.userId, beatScale);
        
        // Apply smoothing to beat scale for smooth size transitions
        const lastSmoothed = userSmoothedBeatScalesRef.current.get(user.userId) || 0.0;
        const smoothedBeatScale = lastSmoothed * (1.0 - BEAT_SCALE_SMOOTHING) + beatScale * BEAT_SCALE_SMOOTHING;
        userSmoothedBeatScalesRef.current.set(user.userId, smoothedBeatScale);
      }

      // Trigger re-render by updating users (which will cause components to re-render)
      setUsers([...currentUsers]);

      requestAnimationFrame(animate);
    };

    const frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Handle frame processing - non-blocking
  const handleFrameReady = useCallback(async (imageData: ImageData | null) => {
    if (!isCameraActive) {
      // Mark all users as invisible when camera is inactive
      const tracker = userTrackerRef.current;
      if (tracker) {
        for (const user of tracker.getUsers()) {
          tracker.updateChestPosition(user.userId, null);
        }
        setUsers(tracker.getUsers());
      }
      return;
    }
    
    if (!imageData || !poseTracker) {
      return;
    }

    const tracker = userTrackerRef.current;
    if (!tracker) return;

    try {
      // Store camera frame size for scaling
      cameraFrameSizeRef.current = { width: imageData.width, height: imageData.height };

      const usersWithDevices = tracker.getUsersWithDevices();
      
      if (usersWithDevices.length === 0) {
        // No users with devices - don't track poses
        return;
      }

      // Process frame - PoseLandmarker returns array of poses (multi-person support)
      const results: PoseResults = await poseTracker.process(imageData, Date.now());
      
      // Log person count
      const personCount = results.poseLandmarks?.length || 0;
      console.log(`[App] Detected ${personCount} person(s) in frame`);
      
      const detectedPoses: Array<{ user: User; chestPos2d: { x: number; y: number } }> = [];

      if (personCount === 0) {
        // No poses detected - mark all users as invisible
        for (const user of usersWithDevices) {
          tracker.updateChestPosition(user.userId, null);
        }
      } else {
        // Calculate chest positions for all detected poses
        const poseChestPositions: Array<{ pose: any; chestPos2d: { x: number; y: number } | null; centerX: number }> = [];
        
        for (const pose of results.poseLandmarks!) {
          // Try each user's chest tracker to get position
          // We'll use the first user's tracker as a temporary measure to calculate position
          const tempChestPos2d = usersWithDevices[0]?.chestTracker.getChestPosition2d(
            pose as any,
            imageData.width,
            imageData.height,
            true
          );
          
          if (tempChestPos2d) {
            poseChestPositions.push({
              pose,
              chestPos2d: { x: tempChestPos2d[0], y: tempChestPos2d[1] },
              centerX: calculatePoseCenterX(pose)
            });
          }
        }

        // Assign poses to users using distance-based matching
        // This prevents hearts from jumping between bodies
        const assignments: Array<{ user: User; poseIndex: number; distance: number }> = [];
        const usedPoseIndices = new Set<number>();
        const usedUserIds = new Set<number>();

        // First pass: assign poses to users based on distance to last known position
        // Use a greedy algorithm: for each user, find the closest unassigned pose
        for (const user of usersWithDevices) {
          if (!user.chestTracker) continue;
          
          let bestMatch: { poseIndex: number; distance: number } | null = null;
          
          for (let i = 0; i < poseChestPositions.length; i++) {
            if (usedPoseIndices.has(i)) continue;
            
            const poseData = poseChestPositions[i];
            if (!poseData.chestPos2d) continue;
            
            // Calculate distance using user's own tracker for accuracy
            const userChestPos2d = user.chestTracker.getChestPosition2d(
              poseData.pose as any,
              imageData.width,
              imageData.height,
              true
            );
            
            if (!userChestPos2d) continue;
            
            // Calculate distance to user's last known position
            let distance: number;
            if (user.chestPosition2d) {
              const dx = userChestPos2d[0] - user.chestPosition2d.x;
              const dy = userChestPos2d[1] - user.chestPosition2d.y;
              distance = Math.sqrt(dx * dx + dy * dy);
              
              // Maximum distance threshold: if pose is too far from last known position,
              // don't assign it (prevents hearts from jumping to distant poses)
              // Threshold is 30% of frame width (reasonable movement distance)
              const maxDistance = imageData.width * 0.3;
              if (distance > maxDistance) {
                continue; // Skip this pose - too far away
              }
            } else {
              // If user has no last position, assign based on order (first user gets first pose)
              // Use a small distance to prioritize users without positions
              distance = i * 100; // Prefer earlier poses for users without positions
            }
            
            if (bestMatch === null || distance < bestMatch.distance) {
              bestMatch = { poseIndex: i, distance };
            }
          }
          
          if (bestMatch) {
            assignments.push({ user, poseIndex: bestMatch.poseIndex, distance: bestMatch.distance });
            usedPoseIndices.add(bestMatch.poseIndex);
            usedUserIds.add(user.userId);
          }
        }

        // Second pass: assign remaining poses to remaining users (if any)
        // Sort by x-position for remaining assignments
        const remainingPoses = poseChestPositions
          .map((p, i) => ({ ...p, index: i }))
          .filter((p, i) => !usedPoseIndices.has(i))
          .sort((a, b) => a.centerX - b.centerX);
        
        const remainingUsers = usersWithDevices.filter(u => !usedUserIds.has(u.userId));
        
        for (let i = 0; i < Math.min(remainingPoses.length, remainingUsers.length); i++) {
          const poseData = remainingPoses[i];
          const user = remainingUsers[i];
          
          if (!user.chestTracker) continue;
          
          // Recalculate with user's own tracker
          const chestPos2d = user.chestTracker.getChestPosition2d(
            poseData.pose as any,
            imageData.width,
            imageData.height,
            true
          );
          
          if (chestPos2d) {
            assignments.push({
              user,
              poseIndex: poseData.index,
              distance: 0
            });
          }
        }

        // Process assignments and calculate final chest positions
        for (const assignment of assignments) {
          const poseData = poseChestPositions[assignment.poseIndex];
          if (!poseData || !poseData.chestPos2d) continue;
          
          // Recalculate with user's own tracker for consistency
          const chestPos2d = assignment.user.chestTracker.getChestPosition2d(
            poseData.pose as any,
            imageData.width,
            imageData.height,
            true
          );
          
          if (chestPos2d) {
            detectedPoses.push({ 
              user: assignment.user, 
              chestPos2d: { x: chestPos2d[0], y: chestPos2d[1] } 
            });
          }
        }
      }

      // Update chest positions for detected poses
      for (const detected of detectedPoses) {
        tracker.updateChestPosition(detected.user.userId, detected.chestPos2d);
        // #region agent log
        // Removed frequent logging
        // #endregion
      }

      // Mark users without detected poses as invisible (but keep them if they have devices)
      const detectedUserIds = new Set(detectedPoses.map(p => p.user.userId));
      for (const user of usersWithDevices) {
        if (!detectedUserIds.has(user.userId)) {
          tracker.updateChestPosition(user.userId, null);
          // #region agent log
          // Removed frequent logging - only log when state changes
          // #endregion
        }
      }
      
      setUsers(tracker.getUsers());
    } catch (error) {
      console.error('Error processing frame:', error);
    }
  }, [poseTracker, isCameraActive]);

  // Clear heart overlays when camera is stopped
  useEffect(() => {
    if (!isCameraActive) {
      const tracker = userTrackerRef.current;
      if (tracker) {
        for (const user of tracker.getUsers()) {
          tracker.updateChestPosition(user.userId, null);
        }
        setUsers(tracker.getUsers());
      }
    }
  }, [isCameraActive]);

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

      {/* Heart Overlays - one per user with device */}
      {users
        .filter(user => user.deviceAddress) // Only show overlays for users with devices
        .map((user) => {
          // Show overlay if user has a pose position, otherwise show at center (temporary)
          const chestPos = user.chestPosition2d || (user.isVisible ? null : null);
          if (!chestPos) return null; // Don't show overlay if no pose detected yet
          
          // Use smoothed beat scale for smooth animation
          const beatScale = userSmoothedBeatScalesRef.current.get(user.userId) || 0.0;
          return (
            <HeartOverlay
              key={user.userId}
              chestPosition2d={chestPos}
              beatScale={beatScale}
              width={viewport.width}
              height={viewport.height}
              cameraFrameWidth={cameraFrameSizeRef.current?.width}
              cameraFrameHeight={cameraFrameSizeRef.current?.height}
              color={user.color}
            />
          );
        })}

      {/* Heart Rate Displays - one per user with device */}
      {/* FIX: Show heart rate displays for users with devices, regardless of pose detection */}
      {users
        .filter(user => user.deviceAddress) // Only require device, not isVisible
        .map((user, index) => (
          <HeartRateDisplay
            key={user.userId}
            heartRate={user.heartRate}
            isConnected={true}
            deviceName={user.deviceName || undefined}
            color={user.color}
            positionOffset={index} // Offset position to avoid overlap
          />
        ))}

      {/* Heart Rate Zones Bar Graphs - one per user with device */}
      {/* FIX: Show heart rate zones for users with devices and heart rate, regardless of pose detection */}
      {users
        .filter(user => user.deviceAddress && user.heartRate) // Only require device and heart rate, not isVisible
        .map((user, index) => (
          <HeartRateZones
            key={user.userId}
            heartRate={user.heartRate}
            age={30} // Default age, can be made configurable later
            color={user.color}
            positionOffset={index} // Offset position to avoid overlap
          />
        ))}

      {/* Controls */}
      <Controls
        cameraService={cameraService}
        onCameraStart={() => setIsCameraActive(true)}
        onCameraStop={() => setIsCameraActive(false)}
        onBLEConnect={(address) => {
          // Add to connecting set for visual feedback
          setConnectingDevices(prev => new Set(prev).add(address));
          if (window.electronAPI) {
            window.electronAPI.bleConnect(address).catch((error: any) => {
              // Remove from connecting set on error
              setConnectingDevices(prev => {
                const next = new Set(prev);
                next.delete(address);
                return next;
              });
              console.error('[App] Connection error:', error);
            });
          }
        }}
        onBLEDisconnect={(address) => {
          if (window.electronAPI) {
            window.electronAPI.bleDisconnect(address).catch((error) => {
              console.error('App: Disconnect error:', error);
            });
          }
        }}
        onAssignDevice={(userId, deviceAddress) => {
          const tracker = userTrackerRef.current;
          if (tracker) {
            const device = discoveredDevices.find(d => d.address === deviceAddress);
            if (device) {
              tracker.assignDevice(userId, deviceAddress, device.name);
              setUsers(tracker.getUsers());
            }
          }
        }}
        onUnassignDevice={(userId) => {
          const tracker = userTrackerRef.current;
          if (tracker) {
            tracker.unassignDevice(userId);
            setUsers(tracker.getUsers());
          }
        }}
        users={users}
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
        connectingDevices={connectingDevices}
      />

    </div>
  );
};

export default App;

