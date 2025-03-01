#!/bin/bash
# Run Dropbox MCP Server Tests with Authentication
# This script reads the token from the token file and sets it as an environment variable
# before running the tests, which helps avoid authentication issues.

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if .tokens.json exists
if [ ! -f ".tokens.json" ]; then
  echo "Error: .tokens.json file not found in the current directory."
  echo "Please complete the authentication setup first."
  exit 1
fi

# Extract the access token from .tokens.json
TOKEN=$(node -e "const fs=require('fs');const tokens=JSON.parse(fs.readFileSync('.tokens.json'));console.log(tokens.accessToken)")

if [ -z "$TOKEN" ]; then
  echo "Error: Could not extract access token from .tokens.json"
  exit 1
fi

# Generate a secure encryption key if not provided
if [ -z "$TOKEN_ENCRYPTION_KEY" ]; then
  TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)
fi

echo "Running Dropbox MCP Server tests with authentication..."
echo "-----------------------------------"

# Set all required environment variables and run the test
DROPBOX_APP_KEY=jphq193qm795io8 \
DROPBOX_APP_SECRET=ltdw34n0b4ob14u \
DROPBOX_REDIRECT_URI=http://localhost \
DROPBOX_ACCESS_TOKEN="$TOKEN" \
TOKEN_ENCRYPTION_KEY="$TOKEN_ENCRYPTION_KEY" \
CORS_ALLOWED_ORIGINS="http://localhost:3000" \
TOKEN_REFRESH_THRESHOLD_MINUTES=5 \
MAX_TOKEN_REFRESH_RETRIES=3 \
TOKEN_REFRESH_RETRY_DELAY_MS=1000 \
npm test

echo "-----------------------------------"
echo "Test execution completed."
