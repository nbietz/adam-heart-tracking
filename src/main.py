"""Application entry point."""

import sys
import os
import logging
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


class FilteredStderr:
    """Filtered stderr that suppresses CMIOMS and other system noise."""
    
    def __init__(self, original_stderr):
        self.original_stderr = original_stderr
        # Preserve all attributes from original stderr
        for attr in ['buffer', 'encoding', 'errors', 'line_buffering', 'mode', 'name', 'newlines']:
            if hasattr(original_stderr, attr):
                setattr(self, attr, getattr(original_stderr, attr))
    
    def write(self, text):
        # Filter out unwanted messages
        if not text or not text.strip():
            return
        
        # Skip CMIOMS messages (macOS Core Media I/O)
        if 'CMIOMS:' in text:
            return
        
        # Skip Qt multimedia debug messages
        if 'qt.multimedia' in text and 'Using Qt multimedia' in text:
            return
        
        # Skip MediaPipe/TensorFlow initialization noise
        if any(skip in text for skip in [
            'WARNING: All log messages before absl::InitializeLog()',
            'INFO: Created TensorFlow Lite',
            'W0000 00:00:',
            'I0000 00:00:',
        ]):
            return
        
        # Write to original stderr
        self.original_stderr.write(text)
        self.original_stderr.flush()
    
    def flush(self):
        self.original_stderr.flush()
    
    def __getattr__(self, name):
        # Forward any other attribute access to original stderr
        return getattr(self.original_stderr, name)


class FilteredStreamHandler(logging.StreamHandler):
    """Stream handler that filters out unwanted system messages."""
    
    def emit(self, record):
        # Filter out CMIOMS messages and other system noise
        message = record.getMessage()
        
        # Skip CMIOMS messages (macOS Core Media I/O)
        if 'CMIOMS:' in message:
            return
        
        # Skip Qt multimedia debug messages
        if 'qt.multimedia' in message and 'Using Qt multimedia' in message:
            return
        
        # Skip protobuf deprecation warnings (we can't fix these)
        if 'SymbolDatabase.GetPrototype() is deprecated' in message:
            return
        
        # Skip MediaPipe/TensorFlow initialization noise
        if any(skip in message for skip in [
            'WARNING: All log messages before absl::InitializeLog()',
            'INFO: Created TensorFlow Lite',
            'W0000 00:00:',
            'I0000 00:00:',
        ]):
            return
        
        super().emit(record)


# Replace stderr with filtered version to suppress CMIOMS messages
# Do this BEFORE any imports that might write to stderr
_original_stderr = sys.stderr
sys.stderr = FilteredStderr(_original_stderr)


# Configure logging with filtered handler
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[FilteredStreamHandler(sys.stdout)],
    force=True  # Override any existing configuration
)

# Force use of discrete GPU (AMD) on Mac if available
# This helps ensure we get the best OpenGL performance
os.environ['QT_MAC_WANTS_LAYERED_VULKAN_SURFACE'] = '0'

from PyQt6.QtWidgets import QApplication
from PyQt6.QtCore import Qt
from src.ui.main_window import MainWindow
from src.utils.config import Config


def main():
    """Main application entry point."""
    # Ensure directories exist
    Config.ensure_directories()
    
    # Create Qt application
    app = QApplication(sys.argv)
    app.setApplicationName("Health Check-in Mirror System")
    
    # Create and show main window
    window = MainWindow()
    window.show()
    
    # Run application
    sys.exit(app.exec())


if __name__ == "__main__":
    main()

