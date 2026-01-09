/**
 * Chest position and rotation tracking from pose landmarks.
 * Ported from src/pose/chest_tracker.py
 */

import { vec3, mat3, mat4 } from 'gl-matrix';
import {
  calculateChestPosition,
  calculateChestRotation,
  createTransformMatrix
} from '../utils/math-utils';
import { HEART_OFFSET_Z, HEART_SCALE } from '../utils/config';

// MediaPipe pose landmark indices
export const LEFT_SHOULDER = 11;
export const RIGHT_SHOULDER = 12;
export const LEFT_HIP = 23;
export const RIGHT_HIP = 24;
export const NOSE = 0;

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface WorldLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export class ChestTracker {
  private lastPosition: vec3 | null = null;
  private lastRotation: mat3 | null = null;
  private lastPosition2d: vec3 | null = null;
  private smoothingFactor: number;

  constructor(smoothingFactor: number = 0.3) {
    // Reduced from 0.7 to 0.3 for more responsive tracking
    // 0.3 = 30% old, 70% new - much more responsive to movements
    // This helps with X-plane tracking lag
    this.smoothingFactor = smoothingFactor;
  }

  /**
   * Extract 2D normalized coordinates of a landmark.
   */
  extractLandmark2d(
    landmarks: NormalizedLandmark[],
    index: number
  ): vec3 | null {
    if (!landmarks || index >= landmarks.length) {
      return null;
    }

    const landmark = landmarks[index];
    if (!landmark) {
      return null;
    }

    // Visibility threshold - MediaPipe landmarks have visibility property
    // If visibility is too low, landmark is not reliable
    if (landmark.visibility !== undefined && landmark.visibility < 0.5) {
      return null;
    }

    // Validate coordinates are valid numbers
    if (typeof landmark.x !== 'number' || typeof landmark.y !== 'number' || 
        isNaN(landmark.x) || isNaN(landmark.y)) {
      return null;
    }

    return vec3.fromValues(landmark.x, landmark.y, 0);
  }

  /**
   * Extract 3D world coordinates of a landmark.
   */
  extractLandmark3d(
    landmarks: WorldLandmark[],
    index: number
  ): vec3 | null {
    if (index >= landmarks.length) {
      return null;
    }

    const landmark = landmarks[index];

    // Visibility threshold
    if (landmark.visibility !== undefined && landmark.visibility < 0.5) {
      return null;
    }

    return vec3.fromValues(landmark.x, landmark.y, landmark.z);
  }

  /**
   * Track chest position and rotation from world landmarks.
   */
  trackChest(worldLandmarks: WorldLandmark[]): [vec3 | null, mat3 | null] {
    // Extract required landmarks
    const leftShoulder = this.extractLandmark3d(worldLandmarks, LEFT_SHOULDER);
    const rightShoulder = this.extractLandmark3d(worldLandmarks, RIGHT_SHOULDER);
    const leftHip = this.extractLandmark3d(worldLandmarks, LEFT_HIP);
    const rightHip = this.extractLandmark3d(worldLandmarks, RIGHT_HIP);

    // Check if we have all required landmarks
    if (!leftShoulder || !rightShoulder) {
      if (!leftShoulder) console.warn('ChestTracker: Left shoulder not visible');
      if (!rightShoulder) console.warn('ChestTracker: Right shoulder not visible');
      return [this.lastPosition, this.lastRotation];
    }

    // Calculate chest position
    const newPosition = calculateChestPosition(
      leftShoulder,
      rightShoulder,
      HEART_OFFSET_Z
    );

    // Apply exponential smoothing to position
    let position: vec3;
    if (this.lastPosition) {
      position = vec3.create();
      vec3.scale(position, this.lastPosition, this.smoothingFactor);
      const newPosScaled = vec3.create();
      vec3.scale(newPosScaled, newPosition, 1.0 - this.smoothingFactor);
      vec3.add(position, position, newPosScaled);
    } else {
      position = vec3.clone(newPosition);
    }

    // Calculate rotation if we have hip data
    let rotation: mat3;
    if (leftHip && rightHip) {
      rotation = calculateChestRotation(
        leftShoulder,
        rightShoulder,
        leftHip,
        rightHip
      );
    } else {
      // Fallback: use shoulder line only
      const shoulderVec = vec3.create();
      vec3.subtract(shoulderVec, rightShoulder, leftShoulder);
      const length = vec3.length(shoulderVec);
      
      if (length > 0) {
        // Simple rotation from shoulder line
        const forward = vec3.fromValues(0, 0, -1); // Towards camera
        const up = vec3.fromValues(0, 1, 0);
        rotation = calculateChestRotation(
          leftShoulder,
          rightShoulder,
          leftHip || vec3.fromValues(0, 0, 0),
          rightHip || vec3.fromValues(0, 0, 0)
        );
      } else {
        rotation = mat3.create();
        mat3.identity(rotation);
      }
    }

    // Apply smoothing to rotation
    if (this.lastRotation) {
      // Simple linear interpolation (not perfect but works for small changes)
      // Scale each element of the matrix
      const smoothed = mat3.create();
      for (let i = 0; i < 9; i++) {
        smoothed[i] = this.lastRotation[i] * this.smoothingFactor + rotation[i] * (1.0 - this.smoothingFactor);
      }
      rotation = smoothed;
    }

    // Update last known values
    this.lastPosition = vec3.clone(position);
    this.lastRotation = mat3.clone(rotation);

    return [position, rotation];
  }

  /**
   * Get 2D heart position in screen coordinates.
   */
  getChestPosition2d(
    normalizedLandmarks: NormalizedLandmark[],
    frameWidth: number,
    frameHeight: number,
    mirrorHorizontal: boolean = true
  ): vec3 | null {
    if (!normalizedLandmarks || normalizedLandmarks.length === 0) {
      return null;
    }

    const leftShoulder2d = this.extractLandmark2d(normalizedLandmarks, LEFT_SHOULDER);
    const rightShoulder2d = this.extractLandmark2d(normalizedLandmarks, RIGHT_SHOULDER);
    const leftHip2d = this.extractLandmark2d(normalizedLandmarks, LEFT_HIP);
    const rightHip2d = this.extractLandmark2d(normalizedLandmarks, RIGHT_HIP);

    if (!leftShoulder2d || !rightShoulder2d) {
      return null;
    }

    // Calculate chest center in normalized coordinates (0-1)
    const chestCenterNormalized = vec3.create();
    const sum = vec3.create();
    vec3.add(sum, leftShoulder2d, rightShoulder2d);
    vec3.scale(chestCenterNormalized, sum, 0.5);

    // Convert to screen coordinates
    // In Python: frame is flipped BEFORE MediaPipe processes it, so MediaPipe
    // processes the flipped frame and returns landmarks in flipped coordinates.
    // In JavaScript: when we use canvas transformations (ctx.scale(-1, 1)),
    // the ImageData from getImageData() contains the pixels as drawn (mirrored).
    // So MediaPipe processes the mirrored ImageData and returns landmarks in
    // mirrored coordinates, matching the Python behavior. No coordinate flipping needed.
    let chestX = chestCenterNormalized[0] * frameWidth;
    let chestY = chestCenterNormalized[1] * frameHeight;

    // Adjust position to be anatomically correct for heart location
        if (leftHip2d && rightHip2d) {
      const shoulderY = chestY;
      const hipSum = vec3.create();
      vec3.add(hipSum, leftHip2d, rightHip2d);
      const hipCenterY = (hipSum[1] / 2.0) * frameHeight;
      const torsoHeight = hipCenterY - shoulderY;
      chestY = chestY + (torsoHeight * 0.25);
    } else {
      const shoulderDiff = vec3.create();
      vec3.subtract(shoulderDiff, rightShoulder2d, leftShoulder2d);
      const shoulderWidth = Math.abs(shoulderDiff[0] * frameWidth);
      chestY = chestY + (shoulderWidth * 0.3);
    }

    // Move slightly to the left (from person's perspective)
    // The heart is on the left side of the chest (person's left)
    // Since the frame is mirrored, person's left appears on screen left
    // So we move left (decrease x) to position on person's left side
    const shoulderDiff = vec3.create();
    vec3.subtract(shoulderDiff, rightShoulder2d, leftShoulder2d);
    const shoulderWidth = Math.abs(shoulderDiff[0] * frameWidth);
    chestX = chestX - (shoulderWidth * 0.15);  // Move left by 15% of shoulder width

    // Apply smoothing on both X and Y to reduce jitter
    let chestPos2d = vec3.fromValues(chestX, chestY, 0);
    if (this.lastPosition2d) {
      const smoothed = vec3.create();
      // Increased smoothing factor from 0.1 to 0.3 for smoother movement
      // This reduces jitter while still being responsive
      const smoothingFactor = 0.3;
      
      // Smooth both coordinates
      smoothed[0] = this.lastPosition2d[0] * smoothingFactor + chestX * (1.0 - smoothingFactor);
      smoothed[1] = this.lastPosition2d[1] * smoothingFactor + chestY * (1.0 - smoothingFactor);
      smoothed[2] = 0;
      
      chestPos2d = smoothed;
    }

    this.lastPosition2d = vec3.clone(chestPos2d);
    return chestPos2d;
  }

  /**
   * Get 4x4 transformation matrix for chest position and rotation.
   */
  getTransformMatrix(worldLandmarks: WorldLandmark[]): mat4 | null {
    const [position, rotation] = this.trackChest(worldLandmarks);

    if (!position || !rotation) {
      return null;
    }

    // Validate that we have valid position and rotation
    if (!position || !rotation) {
      return null;
    }

    return createTransformMatrix(position, rotation, HEART_SCALE);
  }

  /**
   * Reset tracking state.
   */
  reset(): void {
    this.lastPosition = null;
    this.lastRotation = null;
    this.lastPosition2d = null;
  }
}

