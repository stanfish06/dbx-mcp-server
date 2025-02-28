import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
  z
} from '@modelcontextprotocol/sdk/types.js';

// Define schema for prompts/list method
const PromptsListSchema = z.object({
  method: z.literal('prompts/list'),
  params: z.object({}).optional()
});
import { accessToken, handleUpdateAccessToken } from './auth.js';
import { handleListResources } from './resource-handler.js';
import { toolDefinitions } from './tool-definitions.js';
import { listFiles, uploadFile, downloadFile, deleteItem, createFolder, copyItem, moveItem, getFileMetadata, searchFiles, getSharingLink, getAccountInfo } from './dropbox-api.js';
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
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, handleListResources);

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: toolDefinitions,
    }));

      this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      try {
        logger.info(`CallToolRequest: ${request.params.name}`);
      } catch (error) {
        console.error("Error logging tool call:", error);
      }
      if (request.params.name === 'update_access_token') {
        return await handleUpdateAccessToken(request);
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
          return await listFiles(String(request.params.arguments?.path || ''));
        case 'upload_file':
          return await uploadFile(
            String(request.params.arguments?.path),
            String(request.params.arguments?.content)
          );
        case 'download_file':
          return await downloadFile(String(request.params.arguments?.path));
        case 'delete_item':
          return await deleteItem(String(request.params.arguments?.path));
        case 'create_folder':
          return await createFolder(String(request.params.arguments?.path));
        case 'copy_item':
          return await copyItem(
            String(request.params.arguments?.from_path),
            String(request.params.arguments?.to_path)
          );
        case 'move_item':
          return await moveItem(
            String(request.params.arguments?.from_path),
            String(request.params.arguments?.to_path)
          );
        case 'get_file_metadata':
          return await getFileMetadata(String(request.params.arguments?.path));
        case 'search_file_db':
          return await searchFiles(
            String(request.params.arguments?.query),
            String(request.params.arguments?.path || ''),
            Number(request.params.arguments?.max_results || 20)
          );
        case 'get_sharing_link':
          return await getSharingLink(String(request.params.arguments?.path));
        case 'get_account_info':
          return await getAccountInfo();
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Dropbox MCP server running on stdio');
  }
}

export default DropboxServer;
