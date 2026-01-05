/**
 * BLE handler for Polar H10 heart rate monitor.
 * Ported from src/heartrate/polar_h10.py
 * Runs in Electron main process using @abandonware/noble
 */

import { EventEmitter } from 'events';
import noble from '@abandonware/noble';
import {
  POLAR_H10_SERVICE_UUID,
  POLAR_H10_CHARACTERISTIC_UUID,
  HEART_RATE_SCAN_TIMEOUT
} from '../renderer/utils/config';

export interface BLEDevice {
  name: string;
  address: string;
}

export class BLEHandler extends EventEmitter {
  private peripheral: any = null;
  private characteristic: any = null;
  private isConnected: boolean = false;
  private deviceAddress: string | null = null;
  private deviceName: string | null = null;
  private isScanning: boolean = false;
  private continuousScanInterval: NodeJS.Timeout | null = null;
  private nobleState: string = 'unknown';
  private discoveredDevices: Map<string, string> = new Map(); // address -> name

  constructor() {
    super();
    this.setupNoble();
  }

  /**
   * Setup noble BLE library.
   */
  private setupNoble(): void {
    noble.on('stateChange', (state: string) => {
      console.log('[BLE] State changed:', state);
      this.nobleState = state;
      if (state === 'poweredOn') {
        this.emit('ready');
      } else if (state === 'poweredOff') {
        console.warn('[BLE] Bluetooth is powered off');
        this.isScanning = false;
        if (this.continuousScanInterval) {
          clearInterval(this.continuousScanInterval);
          this.continuousScanInterval = null;
        }
      }
    });

    // Note: We don't set up a global discover handler here
    // Each scanning method sets up its own handler
  }

  /**
   * Check if device name matches Polar H10 patterns.
   */
  private isPolarH10Device(name: string, serviceUuids?: string[]): boolean {
    if (!name) return false;
    
    const nameLower = name.toLowerCase();
    // More flexible matching: check for "polar" and "h10" separately
    const hasPolar = nameLower.includes('polar');
    const hasH10 = nameLower.includes('h10') || nameLower.includes('h 10');
    
    // Also check service UUIDs if available
    if (serviceUuids && serviceUuids.length > 0) {
      const hasHeartRateService = serviceUuids.some((uuid: string) => {
        const uuidLower = uuid.toLowerCase().replace(/-/g, '');
        return uuidLower.includes('180d') || uuidLower.includes(POLAR_H10_SERVICE_UUID.toLowerCase().replace(/-/g, ''));
      });
      if (hasHeartRateService) {
        return true;
      }
    }
    
    // Match if has both "polar" and "h10", or just "polar h10" together
    return (hasPolar && hasH10) || nameLower.includes('polar h10');
  }

  /**
   * Start scanning for Polar H10 devices.
   */
  async startScanning(timeout: number = HEART_RATE_SCAN_TIMEOUT): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if BLE is powered on
      const state = (noble as any).state || (noble as any)._state;
      if (state !== 'poweredOn') {
        console.error('[BLE] Cannot start scanning: BLE not powered on, state:', state);
        reject(new Error(`BLE not powered on (state: ${state})`));
        return;
      }

      console.log(`[BLE] Starting scan for ${timeout} seconds...`);

      const onDiscover = (peripheral: any) => {
        const name = peripheral.advertisement.localName || '';
        const address = peripheral.address || peripheral.id || '';
        const serviceUuids = peripheral.advertisement.serviceUuids || [];
        
        // Skip devices with empty addresses
        if (!address || address.trim() === '') {
          return;
        }
        
        if (this.isPolarH10Device(name, serviceUuids)) {
          // Check if device already discovered to prevent duplicates
          if (!this.discoveredDevices.has(address)) {
            console.log(`[BLE] Found Polar H10: ${name} (${address})`);
            const device: BLEDevice = {
              name: name || 'Polar H10',
              address: address
            };
            // Store device name for later retrieval
            this.discoveredDevices.set(address, name || 'Polar H10');
            this.emit('deviceDiscovered', device);
          }
        }
        // Silently skip non-Polar devices
      };

      noble.on('discover', onDiscover);

      noble.startScanning([], true); // Scan for all devices, allow duplicates

      setTimeout(() => {
        noble.removeListener('discover', onDiscover);
        noble.stopScanning();
        console.log('[BLE] Scan completed');
        resolve();
      }, timeout * 1000);
    });
  }

  /**
   * Start continuous scanning for Polar H10 devices.
   * Scans for 2 seconds, waits 3 seconds, repeats.
   */
  startContinuousScanning(): void {
    if (this.isScanning) {
      console.log('[BLE] Continuous scanning already in progress');
      return;
    }

    if (this.nobleState !== 'poweredOn') {
      console.error('[BLE] Cannot start continuous scanning: BLE not powered on');
      return;
    }

    this.isScanning = true;
    console.log('[BLE] Starting continuous scanning...');

    const scanCycle = async () => {
      if (!this.isScanning || this.nobleState !== 'poweredOn') {
        return;
      }

      try {
        await this.startScanning(2.0); // Scan for 2 seconds
      } catch (error) {
        console.error('[BLE] Error in scan cycle:', error);
      }
    };

    // Start first scan immediately
    scanCycle();

    // Then repeat every 5 seconds (2s scan + 3s wait)
    this.continuousScanInterval = setInterval(() => {
      if (this.isScanning && this.nobleState === 'poweredOn') {
        scanCycle();
      }
    }, 5000);
  }

  /**
   * Stop scanning (both one-time and continuous).
   */
  stopScanning(): void {
    console.log('[BLE] Stopping scanning...');
    this.isScanning = false;
    
    if (this.continuousScanInterval) {
      clearInterval(this.continuousScanInterval);
      this.continuousScanInterval = null;
    }
    
    noble.stopScanning();
  }

  /**
   * Connect to a Polar H10 device.
   */
  async connect(address: string): Promise<boolean> {
    try {
      // Validate address
      if (!address || address.trim() === '') {
        throw new Error('Device address is empty');
      }
      
      console.log(`[BLE] Attempting to connect to device: ${address}`);
      
      if (this.nobleState !== 'poweredOn') {
        throw new Error(`BLE not powered on (state: ${this.nobleState})`);
      }

      // Stop continuous scanning but keep one-time scanning for connection
      const wasScanning = this.isScanning;
      this.stopScanning();

      // Find peripheral - try scanning if not already found
      let peripheral: any = null;
      
      // First, try to find in already discovered peripherals (if we have a way to cache them)
      // For now, we'll scan for it
      console.log(`[BLE] Scanning for device ${address}...`);
      
      peripheral = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          noble.removeListener('discover', onDiscover);
          noble.stopScanning();
          reject(new Error(`Device ${address} not found within 10 seconds`));
        }, 10000);

        const onDiscover = (p: any) => {
          const pAddress = p.address || p.id || '';
          if (pAddress && (pAddress === address || pAddress.toLowerCase() === address.toLowerCase())) {
            console.log(`[BLE] Found target device: ${p.advertisement.localName || 'Unknown'} (${pAddress})`);
            clearTimeout(timeout);
            noble.removeListener('discover', onDiscover);
            noble.stopScanning();
            resolve(p);
          }
        };

        noble.on('discover', onDiscover);
        noble.startScanning([], true);
      });

      // Connect to peripheral with retry logic
      console.log('[BLE] Connecting to peripheral...');
      let connected = false;
      let retries = 3;
      
      while (!connected && retries > 0) {
        try {
          await peripheral.connectAsync();
          connected = true;
          console.log('[BLE] Connected to peripheral');
        } catch (error: any) {
          retries--;
          if (retries > 0) {
            console.log(`[BLE] Connection failed, retrying... (${retries} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            throw error;
          }
        }
      }

      this.peripheral = peripheral;
      this.deviceAddress = address;
      // Get device name from discovered devices or use advertisement name
      this.deviceName = this.discoveredDevices.get(address) || peripheral.advertisement.localName || 'Polar H10';
      this.isConnected = true;

      // Discover services and characteristics
      console.log('[BLE] Discovering services...');
      let services = await peripheral.discoverServicesAsync([POLAR_H10_SERVICE_UUID]);
      if (services.length === 0) {
        // Try discovering all services first
        const allServices = await peripheral.discoverServicesAsync([]);
        console.log(`[BLE] Found ${allServices.length} services, looking for heart rate service...`);
        const hrService = allServices.find((s: any) => 
          s.uuid.toLowerCase().includes(POLAR_H10_SERVICE_UUID.toLowerCase().replace(/-/g, '')) ||
          s.uuid.toLowerCase().includes('180d')
        );
        if (!hrService) {
          throw new Error(`Heart rate service not found. Available services: ${allServices.map((s: any) => s.uuid).join(', ')}`);
        }
        services = [hrService];
      }

      const hrService = services[0];
      console.log('[BLE] Discovering characteristics...');
      let characteristics = await hrService.discoverCharacteristicsAsync([
        POLAR_H10_CHARACTERISTIC_UUID
      ]);

      if (characteristics.length === 0) {
        // Try discovering all characteristics
        const allCharacteristics = await hrService.discoverCharacteristicsAsync([]);
        console.log(`[BLE] Found ${allCharacteristics.length} characteristics, looking for heart rate measurement...`);
        const hrChar = allCharacteristics.find((c: any) => 
          c.uuid.toLowerCase().includes(POLAR_H10_CHARACTERISTIC_UUID.toLowerCase().replace(/-/g, '')) ||
          c.uuid.toLowerCase().includes('2a37')
        );
        if (!hrChar) {
          throw new Error(`Heart rate characteristic not found. Available: ${allCharacteristics.map((c: any) => c.uuid).join(', ')}`);
        }
        characteristics.push(hrChar);
      }

      this.characteristic = characteristics[0];
      console.log('[BLE] Subscribing to heart rate notifications...');

      // Subscribe to notifications
      await this.characteristic.subscribeAsync();
      this.characteristic.on('data', (data: Buffer) => {
        this.handleHeartRateData(data);
      });

      console.log('[BLE] Successfully connected and subscribed to heart rate data');
      this.emit('connected', address, this.deviceName);
      
      // Restart continuous scanning if it was active
      if (wasScanning) {
        this.startContinuousScanning();
      }
      
      return true;
    } catch (error: any) {
      console.error('[BLE] Error connecting to device:', error);
      this.emit('error', error);
      this.isConnected = false;
      this.deviceAddress = null;
      return false;
    }
  }

  /**
   * Handle heart rate data notification.
   */
  private handleHeartRateData(data: Buffer): void {
    try {
      if (data.length < 2) {
        console.warn('[BLE] Heart rate data too short:', data.length);
        return;
      }

      const flags = data[0];
      const heartRateFormat = (flags & 0x01) === 0x01; // Bit 0: 0 = 8-bit, 1 = 16-bit

      let heartRate: number;
      if (heartRateFormat && data.length >= 3) {
        // 16-bit heart rate value
        heartRate = data.readUInt16LE(1);
      } else {
        // 8-bit heart rate value
        heartRate = data[1];
      }

      // Only log occasionally to avoid spam
      if (Math.random() < 0.01) { // Log ~1% of heart rate updates
        console.log(`[BLE] Heart rate: ${heartRate} BPM`);
      }
      this.emit('heartRate', heartRate);
    } catch (error) {
      console.error('[BLE] Error parsing heart rate data:', error);
    }
  }

  /**
   * Disconnect from device.
   */
  async disconnect(): Promise<void> {
    console.log('[BLE] Disconnecting...');
    
    if (this.characteristic) {
      try {
        await this.characteristic.unsubscribeAsync();
        console.log('[BLE] Unsubscribed from characteristic');
      } catch (error) {
        console.warn('[BLE] Error unsubscribing:', error);
      }
      this.characteristic = null;
    }

    if (this.peripheral) {
      try {
        await this.peripheral.disconnectAsync();
        console.log('[BLE] Disconnected from peripheral');
      } catch (error) {
        console.warn('[BLE] Error disconnecting:', error);
      }
      this.peripheral = null;
    }

    this.isConnected = false;
    this.deviceAddress = null;
    this.deviceName = null;
    this.emit('disconnected');
  }

  /**
   * Get device name by address.
   */
  getDeviceName(address: string): string | null {
    return this.discoveredDevices.get(address) || null;
  }

  /**
   * Check if connected.
   */
  getConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get current device address.
   */
  getDeviceAddress(): string | null {
    return this.deviceAddress;
  }
}

