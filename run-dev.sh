#!/bin/bash
# Helper script to run the JavaScript app in dev mode
# Run this from the project root directory

cd "$(dirname "$0")/js" || exit 1
npm run dev

