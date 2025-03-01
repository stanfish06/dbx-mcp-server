import { Dropbox } from 'dropbox';
import { McpToolResponse } from './interfaces.js';
import { getValidAccessToken } from './auth.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import os from 'os';

// Helper function to handle Dropbox API errors
function handleDropboxError(error: any): never {
  const errorMessage = error?.error?.error_summary || error?.message || 'Unknown error';
  
  // Handle specific error cases
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
  if (errorMessage.includes('path/not_found')) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Path not found in Dropbox`
    );
  }
  if (errorMessage.includes('path/malformed')) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid path format`
    );
  }
  
  throw new McpError(
    ErrorCode.InternalError,
    `Dropbox API error: ${errorMessage}`
  );
}

// Get a Dropbox client with a valid token
async function getDropboxClient(): Promise<Dropbox> {
  const token = await getValidAccessToken();
  return new Dropbox({ accessToken: token });
}

// Helper function to format paths for Dropbox API
function formatDropboxPath(path: string): string {
  if (!path || path === '/') return '';
  // Remove leading/trailing slashes and add a single leading slash
  return '/' + path.replace(/^\/+|\/+$/g, '');
}

async function listFiles(path: string): Promise<McpToolResponse> {
  try {
    const client = await getDropboxClient();
    const response = await client.filesListFolder({
      path: formatDropboxPath(path),
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
    const client = await getDropboxClient();
    const response = await client.filesUpload({
      path: formatDropboxPath(path),
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
    // Get metadata first to verify it's a file
    const client = await getDropboxClient();
    const metadata = await client.filesGetMetadata({
      path: formatDropboxPath(path)
    });
    
    if (metadata.result['.tag'] !== 'file') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Cannot download a folder'
      );
    }

    const response = await (await getDropboxClient()).filesDownload({ 
      path: formatDropboxPath(path)
    });

    const fileData = response.result as any;
    if (!fileData) {
      throw new Error('No file data received from Dropbox');
    }

    await ensureDownloadsDir();

    const fileName = fileData.name || path.split('/').pop() || 'downloaded_file';
    const filePath = join(DOWNLOADS_DIR, fileName);

    // Convert the binary data to base64 for text transmission
    const base64Content = fileData.fileBinary.toString('base64');

    return {
      content: [
        {
          type: 'text',
          text: base64Content,
          encoding: 'base64'
        },
      ],
    };
  } catch (error: any) {
    handleDropboxError(error);
  }
}

async function deleteItem(path: string): Promise<McpToolResponse> {
  try {
    await (await getDropboxClient()).filesDeleteV2({ 
      path: formatDropboxPath(path)
    });

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
    await (await getDropboxClient()).filesCreateFolderV2({
      path: formatDropboxPath(path),
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
    await (await getDropboxClient()).filesCopyV2({
      from_path: formatDropboxPath(fromPath),
      to_path: formatDropboxPath(toPath),
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
    await (await getDropboxClient()).filesMoveV2({
      from_path: formatDropboxPath(fromPath),
      to_path: formatDropboxPath(toPath),
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
    const response = await (await getDropboxClient()).filesGetMetadata({
      path: formatDropboxPath(path),
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
    // Special handling for metadata-specific errors
    const errorMessage = error?.error?.error_summary || error?.message || 'Unknown error';
    if (errorMessage.includes('path/not_found')) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Resource not found: ${path}`
      );
    }
    handleDropboxError(error);
  }
}

import { files } from 'dropbox/types';

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

interface FileMetadata extends files.FileMetadata {
  name: string;
  path_lower: string;
  server_modified: string;
  size: number;
  '.tag': 'file';
}

interface FolderMetadata extends files.FolderMetadata {
  name: string;
  path_lower: string;
  '.tag': 'folder';
}

type DropboxMetadata = FileMetadata | FolderMetadata;

interface SearchMatch {
  metadata: DropboxMetadata;
  match_type: { '.tag': string };
  highlight_spans: Array<{ highlight: string }>;
}

function getFileCategory(metadata: any): string {
  const extension = (metadata.name || '').split('.').pop()?.toLowerCase();
  const mimeType = metadata.media_info?.metadata?.mime_type;

  // Image files
  if (mimeType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension)) {
    return 'image';
  }
  // Document files
  if (['doc', 'docx', 'rtf', 'odt'].includes(extension)) {
    return 'document';
  }
  // PDF files
  if (extension === 'pdf' || mimeType === 'application/pdf') {
    return 'pdf';
  }
  // Spreadsheet files
  if (['xls', 'xlsx', 'csv', 'ods'].includes(extension)) {
    return 'spreadsheet';
  }
  // Presentation files
  if (['ppt', 'pptx', 'odp'].includes(extension)) {
    return 'presentation';
  }
  // Audio files
  if (mimeType?.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(extension)) {
    return 'audio';
  }
  // Video files
  if (mimeType?.startsWith('video/') || ['mp4', 'avi', 'mov', 'wmv'].includes(extension)) {
    return 'video';
  }
  // Folders
  if (metadata['.tag'] === 'folder') {
    return 'folder';
  }
  return 'other';
}

async function searchFiles({
  query,
  path = '',
  maxResults = 20,
  fileExtensions,
  fileCategories,
  dateRange,
  includeContentMatch = false,
  sortBy = 'relevance',
  order = 'desc'
}: SearchOptions): Promise<McpToolResponse> {
  try {
    const client = await getDropboxClient();
    const response = await client.filesSearchV2({
      query,
      options: {
        path: formatDropboxPath(path),
        max_results: Math.min(Math.max(1, maxResults), 1000),
        file_status: { '.tag': 'active' },
        filename_only: !includeContentMatch,
      },
      match_field_options: {
        include_highlights: true,
      },
    });

    let matches = response.result.matches.map(match => {
      // The search response has a nested metadata structure
      const metadata = (match.metadata as any).metadata as DropboxMetadata;
      return {
        metadata,
        match_type: match.match_type,
        highlights: match.highlight_spans,
      };
    });

    // Apply file extension filter
    if (fileExtensions && fileExtensions.length > 0) {
      matches = matches.filter(match => {
        const extension = match.metadata.name.split('.').pop()?.toLowerCase();
        return extension && fileExtensions.includes(extension);
      });
    }

    // Apply file category filter
    if (fileCategories && fileCategories.length > 0) {
      matches = matches.filter(match => {
        const category = getFileCategory(match.metadata);
        return fileCategories.includes(category);
      });
    }

    function isFileMetadata(metadata: DropboxMetadata): metadata is FileMetadata {
      return metadata['.tag'] === 'file';
    }

    // Apply date range filter
    if (dateRange) {
      const startDate = dateRange.start ? new Date(dateRange.start).getTime() : 0;
      const endDate = dateRange.end ? new Date(dateRange.end).getTime() : Infinity;

      matches = matches.filter(match => {
        if (!isFileMetadata(match.metadata)) return false;
        const modifiedTime = new Date(match.metadata.server_modified).getTime();
        return modifiedTime >= startDate && modifiedTime <= endDate;
      });
    }

    // Apply sorting
    if (sortBy !== 'relevance') {
      matches.sort((a, b) => {
        if (sortBy === 'last_modified_time') {
          if (!isFileMetadata(a.metadata) || !isFileMetadata(b.metadata)) return 0;
          const timeA = new Date(a.metadata.server_modified).getTime();
          const timeB = new Date(b.metadata.server_modified).getTime();
          return order === 'asc' ? timeA - timeB : timeB - timeA;
        } else if (sortBy === 'file_size') {
          const sizeA = isFileMetadata(a.metadata) ? a.metadata.size : 0;
          const sizeB = isFileMetadata(b.metadata) ? b.metadata.size : 0;
          return order === 'asc' ? sizeA - sizeB : sizeB - sizeA;
        }
        return 0;
      });
    } else if (order === 'asc') {
      // For relevance sorting, we only need to reverse if ascending order is requested
      matches.reverse();
    }

    // Format the results with categories
    const formattedMatches = matches.map(match => ({
      ...match,
      category: getFileCategory(match.metadata),
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            total_results: formattedMatches.length,
            search_criteria: {
              query,
              path,
              file_extensions: fileExtensions,
              file_categories: fileCategories,
              date_range: dateRange,
              include_content_match: includeContentMatch,
              sort_by: sortBy,
              order: order,
            },
            matches: formattedMatches,
          }, null, 2),
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
      const response = await (await getDropboxClient()).sharingCreateSharedLinkWithSettings({
        path: formatDropboxPath(path),
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
        const listResponse = await (await getDropboxClient()).sharingListSharedLinks({
          path: formatDropboxPath(path),
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
    const response = await (await getDropboxClient()).usersGetCurrentAccount();

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

async function getFileContent(path: string): Promise<McpToolResponse> {
  try {
    // Get metadata first to verify it's a file
    const metadata = await (await getDropboxClient()).filesGetMetadata({
      path: formatDropboxPath(path)
    });
    
    if (metadata.result['.tag'] !== 'file') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Cannot get content of a folder'
      );
    }

    const response = await (await getDropboxClient()).filesDownload({ 
      path: formatDropboxPath(path)
    });

    const fileData = response.result as any;
    if (!fileData) {
      throw new Error('No file data received from Dropbox');
    }

    // Convert the binary data to base64 for text transmission
    const base64Content = fileData.fileBinary.toString('base64');

    return {
      content: [
        {
          type: 'text',
          text: base64Content,
          encoding: 'base64'
        },
      ],
    };
  } catch (error: any) {
    handleDropboxError(error);
  }
}

export { 
  listFiles, 
  uploadFile, 
  downloadFile, 
  deleteItem, 
  createFolder, 
  copyItem, 
  moveItem, 
  getFileMetadata, 
  searchFiles, 
  getSharingLink, 
  getAccountInfo,
  getFileContent 
};
