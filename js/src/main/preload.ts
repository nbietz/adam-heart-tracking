/**
 * Preload script for Electron security.
 * Exposes safe IPC methods to renderer process.
 */

import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // BLE methods
  bleStartScanning: () => ipcRenderer.invoke('ble:startScanning'),
  bleStopScanning: () => ipcRenderer.invoke('ble:stopScanning'),
  bleConnect: (address: string) => ipcRenderer.invoke('ble:connect', address),
  bleDisconnect: () => ipcRenderer.invoke('ble:disconnect'),
  bleGetConnected: () => ipcRenderer.invoke('ble:getConnected'),
  
  // BLE event listeners
  onBLEDeviceDiscovered: (callback: (device: any) => void) => {
    ipcRenderer.on('ble:deviceDiscovered', (_event, device) => callback(device));
  },
  onBLEConnected: (callback: (address: string, deviceName?: string) => void) => {
    ipcRenderer.on('ble:connected', (_event, address, deviceName) => callback(address, deviceName));
  },
  onBLEDisconnected: (callback: () => void) => {
    ipcRenderer.on('ble:disconnected', () => callback());
  },
  onBLEHeartRate: (callback: (heartRate: number) => void) => {
    ipcRenderer.on('ble:heartRate', (_event, heartRate) => callback(heartRate));
  },
  onBLEError: (callback: (error: Error) => void) => {
    ipcRenderer.on('ble:error', (_event, error) => callback(error));
  },
  
  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

