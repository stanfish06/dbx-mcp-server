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

// Define a proper interface for MCP response
interface McpResponse {
  content: {
    type: string;
    text: string;
  }[];
  isError?: boolean;
}

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
        {
          name: 'create_folder',
          description: 'Create a new folder in Dropbox',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path where the folder should be created (e.g., "/New Folder")',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'copy_item',
          description: 'Copy a file or folder to a new location',
          inputSchema: {
            type: 'object',
            properties: {
              from_path: {
                type: 'string',
                description: 'Path of the source file or folder',
              },
              to_path: {
                type: 'string',
                description: 'Path for the destination file or folder',
              },
            },
            required: ['from_path', 'to_path'],
          },
        },
        {
          name: 'move_item',
          description: 'Move or rename a file or folder',
          inputSchema: {
            type: 'object',
            properties: {
              from_path: {
                type: 'string',
                description: 'Path of the source file or folder',
              },
              to_path: {
                type: 'string',
                description: 'New path for the file or folder',
              },
            },
            required: ['from_path', 'to_path'],
          },
        },
        {
          name: 'get_file_metadata',
          description: 'Get metadata for a file or folder',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the file or folder',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'search_files',
          description: 'Search for files and folders in Dropbox',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query string',
              },
              path: {
                type: 'string',
                description: 'Path to search within (defaults to root)',
                default: '',
              },
              max_results: {
                type: 'number',
                description: 'Maximum number of results to return (1-1000)',
                default: 20,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_sharing_link',
          description: 'Create a shared link for a file or folder',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the file or folder to share',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'get_account_info',
          description: 'Get information about the connected Dropbox account',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));

      this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<McpResponse> => {
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
        case 'create_folder':
          return this.createFolder(String(request.params.arguments?.path));
        case 'copy_item':
          return this.copyItem(
            String(request.params.arguments?.from_path),
            String(request.params.arguments?.to_path)
          );
        case 'move_item':
          return this.moveItem(
            String(request.params.arguments?.from_path),
            String(request.params.arguments?.to_path)
          );
        case 'get_file_metadata':
          return this.getFileMetadata(String(request.params.arguments?.path));
        case 'search_files':
          return this.searchFiles(
            String(request.params.arguments?.query),
            String(request.params.arguments?.path || ''),
            Number(request.params.arguments?.max_results || 20)
          );
        case 'get_sharing_link':
          return this.getSharingLink(String(request.params.arguments?.path));
        case 'get_account_info':
          return this.getAccountInfo();
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async listFiles(path: string): Promise<McpResponse> {
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
      console.error(`Dropbox API error: ${errorMessage}`);
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

  private async createFolder(path: string): Promise<{ content: any[] }> {
    try {
      const response = await axios.post(
        'https://api.dropboxapi.com/2/files/create_folder_v2',
        {
          path: path,
          autorename: false,
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
            text: `Created folder at ${path}`,
          },
        ],
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.error_summary || error.response?.data?.error?.message || error.message;
        return {
          content: [
            {
              type: 'text',
              text: `Dropbox API error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Dropbox API error: ${error.message}`
      );
    }
  }

  private async copyItem(
    fromPath: string,
    toPath: string
  ): Promise<{ content: any[] }> {
    try {
      const response = await axios.post(
        'https://api.dropboxapi.com/2/files/copy_v2',
        {
          from_path: fromPath,
          to_path: toPath,
          allow_shared_folder: true,
          autorename: false,
          allow_ownership_transfer: false,
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
            text: `Copied from ${fromPath} to ${toPath}`,
          },
        ],
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.error_summary || error.response?.data?.error?.message || error.message;
        return {
          content: [
            {
              type: 'text',
              text: `Dropbox API error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Dropbox API error: ${error.message}`
      );
    }
  }

  private async moveItem(
    fromPath: string,
    toPath: string
  ): Promise<{ content: any[] }> {
    try {
      const response = await axios.post(
        'https://api.dropboxapi.com/2/files/move_v2',
        {
          from_path: fromPath,
          to_path: toPath,
          allow_shared_folder: true,
          autorename: false,
          allow_ownership_transfer: false,
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
            text: `Moved from ${fromPath} to ${toPath}`,
          },
        ],
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.error_summary || error.response?.data?.error?.message || error.message;
        return {
          content: [
            {
              type: 'text',
              text: `Dropbox API error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Dropbox API error: ${error.message}`
      );
    }
  }

  private async getFileMetadata(path: string): Promise<{ content: any[] }> {
    try {
      const response = await axios.post(
        'https://api.dropboxapi.com/2/files/get_metadata',
        {
          path: path,
          include_media_info: true,
          include_deleted: false,
          include_has_explicit_shared_members: true,
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
            text: JSON.stringify(response.data, null, 2),
          },
        ],
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.error_summary || error.response?.data?.error?.message || error.message;
        return {
          content: [
            {
              type: 'text',
              text: `Dropbox API error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Dropbox API error: ${error.message}`
      );
    }
  }

  private async searchFiles(
    query: string,
    path: string = '',
    maxResults: number = 20
  ): Promise<{ content: any[] }> {
    try {
      const response = await axios.post(
        'https://api.dropboxapi.com/2/files/search_v2',
        {
          query: query,
          options: {
            path: path === '' ? '' : path,
            max_results: Math.min(Math.max(1, maxResults), 1000),
            file_status: 'active',
            filename_only: false,
          },
          match_field_options: {
            include_highlights: true,
          },
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
            text: JSON.stringify(response.data.matches, null, 2),
          },
        ],
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.error_summary || error.response?.data?.error?.message || error.message;
        return {
          content: [
            {
              type: 'text',
              text: `Dropbox API error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Dropbox API error: ${error.message}`
      );
    }
  }

  private async getSharingLink(path: string): Promise<{ content: any[] }> {
    try {
      const response = await axios.post(
        'https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings',
        {
          path: path,
          settings: {
            requested_visibility: 'public',
            audience: 'public',
            access: 'viewer',
          },
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
            text: JSON.stringify({
              url: response.data.url,
              path: response.data.path,
              visibility: response.data.link_permissions?.resolved_visibility?.["tag"] || 'unknown',
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      // Handle case where link already exists
      if (axios.isAxiosError(error) && 
          error.response?.data?.error?.["tag"] === 'shared_link_already_exists') {
        try {
          // Get existing links for the path
          const listResponse = await axios.post(
            'https://api.dropboxapi.com/2/sharing/list_shared_links',
            {
              path: path,
              direct_only: true,
            },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            }
          );
          
          if (listResponse.data.links && listResponse.data.links.length > 0) {
            const link = listResponse.data.links[0];
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    url: link.url,
                    path: link.path,
                    visibility: link.link_permissions?.resolved_visibility?.["tag"] || 'unknown',
                    note: 'Existing shared link retrieved',
                  }, null, 2),
                },
              ],
            };
          }
        } catch (listError) {
          console.error('Error retrieving existing links:', listError);
        }
      }
      
      // Handle other errors
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.error_summary || error.response?.data?.error?.message || error.message;
        console.error('Sharing link error details:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          headers: error.response?.headers,
        });
        
        // Check for specific error types
        if (error.response?.data?.error?.['.tag'] === 'insufficient_permissions') {
          return {
            content: [
              {
                type: 'text',
                text: `Dropbox API error: insufficient_permissions - The access token does not have the required scope 'sharing.write'`,
              },
            ],
            isError: true,
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `Dropbox API error: ${errorMessage}\nFull error: ${JSON.stringify(error.response?.data, null, 2)}`,
            },
          ],
          isError: true,
        };
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Dropbox API error: ${error.message}`
      );
    }
  }

  private async getAccountInfo(): Promise<{ content: any[] }> {
    try {
      const response = await axios.post(
        'https://api.dropboxapi.com/2/users/get_current_account',
        null,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Extract and format the relevant account information
      const accountInfo = {
        account_id: response.data.account_id,
        name: response.data.name,
        email: response.data.email,
        email_verified: response.data.email_verified,
        profile_photo_url: response.data.profile_photo_url,
        country: response.data.country,
        locale: response.data.locale,
        team: response.data.team ? {
          name: response.data.team.name,
          team_id: response.data.team.id,
        } : null,
        account_type: response.data.account_type?.['.tag'] || 'unknown',
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(accountInfo, null, 2),
          },
        ],
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.error_summary || error.response?.data?.error?.message || error.message;
        return {
          content: [
            {
              type: 'text',
              text: `Dropbox API error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
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
