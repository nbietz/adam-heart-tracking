/**
 * Controls component.
 */

import React, { useState, useEffect } from 'react';
import { CameraService, CameraDevice } from '../services/camera-service';
import '../styles/ecg-theme.css';

interface ControlsProps {
  cameraService: CameraService | null;
  onCameraStart: () => void;
  onCameraStop: () => void;
  onBLEConnect: (address: string) => void;
  onBLEDisconnect: () => void;
  isBLEConnected: boolean;
  discoveredDevices: Array<{ name: string; address: string }>;
  isScanning: boolean;
  initialScanComplete: boolean;
  onRescan: () => void;
  isCameraActive: boolean;
}

export const Controls: React.FC<ControlsProps> = ({
  cameraService,
  onCameraStart,
  onCameraStop,
  onBLEConnect,
  onBLEDisconnect,
  isBLEConnected,
  discoveredDevices,
  isScanning,
  initialScanComplete,
  onRescan,
  isCameraActive
}) => {
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [cameras, setCameras] = useState<CameraDevice[]>([]);

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


  const handleConnect = (address: string) => {
    if (!address || address.trim() === '') {
      console.error('Controls: Cannot connect - address is empty');
      alert('Cannot connect: Device address is missing. Please try scanning again.');
      return;
    }
    
    if (window.electronAPI) {
      window.electronAPI.bleConnect(address).catch((error: Error) => {
        console.error('Controls: Connection failed:', error);
        alert(`Connection failed: ${error.message}`);
      });
    }
    onBLEConnect(address);
  };

  const handleDisconnect = () => {
    if (window.electronAPI) {
      window.electronAPI.bleDisconnect();
    }
    onBLEDisconnect();
  };

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label className="ecg-label" style={{ margin: 0 }}>HR Monitor:</label>
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
        {!isBLEConnected ? (
          <>
            {isScanning && (
              <div className="ecg-status" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                ● Scanning...
              </div>
            )}
            {discoveredDevices.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '10px', width: '100%' }}>
                {discoveredDevices.map((device) => (
                  <button
                    className="ecg-button"
                    key={device.address}
                    onClick={() => handleConnect(device.address)}
                    style={{ 
                      fontSize: '11px',
                      padding: '6px 12px'
                    }}
                  >
                    Connect: {device.name}
                  </button>
                ))}
              </div>
            )}
            {initialScanComplete && discoveredDevices.length === 0 && (
              <div className="ecg-text" style={{ fontSize: '10px', opacity: 0.6, fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '1px' }}>
                No devices found
              </div>
            )}
          </>
        ) : (
          <>
            <div className="ecg-status" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              ● Connected
            </div>
            <button 
              className="ecg-button"
              onClick={handleDisconnect}
              style={{ padding: '6px 12px', fontSize: '11px' }}
            >
              Disconnect
            </button>
          </>
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
      bleDisconnect: () => Promise<void>;
      bleGetConnected: () => Promise<boolean>;
      onBLEDeviceDiscovered: (callback: (device: any) => void) => void;
      onBLEConnected: (callback: (address: string, deviceName?: string) => void) => void;
      onBLEDisconnected: (callback: () => void) => void;
      onBLEHeartRate: (callback: (heartRate: number) => void) => void;
      onBLEError: (callback: (error: Error) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}

