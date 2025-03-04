import * as readline from 'readline';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import { generateAuthUrl, exchangeCodeForTokens } from './auth.js';
import { encryptData } from './security-utils.js';
import open from 'open';

// Type definitions for MCP config
interface ServerConfig {
    command: string;
    args: string[];
    env: Record<string, any>;
    disabled: boolean;
    autoApprove: string[];
}

interface McpConfig {
    mcpServers: {
        [key: string]: ServerConfig;
    };
}

interface ClaudeConfig extends McpConfig {
    globalShortcut: string;
}

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Promisify readline question
const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(query, resolve);
    });
};

async function setup() {
    console.log('\n=== DBX MCP Server Setup ===\n');
    console.log('Note: This project is not affiliated with, endorsed by, or sponsored by Dropbox.');
    console.log('It is an independent integration that works with Dropbox\'s public API.\n');
    
    // Clean up any existing tokens file
    if (fs.existsSync('.tokens.json')) {
        console.log('Removing existing tokens file...');
        fs.unlinkSync('.tokens.json');
    }

    // Generate and set TOKEN_ENCRYPTION_KEY first
    const tokenEncryptionKey = randomBytes(32).toString('base64');
    process.env.TOKEN_ENCRYPTION_KEY = tokenEncryptionKey;
    
    // Get Dropbox credentials from user
    console.log('Please enter your Dropbox API credentials:');
    const appKey = await question('App Key: ');
    const appSecret = await question('App Secret: ');
    
    // Encrypt the app secret
    const encryptedSecret = encryptData(appSecret);
    
    // Create .env file content
    const envContent = `# API Configuration (integrates with Dropbox)
# Note: This project is not affiliated with, endorsed by, or sponsored by Dropbox.
# It is an independent integration that works with Dropbox's public API.

DROPBOX_APP_KEY=${appKey}
DROPBOX_APP_SECRET=${JSON.stringify(encryptedSecret)}
DROPBOX_REDIRECT_URI=http://localhost
TOKEN_ENCRYPTION_KEY=${tokenEncryptionKey}
CORS_ALLOWED_ORIGINS=http://localhost:3000

# Token Configuration
TOKEN_REFRESH_THRESHOLD_MINUTES=5
MAX_TOKEN_REFRESH_RETRIES=3
TOKEN_REFRESH_RETRY_DELAY_MS=1000
TOKEN_STORE_PATH=.tokens.json

# File Management Configuration
DBX_RECYCLE_BIN_PATH=/.recycle_bin
DBX_MAX_DELETES_PER_DAY=100
DBX_RETENTION_DAYS=30
DBX_ALLOWED_PATHS=/
DBX_BLOCKED_PATHS=/.recycle_bin,/.system`;

    // Write .env file
    fs.writeFileSync('.env', envContent);
    console.log('\n✅ Created .env file with encrypted app secret');

    // Set environment variables for auth
    process.env.DROPBOX_APP_KEY = appKey;
    process.env.DROPBOX_APP_SECRET = appSecret;
    process.env.DROPBOX_REDIRECT_URI = 'http://localhost';

    // Generate auth URL and get code verifier
    const { url: authUrl, codeVerifier } = generateAuthUrl();
    
    // Open auth URL in browser
    console.log('\nOpening authorization URL in your browser...');
    await open(authUrl);
    
    // Get authorization code from user
    console.log('\nPlease authorize the application in your browser.');
    console.log('After authorization, you will be redirected to a URL containing the authorization code.');
    console.log('Copy the "code" parameter from the URL and paste it here.');
    const authCode = await question('\nAuthorization code: ');
    
    try {
        // Exchange code for tokens
        console.log('\nExchanging authorization code for tokens...');
        const tokenData = await exchangeCodeForTokens(authCode, codeVerifier);
        
        console.log('\n✅ Successfully obtained and stored access token');
        console.log('Token details:');
        console.log('- Access token expires:', new Date(tokenData.expiresAt).toLocaleString());
        console.log('- Scopes:', tokenData.scope.join(', '));
        
        // Add a command for users to reset tokens if needed
        console.log('\nℹ️ If you ever need to reset tokens (e.g., after changing encryption keys):');
        console.log('   node build/src/reset-tokens.js');
        
        // Ask about generating config files
        console.log('\nWould you like to generate MCP configuration files?');
        console.log('1. Generate Claude Desktop config');
        console.log('2. Generate Cline config');
        console.log('3. Generate both');
        console.log('4. Skip');
        const choice = await question('\nEnter your choice (1-4): ');
        
        if (choice === '1' || choice === '2' || choice === '3') {
            const serverConfig = {
                command: "node",
                args: [`${process.cwd()}/build/src/index.js`],
                env: {
                    DROPBOX_APP_KEY: appKey,
                    DROPBOX_APP_SECRET: JSON.stringify(encryptedSecret),
                    DROPBOX_REDIRECT_URI: "http://localhost",
                    TOKEN_ENCRYPTION_KEY: tokenEncryptionKey,
                    CORS_ALLOWED_ORIGINS: "http://localhost",
                    TOKEN_REFRESH_THRESHOLD_MINUTES: "5",
                    MAX_TOKEN_REFRESH_RETRIES: "3",
                    TOKEN_REFRESH_RETRY_DELAY_MS: "1000",
                    TOKEN_STORE_PATH: `${process.cwd()}/.tokens.json`,
                    DBX_RECYCLE_BIN_PATH: "/.recycle_bin",
                    DBX_MAX_DELETES_PER_DAY: "100",
                    DBX_RETENTION_DAYS: "30",
                    DBX_ALLOWED_PATHS: "/",
                    DBX_BLOCKED_PATHS: "/.recycle_bin,/.system"
                },
                disabled: false,
                autoApprove: []
            };

            // Get paths for config files
            const homedir = process.env.HOME || '/Users/Amgad';
            const claudePath = `${homedir}/Library/Application Support/Claude/claude_desktop_config.json`;
            const clinePath = `${homedir}/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`;

            // Generate Claude Desktop config if selected
            if (choice === '1' || choice === '3') {
                let claudeConfig: ClaudeConfig = {
                    globalShortcut: "Shift+Cmd+L",
                    mcpServers: {}
                };
                
                if (fs.existsSync(claudePath)) {
                    try {
                        const fileContent = fs.readFileSync(claudePath, 'utf8');
                        console.log('\nExisting Claude config found');
                        const backupPath = `${claudePath}.bak.${Date.now()}`;
                        fs.writeFileSync(backupPath, fileContent);
                        console.log(`✅ Backed up existing Claude config to: ${backupPath}`);
                        claudeConfig = JSON.parse(fileContent);
                        if (!claudeConfig.mcpServers) {
                            claudeConfig.mcpServers = {};
                        }
                    } catch (error) {
                        console.log('Warning: Could not parse existing Claude config, creating new one');
                    }
                }
                
                console.log('Adding dbx-mcp-server to Claude config');
                claudeConfig.mcpServers["dbx-mcp-server"] = serverConfig;
                
                fs.mkdirSync(`${homedir}/Library/Application Support/Claude`, { recursive: true });
                fs.writeFileSync(claudePath, JSON.stringify(claudeConfig, null, 2));
                console.log('✅ Updated/created Claude Desktop config at:', claudePath);
            }

            // Generate Cline config if selected
            if (choice === '2' || choice === '3') {
                let clineConfig: McpConfig = { mcpServers: {} };
                
                if (fs.existsSync(clinePath)) {
                    try {
                        const fileContent = fs.readFileSync(clinePath, 'utf8');
                        console.log('\nExisting Cline config found');
                        const backupPath = `${clinePath}.bak.${Date.now()}`;
                        fs.writeFileSync(backupPath, fileContent);
                        console.log(`✅ Backed up existing Cline config to: ${backupPath}`);
                        clineConfig = JSON.parse(fileContent);
                        if (!clineConfig.mcpServers) {
                            clineConfig.mcpServers = {};
                        }
                    } catch (error) {
                        console.log('Warning: Could not parse existing Cline config, creating new one');
                    }
                }
                
                console.log('Adding dbx-mcp-server to Cline config');
                clineConfig.mcpServers["dbx-mcp-server"] = serverConfig;
                
                fs.mkdirSync(`${homedir}/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings`, { recursive: true });
                fs.writeFileSync(clinePath, JSON.stringify(clineConfig, null, 2));
                console.log('✅ Updated/created Cline config at:', clinePath);
            }
        }

        console.log('\n✅ Setup completed successfully!');
        console.log('\nImportant information:');
        console.log('1. You can now start the server with:');
        console.log('   npm start');
        console.log('\n2. If you get decryption errors when running the server:');
        console.log('   - Run: node build/src/reset-tokens.js');
        console.log('   - Then restart the server and it will prompt for re-authorization');
        
    } catch (error) {
        console.error('\n❌ Error exchanging authorization code for tokens:', error);
        console.log('Please try the setup process again.');
    }
    
    rl.close();
}

// Run setup
setup().catch(console.error);
