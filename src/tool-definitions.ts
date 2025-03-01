const toolDefinitions = [
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
      description: 'Download a file from Dropbox to local disk and return the file path. Files are saved to the "downloads" directory.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file to download from Dropbox',
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
      name: 'search_file_db',
      description: 'Advanced search for files and folders in Dropbox with filtering capabilities',
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
          file_extensions: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'Filter by file extensions (e.g., ["pdf", "doc", "txt"])',
          },
          file_categories: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['image', 'document', 'pdf', 'spreadsheet', 'presentation', 'audio', 'video', 'folder']
            },
            description: 'Filter by file categories',
          },
          date_range: {
            type: 'object',
            properties: {
              start: {
                type: 'string',
                description: 'Start date in ISO format (e.g., "2024-01-01")',
              },
              end: {
                type: 'string',
                description: 'End date in ISO format (e.g., "2024-12-31")',
              }
            }
          },
          include_content_match: {
            type: 'boolean',
            description: 'Search within file contents (may be slower)',
            default: false
          },
          sort_by: {
            type: 'string',
            enum: ['relevance', 'last_modified_time', 'file_size'],
            description: 'Sort results by specified criteria',
            default: 'relevance'
          },
          order: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort order (ascending or descending)',
            default: 'desc'
          }
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
    {
      name: 'get_file_content',
      description: 'Get the content of a file directly from Dropbox',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file in Dropbox',
          },
        },
        required: ['path'],
      },
    },
  ];

export { toolDefinitions };
