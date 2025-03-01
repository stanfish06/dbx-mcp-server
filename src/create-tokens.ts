#!/usr/bin/env node
import { encryptData } from './security-utils.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_STORE_PATH = path.join(process.cwd(), '.tokens.json');

const accessToken = process.env.DROPBOX_ACCESS_TOKEN;
if (!accessToken) {
    console.error('DROPBOX_ACCESS_TOKEN not found in environment variables');
    process.exit(1);
}

const tokenData = {
    accessToken: accessToken,
    refreshToken: accessToken,
    expiresAt: Date.now() + (3600 * 1000),
    scope: ['files.metadata.read', 'files.content.read', 'files.content.write', 'sharing.write'],
    refreshAttempts: 0,
    lastRefreshAttempt: undefined,
    accountId: null,
    tokenType: 'bearer'
};

const encryptedData = encryptData(tokenData);
fs.writeFileSync(TOKEN_STORE_PATH, JSON.stringify(encryptedData, null, 2));
console.log('Created encrypted .tokens.json file at:', TOKEN_STORE_PATH);
