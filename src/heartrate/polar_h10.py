"""Polar H10 Bluetooth heart rate monitor integration."""

import asyncio
from bleak import BleakScanner, BleakClient
from typing import Optional, Callable
from ..utils.config import Config


class PolarH10:
    """Polar H10 heart rate monitor BLE client."""
    
    # BLE Service and Characteristic UUIDs
    HEART_RATE_SERVICE_UUID = Config.POLAR_H10_SERVICE_UUID
    HEART_RATE_CHARACTERISTIC_UUID = Config.POLAR_H10_CHARACTERISTIC_UUID
    
    def __init__(self, on_heart_rate: Optional[Callable[[int], None]] = None):
        """
        Initialize Polar H10 client.
        
        Args:
            on_heart_rate: Callback function called when heart rate data is received
        """
        self.client: Optional[BleakClient] = None
        self.on_heart_rate = on_heart_rate
        self.is_connected = False
        self.device_address: Optional[str] = None
    
    async def scan_for_device(self, device_name: str = "Polar H10", timeout: float = None) -> Optional[str]:
        """
        Scan for Polar H10 device.
        
        Args:
            device_name: Device name to search for (default: "Polar H10")
            timeout: Scan timeout in seconds (default from config)
        
        Returns:
            Device address if found, None otherwise
        """
        if timeout is None:
            timeout = Config.HEART_RATE_SCAN_TIMEOUT
        
        try:
            devices = await BleakScanner.discover(timeout=timeout)
            
            for device in devices:
                if device_name.lower() in device.name.lower():
                    self.device_address = device.address
                    return device.address
            
            return None
            
        except Exception as e:
            print(f"Error scanning for device: {e}")
            return None
    
    async def scan_for_all_devices(self, device_name: str = "Polar H10", timeout: float = 2.0) -> list:
        """
        Scan for all Polar H10 devices.
        
        Args:
            device_name: Device name to search for (default: "Polar H10")
            timeout: Scan timeout in seconds
        
        Returns:
            List of discovered devices as dicts with 'name' and 'address' keys
        """
        try:
            devices = await BleakScanner.discover(timeout=timeout)
            
            found_devices = []
            for device in devices:
                # Handle None device names
                device_name_str = device.name or ""
                if device_name.lower() in device_name_str.lower():
                    found_devices.append({
                        'name': device_name_str or 'Unknown',
                        'address': device.address
                    })
            
            return found_devices
            
        except Exception as e:
            print(f"Error scanning for devices: {e}")
            return []
    
    async def connect(self, address: Optional[str] = None) -> bool:
        """
        Connect to Polar H10 device.
        
        Args:
            address: Device address (if None, uses previously scanned address)
        
        Returns:
            True if connected successfully
        """
        if address is None:
            address = self.device_address
        
        if address is None:
            print("Error: No device address provided")
            return False
        
        try:
            print(f"Connecting to {address}...")
            self.client = BleakClient(address)
            await self.client.connect()
            
            if self.client.is_connected:
                self.is_connected = True
                print("Connected to Polar H10")
                
                # Subscribe to heart rate notifications
                await self._subscribe_to_heart_rate()
                return True
            else:
                print("Failed to connect")
                return False
                
        except Exception as e:
            print(f"Error connecting to device: {e}")
            return False
    
    async def _subscribe_to_heart_rate(self):
        """Subscribe to heart rate characteristic notifications."""
        if self.client is None or not self.client.is_connected:
            return
        
        try:
            # Enable notifications
            await self.client.start_notify(
                self.HEART_RATE_CHARACTERISTIC_UUID,
                self._heart_rate_notification_handler
            )
            print("Subscribed to heart rate notifications")
        except Exception as e:
            print(f"Error subscribing to heart rate: {e}")
    
    def _heart_rate_notification_handler(self, sender: str, data: bytearray):
        """
        Handle heart rate notification.
        
        Args:
            sender: Characteristic UUID
            data: Heart rate data bytes
        """
        try:
            # Parse heart rate data according to BLE Heart Rate Profile
            # Format: Flags (1 byte) + Heart Rate Value (1-2 bytes)
            if len(data) < 2:
                return
            
            flags = data[0]
            heart_rate_format = (flags & 0x01) == 0x01  # Bit 0: 0 = 8-bit, 1 = 16-bit
            
            if heart_rate_format and len(data) >= 3:
                # 16-bit heart rate value
                heart_rate = int.from_bytes(data[1:3], byteorder='little')
            else:
                # 8-bit heart rate value
                heart_rate = data[1]
            
            # Call callback if provided
            if self.on_heart_rate:
                self.on_heart_rate(heart_rate)
                
        except Exception as e:
            print(f"Error parsing heart rate data: {e}")
    
    async def disconnect(self):
        """Disconnect from device."""
        if self.client is not None and self.client.is_connected:
            try:
                # Stop notifications first
                try:
                    await self.client.stop_notify(self.HEART_RATE_CHARACTERISTIC_UUID)
                except Exception:
                    # Ignore errors stopping notifications (device may have already disconnected)
                    pass
                
                # Disconnect
                try:
                    await self.client.disconnect()
                    print("Disconnected from Polar H10")
                except Exception:
                    # Device may have already disconnected
                    pass
            except Exception as e:
                # Ignore disconnection errors during shutdown
                pass
            finally:
                self.is_connected = False
                self.client = None
    
    async def __aenter__(self):
        """Async context manager entry."""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.disconnect()

