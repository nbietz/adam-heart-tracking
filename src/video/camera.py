"""Webcam capture and mirroring functionality."""

import cv2
import numpy as np
import platform
import subprocess
import logging
import json
import os
from pathlib import Path
from typing import Optional, Tuple, List, Dict
from ..utils.config import Config

# Set up logging
logger = logging.getLogger(__name__)

# Try to import PyQt6 multimedia for device enumeration
try:
    from PyQt6.QtMultimedia import QMediaDevices, QCameraDevice
    QT_MULTIMEDIA_AVAILABLE = True
except ImportError:
    QT_MULTIMEDIA_AVAILABLE = False


class Camera:
    """Handles webcam capture and video mirroring."""
    
    @staticmethod
    def _get_camera_names_macos() -> Dict[int, str]:
        """
        Get camera device names on macOS using system_profiler.
        Returns a dictionary mapping indices to device names.
        Note: The indices from system_profiler may not match OpenCV indices.
        """
        device_map = {}
        try:
            # Use system_profiler to get camera names
            result = subprocess.run(
                ['system_profiler', 'SPCameraDataType', '-json'],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                import json
                data = json.loads(result.stdout)
                if 'SPCameraDataType' in data:
                    cameras = data['SPCameraDataType']
                    for idx, cam_info in enumerate(cameras):
                        if isinstance(cam_info, dict) and '_name' in cam_info:
                            device_map[idx] = cam_info['_name']
        except Exception:
            pass
        return device_map
    
    @staticmethod
    def _match_qt_to_opencv(qt_devices: List[Dict], opencv_indices: List[int]) -> Dict[int, int]:
        """
        Try to match Qt device indices to OpenCV indices.
        Returns a dictionary mapping Qt index to OpenCV index.
        
        This is a heuristic - we can't reliably identify devices without opening them.
        Strategy: Try Qt index first, then use sequential mapping for remaining devices.
        """
        mapping = {}
        used_opencv = set()
        
        # First pass: try direct index match
        for qt_dev in qt_devices:
            qt_idx = qt_dev['qt_index']
            if qt_idx in opencv_indices and qt_idx not in used_opencv:
                mapping[qt_idx] = qt_idx
                used_opencv.add(qt_idx)
        
        # Second pass: map remaining Qt devices to unused OpenCV indices
        for qt_dev in qt_devices:
            qt_idx = qt_dev['qt_index']
            if qt_idx not in mapping:
                # Find first unused OpenCV index
                for opencv_idx in opencv_indices:
                    if opencv_idx not in used_opencv:
                        mapping[qt_idx] = opencv_idx
                        used_opencv.add(opencv_idx)
                        break
        
        return mapping
    
    @staticmethod
    def _get_camera_names_qt() -> List[Dict[str, any]]:
        """
        Get camera device names and IDs using PyQt6 QMediaDevices.
        Returns a list of dictionaries with 'qt_index', 'name', and 'id'.
        Note: This assumes QApplication already exists (should be called from Qt context).
        """
        devices = []
        if not QT_MULTIMEDIA_AVAILABLE:
            logger.warning("Qt Multimedia not available for camera enumeration")
            return devices
        
        try:
            from PyQt6.QtCore import QCoreApplication
            # Check if QApplication exists
            app = QCoreApplication.instance()
            if app is None:
                logger.warning("QApplication not found, cannot enumerate Qt cameras")
                return devices
            
            qt_devices = QMediaDevices.videoInputs()
            logger.info(f"Found {len(qt_devices)} Qt camera devices:")
            for idx, device in enumerate(qt_devices):
                device_id = None
                try:
                    raw_id = device.id()
                    # Convert device ID to string for consistent comparison
                    # Handle both bytes and string formats
                    if isinstance(raw_id, bytes):
                        device_id = raw_id.decode('utf-8', errors='ignore')
                    elif isinstance(raw_id, (str, int)):
                        device_id = str(raw_id)
                    else:
                        device_id = str(raw_id)
                except Exception as e:
                    logger.debug(f"Error getting device ID: {e}")
                    pass
                
                device_info = {
                    'qt_index': idx,
                    'name': device.description(),
                    'id': device_id
                }
                devices.append(device_info)
                logger.info(f"  Qt Index {idx}: '{device_info['name']}' (ID: {device_id})")
        except Exception as e:
            logger.error(f"Error getting Qt camera devices: {e}", exc_info=True)
        return devices
    
    @staticmethod
    def _find_opencv_index_for_device(device_name: str, device_id: str = None, max_test: int = 10) -> Optional[int]:
        """
        Dynamically find the OpenCV index for a specific device by opening cameras and checking their properties.
        This is more reliable than static mapping since indices can change.
        
        Args:
            device_name: Device name to search for
            device_id: Optional device ID to match
            max_test: Maximum number of indices to test
            
        Returns:
            OpenCV index for the device, or None if not found
        """
        # Try to open each camera and check if it matches
        for i in range(max_test):
            cap = None
            try:
                if platform.system() == 'Darwin':
                    cap = cv2.VideoCapture(i, cv2.CAP_AVFOUNDATION)
                else:
                    cap = cv2.VideoCapture(i)
                
                if cap and cap.isOpened():
                    # On macOS with AVFoundation, we can get device name
                    # Try to match by checking camera properties
                    # Note: OpenCV doesn't directly expose device name, but we can try
                    # to identify by checking if this index opens the right device
                    # by comparing with Qt's device list
                    cap.release()
                    
                    # For now, we'll use a different strategy: match by trying indices
                    # and verifying against Qt device list
                    pass
            except Exception:
                pass
            finally:
                if cap is not None:
                    cap.release()
        
        return None
    
    # Cache for valid OpenCV indices (to avoid opening cameras on every refresh)
    _cached_opencv_indices: Optional[List[int]] = None
    
    # Persistent mapping file path
    _MAPPING_FILE = Path(Config.PROJECT_ROOT) / ".camera_mapping.json"
    
    @staticmethod
    def _load_persistent_mapping() -> Dict[str, int]:
        """
        Load persistent camera mapping from file.
        Maps device ID -> OpenCV index.
        This mapping is updated when cameras are successfully opened.
        """
        if not Camera._MAPPING_FILE.exists():
            return {}
        
        try:
            with open(Camera._MAPPING_FILE, 'r') as f:
                mapping = json.load(f)
                logger.info(f"Loaded persistent camera mapping: {mapping}")
                return mapping
        except Exception as e:
            logger.warning(f"Error loading camera mapping: {e}")
            return {}
    
    @staticmethod
    def _save_persistent_mapping(mapping: Dict[str, int]):
        """
        Save persistent camera mapping to file.
        """
        try:
            with open(Camera._MAPPING_FILE, 'w') as f:
                json.dump(mapping, f, indent=2)
                logger.info(f"Saved camera mapping: {mapping}")
        except Exception as e:
            logger.warning(f"Error saving camera mapping: {e}")
    
    @staticmethod
    def _update_camera_mapping(device_id: str, opencv_index: int):
        """
        Update persistent mapping when a camera is successfully opened.
        """
        mapping = Camera._load_persistent_mapping()
        mapping[device_id] = opencv_index
        Camera._save_persistent_mapping(mapping)
    
    @staticmethod
    def _get_valid_opencv_indices(max_test: int = 10, use_cache: bool = True) -> List[int]:
        """
        Get list of valid OpenCV camera indices.
        Uses caching to avoid opening cameras on every refresh.
        
        Args:
            max_test: Maximum number of camera indices to test
            use_cache: Whether to use cached results (default: True)
            
        Returns:
            List of valid OpenCV indices
        """
        # Return cached results if available and caching is enabled
        if use_cache and Camera._cached_opencv_indices is not None:
            return Camera._cached_opencv_indices
        
        # Find all valid OpenCV indices (this will activate cameras, but only once)
        opencv_indices = []
        for i in range(max_test):
            cap = None
            try:
                if platform.system() == 'Darwin':
                    cap = cv2.VideoCapture(i, cv2.CAP_AVFOUNDATION)
                else:
                    cap = cv2.VideoCapture(i)
                
                if cap and cap.isOpened():
                    opencv_indices.append(i)
            except Exception:
                pass
            finally:
                if cap is not None:
                    cap.release()
        
        # Cache the results
        Camera._cached_opencv_indices = opencv_indices
        return opencv_indices
    
    @staticmethod
    def clear_camera_cache():
        """Clear the cached camera indices (call when cameras are added/removed)."""
        Camera._cached_opencv_indices = None
    
    @staticmethod
    def _get_opencv_device_characteristics(opencv_idx: int) -> Dict:
        """
        Get characteristics of a camera at a given OpenCV index.
        These can help identify which device it is.
        
        Returns:
            Dictionary with device characteristics (resolution, fps, etc.)
        """
        cap = None
        try:
            if platform.system() == 'Darwin':
                cap = cv2.VideoCapture(opencv_idx, cv2.CAP_AVFOUNDATION)
            else:
                cap = cv2.VideoCapture(opencv_idx)
            
            if cap and cap.isOpened():
                # Get device characteristics
                width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                fps = cap.get(cv2.CAP_PROP_FPS)
                backend = cap.getBackendName()
                
                # Try to get device name from AVFoundation (macOS specific)
                device_name = None
                try:
                    # On AVFoundation, we might be able to get device info
                    # This is a workaround - AVFoundation doesn't expose device name directly
                    pass
                except:
                    pass
                
                return {
                    'width': width,
                    'height': height,
                    'fps': fps,
                    'backend': backend,
                    'name': device_name
                }
        except Exception as e:
            logger.debug(f"Error getting characteristics for index {opencv_idx}: {e}")
        finally:
            if cap is not None:
                cap.release()
        
        return {}
    
    @staticmethod
    def _test_4k_support(cap: cv2.VideoCapture) -> bool:
        """
        Test if an already-opened camera supports 4K resolution.
        Logitech BRIO supports 4K, FaceTime typically doesn't.
        
        Args:
            cap: Already-opened VideoCapture object
            
        Returns:
            True if the camera supports 4K (3840x2160), False otherwise
        """
        try:
            if cap and cap.isOpened():
                # Try to set 4K resolution
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 3840)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 2160)
                actual_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                actual_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                
                # Logitech BRIO supports 4K (3840x2160)
                # FaceTime typically maxes out at 1920x1080
                supports_4k = actual_width >= 3840 and actual_height >= 2160
                logger.debug(f"    {actual_width}x{actual_height} -> 4K support: {supports_4k}")
                return supports_4k
        except Exception as e:
            logger.debug(f"    Error testing 4K support: {e}")
        
        return False
    
    @staticmethod
    def _match_qt_device_to_opencv(qt_device: Dict, opencv_indices: List[int], max_test: int = 10, exclude_indices: set = None) -> Optional[int]:
        """
        Match a Qt device to its OpenCV index using device characteristics.
        CRITICAL: Uses 4K capability to differentiate Logitech BRIO from FaceTime.
        
        Args:
            qt_device: Dictionary with 'name' and 'id' keys
            opencv_indices: List of valid OpenCV indices to test
            max_test: Maximum number of indices to test
            
        Returns:
            OpenCV index that matches the device, or None if not found
        """
        device_name = qt_device['name']
        device_id = qt_device.get('id')
        qt_idx = qt_device['qt_index']
        
        # CRITICAL: Only handle FaceTime and Logitech BRIO
        is_facetime = "FaceTime" in device_name and "Built-in" in device_name
        is_logitech_brio = "Logitech" in device_name and "BRIO" in device_name
        
        if not (is_facetime or is_logitech_brio):
            return None
        
        # Normalize device ID
        device_id_str = None
        if device_id:
            if isinstance(device_id, bytes):
                device_id_str = device_id.decode('utf-8', errors='ignore')
            else:
                device_id_str = str(device_id)
        
        logger.info(f"  Matching '{device_name}' (Qt index {qt_idx}, ID: {device_id_str})")
        
        # FIRST: Check persistent mapping
        if device_id_str:
            persistent_mapping = Camera._load_persistent_mapping()
            if device_id_str in persistent_mapping:
                mapped_idx = persistent_mapping[device_id_str]
                if mapped_idx in opencv_indices:
                    # Verify it still works AND has the correct characteristics
                    cap = None
                    try:
                        if platform.system() == 'Darwin':
                            cap = cv2.VideoCapture(mapped_idx, cv2.CAP_AVFOUNDATION)
                        else:
                            cap = cv2.VideoCapture(mapped_idx)
                        if cap and cap.isOpened():
                            ret, frame = cap.read()
                            if ret and frame is not None:
                                # Verify characteristics match
                                supports_4k = Camera._test_4k_support(cap)
                                if (is_logitech_brio and supports_4k) or (is_facetime and not supports_4k):
                                    logger.info(f"  ✓ Using persistent mapping: '{device_name}' -> OpenCV {mapped_idx} (verified)")
                                    cap.release()
                                    return mapped_idx
                                else:
                                    logger.warning(f"  ✗ Persistent mapping for '{device_name}' has wrong characteristics (4K: {supports_4k}), will remap")
                            cap.release()
                    except Exception:
                        pass
                    finally:
                        if cap is not None:
                            cap.release()
        
        # SECOND: Test ALL OpenCV indices to find the one with matching characteristics
        logger.info(f"  Testing all OpenCV indices to find '{device_name}'...")
        
        # For Logitech BRIO: find the index that supports 4K
        # For FaceTime: find the index that does NOT support 4K
        target_4k_support = is_logitech_brio
        
        # Exclude indices that are already matched to other devices
        if exclude_indices is None:
            exclude_indices = set()
        
        for opencv_idx in opencv_indices:
            # Skip indices that are already matched
            if opencv_idx in exclude_indices:
                logger.debug(f"  Skipping OpenCV index {opencv_idx} (already matched)")
                continue
            cap = None
            try:
                if platform.system() == 'Darwin':
                    cap = cv2.VideoCapture(opencv_idx, cv2.CAP_AVFOUNDATION)
                else:
                    cap = cv2.VideoCapture(opencv_idx)
                
                if cap and cap.isOpened():
                    # Verify it can capture
                    ret, frame = cap.read()
                    if ret and frame is not None:
                        # Test 4K support (using the already-opened cap)
                        supports_4k = Camera._test_4k_support(cap)
                        
                        # Match based on 4K capability
                        if supports_4k == target_4k_support:
                            logger.info(f"  ✓ Found '{device_name}' at OpenCV index {opencv_idx} (4K: {supports_4k})")
                            cap.release()
                            # Update persistent mapping
                            if device_id_str:
                                Camera._update_camera_mapping(device_id_str, opencv_idx)
                            return opencv_idx
                    
                    cap.release()
            except Exception as e:
                logger.debug(f"  Error testing index {opencv_idx}: {e}")
            finally:
                if cap is not None:
                    cap.release()
        
        # If we couldn't find by characteristics, log warning but don't use wrong index
        logger.error(f"  ✗ Could not find OpenCV index for '{device_name}' with correct characteristics (needs 4K: {target_4k_support})")
        return None
    
    @staticmethod
    def list_available_cameras(max_test: int = 10, verify_indices: bool = True) -> List[Dict[str, any]]:
        """
        List available camera devices - ONLY FaceTime and Logitech BRIO.
        Uses reliable device ID matching to handle USB changes.
        
        Args:
            max_test: Maximum number of camera indices to test
            verify_indices: If True, verify and match OpenCV indices (default: True)
            
        Returns:
            List of dictionaries with 'index', 'name', 'id', and 'backend' keys
            ONLY includes FaceTime HD Camera and Logitech BRIO
        """
        # Get device names and IDs from Qt (doesn't open cameras)
        qt_devices = Camera._get_camera_names_qt()
        
        if not qt_devices:
            logger.warning("No Qt devices found")
            return []
        
        # FILTER: Only get FaceTime and Logitech BRIO
        target_devices = []
        for qt_dev in qt_devices:
            device_name = qt_dev['name']
            is_facetime = "FaceTime" in device_name and "Built-in" in device_name
            is_logitech_brio = "Logitech" in device_name and "BRIO" in device_name
            
            if is_facetime or is_logitech_brio:
                target_devices.append(qt_dev)
                logger.info(f"Found target device: '{device_name}'")
        
        if not target_devices:
            logger.warning("FaceTime HD Camera or Logitech BRIO not found")
            return []
        
        # Get valid OpenCV indices (this opens cameras briefly, but only once)
        opencv_indices = Camera._get_valid_opencv_indices(max_test, use_cache=True)
        
        if not opencv_indices:
            logger.warning("No valid OpenCV indices found")
            return []
        
        cameras = []
        logger.info(f"Mapping {len(target_devices)} target devices to {len(opencv_indices)} OpenCV indices:")
        
        # Match cameras together to avoid conflicts
        # First, identify which device is which
        facetime_device = None
        logitech_device = None
        for qt_dev in target_devices:
            device_name = qt_dev['name']
            if "FaceTime" in device_name and "Built-in" in device_name:
                facetime_device = qt_dev
            elif "Logitech" in device_name and "BRIO" in device_name:
                logitech_device = qt_dev
        
        # Match Logitech BRIO first (find 4K-capable camera)
        matched_indices = set()
        if logitech_device and verify_indices:
            logitech_idx = Camera._match_qt_device_to_opencv(logitech_device, opencv_indices, max_test, exclude_indices=matched_indices)
            if logitech_idx is not None:
                matched_indices.add(logitech_idx)
                device_name = logitech_device['name']
                raw_device_id = logitech_device.get('id')
                device_id_str = None
                if raw_device_id:
                    if isinstance(raw_device_id, bytes):
                        device_id_str = raw_device_id.decode('utf-8', errors='ignore')
                    else:
                        device_id_str = str(raw_device_id)
                
                # Get backend info
                backend = "Unknown"
                try:
                    if platform.system() == 'Darwin':
                        cap = cv2.VideoCapture(logitech_idx, cv2.CAP_AVFOUNDATION)
                    else:
                        cap = cv2.VideoCapture(logitech_idx)
                    if cap and cap.isOpened():
                        backend = cap.getBackendName()
                        cap.release()
                except Exception:
                    pass
                
                cameras.append({
                    'index': logitech_idx,
                    'name': device_name,
                    'id': device_id_str,
                    'backend': backend
                })
                logger.info(f"  '{device_name}' -> OpenCV Index {logitech_idx} (backend: {backend})")
        
        # Match FaceTime second (find non-4K camera, excluding Logitech's index)
        if facetime_device and verify_indices:
            facetime_idx = Camera._match_qt_device_to_opencv(facetime_device, opencv_indices, max_test, exclude_indices=matched_indices)
            if facetime_idx is not None:
                matched_indices.add(facetime_idx)
                device_name = facetime_device['name']
                raw_device_id = facetime_device.get('id')
                device_id_str = None
                if raw_device_id:
                    if isinstance(raw_device_id, bytes):
                        device_id_str = raw_device_id.decode('utf-8', errors='ignore')
                    else:
                        device_id_str = str(raw_device_id)
                
                # Get backend info
                backend = "Unknown"
                try:
                    if platform.system() == 'Darwin':
                        cap = cv2.VideoCapture(facetime_idx, cv2.CAP_AVFOUNDATION)
                    else:
                        cap = cv2.VideoCapture(facetime_idx)
                    if cap and cap.isOpened():
                        backend = cap.getBackendName()
                        cap.release()
                except Exception:
                    pass
                
                cameras.append({
                    'index': facetime_idx,
                    'name': device_name,
                    'id': device_id_str,
                    'backend': backend
                })
                logger.info(f"  '{device_name}' -> OpenCV Index {facetime_idx} (backend: {backend})")
        
        # Fallback: if verify_indices is False, use Qt indices
        if not verify_indices:
            for qt_dev in target_devices:
                device_name = qt_dev['name']
                raw_device_id = qt_dev.get('id')
                qt_idx = qt_dev['qt_index']
                
                # Normalize device ID to string for consistent comparison
                device_id_str = None
                if raw_device_id:
                    if isinstance(raw_device_id, bytes):
                        device_id_str = raw_device_id.decode('utf-8', errors='ignore')
                    else:
                        device_id_str = str(raw_device_id)
                
                # Use Qt index as fallback
                opencv_idx = qt_idx if qt_idx in opencv_indices else None
                
                if opencv_idx is None:
                    logger.warning(f"  Skipping '{device_name}': Could not find valid OpenCV index")
                    continue
            
        
        logger.info(f"Final camera list has {len(cameras)} devices")
        return cameras
    
    def __init__(self, camera_index: int = None, width: int = None, height: int = None, device_id: str = None, device_name: str = None):
        """
        Initialize camera capture.
        
        Args:
            camera_index: Camera device index (default from config)
            width: Video width (default from config)
            height: Video height (default from config)
            device_id: Device ID for persistent mapping (optional)
            device_name: Device name for logging (optional)
        """
        self.camera_index = camera_index if camera_index is not None else Config.CAMERA_INDEX
        self.width = width if width is not None else Config.VIDEO_WIDTH
        self.height = height if height is not None else Config.VIDEO_HEIGHT
        self.mirror = Config.MIRROR_HORIZONTAL
        self.device_id = device_id
        self.device_name = device_name
        
        self.cap: Optional[cv2.VideoCapture] = None
        self.is_open = False
        logger.info(f"Camera initialized with index {self.camera_index}, resolution {self.width}x{self.height}, device: {device_name}")
        
    def open(self) -> bool:
        """Open camera connection."""
        if self.cap is not None:
            self.close()
        
        logger.info(f"Opening camera at OpenCV index {self.camera_index}...")
        if platform.system() == 'Darwin':
            self.cap = cv2.VideoCapture(self.camera_index, cv2.CAP_AVFOUNDATION)
        else:
            self.cap = cv2.VideoCapture(self.camera_index)
        
        if not self.cap.isOpened():
            logger.error(f"Failed to open camera at OpenCV index {self.camera_index}")
            return False
        
        # Get backend info
        backend = self.cap.getBackendName()
        logger.info(f"Camera opened successfully at OpenCV index {self.camera_index} (backend: {backend})")
        
        # Set camera properties
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        self.cap.set(cv2.CAP_PROP_FPS, Config.VIDEO_FPS)
        
        # Get actual resolution (may differ from requested)
        actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        if actual_width != self.width or actual_height != self.height:
            logger.warning(f"Requested {self.width}x{self.height}, got {actual_width}x{actual_height}")
            self.width = actual_width
            self.height = actual_height
        else:
            logger.info(f"Camera resolution set to {actual_width}x{actual_height}")
        
        self.is_open = True
        return True
    
    def close(self):
        """Close camera connection."""
        if self.cap is not None:
            self.cap.release()
            self.cap = None
        self.is_open = False
    
    def read(self) -> Tuple[bool, Optional[np.ndarray]]:
        """
        Read a frame from the camera.
        
        Returns:
            Tuple of (success, frame). Frame is None on failure.
        """
        if not self.is_open or self.cap is None:
            return False, None
        
        ret, frame = self.cap.read()
        
        if not ret or frame is None:
            return False, None
        
        # Apply horizontal mirroring if enabled
        if self.mirror:
            frame = cv2.flip(frame, 1)
        
        return True, frame
    
    def get_resolution(self) -> Tuple[int, int]:
        """Get current video resolution."""
        return (self.width, self.height)
    
    def __enter__(self):
        """Context manager entry."""
        self.open()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()

