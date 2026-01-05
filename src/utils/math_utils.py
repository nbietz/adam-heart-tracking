"""3D math utilities for transformations and calculations."""

import numpy as np
from typing import Tuple, Optional


def normalize_vector(v: np.ndarray) -> np.ndarray:
    """Normalize a vector."""
    norm = np.linalg.norm(v)
    if norm == 0:
        return v
    return v / norm


def rotation_matrix_from_vectors(forward: np.ndarray, up: np.ndarray) -> np.ndarray:
    """
    Create a rotation matrix from forward and up vectors.
    
    Args:
        forward: Forward direction vector (normalized)
        up: Up direction vector (normalized)
    
    Returns:
        3x3 rotation matrix
    """
    # Ensure vectors are normalized
    forward = normalize_vector(forward)
    up = normalize_vector(up)
    
    # Calculate right vector (cross product)
    right = np.cross(forward, up)
    right = normalize_vector(right)
    
    # Recalculate up to ensure orthogonality
    up = np.cross(right, forward)
    up = normalize_vector(up)
    
    # Build rotation matrix
    rotation = np.array([
        [right[0], up[0], -forward[0]],
        [right[1], up[1], -forward[1]],
        [right[2], up[2], -forward[2]]
    ])
    
    return rotation


def create_transform_matrix(
    position: np.ndarray,
    rotation: np.ndarray,
    scale: float = 1.0
) -> np.ndarray:
    """
    Create a 4x4 transformation matrix from position, rotation, and scale.
    
    Args:
        position: 3D position (x, y, z)
        rotation: 3x3 rotation matrix
        scale: Uniform scale factor
    
    Returns:
        4x4 transformation matrix
    """
    transform = np.eye(4, dtype=np.float32)
    
    # Apply scale
    transform[:3, :3] = rotation * scale
    
    # Apply translation
    transform[:3, 3] = position
    
    return transform


def calculate_chest_rotation(
    left_shoulder: np.ndarray,
    right_shoulder: np.ndarray,
    left_hip: np.ndarray,
    right_hip: np.ndarray
) -> np.ndarray:
    """
    Calculate chest rotation from shoulder and hip landmarks.
    
    Args:
        left_shoulder: Left shoulder 3D position
        right_shoulder: Right shoulder 3D position
        left_hip: Left hip 3D position
        right_hip: Right hip 3D position
    
    Returns:
        3x3 rotation matrix
    """
    # Calculate forward direction (perpendicular to shoulder line, pointing forward)
    shoulder_vec = right_shoulder - left_shoulder
    hip_vec = right_hip - left_hip
    
    # Average of shoulder and hip vectors gives torso direction
    torso_vec = (shoulder_vec + hip_vec) / 2.0
    
    # Forward is perpendicular to torso in the horizontal plane
    forward = np.array([-torso_vec[1], torso_vec[0], 0])
    forward = normalize_vector(forward)
    
    # Up direction (towards head)
    up = np.array([0, 0, 1])  # MediaPipe uses Z-up
    
    return rotation_matrix_from_vectors(forward, up)


def calculate_chest_position(
    left_shoulder: np.ndarray,
    right_shoulder: np.ndarray,
    offset_z: float = 0.05
) -> np.ndarray:
    """
    Calculate chest center position from shoulder landmarks.
    
    Args:
        left_shoulder: Left shoulder 3D position
        right_shoulder: Right shoulder 3D position
        offset_z: Forward offset from chest surface (meters)
    
    Returns:
        3D chest center position
    """
    # Chest center is midpoint of shoulders
    chest_center = (left_shoulder + right_shoulder) / 2.0
    
    # Project forward slightly (towards camera)
    # In MediaPipe coordinates, negative Z is towards camera
    chest_center[2] -= offset_z
    
    return chest_center


def perspective_projection_matrix(
    fov: float,
    aspect: float,
    near: float,
    far: float
) -> np.ndarray:
    """
    Create a perspective projection matrix.
    
    Args:
        fov: Field of view in degrees
        aspect: Aspect ratio (width / height)
        near: Near clipping plane
        far: Far clipping plane
    
    Returns:
        4x4 projection matrix
    """
    fov_rad = np.radians(fov)
    f = 1.0 / np.tan(fov_rad / 2.0)
    
    projection = np.zeros((4, 4), dtype=np.float32)
    projection[0, 0] = f / aspect
    projection[1, 1] = f
    projection[2, 2] = (far + near) / (near - far)
    projection[2, 3] = -1.0
    projection[3, 2] = (2.0 * far * near) / (near - far)
    
    return projection


def look_at_matrix(
    eye: np.ndarray,
    target: np.ndarray,
    up: np.ndarray = np.array([0, 0, 1])
) -> np.ndarray:
    """
    Create a look-at view matrix.
    
    Args:
        eye: Camera position
        target: Target position to look at
        up: Up direction vector
    
    Returns:
        4x4 view matrix
    """
    forward = normalize_vector(target - eye)
    right = normalize_vector(np.cross(forward, up))
    up = normalize_vector(np.cross(right, forward))
    
    view = np.eye(4, dtype=np.float32)
    view[0, :3] = right
    view[1, :3] = up
    view[2, :3] = -forward
    view[:3, 3] = -np.array([
        np.dot(right, eye),
        np.dot(up, eye),
        np.dot(-forward, eye)
    ])
    
    return view

