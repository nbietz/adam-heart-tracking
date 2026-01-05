#!/bin/bash
pkill -f "electron.*health-checkin" || true
sleep 2
echo "Electron processes stopped. Please restart with: npm run dev"
