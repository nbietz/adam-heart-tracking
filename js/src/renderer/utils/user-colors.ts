/**
 * User color system for multi-user heart rate tracking.
 * Provides color mapping for devices and users.
 */

// Device address to color mapping for known devices
const DEVICE_COLORS: Map<string, string> = new Map([
  // Polar H10 EB9C162B
  ['0814e8fe27d1eeb442e0282a0a1350e6', '#ff0040'], // Red
  // Polar H10 5858DC27
  ['d379b26a26793eb2ea989f86f7137085', '#808080'], // Gray
]);

// Additional color palette for users without predefined device colors
// Colors chosen to match ECG theme while being distinct
const COLOR_PALETTE: string[] = [
  '#00ffff', // Cyan
  '#ff00ff', // Magenta
  '#ffff00', // Yellow
  '#ff8000', // Orange
  '#8000ff', // Purple
  '#00ff80', // Green-Cyan
  '#ff4080', // Pink
  '#4080ff', // Blue
];

/**
 * Get color for a specific device address.
 * Returns predefined color if device is known, null otherwise.
 */
export function getColorForDevice(address: string): string | null {
  if (!address) return null;
  const normalizedAddress = address.toLowerCase().replace(/[:-]/g, '');
  return DEVICE_COLORS.get(normalizedAddress) || null;
}

/**
 * Get color for a user by ID.
 * Uses device color if user has assigned device, otherwise uses palette.
 */
export function getColorForUser(userId: number, deviceAddress: string | null = null): string {
  // First try to get color from device address
  if (deviceAddress) {
    const deviceColor = getColorForDevice(deviceAddress);
    if (deviceColor) {
      return deviceColor;
    }
  }
  
  // Otherwise use palette (round-robin based on userId)
  const paletteIndex = (userId - 1) % COLOR_PALETTE.length;
  return COLOR_PALETTE[paletteIndex];
}

/**
 * Get all available colors in the palette.
 */
export function getColorPalette(): string[] {
  return [...COLOR_PALETTE];
}

/**
 * Get device color mappings.
 */
export function getDeviceColors(): Map<string, string> {
  return new Map(DEVICE_COLORS);
}


