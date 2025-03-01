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
import { listFiles, uploadFile, downloadFile, deleteItem, createFolder, copyItem, moveItem, getFileMetadata, searchFiles, getSharingLink, getAccountInfo, getFileContent } from './dropbox-api.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'dropbox-mcp-server' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
    stderrLevels: ['info', 'warn', 'error'] // Redirect all logs to stderr
  }));
}

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
  }

  private setupPromptHandlers() {
    // Prompt handlers
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
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.error('Available tools:', toolDefinitions.map(t => t.name));
      return {
        tools: toolDefinitions,
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      console.error('Full request:', JSON.stringify(request, null, 2));
      console.error('Method:', request.method);
      console.error('Params:', JSON.stringify(request.params, null, 2));
      // Verify authentication for all operations
      try {
        await getValidAccessToken();
      } catch (error) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'Authentication required. Please complete the OAuth setup:\n' +
          '1. Run: node build/generate-auth-url.js\n' +
          '2. Visit the URL and authorize the app\n' +
          '3. Run: node build/exchange-code.js'
        );
      }

      // Handle other tools
      let result;
      switch (request.params.name) {
        case 'list_files':
          result = await listFiles(String(request.params.arguments?.path || ''));
          break;
        case 'upload_file':
          result = await uploadFile(
            String(request.params.arguments?.path),
            String(request.params.arguments?.content)
          );
          break;
        case 'download_file':
          result = await downloadFile(String(request.params.arguments?.path));
          break;
        case 'delete_item':
          result = await deleteItem(String(request.params.arguments?.path));
          break;
        case 'create_folder':
          result = await createFolder(String(request.params.arguments?.path));
          break;
        case 'copy_item':
          result = await copyItem(
            String(request.params.arguments?.from_path),
            String(request.params.arguments?.to_path)
          );
          break;
        case 'move_item':
          result = await moveItem(
            String(request.params.arguments?.from_path),
            String(request.params.arguments?.to_path)
          );
          break;
        case 'get_file_metadata':
          result = await getFileMetadata(String(request.params.arguments?.path));
          break;
        case 'search_file_db':
          result = await searchFiles({
            query: String(request.params.arguments?.query),
            path: String(request.params.arguments?.path || ''),
            maxResults: Number(request.params.arguments?.max_results || 20),
            fileExtensions: request.params.arguments?.file_extensions,
            fileCategories: request.params.arguments?.file_categories,
            dateRange: request.params.arguments?.date_range,
            includeContentMatch: Boolean(request.params.arguments?.include_content_match),
            sortBy: request.params.arguments?.sort_by || 'relevance',
            order: request.params.arguments?.order || 'desc'
          });
          break;
        case 'get_sharing_link':
          result = await getSharingLink(String(request.params.arguments?.path));
          break;
        case 'get_account_info':
          result = await getAccountInfo();
          break;
        case 'get_file_content':
          result = await getFileContent(String(request.params.arguments?.path));
          break;
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
      return {
        content: result.content,
        _meta: {}
      };
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Dropbox MCP server running on stdio');
  }
}

export default DropboxServer;
