import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tokenPath = path.join(__dirname, '..', 'token');

// Access token can be provided via environment variable, token file, or update_access_token tool
let accessToken: string | null = process.env.DROPBOX_ACCESS_TOKEN || (fs.existsSync(tokenPath) ? fs.readFileSync(tokenPath, 'utf-8').trim() : null);

export { accessToken };

// Function to handle the update_access_token tool
async function handleUpdateAccessToken(request: any): Promise<any> {
  if (request.params.name === 'update_access_token') {
    if (typeof request.params.arguments?.token === 'string') {
      // Update both memory and file
      accessToken = request.params.arguments.token;
      fs.writeFileSync(tokenPath, request.params.arguments.token);
      return {
        tools: [],
        resources: [],
        content: [
          {
            type: 'text',
            text: 'Access token updated successfully.',
          },
        ],
      };
    } else {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid token parameter'
      );
    }
  }
  throw new McpError(
    ErrorCode.MethodNotFound,
    `Unknown tool: ${request.params.name}`
  );
}

export { handleUpdateAccessToken };
