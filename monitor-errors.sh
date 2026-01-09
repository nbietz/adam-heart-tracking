#!/bin/bash
# Monitor error logs for the JavaScript app
# Run this from the project root directory

LOG_FILE="/tmp/electron-dev.log"
JS_DIR="$(dirname "$0")/js"

echo "=== Monitoring Error Logs ==="
echo "Log file: $LOG_FILE"
echo "Project: $JS_DIR"
echo ""
echo "Watching for errors... (Press Ctrl+C to stop)"
echo ""

# Function to check for errors
check_errors() {
    if [ -f "$LOG_FILE" ]; then
        echo "=== $(date '+%Y-%m-%d %H:%M:%S') ==="
        tail -50 "$LOG_FILE" | grep -i -E "(error|Error|ERROR|failed|Failed|FAILED|exception|Exception|warning.*error)" | tail -10
        if [ $? -ne 0 ]; then
            echo "No errors found in recent logs"
        fi
        echo ""
    else
        echo "Log file not found: $LOG_FILE"
        echo "Make sure dev mode is running: cd js && npm run dev"
    fi
}

# Check immediately
check_errors

# Monitor continuously
if command -v fswatch &> /dev/null; then
    echo "Using fswatch for real-time monitoring..."
    fswatch -o "$LOG_FILE" | while read f; do
        check_errors
    done
else
    echo "Using polling (install fswatch for real-time: brew install fswatch)"
    while true; do
        sleep 5
        check_errors
    done
fi


