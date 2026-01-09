# Development Guide

## Running the JavaScript App

The JavaScript/Electron app is in the `js/` directory. You must run commands from there.

### Quick Start

**Option 1: Use the helper script (from project root)**
```bash
./run-dev.sh
```

**Option 2: Navigate to js directory**
```bash
cd js
npm run dev
```

### Monitoring Error Logs

**Option 1: Use the monitoring script (from project root)**
```bash
./monitor-errors.sh
```

**Option 2: Manual monitoring**
```bash
tail -f /tmp/electron-dev.log | grep -i error
```

**Option 3: Check recent errors**
```bash
tail -100 /tmp/electron-dev.log | grep -i -E "(error|failed|exception)"
```

## Common Issues

### "Could not read package.json"
- **Problem**: Running `npm run dev` from the wrong directory
- **Solution**: Make sure you're in the `js/` directory or use `./run-dev.sh` from project root

### Camera not showing
- Check Electron DevTools console (Cmd+Option+I)
- Look for camera permission errors
- Click "Request Permission & Refresh" button in the app

### Build errors
- Check TypeScript compilation: `cd js && npx tsc --noEmit`
- Check webpack build: Look for errors in `/tmp/electron-dev.log`

## Log Files

- **Build/Dev logs**: `/tmp/electron-dev.log`
- **Electron console**: Open DevTools in the Electron window
- **npm logs**: `~/.npm/_logs/`

## Directory Structure

```
adam-heart-tracking/
├── js/                    # JavaScript/Electron app (run npm commands here)
│   ├── package.json       # npm configuration
│   ├── src/               # Source code
│   └── dist/              # Build output
├── src/                   # Python code (original)
├── run-dev.sh             # Helper script to run dev mode
└── monitor-errors.sh      # Helper script to monitor errors
```


