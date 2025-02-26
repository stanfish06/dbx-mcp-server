#!/bin/bash
# Run Dropbox MCP Server Tests with Authentication
# This script reads the token from the token file and sets it as an environment variable
# before running the tests, which helps avoid authentication issues.

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if token file exists
if [ ! -f "token" ]; then
  echo "Error: token file not found in the current directory."
  echo "Please create a file named 'token' containing your Dropbox access token."
  exit 1
fi

# Read the token from the file
TOKEN=$(cat token)

if [ -z "$TOKEN" ]; then
  echo "Error: token file is empty."
  echo "Please add your Dropbox access token to the token file."
  exit 1
fi

echo "Running Dropbox MCP Server tests with authentication..."
echo "-----------------------------------"

# Set the token as an environment variable and run the test
DROPBOX_ACCESS_TOKEN="$TOKEN" npm test

echo "-----------------------------------"
echo "Test execution completed."
