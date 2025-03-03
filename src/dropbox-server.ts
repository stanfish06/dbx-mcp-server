import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  McpError,
  ErrorCode
} from '@modelcontextprotocol/sdk/types.js';
import { getValidAccessToken } from './auth.js';
import { handleListPrompts, handleGetPrompt } from './prompt-handler.js';
import { handleListResources, handleReadResource } from './resource-handler.js';
import { toolDefinitions } from './tool-definitions.js';
import { config, log } from './config.js';
import * as dropboxApi from './dropbox-api.js';

// Define resource templates
const resourceTemplates = [
  {
    uriTemplate: 'dropbox://{path}',
    name: 'Dropbox Item',
    description: 'Access any file or folder in Dropbox by path',
    parameters: {
      path: {
        description: 'Path to the file or folder',
        required: true,
        type: 'string'
      }
    }
  },
  {
    uriTemplate: 'dropbox:///shared/{share_id}',
    name: 'Shared Dropbox Item',
    description: 'Access a shared Dropbox item by its share ID',
    parameters: {
      share_id: {
        description: 'Shared item identifier',
        required: true,
        type: 'string'
      }
    }
  }
];

interface SearchOptions {
  query: string;
  path?: string;
  maxResults?: number;
  fileExtensions?: string[];
  fileCategories?: string[];
  dateRange?: {
    start: string;
    end: string;
  };
  includeContentMatch?: boolean;
  sortBy?: 'relevance' | 'last_modified_time' | 'file_size';
  order?: 'asc' | 'desc';
}

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
          resources: {
            types: ["dropbox-file", "dropbox-folder"],
          },
          tools: {
            tools: toolDefinitions
          },
          prompts: {
            listChanged: true
          }
        },
      }
    );

    this.setupHandlers();
    this.setupPromptHandlers();

    // Error handling
    this.server.onerror = (error: Error & { code?: string }) => {
      log.error('Server error:', { 
        error: error.message, 
        code: error.code,
        stack: error.stack 
      });
    };
  }

  private setupPromptHandlers() {
    this.server.setRequestHandler(ListPromptsRequestSchema, handleListPrompts);
    this.server.setRequestHandler(GetPromptRequestSchema, handleGetPrompt);
  }

  private setupHandlers() {
    // Resource handlers
    this.server.setRequestHandler(ListResourcesRequestSchema, handleListResources);
    this.server.setRequestHandler(ReadResourceRequestSchema, handleReadResource);
    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
      resourceTemplates
    }));

    // Tool handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: toolDefinitions
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Verify authentication
      if (!config.dropbox.accessToken && !await getValidAccessToken()) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'No valid access token available. Please authenticate first.'
        );
      }

      // Log request (without sensitive data)
      log.info('Tool request:', { 
        tool: request.params.name,
        args: this.sanitizeArgs(request.params.arguments)
      });

      // Handle tool requests
      const result = await (async () => {
        switch (request.params.name) {
          case 'list_files':
            return await dropboxApi.listFiles(String(request.params.arguments?.path || ''));
          case 'upload_file':
            return await dropboxApi.uploadFile(
              String(request.params.arguments?.path),
              String(request.params.arguments?.content)
            );
          case 'download_file':
            return await dropboxApi.downloadFile(String(request.params.arguments?.path));
          case 'safe_delete_item':
            return await dropboxApi.safeDeleteItem({
              path: String(request.params.arguments?.path),
              userId: String(request.params.arguments?.userId),
              skipConfirmation: Boolean(request.params.arguments?.skipConfirmation),
              retentionDays: Number(request.params.arguments?.retentionDays || config.safety.retentionDays),
              reason: String(request.params.arguments?.reason || ''),
              permanent: Boolean(request.params.arguments?.permanent)
            });
          case 'delete_item':
            // Legacy delete operation - logs a warning and uses safe delete with default settings
            log.warn('Legacy delete operation used', { path: request.params.arguments?.path });
            return await dropboxApi.safeDeleteItem({
              path: String(request.params.arguments?.path),
              userId: 'legacy_user',
              skipConfirmation: true,
              permanent: true
            });
          case 'create_folder':
            return await dropboxApi.createFolder(String(request.params.arguments?.path));
          case 'copy_item':
            return await dropboxApi.copyItem(
              String(request.params.arguments?.from_path),
              String(request.params.arguments?.to_path)
            );
          case 'move_item':
            return await dropboxApi.moveItem(
              String(request.params.arguments?.from_path),
              String(request.params.arguments?.to_path)
            );
          case 'get_file_metadata':
            return await dropboxApi.getFileMetadata(String(request.params.arguments?.path));
          case 'search_file_db': {
            const searchOptions: SearchOptions = {
              query: String(request.params.arguments?.query),
              path: String(request.params.arguments?.path || ''),
              maxResults: Number(request.params.arguments?.max_results || 20),
              fileExtensions: request.params.arguments?.file_extensions as string[] | undefined,
              fileCategories: request.params.arguments?.file_categories as string[] | undefined,
              dateRange: request.params.arguments?.date_range as { start: string; end: string } | undefined,
              includeContentMatch: Boolean(request.params.arguments?.include_content_match),
              sortBy: (request.params.arguments?.sort_by as SearchOptions['sortBy']) || 'relevance',
              order: (request.params.arguments?.order as SearchOptions['order']) || 'desc'
            };
            return await dropboxApi.searchFiles(searchOptions);
          }
          case 'get_sharing_link':
            return await dropboxApi.getSharingLink(String(request.params.arguments?.path));
          case 'get_account_info':
            return await dropboxApi.getAccountInfo();
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      })();

      return {
        content: result.content,
        _meta: {}
      };
    });
  }

  private sanitizeArgs(args: any): any {
    if (!args) return args;
    const sanitized = { ...args };
    // Remove sensitive data from logs
    if (sanitized.content) sanitized.content = '[CONTENT]';
    return sanitized;
  }

  async run() {
    try {
      const transport = new StdioServerTransport();
      log.info('Connecting to transport...');
      await this.server.connect(transport);
      log.info('Dropbox MCP server running on stdio');
    } catch (error) {
      log.error('Error connecting server:', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }
}

export default DropboxServer;
