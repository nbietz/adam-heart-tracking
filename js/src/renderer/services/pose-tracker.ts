/**
 * MediaPipe Pose Landmarker tracker.
 * Migrated from deprecated @mediapipe/pose to @mediapipe/tasks-vision PoseLandmarker
 * Supports multi-person detection (up to 2 people simultaneously).
 */

import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import {
  MEDIAPIPE_POSE_LANDMARKER_MODEL,
  MEDIAPIPE_NUM_POSES,
  MEDIAPIPE_MIN_POSE_DETECTION_CONFIDENCE,
  MEDIAPIPE_MIN_POSE_PRESENCE_CONFIDENCE,
  MEDIAPIPE_MIN_TRACKING_CONFIDENCE_LANDMARKER
} from '../utils/config';

export interface PoseResults {
  poseLandmarks?: any[];  // Array of arrays: [pose1[33 landmarks], pose2[33 landmarks]]
  poseWorldLandmarks?: any[];  // Array of arrays
  timestamp?: number;  // For VIDEO mode
}

export class PoseTracker {
  private poseLandmarker: PoseLandmarker | null = null;
  private isInitialized: boolean = false;
  private isProcessing: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private lastTimestamp: number = -1;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        console.log('[PoseTracker] Initializing MediaPipe Pose Landmarker...');
        
        // Initialize FilesetResolver for vision tasks
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        // Create PoseLandmarker with multi-person support
        // Model URLs use versioned paths: /pose_landmarker/{model_name}/float16/1/{model_name}.task
        const modelName = MEDIAPIPE_POSE_LANDMARKER_MODEL.replace('.task', '');
        const modelPath = `https://storage.googleapis.com/mediapipe-models/pose_landmarker/${modelName}/float16/1/${MEDIAPIPE_POSE_LANDMARKER_MODEL}`;
        console.log('[PoseTracker] Loading model from:', modelPath);
        
        this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: 'GPU'
          },
          numPoses: MEDIAPIPE_NUM_POSES,  // Enable multi-person detection (up to 2)
          minPoseDetectionConfidence: MEDIAPIPE_MIN_POSE_DETECTION_CONFIDENCE,
          minPosePresenceConfidence: MEDIAPIPE_MIN_POSE_PRESENCE_CONFIDENCE,
          minTrackingConfidence: MEDIAPIPE_MIN_TRACKING_CONFIDENCE_LANDMARKER,
          runningMode: 'VIDEO',  // For webcam streaming
          outputSegmentationMasks: false
        });

        this.isInitialized = true;
        console.log('[PoseTracker] MediaPipe Pose Landmarker initialized successfully');
      } catch (error) {
        console.error('[PoseTracker] Initialization error:', error);
        this.isInitialized = false;
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Process a frame and detect pose landmarks.
   * @param imageData - ImageData from camera
   * @param timestamp - Optional timestamp for VIDEO mode (defaults to performance.now())
   * @returns Promise that resolves with results containing array of poses
   */
  async process(imageData: ImageData, timestamp?: number): Promise<PoseResults> {
    // Wait for initialization
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Skip if already processing or not initialized
    if (this.isProcessing || !this.poseLandmarker) {
      return { poseLandmarks: [], poseWorldLandmarks: [] };
    }

    try {
      this.isProcessing = true;

      // Convert ImageData to ImageBitmap for PoseLandmarker
      const imageBitmap = await createImageBitmap(imageData);
      
      // MediaPipe requires timestamps to be strictly monotonically increasing, starting at 1
      // Use a simple counter to ensure this requirement is met
      if (this.lastTimestamp === -1) {
        // First frame - start at 1
        this.lastTimestamp = 1;
      } else {
        // Increment timestamp for each frame
        this.lastTimestamp = this.lastTimestamp + 1;
      }

      // Detect poses in the frame using the counter-based timestamp
      const results = this.poseLandmarker.detectForVideo(imageBitmap, this.lastTimestamp);
      
      // Clean up ImageBitmap
      imageBitmap.close();

      // Convert results to our PoseResults format
      // results.landmarks is an array of arrays: [pose1[33 landmarks], pose2[33 landmarks]]
      return {
        poseLandmarks: results.landmarks || [],
        poseWorldLandmarks: results.worldLandmarks || [],
        timestamp: this.lastTimestamp
      };
    } catch (error) {
      console.error('[PoseTracker] Error processing frame:', error);
      return { poseLandmarks: [], poseWorldLandmarks: [] };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get normalized landmarks from results.
   * Returns array of pose landmark arrays (for multi-person support).
   */
  getNormalizedLandmarks(results: PoseResults): any[] | null {
    return results.poseLandmarks || null;
  }

  /**
   * Get world landmarks from results.
   * Returns array of pose world landmark arrays (for multi-person support).
   */
  getWorldLandmarks(results: PoseResults): any[] | null {
    return results.poseWorldLandmarks || null;
  }

  /**
   * Close MediaPipe pose estimation.
   */
  close(): void {
    if (this.poseLandmarker) {
      try {
        // PoseLandmarker doesn't have a close method, just clear the reference
        this.poseLandmarker = null;
        this.isInitialized = false;
        this.isProcessing = false;
        console.log('[PoseTracker] Closed');
      } catch (error) {
        console.error('[PoseTracker] Error closing:', error);
      }
    }
  }
}
