import { Dropbox } from 'dropbox';
import { McpToolResponse } from './interfaces.js';
import { accessToken } from './auth.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import os from 'os';

// Helper function to handle Dropbox API errors
function handleDropboxError(error: any): never {
  const errorMessage = error?.error?.error_summary || error?.message || 'Unknown error';
  if (error?.status === 401 || errorMessage.includes('invalid_access_token')) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Dropbox API error: Authentication failed - Invalid or expired access token`
    );
  }
  if (error?.status === 403 || errorMessage.includes('insufficient_permissions')) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Dropbox API error: insufficient_permissions - The access token does not have the required scope`
    );
  }
  throw new McpError(
    ErrorCode.InternalError,
    `Dropbox API error: ${errorMessage}`
  );
}

// Initialize Dropbox client
const dbx = new Dropbox({ accessToken: accessToken || undefined });

async function listFiles(path: string): Promise<McpToolResponse> {
  try {
    const response = await dbx.filesListFolder({
      path: path === "" ? "" : "/" + path.replace(/^\/+/, ""),
      recursive: false,
      include_media_info: false,
      include_deleted: false,
      include_has_explicit_shared_members: false,
      include_mounted_folders: true,
      include_non_downloadable_files: true
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response.result.entries, null, 2),
        },
      ],
    };
  } catch (error: any) {
    handleDropboxError(error);
  }
}

async function uploadFile(
  path: string,
  content: string
): Promise<McpToolResponse> {
  try {
    const buffer = Buffer.from(content, 'base64');
    const response = await dbx.filesUpload({
      path,
      contents: buffer,
      mode: { '.tag': 'overwrite' },
    });

    return {
      content: [
        {
          type: 'text',
          text: `File uploaded to ${path}`,
        },
      ],
    };
  } catch (error: any) {
    handleDropboxError(error);
  }
}

// Ensure downloads directory exists in system temp
const DOWNLOADS_DIR = join(os.tmpdir(), 'dropbox-mcp-downloads');
async function ensureDownloadsDir() {
  try {
    await mkdir(DOWNLOADS_DIR, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

async function downloadFile(path: string): Promise<McpToolResponse> {
  try {
    const formattedPath = path.startsWith('/') ? path : '/' + path;
    const response = await dbx.filesDownload({ path: formattedPath });

    // Based on Dropbox SDK example
    const fileData = response.result as any;
    if (!fileData) {
      throw new Error('No file data received from Dropbox');
    }

    // Ensure downloads directory exists
    await ensureDownloadsDir();

    // Get file name from path
    const fileName = fileData.name || path.split('/').pop() || 'downloaded_file';
    const filePath = join(DOWNLOADS_DIR, fileName);

    // Write file to disk
    await writeFile(filePath, fileData.fileBinary);

    return {
      content: [
        {
          type: 'text',
          text: filePath,
        },
      ],
    };
  } catch (error: any) {
    handleDropboxError(error);
  }
}

async function deleteItem(path: string): Promise<McpToolResponse> {
  try {
    await dbx.filesDeleteV2({ path });

    return {
      content: [
        {
          type: 'text',
          text: `Deleted ${path}`,
        },
      ],
    };
  } catch (error: any) {
    handleDropboxError(error);
  }
}

async function createFolder(path: string): Promise<McpToolResponse> {
  try {
    await dbx.filesCreateFolderV2({
      path,
      autorename: false,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Created folder at ${path}`,
        },
      ],
    };
  } catch (error: any) {
    handleDropboxError(error);
  }
}

async function copyItem(
  fromPath: string,
  toPath: string
): Promise<McpToolResponse> {
  try {
    await dbx.filesCopyV2({
      from_path: fromPath,
      to_path: toPath,
      allow_shared_folder: true,
      autorename: false,
      allow_ownership_transfer: false,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Copied from ${fromPath} to ${toPath}`,
        },
      ],
    };
  } catch (error: any) {
    handleDropboxError(error);
  }
}

async function moveItem(
  fromPath: string,
  toPath: string
): Promise<McpToolResponse> {
  try {
    await dbx.filesMoveV2({
      from_path: fromPath,
      to_path: toPath,
      allow_shared_folder: true,
      autorename: false,
      allow_ownership_transfer: false,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Moved from ${fromPath} to ${toPath}`,
        },
      ],
    };
  } catch (error: any) {
    handleDropboxError(error);
  }
}

async function getFileMetadata(path: string): Promise<McpToolResponse> {
  try {
    const response = await dbx.filesGetMetadata({
      path,
      include_media_info: true,
      include_deleted: false,
      include_has_explicit_shared_members: true,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response.result, null, 2),
        },
      ],
    };
  } catch (error: any) {
    handleDropboxError(error);
  }
}

async function searchFiles(
  query: string,
  path: string = '',
  maxResults: number = 20
): Promise<McpToolResponse> {
  try {
    const response = await dbx.filesSearchV2({
      query,
      options: {
        path: path === '' ? '' : path,
        max_results: Math.min(Math.max(1, maxResults), 1000),
        file_status: { '.tag': 'active' },
        filename_only: false,
      },
      match_field_options: {
        include_highlights: true,
      },
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response.result.matches, null, 2),
        },
      ],
    };
  } catch (error: any) {
    handleDropboxError(error);
  }
}

async function getSharingLink(path: string): Promise<McpToolResponse> {
  try {
    try {
      const response = await dbx.sharingCreateSharedLinkWithSettings({
        path,
        settings: {
          requested_visibility: { '.tag': 'public' },
          audience: { '.tag': 'public' },
          access: { '.tag': 'viewer' },
        },
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              url: response.result.url,
              path: response.result.path_lower,
              visibility: response.result.link_permissions?.resolved_visibility?.['.tag'] || 'unknown',
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      // Handle case where link already exists
      if (error?.error?.error_summary?.includes('shared_link_already_exists')) {
        const listResponse = await dbx.sharingListSharedLinks({
          path,
          direct_only: true,
        });

        if (listResponse.result.links && listResponse.result.links.length > 0) {
          const link = listResponse.result.links[0];
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  url: link.url,
                  path: link.path_lower,
                  visibility: link.link_permissions?.resolved_visibility?.['.tag'] || 'unknown',
                  note: 'Existing shared link retrieved',
                }, null, 2),
              },
            ],
          };
        }
      }
      throw error;
    }
  } catch (error: any) {
    handleDropboxError(error);
  }
}

async function getAccountInfo(): Promise<McpToolResponse> {
  try {
    const response = await dbx.usersGetCurrentAccount();

    const accountInfo = {
      account_id: response.result.account_id,
      name: response.result.name,
      email: response.result.email,
      email_verified: response.result.email_verified,
      profile_photo_url: response.result.profile_photo_url,
      country: response.result.country,
      locale: response.result.locale,
      team: response.result.team ? {
        name: response.result.team.name,
        team_id: response.result.team.id,
      } : null,
      account_type: response.result.account_type['.tag'] || 'unknown',
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
    handleDropboxError(error);
  }
}

 export { listFiles, uploadFile, downloadFile, deleteItem, createFolder, copyItem, moveItem, getFileMetadata, searchFiles, getSharingLink, getAccountInfo };
