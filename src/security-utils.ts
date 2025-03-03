import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
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
    iv: string;
    encryptedData: string;
}

const ALGORITHM = 'aes-256-gcm';

export function encryptData(data: any): EncryptedTokenData {
    try {
        // Generate a random initialization vector
        const iv = randomBytes(16);
        
        // Create cipher with key and iv
        const cipher = createCipheriv(
            ALGORITHM, 
            Buffer.from(validatedKey.slice(0, 32)), 
            iv
        );
        
        // Convert data to JSON string
        const jsonStr = JSON.stringify(data);
        
        // Encrypt the data
        let encryptedData = cipher.update(jsonStr, 'utf8', 'hex');
        encryptedData += cipher.final('hex');
        
        // Get the auth tag
        const authTag = cipher.getAuthTag();
        
        // Combine the encrypted data and auth tag
        const finalEncryptedData = encryptedData + authTag.toString('hex');
        
        return {
            iv: iv.toString('hex'),
            encryptedData: finalEncryptedData
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
        // Extract the auth tag from the end of the encrypted data (last 16 bytes)
        const authTagLength = 32; // 16 bytes in hex = 32 characters
        const encryptedHex = encryptedData.encryptedData;
        const authTag = Buffer.from(
            encryptedHex.slice(-authTagLength), 
            'hex'
        );
        const encryptedContent = encryptedHex.slice(0, -authTagLength);
        
        // Create decipher
        const decipher = createDecipheriv(
            ALGORITHM,
            Buffer.from(validatedKey.slice(0, 32)),
            Buffer.from(encryptedData.iv, 'hex')
        );
        
        // Set auth tag
        decipher.setAuthTag(authTag);
        
        // Decrypt the data
        let decrypted = decipher.update(encryptedContent, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        if (!decrypted) {
            throw new Error('Decryption produced empty result');
        }
        
        return JSON.parse(decrypted);
    } catch (error) {
        console.error('Decryption error:', error);
        throw new McpError(
            ErrorCode.InternalError,
            'Failed to decrypt token data. The data may be corrupted or the encryption key may be invalid.'
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
