/**
 * User tracking service for multi-user heart rate tracking.
 * Manages multiple users, their poses, and device assignments.
 */

import { ChestTracker } from './chest-tracker';
import { getColorForUser } from '../utils/user-colors';

export interface User {
  userId: number;
  deviceAddress: string | null;
  deviceName: string | null;
  chestPosition2d: { x: number; y: number } | null;
  heartRate: number | null;
  color: string;
  isVisible: boolean;
  chestTracker: ChestTracker;
  lastSeen: number; // timestamp
}

export class UserTracker {
  private users: Map<number, User> = new Map();
  private nextUserId: number = 1;
  private readonly visibilityTimeout: number = 2000; // 2 seconds
  private readonly MAX_USERS: number = 2; // Maximum 2 users supported

  constructor() {
    // Cleanup invisible users periodically (only users without devices)
    setInterval(() => this.cleanupInvisibleUsers(), 1000);
  }

  /**
   * Add a new user when a device connects.
   * Maximum of 2 users supported.
   */
  addUser(deviceAddress: string | null = null, deviceName: string | null = null): number | null {
    // Check if we've reached the maximum number of users
    if (this.users.size >= this.MAX_USERS) {
      console.warn(`[UserTracker] Maximum number of users (${this.MAX_USERS}) reached. Cannot add more users.`);
      return null;
    }
    
    const userId = this.nextUserId++;
    const color = getColorForUser(userId, deviceAddress);
    
    const user: User = {
      userId,
      deviceAddress,
      deviceName,
      chestPosition2d: null,
      heartRate: null,
      color,
      isVisible: true,
      chestTracker: new ChestTracker(),
      lastSeen: Date.now()
    };

    this.users.set(userId, user);
    console.log(`[UserTracker] Added user ${userId} with color ${color}`);
    return userId;
  }

  /**
   * Remove a user.
   */
  removeUser(userId: number): void {
    if (this.users.has(userId)) {
      this.users.delete(userId);
      console.log(`[UserTracker] Removed user ${userId}`);
    }
  }

  /**
   * Assign a BLE device to a user.
   */
  assignDevice(userId: number, deviceAddress: string, deviceName: string): void {
    const user = this.users.get(userId);
    if (!user) {
      console.warn(`[UserTracker] Cannot assign device to non-existent user ${userId}`);
      return;
    }

    user.deviceAddress = deviceAddress;
    user.deviceName = deviceName;
    // Update color based on device
    user.color = getColorForUser(userId, deviceAddress);
    console.log(`[UserTracker] Assigned device ${deviceName} (${deviceAddress}) to user ${userId}`);
  }

  /**
   * Unassign device from a user.
   */
  unassignDevice(userId: number): void {
    const user = this.users.get(userId);
    if (!user) {
      return;
    }

    user.deviceAddress = null;
    user.deviceName = null;
    user.heartRate = null;
    // Update color based on user ID only
    user.color = getColorForUser(userId, null);
    console.log(`[UserTracker] Unassigned device from user ${userId}`);
  }

  /**
   * Update chest position for a user.
   */
  updateChestPosition(userId: number, chestPosition2d: { x: number; y: number } | null): void {
    const user = this.users.get(userId);
    if (!user) {
      return;
    }

    const wasVisible = user.isVisible;
    user.chestPosition2d = chestPosition2d;
    user.isVisible = chestPosition2d !== null;
    if (chestPosition2d) {
      user.lastSeen = Date.now();
    }
    
    // #region agent log
    // Only log when visibility state changes
    if (wasVisible !== user.isVisible) {
      console.log('[DEBUG] Visibility changed', {userId, wasVisible, nowVisible: user.isVisible, deviceAddress: user.deviceAddress});
    }
    // #endregion
  }

  /**
   * Update heart rate for a user (by device address).
   */
  updateHeartRate(deviceAddress: string, heartRate: number): void {
    // Find user with this device address
    for (const user of this.users.values()) {
      if (user.deviceAddress === deviceAddress) {
        user.heartRate = heartRate;
        return;
      }
    }
    // If no user found, this is okay - device might not be assigned yet
  }

  /**
   * Get all active users.
   */
  getUsers(): User[] {
    return Array.from(this.users.values());
  }

  /**
   * Get a specific user by ID.
   */
  getUser(userId: number): User | null {
    return this.users.get(userId) || null;
  }

  /**
   * Get user by device address.
   */
  getUserByDevice(deviceAddress: string): User | null {
    for (const user of this.users.values()) {
      if (user.deviceAddress === deviceAddress) {
        return user;
      }
    }
    return null;
  }

  /**
   * Get visible users (currently in frame).
   */
  getVisibleUsers(): User[] {
    return this.getUsers().filter(user => user.isVisible);
  }

  /**
   * Get users with assigned devices.
   */
  getUsersWithDevices(): User[] {
    return this.getUsers().filter(user => user.deviceAddress !== null);
  }

  /**
   * Get users without assigned devices.
   */
  getUsersWithoutDevices(): User[] {
    return this.getUsers().filter(user => user.deviceAddress === null);
  }

  /**
   * Clean up users that haven't been seen for a while.
   * Only removes users without devices that haven't been seen for a long time.
   * Never remove users if we're at or below the max user limit to prevent creating new users.
   */
  private cleanupInvisibleUsers(): void {
    // Don't remove users if we're at or below max - this prevents creating new users when devices reconnect
    if (this.users.size <= this.MAX_USERS) {
      return;
    }
    
    const now = Date.now();
    const usersToRemove: number[] = [];

    for (const user of this.users.values()) {
      // Only remove users without devices that haven't been seen for a long time
      // And only if we have more than MAX_USERS
      if (!user.deviceAddress && !user.isVisible && (now - user.lastSeen) > this.visibilityTimeout) {
        usersToRemove.push(user.userId);
      }
    }

    // Only remove if we'd still have at least MAX_USERS remaining
    if (this.users.size - usersToRemove.length >= this.MAX_USERS) {
      for (const userId of usersToRemove) {
        this.removeUser(userId);
      }
    }
  }

  /**
   * Reset all users.
   */
  reset(): void {
    this.users.clear();
    this.nextUserId = 1;
  }
}

