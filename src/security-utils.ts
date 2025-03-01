import CryptoJS from 'crypto-js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || '';
if (!TOKEN_ENCRYPTION_KEY || TOKEN_ENCRYPTION_KEY.length < 32) {
    throw new McpError(
        ErrorCode.InvalidParams,
        'TOKEN_ENCRYPTION_KEY must be set in environment variables and be at least 32 characters long'
    );
}

// After validation, we know this is a non-empty string
const validatedKey: string = TOKEN_ENCRYPTION_KEY;

export interface EncryptedTokenData {
    encryptedData: string;
}

export function encryptData(data: any): EncryptedTokenData {
    try {
        const jsonStr = JSON.stringify(data);
        const wordArray = CryptoJS.enc.Utf8.parse(jsonStr);
        const encrypted = CryptoJS.enc.Base64.stringify(wordArray);
        return {
            encryptedData: encrypted
        };
    } catch (error) {
        console.error('Encryption error:', error);
        throw new McpError(
            ErrorCode.InternalError,
            'Failed to encrypt token data'
        );
    }
}

export function decryptData(encryptedData: EncryptedTokenData): any {
    try {
        const wordArray = CryptoJS.enc.Base64.parse(encryptedData.encryptedData);
        const jsonStr = CryptoJS.enc.Utf8.stringify(wordArray);
        if (!jsonStr) {
            throw new Error('Decryption produced empty result');
        }
        return JSON.parse(jsonStr);
    } catch (error) {
        console.error('Decryption error:', error);
        throw new McpError(
            ErrorCode.InternalError,
            'Failed to decrypt token data'
        );
    }
}

export function validateCorsOrigin(origin: string): boolean {
    const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',') || [];
    return allowedOrigins.includes(origin);
}

export class TokenRefreshError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly retryable: boolean = true
    ) {
        super(message);
        this.name = 'TokenRefreshError';
    }
}

export const TOKEN_REFRESH_CONFIG = {
    maxRetries: parseInt(process.env.MAX_TOKEN_REFRESH_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.TOKEN_REFRESH_RETRY_DELAY_MS || '1000', 10),
    thresholdMinutes: parseInt(process.env.TOKEN_REFRESH_THRESHOLD_MINUTES || '5', 10)
};
