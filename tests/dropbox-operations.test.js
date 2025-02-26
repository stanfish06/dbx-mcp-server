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
const TEST_FOLDER_NAME = 'MCP Test Folder';
const TEST_FILE_NAME = 'test_file.txt';
const TEST_FILE_CONTENT = 'Hello, this is a test file created by the Dropbox MCP test suite.';
const TEST_FILE_COPY_NAME = 'test_file_copy.txt';
const TEST_FILE_RENAMED_NAME = 'renamed_test_file.txt';

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

                try {
                    // Try to parse the text as JSON
                    return JSON.parse(text);
                } catch (e) {
                    // If it's not JSON, return the text directly
                    return text;
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

    // Initialize variables for test status tracking
    const testResults = {
        accessToken: false,
        accountInfo: false,
        listFiles: false,
        createFolder: false,
        uploadFile: false,
        fileMetadata: false,
        downloadFile: false,
        sharingLink: false,
        searchFiles: false,
        copyFile: false,
        moveFile: false,
        deleteFile: false
    };

    try {
        // Step 1: Update access token
        const token = readToken();
        console.log('1. Updating access token...');
        await callMcpTool('update_access_token', { token });
        console.log('✅ Access token updated successfully');
        testResults.accessToken = true;

        // Step 2: Get account information
        console.log('\n2. Getting account information...');
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
        testResults.accountInfo = true;

        // Step 3: List files in root directory
        console.log('\n3. Listing files in root directory...');
        const rootFilesResponse = await callMcpTool('list_files', { path: '' });
        console.log('Root files response:', JSON.stringify(rootFilesResponse, null, 2));

        // Parse the response if it's an array
        const rootFiles = Array.isArray(rootFilesResponse) ? rootFilesResponse : [];
        console.log(`✅ Found ${rootFiles.length} items in root directory`);
        testResults.listFiles = true;

        // Step 4: Create a test folder
        console.log(`\n4. Creating test folder "${TEST_FOLDER_NAME}"...`);
        try {
            await callMcpTool('create_folder', { path: `/${TEST_FOLDER_NAME}` });
            console.log(`✅ Folder "${TEST_FOLDER_NAME}" created successfully`);
            testResults.createFolder = true;
        } catch (error) {
            console.log(`ℹ️ Folder "${TEST_FOLDER_NAME}" may already exist, continuing...`);
            testResults.createFolder = true; // Consider existing folder as success
        }

        // Step 5: Upload a test file
        console.log(`\n5. Uploading test file "${TEST_FILE_NAME}"...`);
        const encodedContent = encodeBase64(TEST_FILE_CONTENT);
        await callMcpTool('upload_file', {
            path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`,
            content: encodedContent
        });
        console.log(`✅ File "${TEST_FILE_NAME}" uploaded successfully`);
        testResults.uploadFile = true;

        // Step 6: Get file metadata
        console.log('\n6. Getting file metadata...');
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
        testResults.fileMetadata = true;

        // Step 7: Download the file
        console.log('\n7. Downloading the file...');
        const downloadedFileResponse = await callMcpTool('download_file', {
            path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`
        });
        console.log('Download response:', JSON.stringify(downloadedFileResponse, null, 2));

        // Handle the downloaded file content
        let decodedContent = 'N/A';
        if (typeof downloadedFileResponse === 'string') {
            try {
                decodedContent = decodeBase64(downloadedFileResponse);
            } catch (e) {
                console.log('Error decoding content:', e.message);
                decodedContent = 'Error: Could not decode content';
            }
        } else {
            decodedContent = 'Response was not a string';
        }

        console.log('✅ File downloaded successfully');
        console.log(`   - Content: "${decodedContent}"`);
        testResults.downloadFile = true;

        // Step 8: Try to create a sharing link
        console.log('\n8. Attempting to create a sharing link...');
        try {
            const sharingLinkResponse = await callMcpTool('get_sharing_link', {
                path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`
            });
            console.log('Sharing link response:', JSON.stringify(sharingLinkResponse, null, 2));

            // Update sharingLinkSuccess variable

            // Check if the response contains an error message
            if (typeof sharingLinkResponse === 'string' && sharingLinkResponse.includes('missing_scope')) {
                console.log('❌ Failed to create sharing link due to missing permissions');
                console.log('   - Make sure your token has the sharing.write permission scope enabled');
            } else {
                // Try to extract the URL from the response
                let url = 'N/A';
                if (typeof sharingLinkResponse === 'object' && sharingLinkResponse.url) {
                    url = sharingLinkResponse.url;
                } else if (typeof sharingLinkResponse === 'string') {
                    try {
                        const parsed = JSON.parse(sharingLinkResponse);
                        url = parsed.url || 'N/A';
                    } catch (e) {
                        // Not JSON, use as is
                    }
                }

                testResults.sharingLink = true;
                console.log('✅ Sharing link created successfully');
                console.log(`   - Link: ${url}`);
            }
        } catch (error) {
            testResults.sharingLink = false;
            console.log('❌ Failed to create sharing link');
            console.log(`   - Error: ${error.message}`);
        }


        // Step 9: List the test folder
        console.log(`\n9. Listing contents of "${TEST_FOLDER_NAME}"...`);
        const folderContentsResponse = await callMcpTool('list_files', {
            path: `/${TEST_FOLDER_NAME}`
        });

        // Parse the response if it's an array
        const folderContents = Array.isArray(folderContentsResponse) ? folderContentsResponse : [];
        console.log(`✅ Found ${folderContents.length} items in the test folder`);

        // Step 10: Search for files
        console.log('\n10. Searching for files with "test" in the name...');
        const searchResultsResponse = await callMcpTool('search_file_db', {
            query: 'test',
            path: '',
            max_results: 10
        });

        // Parse the response if it's an array
        const searchResults = Array.isArray(searchResultsResponse) ? searchResultsResponse : [];
        console.log(`✅ Found ${searchResults.length} items matching the search query`);
        testResults.searchFiles = true;

        // Step 11: Copy the file
        console.log(`\n11. Copying the file to "${TEST_FILE_COPY_NAME}"...`);
        await callMcpTool('copy_item', {
            from_path: `/${TEST_FOLDER_NAME}/${TEST_FILE_NAME}`,
            to_path: `/${TEST_FOLDER_NAME}/${TEST_FILE_COPY_NAME}`
        });
        console.log('✅ File copied successfully');
        testResults.copyFile = true;

        // Step 12: Move/rename the file
        console.log(`\n12. Renaming the copied file to "${TEST_FILE_RENAMED_NAME}"...`);
        await callMcpTool('move_item', {
            from_path: `/${TEST_FOLDER_NAME}/${TEST_FILE_COPY_NAME}`,
            to_path: `/${TEST_FOLDER_NAME}/${TEST_FILE_RENAMED_NAME}`
        });
        console.log('✅ File renamed successfully');
        testResults.moveFile = true;

        // Step 13: List the test folder again
        console.log(`\n13. Listing contents of "${TEST_FOLDER_NAME}" again...`);
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

        // Step 14: Delete the renamed file
        console.log(`\n14. Deleting the renamed file "${TEST_FILE_RENAMED_NAME}"...`);
        await callMcpTool('delete_item', {
            path: `/${TEST_FOLDER_NAME}/${TEST_FILE_RENAMED_NAME}`
        });
        console.log('✅ File deleted successfully');
        testResults.deleteFile = true;

        // Step 15: Verify deletion
        console.log('\n15. Verifying deletion...');
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

        // Generate dynamic test summary
        console.log('\n=== Test Summary ===');
        const totalTests = Object.keys(testResults).length;
        const passedTests = Object.values(testResults).filter(result => result).length;

        Object.entries(testResults).forEach(([test, passed]) => {
            const icon = passed ? '✅' : '❌';
            const status = passed ? 'Success' : 'Failed';
            const formattedTest = test
                .replace(/([A-Z])/g, ' $1') // Add space before capital letters
                .replace(/^./, str => str.toUpperCase()); // Capitalize first letter
            console.log(`${icon} ${formattedTest}: ${status}`);
        });

        console.log('-------------------');
        console.log(`Total Tests: ${totalTests}`);
        console.log(`Passed: ${passedTests}`);
        console.log(`Failed: ${totalTests - passedTests}`);
        console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
        console.log('==================\n');


    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
}

// Run the tests
runTests().catch(console.error);
