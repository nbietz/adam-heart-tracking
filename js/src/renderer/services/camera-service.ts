/**
 * Camera service using getUserMedia API.
 * Ported from src/video/qt_camera.py
 */

import {
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  VIDEO_FPS,
  MIRROR_HORIZONTAL
} from '../utils/config';

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export class CameraService {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width: number;
  private height: number;
  private mirror: boolean;
  private currentDeviceId: string | null = null;

  constructor(
    width: number = VIDEO_WIDTH,
    height: number = VIDEO_HEIGHT,
    mirror: boolean = MIRROR_HORIZONTAL
  ) {
    this.width = width;
    this.height = height;
    this.mirror = mirror;
  }

  /**
   * Get list of available camera devices.
   * Note: Requires camera permissions to get device labels.
   */
  async getDevices(): Promise<CameraDevice[]> {
    try {
      // Check if mediaDevices is available
      if (!navigator.mediaDevices) {
        console.error('getDevices: navigator.mediaDevices is not available');
        console.error('getDevices: navigator object:', navigator);
        return [];
      }
      
      if (!navigator.mediaDevices.enumerateDevices) {
        console.error('getDevices: navigator.mediaDevices.enumerateDevices is not available');
        return [];
      }

      // First, request camera permissions to get device labels
      // We'll use a temporary stream just to trigger permission request
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 640 },
            height: { ideal: 480 }
          } 
        });
        // Stop the temporary stream immediately
        tempStream.getTracks().forEach(track => {
          track.stop();
        });
      } catch (permError: any) {
        // Continue anyway - we'll still get device IDs
      }

      // Now enumerate devices - labels should be available if permission was granted
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const videoDevices = devices
        .filter(device => device.kind === 'videoinput')
        .map((device, index) => {
          const label = device.label || `Camera ${index + 1} (${device.deviceId.substring(0, 8)}...)`;
          return {
            deviceId: device.deviceId,
            label: label
          };
        });

      return videoDevices;
    } catch (error: any) {
      console.error('getDevices: Error enumerating devices:', error.name, error.message, error);
      return [];
    }
  }

  /**
   * Start camera capture.
   */
  async start(deviceId?: string): Promise<boolean> {
    try {
      // Stop existing stream if any
      await this.stop();

      // Create video element
      this.videoElement = document.createElement('video');
      this.videoElement.width = this.width;
      this.videoElement.height = this.height;
      this.videoElement.autoplay = true;
      this.videoElement.playsInline = true;

      // Create canvas for frame capture
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

      if (!this.ctx) {
        throw new Error('Failed to get canvas context');
      }

      // Request camera access
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: this.width },
          height: { ideal: this.height },
          frameRate: { ideal: VIDEO_FPS }
        }
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = this.stream;

      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        if (!this.videoElement) {
          reject(new Error('Video element not created'));
          return;
        }

        this.videoElement.onloadedmetadata = () => {
          // Update dimensions to match actual video
          if (this.videoElement) {
            this.width = this.videoElement.videoWidth;
            this.height = this.videoElement.videoHeight;
            if (this.canvas) {
              this.canvas.width = this.width;
              this.canvas.height = this.height;
            }
          }
          resolve();
        };

        this.videoElement.onerror = reject;
      });

      // Get device ID from track
      const videoTrack = this.stream.getVideoTracks()[0];
      if (videoTrack) {
        this.currentDeviceId = videoTrack.getSettings().deviceId || null;
      }

      return true;
    } catch (error) {
      console.error('Error starting camera:', error);
      await this.stop();
      return false;
    }
  }

  /**
   * Stop camera capture.
   */
  async stop(): Promise<void> {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    this.canvas = null;
    this.ctx = null;
    this.currentDeviceId = null;
  }

  /**
   * Read a frame from the camera.
   * Returns ImageData for MediaPipe processing.
   */
  readFrame(): ImageData | null {
    if (!this.videoElement || !this.canvas || !this.ctx) {
      return null;
    }

    try {
      // Draw video frame to canvas (mirrored if needed)
      if (this.mirror) {
        this.ctx.save();
        this.ctx.scale(-1, 1);
        this.ctx.drawImage(
          this.videoElement,
          -this.width,
          0,
          this.width,
          this.height
        );
        this.ctx.restore();
      } else {
        this.ctx.drawImage(
          this.videoElement,
          0,
          0,
          this.width,
          this.height
        );
      }

      // Get ImageData
      return this.ctx.getImageData(0, 0, this.width, this.height);
    } catch (error) {
      console.error('Error reading frame:', error);
      return null;
    }
  }

  /**
   * Get current video element (for display).
   */
  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  /**
   * Get current resolution.
   */
  getResolution(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /**
   * Check if camera is active.
   */
  isActive(): boolean {
    return this.stream !== null && this.stream.active;
  }

  /**
   * Get current device ID.
   */
  getCurrentDeviceId(): string | null {
    return this.currentDeviceId;
  }
}

