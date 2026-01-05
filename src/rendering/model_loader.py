"""3D model loading using trimesh."""

import trimesh
import numpy as np
from pathlib import Path
from typing import Optional, Tuple
from ..utils.config import Config


class ModelLoader:
    """Loads and processes 3D OBJ models."""
    
    def __init__(self):
        """Initialize model loader."""
        self.mesh: Optional[trimesh.Trimesh] = None
        self.vertices: Optional[np.ndarray] = None
        self.faces: Optional[np.ndarray] = None
        self.normals: Optional[np.ndarray] = None
    
    def load_model(self, model_path: Path, use_low_poly: bool = True) -> bool:
        """
        Load an OBJ model file.
        
        Args:
            model_path: Path to OBJ file
            use_low_poly: If True, prefer low-poly model
        
        Returns:
            True if model loaded successfully
        """
        if not model_path.exists():
            print(f"Error: Model file not found: {model_path}")
            return False
        
        try:
            # Load mesh using trimesh
            self.mesh = trimesh.load(str(model_path))
            
            # Ensure it's a Trimesh object (not a Scene)
            if isinstance(self.mesh, trimesh.Scene):
                # Get the first mesh from the scene
                self.mesh = list(self.mesh.geometry.values())[0]
            
            if not isinstance(self.mesh, trimesh.Trimesh):
                print(f"Error: Could not extract mesh from {model_path}")
                return False
            
            # Extract vertices and faces
            self.vertices = np.array(self.mesh.vertices, dtype=np.float32)
            self.faces = np.array(self.mesh.faces, dtype=np.uint32)
            
            # Calculate normals if not present
            if hasattr(self.mesh.visual, 'vertex_normals') and self.mesh.visual.vertex_normals is not None:
                self.normals = np.array(self.mesh.visual.vertex_normals, dtype=np.float32)
            else:
                # Compute normals
                self.mesh.fix_normals()
                self.normals = np.array(self.mesh.vertex_normals, dtype=np.float32)
            
            # Center and normalize model
            self._normalize_model()
            
            print(f"Loaded model: {len(self.vertices)} vertices, {len(self.faces)} faces")
            return True
            
        except Exception as e:
            print(f"Error loading model: {e}")
            return False
    
    def _normalize_model(self):
        """Center and normalize model to unit size."""
        if self.vertices is None:
            return
        
        # Center model at origin
        center = np.mean(self.vertices, axis=0)
        self.vertices -= center
        
        # Scale to unit size (bounding box diagonal = 1)
        bounds = np.max(self.vertices, axis=0) - np.min(self.vertices, axis=0)
        max_dim = np.max(bounds)
        if max_dim > 0:
            self.vertices /= max_dim
    
    def get_vertex_data(self) -> Tuple[Optional[np.ndarray], Optional[np.ndarray], Optional[np.ndarray]]:
        """
        Get vertex data for rendering.
        
        Returns:
            Tuple of (vertices, faces, normals)
        """
        return self.vertices, self.faces, self.normals
    
    def get_bounding_box(self) -> Optional[Tuple[np.ndarray, np.ndarray]]:
        """
        Get model bounding box.
        
        Returns:
            Tuple of (min_bounds, max_bounds) or None
        """
        if self.vertices is None:
            return None
        
        return np.min(self.vertices, axis=0), np.max(self.vertices, axis=0)
    
    def get_vertex_count(self) -> int:
        """Get number of vertices."""
        if self.vertices is None:
            return 0
        return len(self.vertices)
    
    def get_face_count(self) -> int:
        """Get number of faces."""
        if self.faces is None:
            return 0
        return len(self.faces)

