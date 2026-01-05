"""ModernGL 3D heart model renderer."""

import logging
import moderngl
import numpy as np
from typing import Optional, Tuple
from pathlib import Path
from ..rendering.model_loader import ModelLoader
from ..utils.config import Config
from ..utils.math_utils import perspective_projection_matrix, look_at_matrix

logger = logging.getLogger(__name__)


class HeartRenderer:
    """Renders 3D heart model using ModernGL."""
    
    # Vertex shader (using GLSL 410 for OpenGL 4.1)
    VERTEX_SHADER = """
    #version 410
    
    in vec3 in_position;
    in vec3 in_normal;
    
    uniform mat4 model;
    uniform mat4 view;
    uniform mat4 projection;
    uniform float beat_scale;
    
    out vec3 frag_normal;
    out vec3 frag_position;
    
    void main() {
        // Apply heartbeat scale (beat_scale is 0.0-0.1, so add 1.0 to get 1.0-1.1)
        vec3 scaled_position = in_position * (1.0 + beat_scale);
        vec4 world_pos = model * vec4(scaled_position, 1.0);
        frag_position = world_pos.xyz;
        frag_normal = mat3(model) * in_normal;
        vec4 view_pos = view * world_pos;
        gl_Position = projection * view_pos;
    }
    """
    
    # Fragment shader (using GLSL 410 for OpenGL 4.1)
    FRAGMENT_SHADER = """
    #version 410
    
    in vec3 frag_normal;
    in vec3 frag_position;
    
    uniform vec3 color;
    uniform float alpha;
    uniform vec3 light_dir;
    
    out vec4 frag_color;
    
    void main() {
        // TEMPORARY: Force red output to test if shader is working
        frag_color = vec4(1.0, 0.0, 0.0, 1.0);
        
        // Original lighting code (commented out for testing)
        // float light = max(dot(normalize(frag_normal), normalize(-light_dir)), 0.3);
        // vec3 final_color = color * light;
        // frag_color = vec4(final_color, alpha);
    }
    """
    
    def __init__(self, ctx: moderngl.Context, width: int, height: int):
        """
        Initialize heart renderer.
        
        Args:
            ctx: ModernGL context
            width: Viewport width
            height: Viewport height
        """
        self.ctx = ctx
        self.width = width
        self.height = height
        
        # Model data
        self.model_loader = ModelLoader()
        self.vertices: Optional[np.ndarray] = None
        self.faces: Optional[np.ndarray] = None
        self.normals: Optional[np.ndarray] = None
        
        # OpenGL buffers
        self.vbo: Optional[moderngl.Buffer] = None
        self.ibo: Optional[moderngl.Buffer] = None
        self.vao: Optional[moderngl.VertexArray] = None
        
        # Shader program
        self.prog: Optional[moderngl.Program] = None
        
        # Rendering state
        self.beat_scale = 1.0
        self.model_matrix = np.eye(4, dtype=np.float32)
        # Initialize view matrix to look from origin down negative Z
        self.view_matrix = look_at_matrix(
            np.array([0.0, 0.0, 0.0], dtype=np.float32),  # eye
            np.array([0.0, 0.0, -1.0], dtype=np.float32),  # target
            np.array([0.0, 1.0, 0.0], dtype=np.float32)  # up
        )
        self.projection_matrix = np.eye(4, dtype=np.float32)
        
        # Setup shaders
        self._setup_shaders()
        
        # Setup projection
        self._setup_projection()
    
    def _setup_shaders(self):
        """Setup shader program."""
        try:
            self.prog = self.ctx.program(
                vertex_shader=self.VERTEX_SHADER,
                fragment_shader=self.FRAGMENT_SHADER
            )
            logger.info("Shader program created successfully")
            # Verify attributes exist
            try:
                pos_attr = self.prog.get('in_position', None)
                norm_attr = self.prog.get('in_normal', None)
                logger.info(f"Shader attributes - in_position: {pos_attr is not None}, in_normal: {norm_attr is not None}")
            except Exception as e:
                logger.warning(f"Could not verify shader attributes: {e}")
        except Exception as e:
            logger.error(f"Error creating shader program: {e}", exc_info=True)
            raise
    
    def _setup_projection(self, fov: float = 60.0, near: float = 0.1, far: float = 10.0):
        """
        Setup projection matrix.
        
        Args:
            fov: Field of view in degrees
            near: Near clipping plane
            far: Far clipping plane
        """
        aspect = self.width / self.height if self.height > 0 else 1.0
        self.projection_matrix = perspective_projection_matrix(fov, aspect, near, far)
    
    def load_model(self, model_path: Path) -> bool:
        """
        Load heart model from OBJ file.
        
        Args:
            model_path: Path to OBJ file
        
        Returns:
            True if model loaded successfully
        """
        import logging
        logger = logging.getLogger(__name__)
        
        # 3D heart model loading disabled - using 2D overlay instead
        # logger.info(f"Loading heart model from {model_path}")
        if not model_path.exists():
            logger.error(f"Heart model file not found: {model_path}")
            return False
        
        if not self.model_loader.load_model(model_path):
            logger.error(f"Failed to load model from {model_path}")
            return False
        
        self.vertices, self.faces, self.normals = self.model_loader.get_vertex_data()
        
        if self.vertices is None or self.faces is None:
            logger.error("Model loaded but vertices or faces are None")
            return False
        
        # logger.info(f"Successfully loaded heart model: {len(self.vertices)} vertices, {len(self.faces)} faces")
        
        # Create vertex buffer
        # Interleave vertices and normals as a flat array: [vx, vy, vz, nx, ny, nz, ...]
        num_vertices = len(self.vertices)
        
        # Ensure normals exist
        if self.normals is None or len(self.normals) != num_vertices:
            logger.warning("Normals missing or incorrect length, computing from faces")
            # Compute simple normals (this is a fallback, ideally normals come from the model)
            self.normals = np.ones((num_vertices, 3), dtype=np.float32) * [0, 0, 1]
        
        # Create interleaved vertex data: position (3 floats) + normal (3 floats) per vertex
        # ModernGL expects interleaved data as a flat array
        vertex_data = np.zeros(num_vertices * 6, dtype=np.float32)
        vertex_data[0::6] = self.vertices[:, 0]  # x positions
        vertex_data[1::6] = self.vertices[:, 1]  # y positions
        vertex_data[2::6] = self.vertices[:, 2]  # z positions
        vertex_data[3::6] = self.normals[:, 0]    # nx normals
        vertex_data[4::6] = self.normals[:, 1]    # ny normals
        vertex_data[5::6] = self.normals[:, 2]    # nz normals
        
        self.vbo = self.ctx.buffer(vertex_data.tobytes())
        
        # Create index buffer - ensure faces are uint32 and flattened
        # Faces should be a flat 1D array of indices
        if len(self.faces.shape) == 2:
            faces_flat = self.faces.flatten().astype(np.uint32)
        else:
            faces_flat = self.faces.astype(np.uint32)
        self.ibo = self.ctx.buffer(faces_flat.tobytes())
        
        # Verify shader program is valid
        if self.prog is None:
            logger.error("Shader program is None, cannot create VAO")
            return False
        
        # Verify buffers are valid
        if self.vbo is None or self.ibo is None:
            logger.error(f"Buffers are invalid: VBO={self.vbo is not None}, IBO={self.ibo is not None}")
            return False
        
        # Verify buffer sizes
        vbo_size = len(vertex_data) * 4  # 4 bytes per float32
        ibo_size = len(faces_flat) * 4   # 4 bytes per uint32
        logger.debug(f"Buffer sizes - VBO: {vbo_size} bytes ({num_vertices} vertices), IBO: {ibo_size} bytes ({len(faces_flat)} indices)")
        
        # Create vertex array
        # Try different format approaches
        try:
            # First try: interleaved format
            # Format: '3f 3f' means 3 floats for position, 3 floats for normal, interleaved
            # Stride is automatically calculated (6 floats = 24 bytes)
            # Verify shader attributes exist before creating VAO
            available_attrs = list(self.prog.attributes.keys())
            logger.info(f"Available shader attributes: {available_attrs}")
            if 'in_position' not in available_attrs or 'in_normal' not in available_attrs:
                logger.error(f"Missing required attributes. Have: {available_attrs}, Need: in_position, in_normal")
                return False
            
            logger.debug("Attempting to create VAO with interleaved format...")
            self.vao = self.ctx.vertex_array(
                self.prog,
                [
                    (self.vbo, '3f 3f', 'in_position', 'in_normal')
                ],
                self.ibo
            )
            logger.info(f"Successfully created VAO with {num_vertices} vertices and {len(faces_flat)} indices")
        except Exception as e1:
            logger.warning(f"First VAO creation attempt failed: {e1}, trying separate buffers...")
            try:
                # Second try: separate buffers for position and normal
                logger.debug("Attempting to create VAO with separate buffers...")
                pos_data = self.vertices.astype(np.float32).tobytes()
                norm_data = self.normals.astype(np.float32).tobytes()
                pos_vbo = self.ctx.buffer(pos_data)
                norm_vbo = self.ctx.buffer(norm_data)
                
                self.vao = self.ctx.vertex_array(
                    self.prog,
                    [
                        (pos_vbo, '3f', 'in_position'),
                        (norm_vbo, '3f', 'in_normal')
                    ],
                    self.ibo
                )
                # Store both VBOs for cleanup
                self.pos_vbo = pos_vbo
                self.norm_vbo = norm_vbo
                logger.info(f"Successfully created VAO with separate buffers: {num_vertices} vertices")
            except Exception as e2:
                logger.error(f"Both VAO creation attempts failed. First: {e1}, Second: {e2}", exc_info=True)
                # Try to get more details about the error
                try:
                    # Check if attributes exist in shader
                    attrs = list(self.prog.attributes.keys())
                    logger.error(f"Shader attributes available: {attrs}")
                    logger.error(f"Looking for: in_position, in_normal")
                    logger.error(f"VBO size: {len(vertex_data)} floats, IBO size: {len(faces_flat)} indices")
                except Exception as e3:
                    logger.error(f"Could not get diagnostic info: {e3}")
                self.vao = None
                return False
        
        return True
    
    def set_transform(self, transform_matrix: np.ndarray):
        """
        Set model transformation matrix.
        
        Args:
            transform_matrix: 4x4 transformation matrix
        """
        self.model_matrix = transform_matrix.astype(np.float32)
    
    def set_view(self, eye: np.ndarray, target: np.ndarray, up: np.ndarray = np.array([0, 0, 1])):
        """
        Set view matrix.
        
        Args:
            eye: Camera position
            target: Look-at target
            up: Up vector
        """
        self.view_matrix = look_at_matrix(eye, target, up)
        # Debug: log view matrix occasionally
        if hasattr(self, '_render_debug_count') and self._render_debug_count % 60 == 0:
            logger.info(f"View matrix - eye: {eye}, target: {target}, up: {up}")
            logger.info(f"View matrix translation: {self.view_matrix[:3, 3]}")
    
    def set_beat_scale(self, scale: float):
        """
        Set heartbeat animation scale.
        
        Args:
            scale: Scale factor (1.0 = normal, >1.0 = expanded)
        """
        self.beat_scale = max(0.5, min(2.0, scale))  # Clamp between 0.5 and 2.0
    
    def resize(self, width: int, height: int):
        """
        Resize viewport.
        
        Args:
            width: New viewport width
            height: New viewport height
        """
        self.width = width
        self.height = height
        self._setup_projection()
    
    def render(self):
        """Render the heart model."""
        if self.vao is None or self.prog is None:
            # Log why rendering is skipped
            if self.vao is None:
                print("Debug: Heart model VAO is None - model may not be loaded")
            if self.prog is None:
                print("Debug: Shader program is None")
            return
        
        # Enable depth testing - disable culling to see if model is inside-out
        self.ctx.enable(moderngl.DEPTH_TEST)
        self.ctx.disable(moderngl.CULL_FACE)  # Disable culling to see both sides
        self.ctx.enable(moderngl.BLEND)
        self.ctx.blend_func = moderngl.SRC_ALPHA, moderngl.ONE_MINUS_SRC_ALPHA
        
        # Set viewport - ensure it matches framebuffer size
        self.ctx.viewport = (0, 0, self.width, self.height)
        
        # Set uniforms
        self.prog['model'].write(self.model_matrix.tobytes())
        self.prog['view'].write(self.view_matrix.tobytes())
        self.prog['projection'].write(self.projection_matrix.tobytes())
        self.prog['beat_scale'].value = self.beat_scale
        # Note: color, alpha, and light_dir uniforms removed since shader now outputs fixed red
        
        # Debug: log transform occasionally
        if not hasattr(self, '_render_debug_count'):
            self._render_debug_count = 0
        self._render_debug_count += 1
        if self._render_debug_count % 60 == 0:  # Every ~2 seconds at 30fps
            # Transform a point from model space to clip space to check visibility
            test_point = np.array([0.0, 0.0, 0.0, 1.0])  # Center of model in model space
            model_point = self.model_matrix @ test_point
            view_point = self.view_matrix @ model_point
            clip_point = self.projection_matrix @ view_point
            logger.info(f"Model center in clip space: x={clip_point[0]/clip_point[3]:.3f}, y={clip_point[1]/clip_point[3]:.3f}, z={clip_point[2]/clip_point[3]:.3f}, w={clip_point[3]:.3f}")
            # Check if in view frustum: -w <= x,y,z <= w and 0 < z < w (for perspective)
            in_frustum = (abs(clip_point[0]) <= abs(clip_point[3]) and 
                         abs(clip_point[1]) <= abs(clip_point[3]) and 
                         0 < clip_point[2] and clip_point[2] < clip_point[3])
            logger.info(f"Heart in view frustum: {in_frustum}")
            pos = self.model_matrix[:3, 3]
            scale = np.linalg.norm(self.model_matrix[:3, 0])  # Get scale from first column
            logger.info(f"Rendering heart at: x={pos[0]:.3f}, y={pos[1]:.3f}, z={pos[2]:.3f}, scale={scale:.3f}")
            logger.info(f"View matrix: eye at origin, looking at (0,0,-1)")
            logger.info(f"Projection: FOV=60, near=0.1, far=10.0, aspect={self.width/self.height:.3f}")
            
            # Debug: check if model has vertices
            if self.vao is not None:
                logger.info(f"VAO exists, attempting to render {len(self.faces) if self.faces is not None else 'unknown'} faces")
            else:
                logger.warning("VAO is None!")
        
        # Render
        if self.vao is not None:
            try:
                # Try rendering with explicit mode - ModernGL should auto-detect from index buffer
                # But let's be explicit about it
                num_indices = len(self.faces.flatten()) if len(self.faces.shape) == 2 else len(self.faces)
                # Each face is 3 indices, so num_indices is already the total count
                self.vao.render(moderngl.TRIANGLES)
                if self._render_debug_count % 60 == 0:
                    logger.info(f"VAO.render(TRIANGLES) called successfully with {num_indices} indices")
            except Exception as e:
                logger.error(f"Error during VAO.render(): {e}", exc_info=True)
                # Fallback: try without explicit mode
                try:
                    self.vao.render()
                    logger.info("VAO.render() succeeded without explicit mode")
                except Exception as e2:
                    logger.error(f"VAO.render() failed both ways: {e}, {e2}", exc_info=True)

