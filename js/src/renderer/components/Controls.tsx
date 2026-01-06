/**
 * Controls component.
 */

import React, { useState, useEffect, useRef } from 'react';
import { CameraService, CameraDevice } from '../services/camera-service';
import { User } from '../services/user-tracker';
import { getColorForDevice } from '../utils/user-colors';
import '../styles/ecg-theme.css';

interface ControlsProps {
  cameraService: CameraService | null;
  onCameraStart: () => void;
  onCameraStop: () => void;
  onBLEConnect: (address: string) => void;
  onBLEDisconnect: (address?: string) => void;
  onAssignDevice: (userId: number, deviceAddress: string) => void;
  onUnassignDevice: (userId: number) => void;
  users: User[];
  discoveredDevices: Array<{ name: string; address: string }>;
  isScanning: boolean;
  initialScanComplete: boolean;
  onRescan: () => void;
  isCameraActive: boolean;
  connectingDevices: Set<string>;
}

export const Controls: React.FC<ControlsProps> = ({
  cameraService,
  onCameraStart,
  onCameraStop,
  onBLEConnect,
  onBLEDisconnect,
  onAssignDevice,
  onUnassignDevice,
  users,
  discoveredDevices,
  isScanning,
  initialScanComplete,
  onRescan,
  isCameraActive,
  connectingDevices
}) => {
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  // Local ref to track pending connections (prevents race conditions with async state updates)
  const pendingConnectionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    
    
    if (cameraService) {
      // Delay slightly to ensure component is fully mounted
      const timeoutId = setTimeout(() => {
        loadCameras();
      }, 100);
      
      // Listen for device changes
      const handleDeviceChange = () => {
        loadCameras();
      };
      
      let deviceChangeListener: (() => void) | null = null;
      if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
        navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
        deviceChangeListener = handleDeviceChange;
      }
      
      return () => {
        clearTimeout(timeoutId);
        if (deviceChangeListener && navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
          navigator.mediaDevices.removeEventListener('devicechange', deviceChangeListener);
        }
      };
    }
  }, [cameraService]);

  const loadCameras = async () => {
    if (!cameraService) {
      console.error('loadCameras: CameraService is null!');
      return;
    }
    
    try {
      const devices = await cameraService.getDevices();
      setCameras(devices);
      
      if (devices.length > 0) {
        setSelectedCamera(devices[0].deviceId);
      }
    } catch (error: any) {
      console.error('loadCameras: Error loading cameras:', error);
      console.error('loadCameras: Error name:', error?.name);
      console.error('loadCameras: Error message:', error?.message);
      console.error('loadCameras: Error stack:', error?.stack);
    }
  };

  const handleStartCamera = async () => {
    if (cameraService && selectedCamera) {
      await cameraService.start(selectedCamera);
      onCameraStart();
    }
  };

  const handleStopCamera = async () => {
    if (cameraService) {
      await cameraService.stop();
      onCameraStop();
    }
  };


  const handleConnect = async (address: string) => {
    if (!address || address.trim() === '') {
      console.error('Controls: Cannot connect - address is empty');
      alert('Cannot connect: Device address is missing. Please try scanning again.');
      return;
    }
    
    // Check if already connecting (using both state and ref for immediate blocking)
    if (connectingDevices.has(address) || pendingConnectionsRef.current.has(address)) {
      console.log(`Controls: Device ${address} is already connecting`);
      return; // Already connecting, don't do anything
    }
    
    // Check if device is already BLE-connected (has heart rate data)
    // Assignment != BLE connection - a device can be assigned but not BLE-connected
    const userWithDevice = users.find(user => user.deviceAddress === address);
    if (userWithDevice && userWithDevice.heartRate !== undefined && userWithDevice.heartRate !== null) {
      console.log(`Controls: Device ${address} is already BLE-connected (has heart rate data)`);
      // Device is already connected and receiving data, don't reconnect
      return;
    }
    
    // Check if we've reached the maximum number of users (2) - but only if device is not already assigned
    // If device is assigned but not connected, we should still allow connection
    if (!userWithDevice) {
      const usersWithDevices = users.filter(user => user.deviceAddress);
      if (usersWithDevices.length >= 2) {
        alert('Maximum of 2 users supported. Please disconnect a user before connecting another device.');
        return;
      }
    }
    
    // Add to pending connections immediately (synchronous) to prevent multiple clicks
    pendingConnectionsRef.current.add(address);
    
    // Call onBLEConnect which will add to connectingDevices and start the connection
    onBLEConnect(address);
    
    // Note: pendingConnectionsRef will be cleared when connection succeeds/fails via connectingDevices state
    // But we also clear it when the device is removed from connectingDevices
  };
  
  // Clear pending connections when they're no longer in connectingDevices
  useEffect(() => {
    // Remove any addresses from pendingConnectionsRef that are no longer in connectingDevices
    // This handles the case where connection succeeds or fails
    pendingConnectionsRef.current.forEach(address => {
      if (!connectingDevices.has(address)) {
        pendingConnectionsRef.current.delete(address);
      }
    });
  }, [connectingDevices]);

  const handleDisconnect = (address?: string) => {
    if (window.electronAPI) {
      window.electronAPI.bleDisconnect(address);
    }
    onBLEDisconnect(address);
  };

  // Get connected device addresses
  const connectedDevices = users
    .filter(user => user.deviceAddress)
    .map(user => user.deviceAddress!);
  
  // Get unassigned devices (discovered but not connected or not assigned)
  const unassignedDevices = discoveredDevices.filter(device => 
    !connectedDevices.includes(device.address)
  );

  // Get users without devices
  const usersWithoutDevices = users.filter(user => !user.deviceAddress && user.isVisible);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: '15px',
        alignItems: 'center'
      }}
    >
      {/* Camera Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {cameras.length === 0 ? (
          <div className="ecg-panel" style={{ padding: '10px 15px', border: '1px solid var(--ecg-border)' }}>
            <div className="ecg-text" style={{ fontSize: '10px', opacity: 0.8, marginBottom: '8px' }}>
              No cameras found
            </div>
            <button 
              className="ecg-button"
              onClick={async () => {
                
                // First try to get permission
                try {
                  const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { 
                      width: { ideal: 640 },
                      height: { ideal: 480 }
                    } 
                  });
                  const tracks = stream.getVideoTracks();
                  
                  // Stop the stream
                  stream.getTracks().forEach(track => {
                    track.stop();
                  });
                  
                  // Wait a moment for permissions to propagate
                  await new Promise(resolve => setTimeout(resolve, 1000));

                  // Now enumerate devices directly
                  const allDevices = await navigator.mediaDevices.enumerateDevices();
                  const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
                  
                  if (videoDevices.length > 0) {
                    const deviceList = videoDevices.map(d => ({
                      deviceId: d.deviceId,
                      label: d.label || `Camera ${d.deviceId.substring(0, 8)}`
                    }));
                    setCameras(deviceList);
                    if (deviceList.length > 0) {
                      setSelectedCamera(deviceList[0].deviceId);
                    }
                  }

                  // Also try through the service
                  await loadCameras();
                } catch (err: any) {
                  console.error('Camera permission error:', err);
                  alert(`Camera permission error: ${err.name}\n${err.message}\n\nPlease grant camera access in System Preferences > Security & Privacy > Camera`);
                }
              }}
              style={{ fontSize: '10px', padding: '6px 12px' }}
            >
              Request Permission
            </button>
          </div>
        ) : (
          <>
            <select
              className="ecg-select"
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
              style={{ minWidth: '200px' }}
            >
              {cameras.map((cam) => (
                <option key={cam.deviceId} value={cam.deviceId}>
                  {cam.label}
                </option>
              ))}
            </select>
            <button 
              onClick={loadCameras}
              style={{ 
                padding: '8px 12px', 
                fontSize: '16px',
                background: 'transparent',
                border: 'none',
                color: 'var(--ecg-green)',
                cursor: 'pointer',
                textShadow: '0 0 10px var(--ecg-green-glow)',
                filter: 'drop-shadow(0 0 5px rgba(0, 255, 65, 0.8))'
              }}
              title="Refresh cameras"
            >
              <i className="fas fa-sync-alt"></i>
            </button>
            <button 
              onClick={isCameraActive ? handleStopCamera : handleStartCamera}
              disabled={!selectedCamera || cameras.length === 0}
              style={{ 
                padding: '8px 12px', 
                fontSize: '16px', 
                position: 'relative',
                background: 'transparent',
                border: 'none',
                color: 'var(--ecg-green)',
                cursor: 'pointer',
                textShadow: '0 0 10px var(--ecg-green-glow)',
                filter: 'drop-shadow(0 0 5px rgba(0, 255, 65, 0.8))'
              }}
              title={isCameraActive ? "Stop camera" : "Start camera"}
            >
              <i className="fas fa-video"></i>
              {isCameraActive && (
                <i className="fas fa-ban" style={{ 
                  position: 'absolute', 
                  top: '50%', 
                  left: '50%', 
                  transform: 'translate(-50%, -50%)',
                  fontSize: '20px',
                  color: 'var(--ecg-green)',
                  filter: 'drop-shadow(0 0 5px rgba(0, 255, 65, 0.8))'
                }}></i>
              )}
            </button>
          </>
        )}
      </div>

      {/* HR Monitor Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', maxWidth: '600px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label className="ecg-label" style={{ margin: 0 }}>HR Monitors:</label>
          {initialScanComplete && (
            <button
              onClick={onRescan}
              style={{ 
                padding: '4px 8px', 
                fontSize: '12px',
                background: 'transparent',
                border: 'none',
                color: 'var(--ecg-green)',
                cursor: 'pointer',
                textShadow: '0 0 10px var(--ecg-green-glow)',
                filter: 'drop-shadow(0 0 5px rgba(0, 255, 65, 0.8))'
              }}
              title="Rescan for devices"
            >
              <i className="fas fa-sync-alt"></i>
            </button>
          )}
        </div>
        
        {isScanning && (
          <div className="ecg-status" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>
            ● Scanning...
          </div>
        )}

        {/* Device Assignment UI */}
        {users.length > 0 && (
          <div className="ecg-panel" style={{ padding: '15px', width: '100%', maxHeight: '400px', overflowY: 'auto' }}>
            <div className="ecg-label" style={{ marginBottom: '10px', fontSize: '11px' }}>
              User Assignments
            </div>
            {users.map((user) => (
              <div key={user.userId} style={{ marginBottom: '10px', padding: '8px', border: `1px solid ${user.color}`, borderRadius: '3px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '2px',
                      backgroundColor: user.color,
                      boxShadow: `0 0 8px ${user.color}`
                    }}
                  />
                  <span className="ecg-text" style={{ fontSize: '11px', color: user.color }}>
                    User {user.userId} {user.isVisible ? '(Visible)' : '(Hidden)'}
                  </span>
                  {user.deviceAddress && (
                    <button
                      className="ecg-button"
                      onClick={() => {
                        // Store device address before unassigning (since unassign clears it)
                        const deviceAddress = user.deviceAddress!;
                        // First unassign the device from the user (this clears deviceAddress)
                        onUnassignDevice(user.userId);
                        // Then disconnect the BLE device (this will trigger onBLEDisconnected,
                        // but since deviceAddress is already cleared, it won't find the user to unassign again)
                        handleDisconnect(deviceAddress);
                      }}
                      style={{ 
                        padding: '4px 8px', 
                        fontSize: '10px', 
                        marginLeft: 'auto',
                        backgroundColor: user.color,
                        borderColor: user.color,
                        boxShadow: `0 0 10px ${user.color}`,
                        textShadow: `0 0 5px ${user.color}`
                      }}
                    >
                      Unassign
                    </button>
                  )}
                </div>
                {user.deviceAddress ? (
                  <div style={{ fontSize: '10px', opacity: 0.8, color: user.color }}>
                    Device: {user.deviceName} ({user.deviceAddress.substring(0, 8)}...)
                    {user.heartRate && ` - ${user.heartRate} BPM`}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div className="ecg-text" style={{ fontSize: '10px', opacity: 0.7, marginBottom: '4px' }}>
                      Assign device:
                    </div>
                    {unassignedDevices.length > 0 ? (
                      unassignedDevices.map((device) => {
                        // Check if we've reached max users before allowing assignment
                        const currentUsersWithDevices = users.filter(u => u.deviceAddress);
                        const canAssign = currentUsersWithDevices.length < 2 || user.deviceAddress !== null;
                        const deviceColor = getColorForDevice(device.address) || 'var(--ecg-green)';
                        return (
                          <button
                            key={device.address}
                            className="ecg-button"
                            onClick={async () => {
                              if (!canAssign) {
                                alert('Maximum of 2 users supported. Please disconnect a user before assigning a device.');
                                return;
                              }
                              // Check if already connecting (using both state and ref for immediate blocking)
                              if (connectingDevices.has(device.address) || pendingConnectionsRef.current.has(device.address)) {
                                return; // Already connecting, don't do anything
                              }
                              // Manually assign the device to the specific user first
                              // This ensures the device is assigned to the correct user before the BLE connected event fires
                              onAssignDevice(user.userId, device.address);
                              // Then connect the device (the BLE connected event will see it's already assigned and skip auto-assignment)
                              await handleConnect(device.address);
                            }}
                            disabled={!canAssign || connectingDevices.has(device.address) || pendingConnectionsRef.current.has(device.address)}
                            style={{ 
                              padding: '4px 8px', 
                              fontSize: '10px', 
                              textAlign: 'left',
                              opacity: (canAssign && !connectingDevices.has(device.address) && !pendingConnectionsRef.current.has(device.address)) ? 1 : 0.5,
                              cursor: (canAssign && !connectingDevices.has(device.address) && !pendingConnectionsRef.current.has(device.address)) ? 'pointer' : 'not-allowed',
                              backgroundColor: (canAssign && !connectingDevices.has(device.address) && !pendingConnectionsRef.current.has(device.address)) ? deviceColor : undefined,
                              borderColor: deviceColor,
                              boxShadow: (canAssign && !connectingDevices.has(device.address) && !pendingConnectionsRef.current.has(device.address)) ? `0 0 10px ${deviceColor}` : undefined,
                              textShadow: (canAssign && !connectingDevices.has(device.address) && !pendingConnectionsRef.current.has(device.address)) ? `0 0 5px ${deviceColor}` : undefined,
                              position: 'relative'
                            }}
                          >
                            {(connectingDevices.has(device.address) || pendingConnectionsRef.current.has(device.address)) ? (
                              <>
                                <i className="fas fa-spinner fa-spin" style={{ marginRight: '4px' }}></i>
                                Connecting...
                              </>
                            ) : (
                              device.name
                            )}
                          </button>
                        );
                      })
                    ) : (
                      <div className="ecg-text" style={{ fontSize: '9px', opacity: 0.6, fontStyle: 'italic' }}>
                        No unassigned devices
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Available Devices */}
        {unassignedDevices.length > 0 && (
          <div className="ecg-panel" style={{ padding: '15px', width: '100%' }}>
            <div className="ecg-label" style={{ marginBottom: '10px', fontSize: '11px' }}>
              Available Devices
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {unassignedDevices.map((device) => {
                const deviceColor = getColorForDevice(device.address) || 'var(--ecg-green)';
                const isConnecting = connectingDevices.has(device.address) || pendingConnectionsRef.current.has(device.address);
                return (
                  <button
                    key={device.address}
                    className="ecg-button"
                    onClick={() => {
                      if (!isConnecting) {
                        handleConnect(device.address);
                      }
                    }}
                    disabled={isConnecting}
                    style={{ 
                      fontSize: '11px',
                      padding: '6px 12px',
                      textAlign: 'left',
                      backgroundColor: isConnecting ? undefined : deviceColor,
                      borderColor: deviceColor,
                      boxShadow: isConnecting ? undefined : `0 0 10px ${deviceColor}`,
                      textShadow: isConnecting ? undefined : `0 0 5px ${deviceColor}`,
                      opacity: isConnecting ? 0.5 : 1,
                      cursor: isConnecting ? 'not-allowed' : 'pointer',
                      position: 'relative'
                    }}
                  >
                    {isConnecting ? (
                      <>
                        <i className="fas fa-spinner fa-spin" style={{ marginRight: '4px' }}></i>
                        Connecting: {device.name}
                      </>
                    ) : (
                      `Connect: ${device.name}`
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {initialScanComplete && discoveredDevices.length === 0 && (
          <div className="ecg-text" style={{ fontSize: '10px', opacity: 0.6, fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '1px' }}>
            No devices found
          </div>
        )}
      </div>
    </div>
  );
};

// Extend Window interface for TypeScript
declare global {
  interface Window {
    electronAPI?: {
      bleStartScanning: () => Promise<void>;
      bleStopScanning: () => void;
      bleConnect: (address: string) => Promise<boolean>;
      bleDisconnect: (address?: string) => Promise<void>;
      bleGetConnected: () => Promise<boolean>;
      onBLEDeviceDiscovered: (callback: (device: any) => void) => void;
      onBLEConnected: (callback: (address: string, deviceName?: string) => void) => void;
      onBLEDisconnected: (callback: (address?: string) => void) => void;
      onBLEHeartRate: (callback: (heartRate: number, address?: string) => void) => void;
      onBLEError: (callback: (error: Error) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}

