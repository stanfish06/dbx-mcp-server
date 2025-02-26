#!/bin/bash
echo "Building Dropbox MCP Server..."
tsc --skipLibCheck
chmod 755 build/index.js
echo "Build completed."
