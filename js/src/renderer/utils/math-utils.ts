/**
 * 3D math utilities for transformations and calculations.
 * Ported from src/utils/math_utils.py using gl-matrix
 */

import { vec3, mat3, mat4 } from 'gl-matrix';

/**
 * Normalize a vector.
 */
export function normalizeVector(v: vec3): vec3 {
  const out = vec3.create();
  vec3.normalize(out, v);
  return out;
}

/**
 * Create a rotation matrix from forward and up vectors.
 */
export function rotationMatrixFromVectors(forward: vec3, up: vec3): mat3 {
  // Ensure vectors are normalized
  const f = normalizeVector(forward);
  const u = normalizeVector(up);
  
  // Calculate right vector (cross product)
  const right = vec3.create();
  vec3.cross(right, f, u);
  vec3.normalize(right, right);
  
  // Recalculate up to ensure orthogonality
  const newUp = vec3.create();
  vec3.cross(newUp, right, f);
  vec3.normalize(newUp, newUp);
  
  // Build rotation matrix
  const rotation = mat3.create();
  rotation[0] = right[0];
  rotation[1] = right[1];
  rotation[2] = right[2];
  rotation[3] = newUp[0];
  rotation[4] = newUp[1];
  rotation[5] = newUp[2];
  rotation[6] = -f[0];
  rotation[7] = -f[1];
  rotation[8] = -f[2];
  
  return rotation;
}

/**
 * Create a 4x4 transformation matrix from position, rotation, and scale.
 */
export function createTransformMatrix(
  position: vec3,
  rotation: mat3,
  scale: number = 1.0
): mat4 {
  const transform = mat4.create();
  
  // Copy rotation matrix to upper-left 3x3
  transform[0] = rotation[0] * scale;
  transform[1] = rotation[1] * scale;
  transform[2] = rotation[2] * scale;
  transform[4] = rotation[3] * scale;
  transform[5] = rotation[4] * scale;
  transform[6] = rotation[5] * scale;
  transform[8] = rotation[6] * scale;
  transform[9] = rotation[7] * scale;
  transform[10] = rotation[8] * scale;
  
  // Apply translation
  transform[12] = position[0];
  transform[13] = position[1];
  transform[14] = position[2];
  transform[15] = 1.0;
  
  return transform;
}

/**
 * Calculate chest rotation from shoulder and hip landmarks.
 */
export function calculateChestRotation(
  leftShoulder: vec3,
  rightShoulder: vec3,
  leftHip: vec3,
  rightHip: vec3
): mat3 {
  // Calculate forward direction (perpendicular to shoulder line, pointing forward)
  const shoulderVec = vec3.create();
  vec3.subtract(shoulderVec, rightShoulder, leftShoulder);
  
  const hipVec = vec3.create();
  vec3.subtract(hipVec, rightHip, leftHip);
  
  // Average of shoulder and hip vectors gives torso direction
  const torsoVec = vec3.create();
  vec3.add(torsoVec, shoulderVec, hipVec);
  vec3.scale(torsoVec, torsoVec, 0.5);
  
  // Forward is perpendicular to torso in the horizontal plane
  const forward = vec3.fromValues(-torsoVec[1], torsoVec[0], 0);
  vec3.normalize(forward, forward);
  
  // Up direction (towards head) - MediaPipe uses Z-up
  const up = vec3.fromValues(0, 0, 1);
  
  return rotationMatrixFromVectors(forward, up);
}

/**
 * Calculate chest center position from shoulder landmarks.
 */
export function calculateChestPosition(
  leftShoulder: vec3,
  rightShoulder: vec3,
  offsetZ: number = 0.05
): vec3 {
  // Chest center is midpoint of shoulders
  const chestCenter = vec3.create();
  vec3.add(chestCenter, leftShoulder, rightShoulder);
  vec3.scale(chestCenter, chestCenter, 0.5);
  
  // Project forward slightly (towards camera)
  // In MediaPipe coordinates, negative Z is towards camera
  chestCenter[2] -= offsetZ;
  
  return chestCenter;
}

/**
 * Create a perspective projection matrix.
 */
export function perspectiveProjectionMatrix(
  fov: number,
  aspect: number,
  near: number,
  far: number
): mat4 {
  const projection = mat4.create();
  mat4.perspective(projection, (fov * Math.PI) / 180, aspect, near, far);
  return projection;
}

/**
 * Create a look-at view matrix.
 */
export function lookAtMatrix(
  eye: vec3,
  target: vec3,
  up: vec3 = vec3.fromValues(0, 0, 1)
): mat4 {
  const view = mat4.create();
  mat4.lookAt(view, eye, target, up);
  return view;
}

