/**
 * Three.js 3D heart model renderer.
 * Ported from src/rendering/heart_renderer.py
 */

import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mat4, vec3 } from 'gl-matrix';
import { HEART_SCALE, HEART_BEAT_SCALE_AMPLITUDE } from '../utils/config';

export class HeartRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private heartModel: THREE.Group | null = null;
  private beatScale: number = 0.0;
  private modelMatrix: mat4 = mat4.create();
  private width: number;
  private height: number;

  // Shader material for heartbeat animation
  private shaderMaterial: THREE.ShaderMaterial | null = null;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.width = width;
    this.height = height;

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera
    // Match Python version: eye at origin, looking down negative Z, up is positive Y
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10.0);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -1);
    this.camera.up.set(0, 1, 0);

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0x000000, 0); // Transparent background

    // Setup shader material
    this._setupShaderMaterial();
  }

  /**
   * Setup shader material for heartbeat animation.
   */
  private _setupShaderMaterial(): void {
    const vertexShader = `
      uniform float beatScale;
      
      varying vec3 vNormal;
      varying vec3 vPosition;
      
      void main() {
        // Apply heartbeat scale to position
        vec3 scaledPosition = position * (1.0 + beatScale);
        
        // Transform to world space
        vec4 worldPos = modelMatrix * vec4(scaledPosition, 1.0);
        vPosition = worldPos.xyz;
        vNormal = normalize(normalMatrix * normal);
        
        // Transform to clip space
        gl_Position = projectionMatrix * modelViewMatrix * vec4(scaledPosition, 1.0);
      }
    `;

    const fragmentShader = `
      uniform vec3 color;
      uniform float alpha;
      uniform vec3 lightDir;
      
      varying vec3 vNormal;
      varying vec3 vPosition;
      
      void main() {
        // Simple lighting
        float light = max(dot(normalize(vNormal), normalize(-lightDir)), 0.3);
        vec3 finalColor = color * light;
        gl_FragColor = vec4(finalColor, alpha);
      }
    `;

    this.shaderMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        beatScale: { value: 0.0 },
        color: { value: new THREE.Vector3(1.0, 0.0, 0.0) }, // Red
        alpha: { value: 0.8 },
        lightDir: { value: new THREE.Vector3(0, 0, -1) } // Light coming from camera
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false // Important for transparency
    });
  }

  /**
   * Load heart model from OBJ file.
   */
  async loadModel(modelPath: string): Promise<boolean> {
    try {
      console.log('HeartRenderer: Loading model from:', modelPath);
      
      // URL encode the path to handle spaces and special characters
      const encodedPath = modelPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
      console.log('HeartRenderer: Encoded path:', encodedPath);
      
      const loader = new OBJLoader();
      
      // Load model
      const model = await new Promise<THREE.Group>((resolve, reject) => {
        loader.load(
          encodedPath,
          (object) => {
            console.log('HeartRenderer: Model loaded successfully');
            resolve(object);
          },
          (progress) => {
            if (progress.lengthComputable) {
              const percent = (progress.loaded / progress.total) * 100;
              console.log('HeartRenderer: Loading progress:', percent.toFixed(1) + '%');
            }
          },
          (error) => {
            console.error('HeartRenderer: Error loading model:', error);
            console.error('HeartRenderer: Tried path:', encodedPath);
            reject(error);
          }
        );
      });

      // Apply material to all meshes
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (this.shaderMaterial) {
            child.material = this.shaderMaterial;
          } else {
            // Fallback to basic material
            child.material = new THREE.MeshBasicMaterial({
              color: 0xff0000,
              transparent: true,
              opacity: 0.8,
              side: THREE.DoubleSide
            });
          }
        }
      });

      // Remove old model if exists
      if (this.heartModel) {
        this.scene.remove(this.heartModel);
      }

      this.heartModel = model;
      this.scene.add(this.heartModel);

      return true;
    } catch (error) {
      console.error('Error loading heart model:', error);
      return false;
    }
  }

  /**
   * Set model transformation matrix.
   */
  setTransform(transformMatrix: mat4): void {
    this.modelMatrix = mat4.clone(transformMatrix);

    if (this.heartModel) {
      // Convert mat4 to THREE.Matrix4
      // gl-matrix uses column-major, Three.js uses row-major, so we need to transpose
      const matrix = new THREE.Matrix4();
      const array = Array.from(transformMatrix);
      matrix.set(
        array[0], array[4], array[8], array[12],
        array[1], array[5], array[9], array[13],
        array[2], array[6], array[10], array[14],
        array[3], array[7], array[11], array[15]
      );
      this.heartModel.matrix.copy(matrix);
      this.heartModel.matrixAutoUpdate = false;
      this.heartModel.updateMatrixWorld(true);
    }
  }

  /**
   * Set heartbeat animation scale.
   */
  setBeatScale(scale: number): void {
    // Clamp between 0 and HEART_BEAT_SCALE_AMPLITUDE
    this.beatScale = Math.max(0, Math.min(HEART_BEAT_SCALE_AMPLITUDE, scale));

    if (this.shaderMaterial) {
      this.shaderMaterial.uniforms.beatScale.value = this.beatScale;
    }
  }

  /**
   * Resize viewport.
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Render the heart model.
   */
  render(): void {
    if (!this.heartModel) {
      return;
    }

    // Update model matrix - convert from gl-matrix (column-major) to Three.js (row-major)
    if (this.heartModel.matrixAutoUpdate === false) {
      const array = Array.from(this.modelMatrix);
      const matrix = new THREE.Matrix4();
      matrix.set(
        array[0], array[4], array[8], array[12],
        array[1], array[5], array[9], array[13],
        array[2], array[6], array[10], array[14],
        array[3], array[7], array[11], array[15]
      );
      this.heartModel.matrix.copy(matrix);
      this.heartModel.updateMatrixWorld(true);
    }

    // Update shader uniforms
    if (this.shaderMaterial) {
      this.shaderMaterial.uniforms.beatScale.value = this.beatScale;
      
      // Update model matrix uniform if shader uses it
      const array = Array.from(this.modelMatrix);
      if (this.shaderMaterial.uniforms.modelMatrix) {
        this.shaderMaterial.uniforms.modelMatrix.value.fromArray(array);
      }
    }

    // Render scene
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Get WebGL context.
   */
  getContext(): WebGLRenderingContext | null {
    return this.renderer.getContext();
  }

  /**
   * Get canvas element.
   */
  getCanvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    if (this.heartModel) {
      this.scene.remove(this.heartModel);
      this.heartModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }

    this.renderer.dispose();
  }
}

