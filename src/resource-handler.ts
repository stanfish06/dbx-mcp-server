import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { listFiles } from './dropbox-api.js';

async function handleListResources(request: any): Promise<any> {
  try {
    const args = request.params?.arguments as { path?: string } | undefined;
    const path = args?.path || ''; // Safely access path

    const dropboxFiles = await listFiles(String(path)); // Reuse listFiles to get Dropbox data

    const resources = (JSON.parse(dropboxFiles.content[0].text) as any[]).map(
      (item: any) => {
        return {
          id: item.id, // Or generate a unique ID if Dropbox ID isn't suitable
          name: item.name,
          type: item['.tag'] === 'file' ? 'dropbox-file' : 'dropbox-folder',
          // Add other relevant properties from Dropbox metadata as needed
          path_display: item.path_display,
          modified: item.client_modified,
        };
      }
    );

    return {
      resources: resources,
    };
  } catch (error: any) {
    console.error("Error listing resources:", error);
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to list resources: ${error.message}`
    );
  }
}

export { handleListResources };
