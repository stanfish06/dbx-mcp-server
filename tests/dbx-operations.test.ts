import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { decryptData, encryptData } from '../src/security-utils.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get root directory
const rootDir = process.cwd();

// Configuration
const SERVER_COMMAND = 'node';
const SERVER_ARGS = [path.join(rootDir, 'build', 'src', 'index.js')];
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const TEST_FOLDER_NAME = `mcp-test-${timestamp}`;
const TEST_FILE_NAME = `test-file-${timestamp}.txt`;
const TEST_FILE_CONTENT = 'Hello, this is a test file created by the Dropbox MCP test suite.';
const TOKEN_STORE_PATH = path.join(rootDir, '.tokens.json');

// Helper functions
function encodeBase64(text: string): string {
  return Buffer.from(text).toString('base64');
}

function decodeBase64(base64: string): string {
  return Buffer.from(base64, 'base64').toString('utf-8');
}

async function sendMcpRequest(request: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const serverProcess = spawn(SERVER_COMMAND, SERVER_ARGS, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let responseData = '';
    let errorData = '';

    serverProcess.stdout.on('data', (data) => {
      responseData += data.toString();
    });

    serverProcess.stderr.on('data', (data) => {
      errorData += data.toString();
    });

    serverProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Server process exited with code ${code}: ${errorData}`));
        return;
      }

      try {
        const lines = responseData.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        const response = JSON.parse(lastLine);
        resolve(response);
      } catch (error) {
        reject(error);
      }
    });

    serverProcess.stdin.write(JSON.stringify(request) + '\n');
    serverProcess.stdin.end();
  });
}

async function callMcpTool(toolName: string, args: any = {}): Promise<any> {
  const request = {
    jsonrpc: '2.0',
    id: Date.now().toString(),
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args
    }
  };

  const response = await sendMcpRequest(request);
  if (response.error) {
    throw new Error(`MCP error: ${JSON.stringify(response.error)}`);
  }
  return response.result;
}

interface TestResult {
  passed: boolean;
  error: Error | null;
  startTime: Date | null;
  endTime: Date | null;
  duration: number | null;
  details: Record<string, any>;
}

describe('Dropbox MCP Server', () => {
  const testResults: Record<string, TestResult> = {};
  const startTime = new Date();

  beforeAll(() => {
    // Verify token store exists
    if (!fs.existsSync(TOKEN_STORE_PATH)) {
      throw new Error('Token store not found. Please complete the authentication setup first.');
    }

    // Verify token data
    const tokenData = JSON.parse(fs.readFileSync(TOKEN_STORE_PATH, 'utf-8'));
    const decrypted = decryptData(tokenData);
    if (!decrypted.accessToken || !decrypted.refreshToken) {
      throw new Error('Invalid token data');
    }
  });

  afterAll(async () => {
    // Generate test summary
    const endTime = new Date();
    const totalDuration = endTime.getTime() - startTime.getTime();
    const totalTests = Object.keys(testResults).length;
    const passedTests = Object.values(testResults).filter(r => r.passed).length;

    console.log('\n=== Test Summary ===');
    console.log(`Run ID: ${timestamp}`);
    console.log(`Test Folder: ${TEST_FOLDER_NAME}`);
    console.log('-------------------');

    Object.entries(testResults).forEach(([name, result]) => {
      const icon = result.passed ? '✅' : '❌';
      const status = result.passed ? 'Success' : 'Failed';
      const duration = result.duration ? `${result.duration}ms` : 'N/A';

      console.log(`\n${icon} ${name}`);
      console.log(`   Status: ${status}`);
      console.log(`   Duration: ${duration}`);

      if (result.error) {
        console.log(`   Error: ${result.error.message}`);
      }

      if (Object.keys(result.details).length > 0) {
        console.log('   Details:');
        Object.entries(result.details).forEach(([key, value]) => {
          console.log(`     ${key}: ${value}`);
        });
      }
    });

    console.log('\n=== Summary Statistics ===');
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${totalTests - passedTests}`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    console.log(`Total Duration: ${totalDuration}ms`);
    console.log('==================\n');

    // Clean up test folder
    try {
      await callMcpTool('delete_item', {
        path: `/${TEST_FOLDER_NAME}`
      });
      console.log('Cleaned up test folder in Dropbox');
    } catch (error) {
      console.error('Failed to clean up test folder:', error);
    }
  });

  beforeEach(() => {
    const testName = expect.getState().currentTestName;
    if (testName) {
      testResults[testName] = {
        passed: false,
        error: null,
        startTime: new Date(),
        endTime: null,
        duration: null,
        details: {}
      };
    }
  });

  afterEach(() => {
    const testName = expect.getState().currentTestName;
    if (testName && testResults[testName]) {
      testResults[testName].endTime = new Date();
      testResults[testName].duration = testResults[testName].endTime.getTime() - 
        (testResults[testName].startTime?.getTime() || 0);
      testResults[testName].passed = !expect.getState().currentTestName?.includes('failed');
    }
  });

  it('should get account information', async () => {
    const response = await callMcpTool('get_account_info');
    const accountInfo = JSON.parse(response.content[0].text);
    expect(accountInfo.account_id).toBeDefined();
    testResults[expect.getState().currentTestName!].details = {
      accountId: accountInfo.account_id,
      name: accountInfo.name?.display_name,
      email: accountInfo.email,
      accountType: accountInfo.account_type
    };
  });

  it('should create a folder', async () => {
    const response = await callMcpTool('create_folder', { path: `/${TEST_FOLDER_NAME}` });
    expect(response).toBeDefined();
    testResults[expect.getState().currentTestName!].details = {
      folderName: TEST_FOLDER_NAME,
      path: `/${TEST_FOLDER_NAME}`
    };
  });

  it('should upload a file', async () => {
    const encodedContent = encodeBase64(TEST_FILE_CONTENT);
    const response = await callMcpTool('upload_file', {
      path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`,
      content: encodedContent
    });
    expect(response).toBeDefined();
    testResults[expect.getState().currentTestName!].details = {
      fileName: TEST_FILE_NAME,
      path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`,
      contentSize: TEST_FILE_CONTENT.length
    };
  });

  it('should get file metadata', async () => {
    const response = await callMcpTool('get_file_metadata', {
      path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`
    });
    const metadata = JSON.parse(response.content[0].text);
    expect(metadata.name).toBe(TEST_FILE_NAME);
    testResults[expect.getState().currentTestName!].details = {
      name: metadata.name,
      path: metadata.path_display,
      size: metadata.size,
      modified: metadata.server_modified
    };
  });

  it('should download a file', async () => {
    const response = await callMcpTool('download_file', {
      path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`
    });
    const reference = JSON.parse(response.content[0].text);
    const content = decodeBase64(reference.content.content);
    expect(content).toBe(TEST_FILE_CONTENT);
    testResults[expect.getState().currentTestName!].details = {
      path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`,
      contentSize: content.length,
      contentMatch: content === TEST_FILE_CONTENT
    };
  });

  it('should list files', async () => {
    const response = await callMcpTool('list_files', { path: `/${TEST_FOLDER_NAME}` });
    const files = JSON.parse(response.content[0].text);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe(TEST_FILE_NAME);
    testResults[expect.getState().currentTestName!].details = {
      path: `/${TEST_FOLDER_NAME}`,
      fileCount: files.length,
      files: files.map((f: { name: string }) => f.name).join(', ')
    };
  });

  it('should search for files', async () => {
    const response = await callMcpTool('search_file_db', {
      query: TEST_FILE_NAME,
      path: '',
      max_results: 10
    });
    const results = JSON.parse(response.content[0].text);
    expect(results).toBeDefined();
    expect(results.matches || results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({
            name: TEST_FILE_NAME
          })
        })
      ])
    );
    testResults[expect.getState().currentTestName!].details = {
      query: TEST_FILE_NAME,
      totalResults: results.total_results,
      matchCount: results.matches?.length || 0
    };
  });

  it('should handle safe delete with confirmation', async () => {
    const response = await callMcpTool('safe_delete_item', {
      path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`,
      userId: 'test_user'
    });
    const result = JSON.parse(response.content[0].text);
    expect(result.status).toBe('confirmation_required');
    testResults[expect.getState().currentTestName!].details = {
      path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`,
      status: result.status,
      message: result.message
    };
  });

  it('should perform safe delete with skip confirmation', async () => {
    const response = await callMcpTool('safe_delete_item', {
      path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`,
      userId: 'test_user',
      skipConfirmation: true
    });
    const result = JSON.parse(response.content[0].text);
    expect(result.status).toBe('success');
    testResults[expect.getState().currentTestName!].details = {
      path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`,
      status: result.status,
      operation: result.operation
    };
  });
});
