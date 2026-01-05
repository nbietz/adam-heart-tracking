# Building for Different Mac Architectures

## Current Situation

- **Development Mac**: Intel (x86_64)
- **Test Mac**: Apple Silicon M2 (ARM64)
- **Current Build**: x86_64 (Intel only)

## Options

### Option 1: Build on Apple Silicon Mac (Recommended) ⭐

**Best for**: Optimal performance on Apple Silicon

**Steps**:
1. Transfer the project to your M2 Mac
2. Set up the environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
3. Run the packaging script:
   ```bash
   ./package.sh
   ```

**Result**: Native ARM64 build that runs optimally on Apple Silicon.

### Option 2: Use Rosetta 2 (Quick Test)

**Best for**: Quick testing without rebuilding

**How it works**: Apple Silicon Macs can run Intel apps via Rosetta 2 translation.

**Steps**:
1. Use the Intel build you just created
2. Transfer `dist/HealthCheckInMirror.app` to the M2 Mac
3. Run it - macOS will automatically use Rosetta 2

**Limitations**:
- Performance overhead (~10-20% slower)
- Some native libraries may have compatibility issues
- Not ideal for production use

**To test**: Just copy the app bundle to your M2 Mac and run it.

### Option 3: Universal Binary (Build Once, Run Everywhere)

**Best for**: Distributing to both Intel and Apple Silicon users

**Requirements**:
- Universal Python installation (python.org universal2 build)
- All dependencies must support universal builds

**Steps**:
1. Install universal Python from python.org
2. Create a new virtual environment with universal Python
3. Install dependencies
4. Build with universal spec:
   ```bash
   pyinstaller build_universal.spec
   ```

**Result**: Larger bundle (~2x size) that runs natively on both architectures.

## Recommendation

**For testing on your M2 Mac**: Use Option 1 (build on the M2 Mac) for best results.

**For quick testing**: Option 2 (Rosetta 2) will work but may have performance issues.

**For distribution**: Option 3 (universal binary) if you need to support both architectures.

## Checking Architecture

To check what architecture a build is:

```bash
file dist/HealthCheckInMirror.app/Contents/MacOS/HealthCheckInMirror
```

Output examples:
- `x86_64` = Intel only
- `arm64` = Apple Silicon only  
- `universal binary with 2 architectures` = Both

