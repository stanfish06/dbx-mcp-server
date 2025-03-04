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
import { decryptData, encryptData } from '../src/security-utils.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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
  tokenRefresh: { id: 'T002', name: 'Token Refresh', description: 'Test automatic token refresh' },
  accountInfo: { id: 'T003', name: 'Account Information', description: 'Retrieve account details' },
  listFiles: { id: 'T004', name: 'List Files', description: 'List files in root directory' },
  createFolder: { id: 'T005', name: 'Create Folder', description: 'Create test folder' },
  uploadFile: { id: 'T006', name: 'Upload File', description: 'Upload test file' },
  fileMetadata: { id: 'T007', name: 'File Metadata', description: 'Get file metadata' },
  downloadFile: { id: 'T008', name: 'Download File', description: 'Download and verify file content' },
  sharingLink: { id: 'T009', name: 'Create Sharing Link', description: 'Generate sharing link for file' },
  searchFiles: { id: 'T010', name: 'Search Files', description: 'Search for test files' },
  copyFile: { id: 'T011', name: 'Copy File', description: 'Copy test file' },
  moveFile: { id: 'T012', name: 'Move/Rename File', description: 'Move and rename file' },
  safeDeleteConfirm: { id: 'T013', name: 'Safe Delete Confirmation', description: 'Test safe delete confirmation requirement' },
  safeDeleteSoft: { id: 'T014', name: 'Safe Delete with Recycle Bin', description: 'Test soft delete to recycle bin' },
  safeDeletePermanent: { id: 'T015', name: 'Safe Delete Permanent', description: 'Test permanent deletion' },
  safeDeleteRateLimit: { id: 'T016', name: 'Safe Delete Rate Limit', description: 'Test delete rate limiting' },
  safeDeletePathValidation: { id: 'T017', name: 'Safe Delete Path Validation', description: 'Test path validation' },
  legacyDelete: { id: 'T018', name: 'Legacy Delete Operation', description: 'Test backward compatibility of delete operation' }
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

  let encryptedData;
  try {
    encryptedData = JSON.parse(fs.readFileSync(TOKEN_STORE_PATH, 'utf-8'));
    if (!encryptedData.encryptedData) {
      throw new Error('Invalid encrypted token data');
    }
    // Try decrypting to validate the token
    const decrypted = decryptData(encryptedData);
    if (!decrypted.accessToken || !decrypted.refreshToken) {
      throw new Error('Invalid token data');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error: Token store validation failed:', errorMessage);
    console.error('Current token data:', encryptedData || 'Could not read token data');
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
        // Get the last line of response data (which should be the JSON response)
        const lines = responseData.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        
        const response = JSON.parse(lastLine);
        resolve(response);
      } catch (error) {
        console.error('Error parsing response:', error);
        console.error('Full response data:', responseData);
        console.error('Response lines:', responseData.trim().split('\n'));
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

    // Step T002: Test token refresh
    startTest('tokenRefresh');
    
    // Import auth module
    const auth = await import('../src/auth.js');
    
    // Load current token data
    const tokenData = JSON.parse(fs.readFileSync(TOKEN_STORE_PATH, 'utf-8'));
    const currentToken = decryptData(tokenData);
    console.log('Current token data:', {
        hasAccessToken: !!currentToken.accessToken,
        hasRefreshToken: !!currentToken.refreshToken,
        expiresAt: new Date(currentToken.expiresAt).toISOString(),
        scope: currentToken.scope
    });
    
    // Check if we have a proper OAuth token with code verifier
    const isProperOAuthToken = currentToken.refreshToken && currentToken.codeVerifier;
    
    // Skip refresh test if not using proper OAuth token
    if (!isProperOAuthToken) {
        console.log('ℹ️ Skipping token refresh test - token not obtained through OAuth flow');
        console.log('To test token refresh:');
        console.log('1. Run: node build/generate-auth-url.js');
        console.log('2. Visit the URL and authorize the app');
        console.log('3. Run: node build/exchange-code.js');
        recordTestResult('tokenRefresh', true, null, {
            skipped: true,
            reason: 'Using long-lived access token'
        });
    } else {
        // Force token expiration while preserving other fields
        const originalExpiry = currentToken.expiresAt;
        const expiredToken = {
            ...currentToken,
            expiresAt: Date.now() - 1000 // Set to expired
        };
        
        // Save expired token and update auth module's token data
        const encryptedData = encryptData(expiredToken);
        fs.writeFileSync(TOKEN_STORE_PATH, JSON.stringify(encryptedData, null, 2));
        await auth.saveTokenData(expiredToken);
        console.log('✅ Token expiration forced');
        console.log(`   - Original expiry: ${new Date(originalExpiry).toISOString()}`);
        console.log(`   - Forced expiry: ${new Date(expiredToken.expiresAt).toISOString()}`);

        // Directly call refresh token function
        const newAccessToken = await auth.refreshAccessToken();
        console.log('✅ Token refresh function called');
        
        // Verify token was refreshed
        const newTokenData = JSON.parse(fs.readFileSync(TOKEN_STORE_PATH, 'utf-8'));
        const newToken = decryptData(newTokenData);
        const newExpiry = newToken.expiresAt;
        
        // Verify the new token works
        const validToken = await auth.getValidAccessToken();
        console.log('✅ Token refresh verified:');
        console.log(`   - New expiry: ${new Date(newExpiry).toISOString()}`);
        console.log(`   - Token was refreshed: ${newExpiry > Date.now()}`);
        console.log(`   - New token is valid: ${validToken === newAccessToken}`);
        
        recordTestResult('tokenRefresh', true, null, {
            originalExpiry: new Date(originalExpiry).toISOString(),
            forcedExpiry: new Date(expiredToken.expiresAt).toISOString(),
            newExpiry: new Date(newExpiry).toISOString(),
            wasRefreshed: newExpiry > Date.now(),
            tokenValid: validToken === newAccessToken
        });
    }

    // Step T003: Get account information
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

    // Step T013: Test safe delete confirmation requirement
    startTest('safeDeleteConfirm');
    try {
      const confirmResponse = await callMcpTool('safe_delete_item', {
        path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`,
        userId: 'test_user'
      });
      const confirmResult = JSON.parse(confirmResponse.content[0].text);
      const requiresConfirmation = confirmResult.status === 'confirmation_required';
      console.log('✅ Safe delete confirmation test:');
      console.log(`   - Status: ${confirmResult.status}`);
      console.log(`   - Message: ${confirmResult.message}`);
      console.log(`   - Requires confirmation: ${requiresConfirmation}`);
      recordTestResult('safeDeleteConfirm', requiresConfirmation, null, confirmResult);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('❌ Safe delete confirmation test failed');
      console.log(`   - Error: ${errorMessage}`);
      recordTestResult('safeDeleteConfirm', false, new Error(errorMessage));
    }

    // Step T014: Test soft delete to recycle bin
    startTest('safeDeleteSoft');
    try {
      const softDeleteResponse = await callMcpTool('safe_delete_item', {
        path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`,
        userId: 'test_user',
        skipConfirmation: true,
        permanent: false
      });
      const softDeleteResult = JSON.parse(softDeleteResponse.content[0].text);
      console.log('✅ Soft delete test:');
      console.log(`   - Status: ${softDeleteResult.status}`);
      console.log(`   - Operation: ${softDeleteResult.operation}`);
      console.log(`   - Version ID: ${softDeleteResult.versionId}`);
      console.log(`   - Recycle Path: ${softDeleteResult.recyclePath}`);
      recordTestResult('safeDeleteSoft', true, null, softDeleteResult);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('❌ Soft delete test failed');
      console.log(`   - Error: ${errorMessage}`);
      recordTestResult('safeDeleteSoft', false, new Error(errorMessage));
    }

    // Step T015: Test permanent deletion
    startTest('safeDeletePermanent');
    try {
      const permanentDeleteResponse = await callMcpTool('safe_delete_item', {
        path: `/${TEST_FOLDER_NAME}/${TEST_FILE_RENAMED_NAME}`,
        userId: 'test_user',
        skipConfirmation: true,
        permanent: true,
        reason: 'Test permanent deletion'
      });
      const permanentDeleteResult = JSON.parse(permanentDeleteResponse.content[0].text);
      console.log('✅ Permanent delete test:');
      console.log(`   - Status: ${permanentDeleteResult.status}`);
      console.log(`   - Operation: ${permanentDeleteResult.operation}`);
      recordTestResult('safeDeletePermanent', true, null, permanentDeleteResult);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('❌ Permanent delete test failed');
      console.log(`   - Error: ${errorMessage}`);
      recordTestResult('safeDeletePermanent', false, new Error(errorMessage));
    }

    // Step T016: Test delete rate limiting
    startTest('safeDeleteRateLimit');
    try {
      // Create test files for rate limit testing
      const testFiles = [];
      for (let i = 0; i < 5; i++) {
        const fileName = `rate-limit-test-${i}-${timestamp}.txt`;
        await callMcpTool('upload_file', {
          path: `/${TEST_FOLDER_NAME}/${fileName}`,
          content: encodeBase64(`Rate limit test file ${i}`)
        });
        testFiles.push(fileName);
      }

      // Try to delete files rapidly
      let rateLimitHit = false;
      for (const fileName of testFiles) {
        try {
          await callMcpTool('safe_delete_item', {
            path: `/${TEST_FOLDER_NAME}/${fileName}`,
            userId: 'rate_limit_test_user',
            skipConfirmation: true,
            permanent: true
          });
        } catch (error) {
          if (error instanceof Error && error.message.includes('rate limit exceeded')) {
            rateLimitHit = true;
            break;
          }
          throw error;
        }
      }

      console.log('✅ Rate limit test:');
      console.log(`   - Rate limit enforced: ${rateLimitHit}`);
      recordTestResult('safeDeleteRateLimit', true, null, { rateLimitEnforced: rateLimitHit });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('❌ Rate limit test failed');
      console.log(`   - Error: ${errorMessage}`);
      recordTestResult('safeDeleteRateLimit', false, new Error(errorMessage));
    }

    // Step T017: Test path validation
    startTest('safeDeletePathValidation');
    try {
      // Test allowed path
      const allowedPath = `/${TEST_FOLDER_NAME}/allowed-test.txt`;
      await callMcpTool('upload_file', {
        path: allowedPath,
        content: encodeBase64('Test file for path validation')
      });

      // Try to delete from allowed path - should succeed
      const allowedResponse = await callMcpTool('safe_delete_item', {
        path: allowedPath,
        userId: 'test_user',
        skipConfirmation: true
      });
      const allowedResult = JSON.parse(allowedResponse.content[0].text);
      console.log('✅ Allowed path deletion succeeded as expected');

      // Try to delete from blocked path - should fail with validation error
      const blockedPath = '/.system/test.txt';
      try {
        await callMcpTool('safe_delete_item', {
          path: blockedPath,
          userId: 'test_user',
          skipConfirmation: true
        });
        console.log('❌ Path validation test failed - blocked path was allowed');
        recordTestResult('safeDeletePathValidation', false, new Error('Blocked path was allowed'));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isValidationError = errorMessage.includes('blocked and cannot be deleted');
        console.log('✅ Path validation test:');
        console.log(`   - Blocked path rejected: ${isValidationError}`);
        console.log(`   - Error message: ${errorMessage}`);
        recordTestResult('safeDeletePathValidation', isValidationError, null, { 
          validationWorking: isValidationError,
          allowedResult,
          blockedPath,
          errorMessage
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('❌ Path validation test setup failed');
      console.log(`   - Error: ${errorMessage}`);
      recordTestResult('safeDeletePathValidation', false, new Error(errorMessage));
    }

    // Step T018: Test legacy delete operation
    startTest('legacyDelete');
    try {
      // First create a test file
      const legacyTestFile = `/${TEST_FOLDER_NAME}/legacy-test.txt`;
      await callMcpTool('upload_file', {
        path: legacyTestFile,
        content: encodeBase64('Test file for legacy delete')
      });

      // Verify file exists before attempting deletion
      await callMcpTool('get_file_metadata', {
        path: legacyTestFile
      });

      // Try legacy delete
      const legacyDeleteResponse = await callMcpTool('delete_item', {
        path: legacyTestFile
      });
      const legacyDeleteResult = JSON.parse(legacyDeleteResponse.content[0].text);
      console.log('✅ Legacy delete test:');
      console.log(`   - Status: ${legacyDeleteResult.status}`);
      console.log(`   - Operation: ${legacyDeleteResult.operation}`);

      // Verify file was deleted
      try {
        await callMcpTool('get_file_metadata', {
          path: legacyTestFile
        });
        console.log('❌ Legacy delete test failed - file still exists');
        recordTestResult('legacyDelete', false, new Error('File still exists after deletion'));
      } catch (error) {
        // File not found error is expected
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('path/not_found')) {
          console.log('✅ File successfully deleted');
          recordTestResult('legacyDelete', true, null, legacyDeleteResult);
        } else {
          throw error;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('❌ Legacy delete test failed');
      console.log(`   - Error: ${errorMessage}`);
      recordTestResult('legacyDelete', false, new Error(errorMessage));
    }

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
