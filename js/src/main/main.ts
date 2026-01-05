/**
 * Electron main process entry point.
 * Ported from src/main.py
 */

import { app, BrowserWindow, ipcMain, session, systemPreferences } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { BLEHandler } from './ble-handler';

let mainWindow: BrowserWindow | null = null;
let bleHandler: BLEHandler | null = null;

// Set up permission handlers globally (before any windows are created)
// This is critical for camera/microphone access in Electron
async function setupPermissions(): Promise<void> {
  // On macOS, explicitly request camera access using systemPreferences
  // This will trigger the macOS permission dialog
  if (process.platform === 'darwin') {
    try {
      const cameraStatus = systemPreferences.getMediaAccessStatus('camera');
      console.log(`[Main] Current camera permission status: ${cameraStatus}`);
      
      if (cameraStatus === 'not-determined') {
        console.log('[Main] Requesting camera permission from macOS...');
        const granted = await systemPreferences.askForMediaAccess('camera');
        console.log(`[Main] Camera permission ${granted ? 'GRANTED' : 'DENIED'}`);
      } else {
        console.log(`[Main] Camera permission already ${cameraStatus}`);
      }
    } catch (error) {
      console.error('[Main] Error requesting camera permission:', error);
    }
  }
  
  // Set up permission request handler
  // Electron uses "media" as the permission type for camera/microphone
  // This is called when the renderer requests permissions (e.g., getUserMedia)
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      console.log(`[Main] Permission requested: ${permission}`);
      
      // Automatically grant media permissions (camera/microphone)
      if (permission === 'media') {
        console.log(`[Main] ✓ Granting media permission (camera/microphone)`);
        callback(true);
      } else {
        // Deny other permissions
        console.log(`[Main] ✗ Denying ${permission} permission`);
        callback(false);
      }
    }
  );
  
  // Also handle permission check results (for logging)
  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin) => {
      console.log(`[Main] Permission check: ${permission} from ${requestingOrigin}`);
      
      // Allow media (camera/microphone)
      if (permission === 'media') {
        return true;
      }
      return false;
    }
  );
  
  console.log('[Main] Permission handlers configured');
}

function createWindow(): void {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true, // Enable web security (we'll handle CORS properly)
      // Enable camera and microphone permissions
      // Note: enableBlinkFeatures is deprecated, MediaDevices API works without it
    }
  });

  // Load the app
  // In development, always use the dev server
  // Check if we're in development by checking if renderer/index.html exists
  // __dirname is dist/main in production, so go up one level to dist/
  const rendererPath = path.join(__dirname, '..', 'renderer/index.html');
  const isDev = !fs.existsSync(rendererPath) || process.env.NODE_ENV === 'development';
  
  if (isDev) {
    // Wait a bit for webpack dev server to be ready, then load
    const loadDevServer = () => {
      console.log('Loading dev server at http://localhost:8080...');
      mainWindow?.loadURL('http://localhost:8080').then(() => {
        console.log('Successfully loaded dev server');
      }).catch((err) => {
        console.error('Failed to load dev server, retrying...', err);
        setTimeout(loadDevServer, 1000);
      });
    };
    
    // Log renderer errors
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('[Main] Failed to load page:', errorCode, errorDescription);
    });
    
    mainWindow.webContents.on('did-finish-load', () => {
      console.log('[Main] Page finished loading');
    });
    
    mainWindow.webContents.on('dom-ready', () => {
      console.log('[Main] DOM ready');
    });
    
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      // Log all renderer console messages
      // level: 0 = debug, 1 = info, 2 = warning, 3 = error
      const levelNames = ['debug', 'info', 'warn', 'error'];
      const levelName = levelNames[level] || 'unknown';
      const prefix = level === 3 ? '❌' : level === 2 ? '⚠️' : 'ℹ️';
      console.log(`[Renderer ${levelName}] ${prefix}`, message);
      if (sourceId && line) {
        console.log(`  → Source: ${sourceId}:${line}`);
      }
    });
    
    setTimeout(loadDevServer, 2000);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(rendererPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize BLE handler
function initBLE(): void {
  bleHandler = new BLEHandler();

  // Forward BLE events to renderer
  bleHandler.on('deviceDiscovered', (device) => {
    mainWindow?.webContents.send('ble:deviceDiscovered', device);
  });

  bleHandler.on('connected', (address, deviceName) => {
    // Forward both address and device name
    mainWindow?.webContents.send('ble:connected', address, deviceName);
  });

  bleHandler.on('disconnected', () => {
    mainWindow?.webContents.send('ble:disconnected');
  });

  bleHandler.on('heartRate', (heartRate: number) => {
    mainWindow?.webContents.send('ble:heartRate', heartRate);
  });

  bleHandler.on('error', (error: Error) => {
    mainWindow?.webContents.send('ble:error', error);
  });

  // IPC handlers
  ipcMain.handle('ble:startScanning', async () => {
    if (bleHandler) {
      // Start a 10-second scan instead of continuous
      await bleHandler.startScanning(10.0);
    }
  });

  ipcMain.handle('ble:stopScanning', () => {
    if (bleHandler) {
      bleHandler.stopScanning();
    }
  });

  ipcMain.handle('ble:connect', async (_event, address: string) => {
    if (bleHandler) {
      return await bleHandler.connect(address);
    }
    return false;
  });

  ipcMain.handle('ble:disconnect', async () => {
    if (bleHandler) {
      await bleHandler.disconnect();
    }
  });

  ipcMain.handle('ble:getConnected', () => {
    if (bleHandler) {
      return bleHandler.getConnected();
    }
    return false;
  });
}

// App event handlers
app.whenReady().then(async () => {
  // Set up permissions FIRST, before creating any windows
  // This will request macOS camera permission if needed
  await setupPermissions();
  
  createWindow();
  initBLE();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (bleHandler) {
    bleHandler.disconnect();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (bleHandler) {
    bleHandler.disconnect();
  }
});

