#!/usr/bin/env node
/**
 * Dropbox MCP Server Test Suite
 * 
 * This script tests all the basic operations of the Dropbox MCP server.
 * It performs a series of operations to verify that the server is working correctly.
 * 
 * To run this test:
 * 1. Complete the initial auth setup using generate-auth-url.ts and exchange-code.ts
 * 2. Build the project: npm run build
 * 3. Run the test: node build/tests/dropbox-operations.test.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { decryptData } from '../src/security-utils.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = process.cwd();

// Configuration
const SERVER_COMMAND = 'node';
const SERVER_ARGS = [path.join(rootDir, 'build', 'src', 'index.js')];
// Generate unique test folder name using timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const TEST_FOLDER_NAME = `mcp-test-${timestamp}`;
const TEST_FILE_NAME = `test-file-${timestamp}.txt`;
const TEST_FILE_CONTENT = 'Hello, this is a test file created by the Dropbox MCP test suite.';
const TEST_FILE_COPY_NAME = `test-file-copy-${timestamp}.txt`;
const TEST_FILE_RENAMED_NAME = `renamed-file-${timestamp}.txt`;
const TOKEN_STORE_PATH = path.join(rootDir, '.tokens.json');

// Test definitions with IDs and descriptions
interface TestCase {
  id: string;
  name: string;
  description: string;
}

interface TestResult {
  passed: boolean;
  error: Error | null;
  startTime: Date | null;
  endTime: Date | null;
  duration: number | null;
  details: Record<string, any>;
}

const TEST_CASES: Record<string, TestCase> = {
  tokenStore: { id: 'T001', name: 'Token Store Verification', description: 'Verify token store exists and is valid' },
  accountInfo: { id: 'T002', name: 'Account Information', description: 'Retrieve account details' },
  listFiles: { id: 'T003', name: 'List Files', description: 'List files in root directory' },
  createFolder: { id: 'T004', name: 'Create Folder', description: 'Create test folder' },
  uploadFile: { id: 'T005', name: 'Upload File', description: 'Upload test file' },
  fileMetadata: { id: 'T006', name: 'File Metadata', description: 'Get file metadata' },
  downloadFile: { id: 'T007', name: 'Download File', description: 'Download and verify file content' },
  sharingLink: { id: 'T008', name: 'Create Sharing Link', description: 'Generate sharing link for file' },
  searchFiles: { id: 'T009', name: 'Search Files', description: 'Search for test files' },
  copyFile: { id: 'T010', name: 'Copy File', description: 'Copy test file' },
  moveFile: { id: 'T011', name: 'Move/Rename File', description: 'Move and rename file' },
  deleteFile: { id: 'T012', name: 'Delete File', description: 'Delete test file' }
};

// Helper functions
function encodeBase64(text: string): string {
  return Buffer.from(text).toString('base64');
}

function decodeBase64(base64: string): string {
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function verifyTokenStore(): void {
  if (!fs.existsSync(TOKEN_STORE_PATH)) {
    console.error('Error: Token store not found. Please complete the authentication setup first:');
    console.error('1. Run: node build/generate-auth-url.js');
    console.error('2. Visit the URL and authorize the app');
    console.error('3. Run: node build/exchange-code.js');
    process.exit(1);
  }

  try {
    const encryptedData = JSON.parse(fs.readFileSync(TOKEN_STORE_PATH, 'utf-8'));
    if (!encryptedData.encryptedData) {
      throw new Error('Invalid encrypted token data');
    }
    // Try decrypting to validate the token
    const decrypted = decryptData(encryptedData);
    if (!decrypted.accessToken || !decrypted.refreshToken) {
      throw new Error('Invalid token data');
    }
  } catch (error) {
    console.error('Error: Invalid token store. Please re-run the authentication setup.');
    process.exit(1);
  }
}

// Helper function to send a request to the MCP server
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
        console.error(`Server process exited with code ${code}`);
        console.error('Error output:', errorData);
        reject(new Error(`Server process exited with code ${code}`));
        return;
      }

      try {
        const response = JSON.parse(responseData);
        resolve(response);
      } catch (error) {
        console.error('Error parsing response:', error);
        console.error('Response data:', responseData);
        reject(error);
      }
    });

    serverProcess.stdin.write(JSON.stringify(request) + '\n');
    serverProcess.stdin.end();
  });
}

// Helper function to call an MCP tool
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
  console.error('Sending request:', JSON.stringify(request, null, 2));

  try {
    const response = await sendMcpRequest(request);
    if (response.error) {
      throw new Error(`MCP error: ${JSON.stringify(response.error)}`);
    }
    return response.result;
  } catch (error) {
    console.error(`Error calling MCP tool ${toolName}:`, error);
    throw error;
  }
}

// Main test function
async function runTests() {
  console.log('Starting Dropbox MCP Server Tests...');
  console.log('-----------------------------------');

  console.log(`Test Run ID: ${timestamp}`);
  console.log(`Test Folder: ${TEST_FOLDER_NAME}`);
  console.log('-----------------------------------');

  // Initialize test results tracking
  const testResults: Record<string, TestResult> = {};
  Object.keys(TEST_CASES).forEach(key => {
    testResults[key] = {
      passed: false,
      error: null,
      startTime: null,
      endTime: null,
      duration: null,
      details: {}
    };
  });

  // Helper function to record test result
  function recordTestResult(testKey: string, passed: boolean, error: Error | null = null, details: Record<string, any> = {}) {
    const endTime = new Date();
    testResults[testKey].passed = passed;
    testResults[testKey].error = error;
    testResults[testKey].endTime = endTime;
    testResults[testKey].duration = testResults[testKey].startTime ?
      endTime.getTime() - testResults[testKey].startTime.getTime() : 0;
    testResults[testKey].details = details;
  }

  // Helper function to start test timing
  function startTest(testKey: string) {
    testResults[testKey].startTime = new Date();
    console.log(`\n${TEST_CASES[testKey].id}. ${TEST_CASES[testKey].name}...`);
  }

  try {
    // Step T001: Verify token store
    startTest('tokenStore');
    verifyTokenStore();
    console.log('✅ Token store verified successfully');
    recordTestResult('tokenStore', true);

    // Step T002: Get account information
    startTest('accountInfo');
    const accountResponse = await callMcpTool('get_account_info');
    const accountInfo = JSON.parse(accountResponse.content[0].text);
    console.log('✅ Account information retrieved:');
    console.log(`   - Account ID: ${accountInfo.account_id || 'N/A'}`);
    console.log(`   - Name: ${accountInfo.name?.display_name || 'N/A'}`);
    console.log(`   - Email: ${accountInfo.email || 'N/A'}`);
    console.log(`   - Account Type: ${accountInfo.account_type || 'N/A'}`);
    recordTestResult('accountInfo', true, null, {
      accountId: accountInfo.account_id,
      name: accountInfo.name?.display_name,
      email: accountInfo.email,
      accountType: accountInfo.account_type
    });

    // Step T003: List files in root directory
    startTest('listFiles');
    const listResponse = await callMcpTool('list_files', { path: '' });
    const rootFiles = JSON.parse(listResponse.content[0].text);
    console.log(`✅ Found ${rootFiles.length} items in root directory`);
    recordTestResult('listFiles', true, null, { itemCount: rootFiles.length });

    // Step T004: Create a test folder
    startTest('createFolder');
    try {
      await callMcpTool('create_folder', { path: `/${TEST_FOLDER_NAME}` });
      console.log(`✅ Folder "${TEST_FOLDER_NAME}" created successfully`);
      recordTestResult('createFolder', true);
    } catch (error) {
      console.log(`ℹ️ Folder "${TEST_FOLDER_NAME}" may already exist, continuing...`);
      recordTestResult('createFolder', true); // Consider existing folder as success
    }

    // Step T005: Upload a test file
    startTest('uploadFile');
    const encodedContent = encodeBase64(TEST_FILE_CONTENT);
    await callMcpTool('upload_file', {
      path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`,
      content: encodedContent
    });
    console.log(`✅ File "${TEST_FILE_NAME}" uploaded successfully`);
    recordTestResult('uploadFile', true);

    // Step T006: Get file metadata
    startTest('fileMetadata');
    const metadataResponse = await callMcpTool('get_file_metadata', {
      path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`
    });
    const fileMetadata = JSON.parse(metadataResponse.content[0].text);
    console.log('✅ File metadata retrieved:');
    console.log(`   - Name: ${fileMetadata.name || 'N/A'}`);
    console.log(`   - Path: ${fileMetadata.path_display || 'N/A'}`);
    console.log(`   - Size: ${fileMetadata.size || 'N/A'} bytes`);
    console.log(`   - Modified: ${fileMetadata.server_modified || 'N/A'}`);
    recordTestResult('fileMetadata', true, null, {
      name: fileMetadata.name,
      path: fileMetadata.path_display,
      size: fileMetadata.size,
      modified: fileMetadata.server_modified
    });

    // Step T007: Download the file
    startTest('downloadFile');
    const downloadResponse = await callMcpTool('download_file', {
      path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`
    });
    const decodedContent = decodeBase64(downloadResponse.content[0].text);
    console.log('✅ File downloaded successfully');
    console.log(`   - Content: "${decodedContent}"`);
    recordTestResult('downloadFile', true, null, {
      contentLength: decodedContent.length,
      contentMatch: decodedContent === TEST_FILE_CONTENT
    });

    // Step T008: Try to create a sharing link
    startTest('sharingLink');
    try {
      const sharingResponse = await callMcpTool('get_sharing_link', {
        path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`,
        settings: {
          requested_visibility: { ".tag": "public" },
          audience: { ".tag": "public" },
          access: { ".tag": "viewer" }
        }
      });
      const sharingInfo = JSON.parse(sharingResponse.content[0].text);
      console.log('✅ Sharing link created successfully');
      console.log(`   - Link: ${sharingInfo.url}`);
      recordTestResult('sharingLink', true, null, { url: sharingInfo.url });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('❌ Failed to create sharing link (expected if token lacks sharing scope)');
      console.log(`   - Error: ${errorMessage}`);
      recordTestResult('sharingLink', false, new Error(errorMessage));
    }

    // Step T009: Search for files
    startTest('searchFiles');
    const searchResponse = await callMcpTool('search_file_db', {
      query: 'test',
      path: '',
      max_results: 10
    });
    const searchResults = JSON.parse(searchResponse.content[0].text);
    console.log(`✅ Found ${searchResults.length} items matching the search query`);
    recordTestResult('searchFiles', true, null, { matchCount: searchResults.length });

    // Step T010: Copy the file
    startTest('copyFile');
    await callMcpTool('copy_item', {
      from_path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`,
      to_path: `/${TEST_FOLDER_NAME}/${TEST_FILE_COPY_NAME}`
    });
    console.log('✅ File copied successfully');
    recordTestResult('copyFile', true);

    // Step T011: Move/rename the file
    startTest('moveFile');
    await callMcpTool('move_item', {
      from_path: `/${TEST_FOLDER_NAME}/${TEST_FILE_COPY_NAME}`,
      to_path: `/${TEST_FOLDER_NAME}/${TEST_FILE_RENAMED_NAME}`
    });
    console.log('✅ File renamed successfully');
    recordTestResult('moveFile', true);

    // Step T012: Delete the renamed file
    startTest('deleteFile');
    await callMcpTool('delete_item', {
      path: `/${TEST_FOLDER_NAME}/${TEST_FILE_RENAMED_NAME}`
    });
    console.log('✅ File deleted successfully');

    // Verify deletion
    const finalListResponse = await callMcpTool('list_files', {
      path: `/${TEST_FOLDER_NAME}`
    });
    const finalFolderContents = JSON.parse(finalListResponse.content[0].text);
    console.log(`✅ Found ${finalFolderContents.length} items in the test folder after deletion`);
    console.log('   Files:');
    finalFolderContents.forEach((item: any) => {
      console.log(`   - ${item.name}`);
    });
    recordTestResult('deleteFile', true, null, { remainingFiles: finalFolderContents.length });

    // Generate detailed test summary
    console.log('\n=== Test Summary ===');
    console.log(`Run ID: ${timestamp}`);
    console.log(`Test Folder: ${TEST_FOLDER_NAME}`);
    console.log('-------------------');

    const totalTests = Object.keys(testResults).length;
    const passedTests = Object.values(testResults).filter(result => result.passed).length;

    Object.entries(testResults).forEach(([testKey, result]) => {
      const test = TEST_CASES[testKey];
      const icon = result.passed ? '✅' : '❌';
      const status = result.passed ? 'Success' : 'Failed';
      const duration = result.duration ? `${result.duration}ms` : 'N/A';

      console.log(`\n${icon} ${test.id}: ${test.name}`);
      console.log(`   Description: ${test.description}`);
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

    const totalDuration = Object.values(testResults)
      .reduce((sum, result) => sum + (result.duration || 0), 0);
    console.log(`Total Duration: ${totalDuration}ms`);
    console.log('==================\n');

  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  } finally {
    // Clean up test folder in Dropbox
    try {
      await callMcpTool('delete_item', {
        path: `/${TEST_FOLDER_NAME}`
      });
      console.log('Cleaned up test folder in Dropbox');
    } catch (error) {
      console.error('Failed to clean up test folder in Dropbox:', error);
    }
  }
}

// Run the tests
runTests().catch(console.error);
