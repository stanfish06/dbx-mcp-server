#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

/**
 * Dropbox MCP Server
 * 
 * This server provides MCP tools for interacting with Dropbox:
 * - list_files: List files and folders in a Dropbox directory
 * - upload_file: Upload a file to Dropbox
 * - download_file: Download a file from Dropbox
 * - delete_item: Delete a file or folder from Dropbox
 * - update_access_token: Update the access token at runtime
 */

// Access token can be provided via environment variable or update_access_token tool
let accessToken: string | null = process.env.DROPBOX_ACCESS_TOKEN || null;

// Tool to update the access token at runtime if needed
const updateTokenTool = {
  name: 'update_access_token',
  description: 'Update the Dropbox access token',
  inputSchema: {
    type: 'object',
    properties: {
      token: {
        type: 'string',
        description: 'New Dropbox access token',
      },
    },
    required: ['token'],
  },
};

class DropboxServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'dropbox-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_files',
          description: 'List files in a Dropbox folder',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the folder (default: root)',
                default: '',
              },
            },
          },
        },
        // Add the update access token tool
        updateTokenTool,
        {
          name: 'upload_file',
          description: 'Upload a file to Dropbox',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to upload the file to',
              },
              content: {
                type: 'string',
                description: 'File content (base64 encoded)',
              },
            },
            required: ['path', 'content'],
          },
        },
        {
          name: 'download_file',
          description: 'Download a file from Dropbox',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the file to download',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'delete_item',
          description: 'Delete a file or folder from Dropbox',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the file or folder to delete',
              },
            },
            required: ['path'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Handle the update_access_token tool
      if (request.params.name === 'update_access_token') {
        if (typeof request.params.arguments?.token === 'string') {
          accessToken = request.params.arguments.token;
          return {
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

      // Check if token exists for other operations
      if (!accessToken) {
        return {
          content: [
            {
              type: 'text',
              text:
                'Authentication required. Please use the update_access_token tool to set a valid Dropbox access token.',
            },
          ],
        };
      }

      // Handle other tools
      switch (request.params.name) {
        case 'list_files':
          return this.listFiles(String(request.params.arguments?.path || ''));
        case 'upload_file':
          return this.uploadFile(
            String(request.params.arguments?.path),
            String(request.params.arguments?.content)
          );
        case 'download_file':
          return this.downloadFile(String(request.params.arguments?.path));
        case 'delete_item':
          return this.deleteItem(String(request.params.arguments?.path));
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async listFiles(path: string): Promise<{ content: any[] }> {
    try {
      const response = await axios.post(
        'https://api.dropboxapi.com/2/files/list_folder',
        {
          path: path === "" ? "" : "/" + path.replace(/^\/+/, ""),
          recursive: false,
          include_media_info: false,
          include_deleted: false,
          include_has_explicit_shared_members: false,
          include_mounted_folders: true,
          include_non_downloadable_files: true
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
        }
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data.entries, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error('Full error:', error);
      console.error('Response data:', error.response?.data);
      
      if (axios.isAxiosError(error)) {
        // Handle authentication errors
        if (error.response?.status === 401) {
          accessToken = null; // Clear invalid token
          return {
            content: [
              {
                type: 'text',
                text: 'Authentication failed: The access token is invalid or expired. Please use the update_access_token tool to set a new valid token.',
              },
            ],
          };
        }
        
        // Handle other API errors with detailed message
        const errorMessage = error.response?.data?.error_summary || error.response?.data?.error?.message || error.message;
        return {
          content: [
            {
              type: 'text',
              text: `Dropbox API error (${error.response?.status}): ${errorMessage}\nFull response: ${JSON.stringify(error.response?.data, null, 2)}`,
            },
          ],
        };
      }
      
      // Handle non-Axios errors
      throw new McpError(
        ErrorCode.InternalError,
        `Unexpected error: ${error.message}`
      );
    }
  }

  private async uploadFile(
    path: string,
    content: string
  ): Promise<{ content: any[] }> {
    try {
      const response = await axios.post(
        'https://content.dropboxapi.com/2/files/upload',
        content,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/octet-stream',
            'Dropbox-API-Arg': JSON.stringify({
              path: path,
              mode: 'overwrite',
            }),
          },
        }
      );

      return {
        content: [
          {
            type: 'text',
            text: `File uploaded to ${path}`,
          },
        ],
      };
    } catch (error: any) {
      console.error(error);
      throw new McpError(
        ErrorCode.InternalError,
        `Dropbox API error: ${error.message}`
      );
    }
  }

  private async downloadFile(path: string): Promise<{ content: any[] }> {
    try {
      const formattedPath = path.startsWith('/') ? path : '/' + path;
      const response = await axios.post(
        'https://content.dropboxapi.com/2/files/download',
        null,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Dropbox-API-Arg': JSON.stringify({ path: formattedPath }),
            'Content-Type': ''  // Required for download
          },
          responseType: 'arraybuffer'
        }
      );

      // Convert the ArrayBuffer to a Base64 string
      const buffer = Buffer.from(response.data);
      const base64 = buffer.toString('base64');

      return {
        content: [
          {
            type: 'text',
            text: base64, // Return the Base64 string
          },
        ],
      };
    } catch (error: any) {
      console.error(error);
      throw new McpError(
        ErrorCode.InternalError,
        `Dropbox API error: ${error.message}`
      );
    }
  }

  private async deleteItem(path: string): Promise<{ content: any[] }> {
    try {
      const response = await axios.post(
        'https://api.dropboxapi.com/2/files/delete_v2',
        {
          path: path,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        content: [
          {
            type: 'text',
            text: `Deleted ${path}`,
          },
        ],
      };
    } catch (error: any) {
      console.error(error);
      throw new McpError(
        ErrorCode.InternalError,
        `Dropbox API error: ${error.message}`
      );
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Dropbox MCP server running on stdio');
  }
}

const server = new DropboxServer();
server.run().catch(console.error);
