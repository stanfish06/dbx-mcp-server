# Dropbox MCP Server

A Model Context Protocol (MCP) server that integrates with Dropbox, allowing MCP-compatible clients to interact with Dropbox through a set of powerful tools.

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Authentication](#authentication)
  - [Initial Setup](#initial-setup)
  - [Token Management](#token-management)
  - [Refreshing Tokens](#refreshing-tokens)
  - [Authentication Troubleshooting](#authentication-troubleshooting)
- [Available Tools](#available-tools)
- [Configuration](#configuration)
- [Usage Examples](#usage-examples)
- [Response Format](#response-format)
- [Testing](#testing)
- [Error Handling](#error-handling)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)

## Quick Start

1. Clone the repository
2. Run `npm install` to install dependencies
3. Run `npm run build` to build the project
4. Register a Dropbox app at [Dropbox App Console](https://www.dropbox.com/developers/apps)
5. Create a `.env` file based on `.env.example` with your Dropbox app credentials
6. Generate a random encryption key (see [Generating an Encryption Key](#generating-an-encryption-key))
7. Complete the authentication process:
   - Run `node build/generate-auth-url.js` to get an authorization URL
   - Visit the URL in your browser and authorize the app
   - Run `node build/exchange-code.js` and follow the prompts
8. Configure your MCP client to use the server

## Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-username/dropbox-mcp-server.git
   cd dropbox-mcp-server
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the project**

   ```bash
   npm run build
   ```

4. **Create a `.env` file**

   Copy the example file and fill in your details:

   ```bash
   cp .env.example .env
   ```

   Edit the `.env` file with your Dropbox app credentials and other settings.

5. **Add to MCP settings**

   Add the following to your MCP settings file:

   ```json
   {
     "mcpServers": {
       "dropbox": {
         "command": "node",
         "args": ["/path/to/dropbox-mcp-server/build/index.js"],
         "env": {
           "DROPBOX_APP_KEY": "your-app-key",
           "DROPBOX_APP_SECRET": "your-app-secret",
           "DROPBOX_REDIRECT_URI": "your-redirect-uri",
           "TOKEN_ENCRYPTION_KEY": "your-32-char-encryption-key",
           "CORS_ALLOWED_ORIGINS": "http://localhost:3000"
         }
       }
     }
   }
   ```

## Authentication

The server uses OAuth 2.0 with PKCE (Proof Key for Code Exchange) for secure authentication with Dropbox.

### Initial Setup

1. **Register a Dropbox App**

   - Go to the [Dropbox App Console](https://www.dropbox.com/developers/apps)
   - Click "Create app"
   - Choose "Scoped access" API
   - Choose the access type your app needs (Full Dropbox or App folder)
   - Name your app and click "Create app"
   - Under "Permissions", select the required permissions:
     - `files.metadata.read` - For listing files and metadata
     - `files.content.read` - For downloading files
     - `files.content.write` - For uploading, moving, and deleting files
     - `sharing.write` - For creating sharing links
     - `account_info.read` - For account information

2. **Configure your app**

   - Add your redirect URI (e.g., `http://localhost:3000/callback`) in the OAuth 2 settings
   - Note your App key and App secret

3. **Set environment variables**

   Create a `.env` file with the following:

   ```
   DROPBOX_APP_KEY=your_app_key
   DROPBOX_APP_SECRET=your_app_secret
   DROPBOX_REDIRECT_URI=your_redirect_uri
   TOKEN_ENCRYPTION_KEY=your_32_char_encryption_key
   CORS_ALLOWED_ORIGINS=http://localhost:3000
   ```

   See [Generating an Encryption Key](#generating-an-encryption-key) for creating a secure TOKEN_ENCRYPTION_KEY.

4. **Authentication Process**

   The authentication process involves two steps:

   **Step 1: Generate the authorization URL**

   ```bash
   node build/generate-auth-url.js
   ```

   This command will:

   - Generate a code verifier (save this for the next step)
   - Output an authorization URL
   - Display instructions

   **Step 2: Authorize and exchange the code**

   - Visit the authorization URL in your browser
   - Log in to Dropbox if needed
   - Click "Allow" to authorize the application
   - You'll be redirected to your redirect URI with an authorization code in the URL
   - Run the exchange code script:
     ```bash
     node build/exchange-code.js
     ```
   - When prompted, enter:
     - The authorization code from the redirect URL
     - The code verifier from Step 1
   - The script will exchange these for access and refresh tokens
   - Tokens will be securely stored in `.tokens.json`

### Generating an Encryption Key

The `TOKEN_ENCRYPTION_KEY` is used to encrypt your Dropbox tokens. Generate a secure random key with:

**On macOS/Linux:**

```bash
openssl rand -base64 32
```

**On Windows (PowerShell):**

```powershell
[Convert]::ToBase64String((New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes(32))
```

Copy the generated string to your `.env` file as the `TOKEN_ENCRYPTION_KEY` value.

### Token Management

Tokens are automatically managed by the server:

- **Storage**: Tokens are securely stored in `.tokens.json` using Base64 encoding
- **Validation**: Tokens are validated on server startup
- **Encryption**: Your tokens are encrypted using the `TOKEN_ENCRYPTION_KEY`
- **Expiration tracking**: The server tracks token expiration times

### Refreshing Tokens

The server handles token refreshing automatically:

1. **Automatic refresh**: Access tokens are refreshed when they expire or are about to expire
2. **Refresh threshold**: By default, tokens are refreshed 5 minutes before expiration
3. **Retry mechanism**: If refresh fails, the server will retry with exponential backoff
4. **Manual refresh**: You can manually update the access token using the `update_access_token` tool

To configure token refresh behavior, set these environment variables:

```
TOKEN_REFRESH_THRESHOLD_MINUTES=5
MAX_TOKEN_REFRESH_RETRIES=3
TOKEN_REFRESH_RETRY_DELAY_MS=1000
```

### Authentication Troubleshooting

If you encounter authentication issues:

1. **Invalid or expired tokens**:

   - Check if your tokens are valid and not expired
   - Regenerate tokens using the authentication flow if needed
   - Use the `update_access_token` tool to set a new token

2. **Permission issues**:

   - Verify your app has the necessary permission scopes
   - Check the Dropbox App Console to ensure permissions are correctly set

3. **Token file issues**:

   - If `.tokens.json` is corrupted, delete it and re-authenticate
   - Ensure the `TOKEN_ENCRYPTION_KEY` is consistent

4. **Refresh token errors**:

   - If refresh tokens fail, try re-authenticating from scratch
   - Check Dropbox API status for any outages

5. **Manual token creation**:
   If you need to manually create a token file:

   ```bash
   # Set your access token in the environment
   export DROPBOX_ACCESS_TOKEN=your_access_token

   # Run the token creation script
   node build/create-tokens.js
   ```

## Available Tools

The server provides the following tools for interacting with Dropbox:

### File Operations

#### list_files

Lists files and folders in a Dropbox directory.

- **Input**: `path` (string, optional): Path to the folder (defaults to root "")
- **Output**: JSON array of file and folder entries with metadata

#### upload_file

Upload a file to Dropbox.

- **Input**:
  - `path` (string, required): Path where the file should be uploaded
  - `content` (string, required): Base64-encoded file content
- **Output**: Confirmation message with the file path

#### download_file

Download a file from Dropbox.

- **Input**: `path` (string, required): Path to the file to download
- **Output**: Base64-encoded file content

#### safe_delete_item

Safely delete a file or folder with recycle bin support, confirmation, and audit logging.

- **Input**:
  - `path` (string, required): Path to the file or folder to delete
  - `userId` (string, required): User ID for tracking and rate limiting
  - `skipConfirmation` (boolean, optional): Skip deletion confirmation (default: false)
  - `retentionDays` (number, optional): Days to keep in recycle bin (default: from config)
  - `reason` (string, optional): Reason for deletion (for audit logs)
  - `permanent` (boolean, optional): Permanently delete instead of moving to recycle bin (default: false)
- **Output**: JSON object with operation details:
  - For confirmation requests: `{ status: 'confirmation_required', message, path, metadata }`
  - For soft deletes: `{ status: 'success', operation: 'soft_delete', versionId, originalPath, recyclePath, expiresAt }`
  - For permanent deletes: `{ status: 'success', operation: 'permanent_delete', path }`

#### delete_item (Legacy)

Legacy delete operation (deprecated, uses safe_delete_item internally).

- **Input**: `path` (string, required): Path to the file or folder to delete
- **Output**: Same as safe_delete_item

#### create_folder

Create a new folder in Dropbox.

- **Input**: `path` (string, required): Path where the folder should be created
- **Output**: Confirmation message with the created folder path

#### copy_item

Copy a file or folder to a new location.

- **Input**:
  - `from_path` (string, required): Path of the source file or folder
  - `to_path` (string, required): Path for the destination file or folder
- **Output**: Confirmation message with both paths

#### move_item

Move or rename a file or folder.

- **Input**:
  - `from_path` (string, required): Path of the source file or folder
  - `to_path` (string, required): New path for the file or folder
- **Output**: Confirmation message with both paths

### Metadata and Search

#### get_file_metadata

Get metadata for a file or folder.

- **Input**: `path` (string, required): Path to the file or folder
- **Output**: JSON object with file/folder metadata

#### search_file_db

Search for files and folders in Dropbox.

- **Input**:
  - `query` (string, required): Search query string
  - `path` (string, optional): Path to search within (defaults to root)
  - `max_results` (number, optional): Maximum number of results (1-1000, default: 20)
- **Output**: JSON array of matching files and folders with metadata

#### get_sharing_link

Create or retrieve a shared link for a file or folder.

- **Input**:
  - `path` (string, required): Path to the file or folder to share
  - `settings` (object, optional): Sharing settings
- **Output**: JSON object with the shared URL and sharing information

#### get_file_content

Get the content of a file directly from Dropbox.

- **Input**: `path` (string, required): Path to the file in Dropbox
- **Output**: Base64-encoded file content

### Account and Authentication

#### get_account_info

Get information about the connected Dropbox account.

- **Input**: None
- **Output**: JSON object with account information

#### update_access_token

Update the Dropbox access token at runtime.

- **Input**: `token` (string, required): New Dropbox access token
- **Output**: Confirmation message

## Configuration

### Environment Variables

Required environment variables:

- `DROPBOX_APP_KEY`: Your Dropbox app's key
- `DROPBOX_APP_SECRET`: Your Dropbox app's secret
- `DROPBOX_REDIRECT_URI`: OAuth redirect URI
- `TOKEN_ENCRYPTION_KEY`: 32+ character key for token encryption
- `CORS_ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins

Optional configuration variables:

- `TOKEN_REFRESH_THRESHOLD_MINUTES`: Minutes before expiration to refresh token (default: 5)
- `MAX_TOKEN_REFRESH_RETRIES`: Maximum number of refresh attempts (default: 3)
- `TOKEN_REFRESH_RETRY_DELAY_MS`: Delay between refresh attempts in ms (default: 1000)

Safe Delete configuration:

- `DROPBOX_RECYCLE_BIN_PATH`: Path where deleted files are moved (default: /.recycle_bin)
- `DROPBOX_MAX_DELETES_PER_DAY`: Maximum deletions per user per day (default: 100)
- `DROPBOX_RETENTION_DAYS`: Days to keep files in recycle bin (default: 30)
- `DROPBOX_ALLOWED_PATHS`: Comma-separated list of paths where deletion is allowed (default: /)
- `DROPBOX_BLOCKED_PATHS`: Comma-separated list of paths where deletion is blocked (default: /.recycle_bin,/.system)

## Usage Examples

```typescript
// Example: List files in root directory
await mcp.useTool("dropbox-mcp-server", "list_files", { path: "" });

// Example: Upload a file
await mcp.useTool("dropbox-mcp-server", "upload_file", {
  path: "/test.txt",
  content: Buffer.from("Hello World").toString("base64"),
});

// Example: Download and read a file
const result = await mcp.useTool("dropbox-mcp-server", "download_file", {
  path: "/test.txt",
});
const base64Content = result.content[0].text;
const fileContent = Buffer.from(base64Content, "base64").toString("utf8");

// Example: Create a folder
await mcp.useTool("dropbox-mcp-server", "create_folder", {
  path: "/New Folder",
});

// Example: Search for files
await mcp.useTool("dropbox-mcp-server", "search_file_db", {
  query: "report",
  path: "/Documents",
  max_results: 10,
});

// Example: Get account information
await mcp.useTool("dropbox-mcp-server", "get_account_info", {});

// Example: Safe delete with confirmation
const confirmResult = await mcp.useTool(
  "dropbox-mcp-server",
  "safe_delete_item",
  {
    path: "/Documents/old-report.txt",
    userId: "user123",
  }
);
// confirmResult will have status: 'confirmation_required'

// Example: Soft delete to recycle bin
const softDeleteResult = await mcp.useTool(
  "dropbox-mcp-server",
  "safe_delete_item",
  {
    path: "/Documents/old-report.txt",
    userId: "user123",
    skipConfirmation: true,
    reason: "Document is obsolete",
  }
);
// File will be moved to recycle bin with version history

// Example: Permanent deletion
const permanentDeleteResult = await mcp.useTool(
  "dropbox-mcp-server",
  "safe_delete_item",
  {
    path: "/Documents/sensitive-file.txt",
    userId: "user123",
    skipConfirmation: true,
    permanent: true,
    reason: "Contains sensitive information",
  }
);
// File will be permanently deleted

// Example: Legacy delete operation (deprecated)
await mcp.useTool("dropbox-mcp-server", "delete_item", {
  path: "/Documents/old-file.txt",
});
```

## Response Format

All tools return responses in the MCP format:

```json
{
  "content": [
    {
      "type": "text",
      "text": "...", // String content, may be JSON stringified for objects
      "encoding": "base64" // Optional, used for binary data
    }
  ],
  "_meta": {} // Optional metadata
}
```

## Testing

The server includes a comprehensive test suite that verifies all Dropbox operations.

### Running the Tests

1. Make sure you have a valid Dropbox access token in a file named `token` in the root directory
2. Run the test suite:

   ```bash
   ./run-tests.sh
   ```

   Or directly:

   ```bash
   npm test
   ```

The test will create a folder named "MCP Test Folder" in your Dropbox root and perform various operations within it.

### Test Coverage

The test suite covers all major operations:

- ✅ Token encryption and secure storage
- ✅ Authentication and access token management
- ✅ Account information retrieval
- ✅ File and folder listing
- ✅ Folder creation
- ✅ File upload and download
- ✅ File metadata retrieval
- ✅ File sharing link creation
- ✅ File searching with advanced filters
- ✅ File copying and moving
- ✅ File deletion
- ✅ Error handling and recovery

## Error Handling

The server provides detailed error messages for common issues:

- Authentication failures (401 errors)
- Invalid paths or parameters (400 errors)
- Missing or expired tokens
- API rate limits or quotas
- Network connectivity issues

## Troubleshooting

If you encounter issues:

1. **Authentication problems**:

   - Follow the [Authentication Troubleshooting](#authentication-troubleshooting) section
   - Check if your app has the necessary permission scopes

2. **Path formatting issues**:

   - Paths should be properly formatted (e.g., "/folder/file.txt")
   - Root directory is represented by an empty string ""

3. **File operation errors**:

   - Ensure you have the necessary permissions
   - Verify base64 encoding/decoding for file content
   - Check if files exist before attempting operations

4. **Rate limiting**:

   - If you hit rate limits, implement exponential backoff
   - Consider batching operations when possible

5. **Server logs**:
   - Check server logs for detailed error messages
   - Look for specific error codes in the response

## Development

Built with:

- TypeScript
- Model Context Protocol SDK
- Dropbox SDK v10.34.0
- Dropbox API v2

### Code Organization

The server is organized into several key modules:

- `auth.ts`: Handles authentication and token management
- `dropbox-api.ts`: Provides functions for interacting with the Dropbox API
- `dropbox-server.ts`: Sets up the MCP server and registers handlers
- `tool-definitions.ts`: Defines the available tools
- `resource-handler.ts`: Handles resource listing and reading
- `security-utils.ts`: Provides security utilities

### Future Roadmap

1. **Feature Enhancements**:

   - Batch operations for files
   - Recursive folder operations
   - File versioning support
   - Preview generation
   - Large file upload support

2. **Security Improvements**:
   - Token rotation
   - Rate limiting
   - Custom encryption keys
   - Audit logging
   - Access permissions

## License

MIT License

Copyright (c) 2025 MCP Server Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
