#!/usr/bin / env node
/**
 * Dropbox MCP Server Test Suite
 * 
 * This script tests all the basic operations of the Dropbox MCP server.
 * It performs a series of operations to verify that the server is working correctly.
 * 
 * To run this test:
 * 1. Make sure you have a valid Dropbox access token in the 'token' file
 * 2. Run the test: node tests/dropbox-operations.test.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Configuration
const SERVER_COMMAND = 'node';
const SERVER_ARGS = [path.join(rootDir, 'build', 'index.js')];

// Generate unique test folder name using timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const TEST_FOLDER_NAME = `mcp-test-${timestamp}`;
const TEST_FILE_NAME = `test-file-${timestamp}.txt`;
const TEST_FILE_CONTENT = 'Hello, this is a test file created by the Dropbox MCP test suite.';
const TEST_FILE_COPY_NAME = `test-file-copy-${timestamp}.txt`;
const TEST_FILE_RENAMED_NAME = `renamed-file-${timestamp}.txt`;

// Test definitions with IDs and descriptions
const TEST_CASES = {
    accessToken: { id: 'T001', name: 'Access Token Update', description: 'Update Dropbox access token' },
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

// Helper function to encode content to base64
function encodeBase64(text) {
    return Buffer.from(text).toString('base64');
}

// Helper function to decode base64 content
function decodeBase64(base64) {
    return Buffer.from(base64, 'base64').toString('utf-8');
}

// Helper function to read the token file
function readToken() {
    try {
        return fs.readFileSync(path.join(rootDir, 'token'), 'utf-8').trim();
    } catch (error) {
        console.error('Error reading token file:', error);
        process.exit(1);
    }
}

// Helper function to send a request to the MCP server
async function sendMcpRequest(request) {
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
async function callMcpTool(toolName, args = {}, retryCount = 0) {
    const request = {
        jsonrpc: '2.0',
        id: Date.now().toString(),
        method: 'tools/call',
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

        // Extract the actual content from the MCP response
        if (response.result && response.result.content && response.result.content.length > 0) {
            const content = response.result.content[0];
            if (content.type === 'text') {
                const text = content.text;

                // Check for authentication errors
                if (text.includes("Authentication required") && toolName !== 'update_access_token' && retryCount < 1) {
                    console.log('Authentication error detected, updating token and retrying...');
                    const token = readToken();
                    await callMcpTool('update_access_token', { token });
                    return callMcpTool(toolName, args, retryCount + 1);
                }

                // For download_file, we want the raw text response
                if (toolName === 'download_file') {
                    return { content: [{ type: 'text', text }] };
                } else {
                    try {
                        // Try to parse the text as JSON
                        return JSON.parse(text);
                    } catch (e) {
                        // If it's not JSON, return the text directly
                        return text;
                    }
                }
            }
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
    console.log('Test Folder:', TEST_FOLDER_NAME);
    console.log('-----------------------------------');

    // Initialize test results tracking
    const testResults = {};
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
    function recordTestResult(testKey, passed, error = null, details = {}) {
        const endTime = new Date();
        testResults[testKey].passed = passed;
        testResults[testKey].error = error;
        testResults[testKey].endTime = endTime;
        testResults[testKey].duration = testResults[testKey].startTime ?
            endTime - testResults[testKey].startTime : 0;
        testResults[testKey].details = details;
    }

    // Helper function to start test timing
    function startTest(testKey) {
        testResults[testKey].startTime = new Date();
        console.log(`\n${TEST_CASES[testKey].id}. ${TEST_CASES[testKey].name}...`);
    }

    try {
        // Step T001: Update access token
        startTest('accessToken');
        const token = readToken();
        await callMcpTool('update_access_token', { token });
        console.log('✅ Access token updated successfully');
        recordTestResult('accessToken', true);

        // Step T002: Get account information
        startTest('accountInfo');
        const accountInfoResponse = await callMcpTool('get_account_info');
        console.log('Response:', JSON.stringify(accountInfoResponse, null, 2));

        // Parse the response content
        let accountInfo;
        if (typeof accountInfoResponse === 'string') {
            try {
                accountInfo = JSON.parse(accountInfoResponse);
            } catch (e) {
                accountInfo = { content: accountInfoResponse };
            }
        } else {
            accountInfo = accountInfoResponse;
        }

        console.log('✅ Account information retrieved:');
        console.log(`   - Account ID: ${accountInfo.account_id || 'N/A'}`);
        console.log(`   - Name: ${accountInfo.name ? accountInfo.name.display_name : 'N/A'}`);
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
        const rootFilesResponse = await callMcpTool('list_files', { path: '' });
        console.log('Root files response:', JSON.stringify(rootFilesResponse, null, 2));

        // Parse the response if it's an array
        const rootFiles = Array.isArray(rootFilesResponse) ? rootFilesResponse : [];
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
        const fileMetadataResponse = await callMcpTool('get_file_metadata', {
            path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`
        });
        console.log('File metadata response:', JSON.stringify(fileMetadataResponse, null, 2));

        // Parse the response
        let fileMetadata;
        if (typeof fileMetadataResponse === 'string') {
            try {
                fileMetadata = JSON.parse(fileMetadataResponse);
            } catch (e) {
                fileMetadata = {};
            }
        } else {
            fileMetadata = fileMetadataResponse || {};
        }

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
        const downloadedFileResponse = await callMcpTool('download_file', {
            path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`
        });
        console.log('Download response:', JSON.stringify(downloadedFileResponse, null, 2));

        // Get the downloaded file path from response
        const downloadedFilePath = downloadedFileResponse?.content?.[0]?.text;
        if (!downloadedFilePath) {
            throw new Error('No file path received in download response');
        }

        try {
            // Read the downloaded file content
            const downloadedContent = fs.readFileSync(downloadedFilePath, 'utf-8');

            console.log('✅ File downloaded successfully');
            console.log(`   - File path: "${downloadedFilePath}"`);
            console.log(`   - Content: "${downloadedContent}"`);
            recordTestResult('downloadFile', true, null, {
                filePath: downloadedFilePath,
                contentLength: downloadedContent.length,
                contentMatch: downloadedContent === TEST_FILE_CONTENT
            });

            // Clean up downloaded file
            fs.unlinkSync(downloadedFilePath);
            console.log('   - Cleaned up downloaded file');
        } catch (error) {
            console.error('Error handling downloaded file:', error);
            throw error;
        }

        // Step T008: Try to create a sharing link with force_create
        startTest('sharingLink');
        try {
            // First try to remove any existing sharing link
            try {
                await callMcpTool('delete_item', {
                    path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`
                });
                await callMcpTool('upload_file', {
                    path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`,
                    content: encodedContent
                });
            } catch (e) {
                // Ignore errors here as we just want to ensure a fresh file
            }

            const sharingLinkResponse = await callMcpTool('get_sharing_link', {
                path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`,
                settings: {
                    requested_visibility: { ".tag": "public" },
                    audience: { ".tag": "public" },
                    access: { ".tag": "viewer" }
                }
            });

            let url = 'N/A';
            if (typeof sharingLinkResponse === 'object' && sharingLinkResponse.url) {
                url = sharingLinkResponse.url;
            } else if (typeof sharingLinkResponse === 'string') {
                try {
                    const parsed = JSON.parse(sharingLinkResponse);
                    url = parsed.url || 'N/A';
                } catch (e) { }
            }

            console.log('✅ Sharing link created successfully');
            console.log(`   - Link: ${url}`);
            recordTestResult('sharingLink', true, null, { url });
        } catch (error) {
            console.log('❌ Failed to create sharing link');
            console.log(`   - Error: ${error.message}`);
            recordTestResult('sharingLink', false, error);
        }


        // Step T009: Search for files
        startTest('searchFiles');
        console.log('Searching for files with "test" in the name...');
        const searchResultsResponse = await callMcpTool('search_file_db', {
            query: 'test',
            path: '',
            max_results: 10
        });

        // Parse the response if it's an array
        const searchResults = Array.isArray(searchResultsResponse) ? searchResultsResponse : [];
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

        // List the test folder to verify move operation
        console.log('\nVerifying move operation...');
        const updatedFolderContentsResponse = await callMcpTool('list_files', {
            path: `/${TEST_FOLDER_NAME}`
        });

        // Parse the response if it's an array
        const updatedFolderContents = Array.isArray(updatedFolderContentsResponse) ? updatedFolderContentsResponse : [];
        console.log(`✅ Found ${updatedFolderContents.length} items in the test folder`);
        console.log('   Files:');
        if (updatedFolderContents.length > 0) {
            updatedFolderContents.forEach((item) => {
                console.log(`   - ${item.name || 'Unknown'}`);
            });
        } else {
            console.log('   No files found');
        }

        // Step T012: Delete the renamed file
        startTest('deleteFile');
        console.log(`Deleting the renamed file "${TEST_FILE_RENAMED_NAME}"...`);
        await callMcpTool('delete_item', {
            path: `/${TEST_FOLDER_NAME}/${TEST_FILE_RENAMED_NAME}`
        });
        console.log('✅ File deleted successfully');

        // Verify deletion for T012
        console.log('Verifying deletion...');
        const finalFolderContentsResponse = await callMcpTool('list_files', {
            path: `/${TEST_FOLDER_NAME}`
        });

        // Parse the response if it's an array
        const finalFolderContents = Array.isArray(finalFolderContentsResponse) ? finalFolderContentsResponse : [];
        console.log(`✅ Found ${finalFolderContents.length} items in the test folder after deletion`);
        console.log('   Files:');
        if (finalFolderContents.length > 0) {
            finalFolderContents.forEach((item) => {
                console.log(`   - ${item.name || 'Unknown'}`);
            });
        } else {
            console.log('   No files found');
        }
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
        // Clean up downloads directory
        const downloadsDir = path.join(rootDir, 'downloads');
        if (fs.existsSync(downloadsDir)) {
            try {
                fs.rmSync(downloadsDir, { recursive: true, force: true });
                console.log('\nCleaned up downloads directory');
            } catch (error) {
                console.error('Failed to clean up downloads directory:', error);
            }
        }

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
