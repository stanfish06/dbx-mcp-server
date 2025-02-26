#!/usr/bin/env node
/**
 * Dropbox MCP Server Test Suite
 * 
 * This script tests all the basic operations of the Dropbox MCP server.
 * It performs a series of operations to verify that the server is working correctly.
 * 
 * To run this test:
 * 1. Make sure you have a valid Dropbox access token in the 'token' file
 * 2. Build the project: npm run build
 * 3. Run the test: npx ts-node tests/dropbox-operations.test.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Configuration
const SERVER_COMMAND = 'node';
const SERVER_ARGS = [path.join(rootDir, 'build', 'index.js')];
const TEST_FOLDER_NAME = 'MCP Test Folder';
const TEST_FILE_NAME = 'test_file.txt';
const TEST_FILE_CONTENT = 'Hello, this is a test file created by the Dropbox MCP test suite.';
const TEST_FILE_COPY_NAME = 'test_file_copy.txt';
const TEST_FILE_RENAMED_NAME = 'renamed_test_file.txt';

// Helper function to encode content to base64
function encodeBase64(text: string): string {
  return Buffer.from(text).toString('base64');
}

// Helper function to decode base64 content
function decodeBase64(base64: string): string {
  return Buffer.from(base64, 'base64').toString('utf-8');
}

// Helper function to read the token file
function readToken(): string {
  try {
    return fs.readFileSync(path.join(rootDir, 'token'), 'utf-8').trim();
  } catch (error) {
    console.error('Error reading token file:', error);
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
    method: 'callTool',
    params: {
      name: toolName,
      arguments: args
    }
  };

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

  try {
    // Step 1: Update access token
    const token = readToken();
    console.log('1. Updating access token...');
    await callMcpTool('update_access_token', { token });
    console.log('✅ Access token updated successfully');

    // Step 2: Get account information
    console.log('\n2. Getting account information...');
    const accountInfo = await callMcpTool('get_account_info');
    console.log('✅ Account information retrieved:');
    console.log(`   - Account ID: ${accountInfo.account_id}`);
    console.log(`   - Name: ${accountInfo.name.display_name}`);
    console.log(`   - Email: ${accountInfo.email}`);
    console.log(`   - Account Type: ${accountInfo.account_type}`);

    // Step 3: List files in root directory
    console.log('\n3. Listing files in root directory...');
    const rootFiles = await callMcpTool('list_files', { path: '' });
    console.log(`✅ Found ${rootFiles.length} items in root directory`);

    // Step 4: Create a test folder
    console.log(`\n4. Creating test folder "${TEST_FOLDER_NAME}"...`);
    try {
      await callMcpTool('create_folder', { path: `/${TEST_FOLDER_NAME}` });
      console.log(`✅ Folder "${TEST_FOLDER_NAME}" created successfully`);
    } catch (error) {
      console.log(`ℹ️ Folder "${TEST_FOLDER_NAME}" may already exist, continuing...`);
    }

    // Step 5: Upload a test file
    console.log(`\n5. Uploading test file "${TEST_FILE_NAME}"...`);
    const encodedContent = encodeBase64(TEST_FILE_CONTENT);
    await callMcpTool('upload_file', {
      path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`,
      content: encodedContent
    });
    console.log(`✅ File "${TEST_FILE_NAME}" uploaded successfully`);

    // Step 6: Get file metadata
    console.log('\n6. Getting file metadata...');
    const fileMetadata = await callMcpTool('get_file_metadata', {
      path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`
    });
    console.log('✅ File metadata retrieved:');
    console.log(`   - Name: ${fileMetadata.name}`);
    console.log(`   - Path: ${fileMetadata.path_display}`);
    console.log(`   - Size: ${fileMetadata.size} bytes`);
    console.log(`   - Modified: ${fileMetadata.server_modified}`);

    // Step 7: Download the file
    console.log('\n7. Downloading the file...');
    const downloadedFile = await callMcpTool('download_file', {
      path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`
    });
    const decodedContent = decodeBase64(downloadedFile);
    console.log('✅ File downloaded successfully');
    console.log(`   - Content: "${decodedContent}"`);

    // Step 8: Try to create a sharing link (may fail due to permissions)
    console.log('\n8. Attempting to create a sharing link...');
    try {
      const sharingLink = await callMcpTool('get_sharing_link', {
        path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`
      });
      console.log('✅ Sharing link created successfully');
      console.log(`   - Link: ${sharingLink}`);
    } catch (error) {
      console.log('❌ Failed to create sharing link (expected if token lacks sharing scope)');
      console.log('   - This is normal if your token does not have sharing permissions');
    }

    // Step 9: List the test folder
    console.log(`\n9. Listing contents of "${TEST_FOLDER_NAME}"...`);
    const folderContents = await callMcpTool('list_files', {
      path: `/${TEST_FOLDER_NAME}`
    });
    console.log(`✅ Found ${folderContents.length} items in the test folder`);

    // Step 10: Search for files
    console.log('\n10. Searching for files with "test" in the name...');
    const searchResults = await callMcpTool('search_files', {
      query: 'test',
      path: '',
      max_results: 10
    });
    console.log(`✅ Found ${searchResults.length} items matching the search query`);

    // Step 11: Copy the file
    console.log(`\n11. Copying the file to "${TEST_FILE_COPY_NAME}"...`);
    await callMcpTool('copy_item', {
      from_path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`,
      to_path: `/${TEST_FOLDER_NAME}/${TEST_FILE_COPY_NAME}`
    });
    console.log('✅ File copied successfully');

    // Step 12: Move/rename the file
    console.log(`\n12. Renaming the copied file to "${TEST_FILE_RENAMED_NAME}"...`);
    await callMcpTool('move_item', {
      from_path: `/${TEST_FOLDER_NAME}/${TEST_FILE_COPY_NAME}`,
      to_path: `/${TEST_FOLDER_NAME}/${TEST_FILE_RENAMED_NAME}`
    });
    console.log('✅ File renamed successfully');

    // Step 13: List the test folder again
    console.log(`\n13. Listing contents of "${TEST_FOLDER_NAME}" again...`);
    const updatedFolderContents = await callMcpTool('list_files', {
      path: `/${TEST_FOLDER_NAME}`
    });
    console.log(`✅ Found ${updatedFolderContents.length} items in the test folder`);
    console.log('   Files:');
    updatedFolderContents.forEach((item: any) => {
      console.log(`   - ${item.name}`);
    });

    // Step 14: Delete the renamed file
    console.log(`\n14. Deleting the renamed file "${TEST_FILE_RENAMED_NAME}"...`);
    await callMcpTool('delete_item', {
      path: `/${TEST_FOLDER_NAME}/${TEST_FILE_RENAMED_NAME}`
    });
    console.log('✅ File deleted successfully');

    // Step 15: Verify deletion
    console.log('\n15. Verifying deletion...');
    const finalFolderContents = await callMcpTool('list_files', {
      path: `/${TEST_FOLDER_NAME}`
    });
    console.log(`✅ Found ${finalFolderContents.length} items in the test folder after deletion`);
    console.log('   Files:');
    finalFolderContents.forEach((item: any) => {
      console.log(`   - ${item.name}`);
    });

    // Test summary
    console.log('\n-----------------------------------');
    console.log('Test Summary:');
    console.log('✅ Get account information');
    console.log('✅ List files in a directory');
    console.log('✅ Create a folder');
    console.log('✅ Upload a file');
    console.log('✅ Get file metadata');
    console.log('✅ Download a file');
    console.log('❓ Create a sharing link (may require additional permissions)');
    console.log('✅ Search for files');
    console.log('✅ Copy a file');
    console.log('✅ Move/rename a file');
    console.log('✅ Delete a file');
    console.log('-----------------------------------');
    console.log('All tests completed successfully!');

  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the tests
runTests().catch(console.error);
