/**
 * MediaPipe pose estimation tracker.
 * Ported from src/pose/mediapipe_tracker.py
 */

import { Pose, POSE_CONNECTIONS } from '@mediapipe/pose';
import type { Results } from '@mediapipe/pose';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import {
  MEDIAPIPE_MODEL_COMPLEXITY,
  MEDIAPIPE_MIN_DETECTION_CONFIDENCE,
  MEDIAPIPE_MIN_TRACKING_CONFIDENCE,
  MEDIAPIPE_ENABLE_SEGMENTATION,
  MEDIAPIPE_SMOOTH_LANDMARKS
} from '../utils/config';

export interface PoseResults {
  poseLandmarks?: any;
  poseWorldLandmarks?: any;
}

export class PoseTracker {
  private pose: Pose | null = null;
  private onResultsCallback?: (results: PoseResults) => void;
  private pendingRequests: Map<number, (results: PoseResults) => void> = new Map();
  private requestIdCounter: number = 0;
  private isInitialized: boolean = false;
  private isProcessing: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(onResults?: (results: PoseResults) => void) {
    this.onResultsCallback = onResults;
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = new Promise((resolve, reject) => {
      try {
        // Initialize MediaPipe Pose
        this.pose = new Pose({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
          }
        });

        // Configure MediaPipe Pose
        this.pose.setOptions({
          modelComplexity: MEDIAPIPE_MODEL_COMPLEXITY,
          minDetectionConfidence: MEDIAPIPE_MIN_DETECTION_CONFIDENCE,
          minTrackingConfidence: MEDIAPIPE_MIN_TRACKING_CONFIDENCE,
          enableSegmentation: MEDIAPIPE_ENABLE_SEGMENTATION,
          smoothLandmarks: MEDIAPIPE_SMOOTH_LANDMARKS
        });

        // Set results callback - handles both pending requests and general callback
        this.pose.onResults((results: any) => {
          const poseResults: PoseResults = {
            poseLandmarks: results.poseLandmarks,
            poseWorldLandmarks: results.poseWorldLandmarks
          };

          // Resolve any pending requests (FIFO - first in, first out)
          if (this.pendingRequests.size > 0) {
            const firstRequestId = Array.from(this.pendingRequests.keys())[0];
            const resolveCallback = this.pendingRequests.get(firstRequestId);
            if (resolveCallback) {
              this.pendingRequests.delete(firstRequestId);
              this.isProcessing = false;
              resolveCallback(poseResults);
            }
          }

          // Also call general callback if set
          if (this.onResultsCallback) {
            this.onResultsCallback(poseResults);
          }
        });

        this.isInitialized = true;
        resolve();
      } catch (error) {
        console.error('PoseTracker: Initialization error:', error);
        reject(error);
      }
    });

    return this.initializationPromise;
  }

  /**
   * Process a frame and detect pose landmarks.
   * @param imageData - ImageData from camera
   * @returns Promise that resolves with results
   */
  async process(imageData: ImageData): Promise<PoseResults> {
    // Wait for initialization
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Skip if already processing (MediaPipe can only handle one frame at a time)
    if (this.isProcessing || !this.pose) {
      return Promise.resolve({});
    }

    return new Promise((resolve) => {
      try {
        // Generate unique request ID
        const requestId = this.requestIdCounter++;
        
        // Store resolve callback
        this.pendingRequests.set(requestId, resolve);
        this.isProcessing = true;

        // Convert ImageData to HTMLCanvasElement for MediaPipe
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        if (ctx && this.pose) {
          ctx.putImageData(imageData, 0, 0);
          // Send frame to MediaPipe
          this.pose.send({ image: canvas });
        } else {
          // If canvas context fails, resolve with empty results
          this.pendingRequests.delete(requestId);
          this.isProcessing = false;
          if (!ctx) {
            console.error('PoseTracker: Failed to get canvas context');
          }
          resolve({});
        }
      } catch (error) {
        console.error('PoseTracker: Error processing frame:', error);
        this.isProcessing = false;
        resolve({});
      }
    });
  }

  /**
   * Get normalized landmarks from results.
   */
  getNormalizedLandmarks(results: PoseResults) {
    return results.poseLandmarks || null;
  }

  /**
   * Get world landmarks from results.
   */
  getWorldLandmarks(results: PoseResults) {
    return results.poseWorldLandmarks || null;
  }

  /**
   * Draw pose landmarks on a canvas.
   */
  drawLandmarks(
    canvas: HTMLCanvasElement,
    results: PoseResults
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.poseLandmarks) {
      // Draw connections
      drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
        color: '#00FF00',
        lineWidth: 2
      });

      // Draw landmarks
      drawLandmarks(ctx, results.poseLandmarks, {
        color: '#00FF00',
        radius: 2
      });
    }
  }

  /**
   * Close MediaPipe pose estimation.
   */
  close(): void {
    if (this.pose) {
      try {
        this.pose.close();
      } catch (error) {
        console.error('PoseTracker: Error closing:', error);
      }
      this.pose = null;
      this.isInitialized = false;
      this.isProcessing = false;
    }
  }
}

