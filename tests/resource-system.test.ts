import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ResourceHandler } from '../src/resource/resource-handler.js';
import { ResourceResolver } from '../src/resource/resource-resolver.js';
import { ResourcePromptHandler } from '../src/prompt-handlers/resource-prompt-handler.js';
import { fileReviewPrompt, fileDetailPrompt, fileComparePrompt } from '../src/prompt-definitions/file-review-prompt.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

// Mock the Dropbox API functions
jest.mock('../src/dbx-api.js', () => ({
  downloadFile: jest.fn(),
  listFiles: jest.fn(),
  getFileMetadata: jest.fn()
}));

describe('Resource System', () => {
  let resourceHandler: ResourceHandler;
  let resourceResolver: ResourceResolver;
  let promptHandler: ResourcePromptHandler;

  beforeEach(() => {
    resourceHandler = new ResourceHandler();
    resourceResolver = new ResourceResolver();
    promptHandler = new ResourcePromptHandler();
    jest.clearAllMocks();
  });

  describe('ResourceResolver', () => {
    it('should resolve a single file resource', async () => {
      const mockContent = { content: [{ text: 'file content' }] };
      const mockMetadata = { content: [{ text: JSON.stringify({
        size: 100,
        client_modified: '2025-03-04T00:00:00Z'
      })}]};

      require('../src/dbx-api.js').downloadFile.mockResolvedValue(mockContent);
      require('../src/dbx-api.js').getFileMetadata.mockResolvedValue(mockMetadata);

      const result = await resourceResolver.resolveResource('dbx://test.txt');
      expect(result.content).toBe('file content');
      expect(result.mimeType).toBe('text/plain');
    });

    it('should handle binary files with base64 encoding', async () => {
      const mockContent = { content: [{ text: 'base64data', encoding: 'base64' }] };
      const mockMetadata = { content: [{ text: JSON.stringify({
        size: 100,
        client_modified: '2025-03-04T00:00:00Z'
      })}]};

      require('../src/dbx-api.js').downloadFile.mockResolvedValue(mockContent);
      require('../src/dbx-api.js').getFileMetadata.mockResolvedValue(mockMetadata);

      const result = await resourceResolver.resolveResource('dbx://image.png', { encoding: 'base64' });
      expect(result.encoding).toBe('base64');
      expect(result.mimeType).toBe('image/png');
    });

    it('should resolve a collection of resources', async () => {
      const mockFiles = { content: [{ text: JSON.stringify([
        { '.tag': 'file', name: 'test1.txt', path_display: '/test1.txt' },
        { '.tag': 'file', name: 'test2.txt', path_display: '/test2.txt' }
      ])}]};

      require('../src/dbx-api.js').listFiles.mockResolvedValue(mockFiles);
      const results = await resourceResolver.resolveCollection('dbx://folder');
      expect(results).toHaveLength(2);
    });

    it('should handle recursive folder resolution', async () => {
      const mockFiles = { content: [{ text: JSON.stringify([
        { '.tag': 'folder', name: 'subfolder', path_display: '/folder/subfolder' },
        { '.tag': 'file', name: 'test.txt', path_display: '/folder/test.txt' }
      ])}]};

      const mockSubfolderFiles = { content: [{ text: JSON.stringify([
        { '.tag': 'file', name: 'subtest.txt', path_display: '/folder/subfolder/subtest.txt' }
      ])}]};

      require('../src/dbx-api.js').listFiles
        .mockResolvedValueOnce(mockFiles)
        .mockResolvedValueOnce(mockSubfolderFiles);

      const results = await resourceResolver.resolveCollection('dbx://folder', { recursive: true });
      expect(results.some(r => r.uri.includes('subfolder'))).toBe(true);
    });
  });

  describe('ResourceHandler', () => {
    it('should list resources with proper type', async () => {
      const mockFiles = { content: [{ text: JSON.stringify([
        { '.tag': 'file', name: 'test.txt', path_display: '/test.txt' }
      ])}]};

      require('../src/dbx-api.js').listFiles.mockResolvedValue(mockFiles);
      const results = await resourceHandler.listResources('');
      expect(results[0].type).toBe('inline');
    });

    it('should handle binary resources', async () => {
      const mockContent = { content: [{ text: 'base64data', encoding: 'base64' }] };
      const mockMetadata = { content: [{ text: JSON.stringify({
        size: 100,
        client_modified: '2025-03-04T00:00:00Z'
      })}]};

      require('../src/dbx-api.js').downloadFile.mockResolvedValue(mockContent);
      require('../src/dbx-api.js').getFileMetadata.mockResolvedValue(mockMetadata);

      const result = await resourceHandler.readBinaryResource('dbx://image.png');
      expect(result.encoding).toBe('base64');
    });
  });

  describe('ResourcePromptHandler', () => {
    it('should process prompts with resource references', async () => {
      const mockContent = { content: [{ text: 'file content' }] };
      const mockMetadata = { content: [{ text: JSON.stringify({
        size: 100,
        client_modified: '2025-03-04T00:00:00Z'
      })}]};

      require('../src/dbx-api.js').downloadFile.mockResolvedValue(mockContent);
      require('../src/dbx-api.js').getFileMetadata.mockResolvedValue(mockMetadata);

      const result = await promptHandler.processPrompt(fileDetailPrompt, {
        path: '/test.txt',
        analysis: 'Test file analysis'
      });

      expect(result.resources?.attachments?.[0].content).toBeDefined();
    });

    it('should handle file comparison prompts', async () => {
      const mockContent1 = { content: [{ text: 'content1' }] };
      const mockContent2 = { content: [{ text: 'content2' }] };
      const mockMetadata = { content: [{ text: JSON.stringify({
        size: 100,
        client_modified: '2025-03-04T00:00:00Z'
      })}]};

      require('../src/dbx-api.js').downloadFile
        .mockResolvedValueOnce(mockContent1)
        .mockResolvedValueOnce(mockContent2);
      require('../src/dbx-api.js').getFileMetadata.mockResolvedValue(mockMetadata);

      const result = await promptHandler.processFileComparison('/file1.txt', '/file2.txt');
      expect(result.resources?.inline).toHaveLength(2);
    });

    it('should validate required arguments', async () => {
      await expect(promptHandler.processPrompt(fileDetailPrompt, {}))
        .rejects
        .toThrow('Missing required argument: path');
    });

    it('should handle folder review with file type filtering', async () => {
      const mockFiles = { content: [{ text: JSON.stringify([
        { '.tag': 'file', name: 'test.ts', path_display: '/test.ts' },
        { '.tag': 'file', name: 'test.js', path_display: '/test.js' },
        { '.tag': 'file', name: 'test.txt', path_display: '/test.txt' }
      ])}]};

      require('../src/dbx-api.js').listFiles.mockResolvedValue(mockFiles);

      const result = await promptHandler.processFolderReview('/folder', 'ts,js');
      expect(result.resources?.collections).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid URI format', async () => {
      await expect(resourceResolver.resolveResource('invalid://test.txt'))
        .rejects
        .toThrow('Invalid URI format');
    });

    it('should handle missing resources', async () => {
      require('../src/dbx-api.js').downloadFile.mockRejectedValue(new Error('path not found'));
      
      await expect(resourceResolver.resolveResource('dbx://missing.txt'))
        .rejects
        .toThrow('Failed to get file content');
    });

    it('should handle API errors gracefully', async () => {
      require('../src/dbx-api.js').listFiles.mockRejectedValue(new Error('API error'));

      await expect(resourceHandler.listResources(''))
        .rejects
        .toThrow('Failed to list resources');
    });
  });
});
