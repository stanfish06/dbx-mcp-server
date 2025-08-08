import * as fs from 'fs';
import * as path from 'path';
import axios, { AxiosError } from 'axios';
import { fileURLToPath } from 'url';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { randomBytes, createHash } from 'crypto';
import dotenv from 'dotenv';
import {
  encryptData,
  decryptData,
  TokenRefreshError,
  TOKEN_REFRESH_CONFIG,
  EncryptedTokenData
} from './security-utils.js';
import { config } from './config.js';

dotenv.config();

const TOKEN_STORE_PATH = process.env.TOKEN_STORE_PATH || path.join(process.cwd(), '.tokens.json');

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string[];
  lastRefreshAttempt?: number;
  refreshAttempts?: number;
  codeVerifier?: string; // PKCE code verifier needed for token refresh
}

// Use config values which handle encrypted secrets
const validatedAppKey: string = config.dropbox.appKey as string;
const validatedAppSecret: string = config.dropbox.appSecret as string;
const validatedRedirectUri: string = config.dropbox.redirectUri as string;

// Skip validation during setup
const isSetup = process.argv[1]?.endsWith('setup.js');
if (!isSetup && (!validatedAppKey || !validatedAppSecret || !validatedRedirectUri)) {
  throw new McpError(
    ErrorCode.InvalidParams,
    'Missing required configuration. Please ensure API credentials are properly set.'
  );
}

let tokenData: TokenData | null = process.env.DROPBOX_ACCESS_TOKEN ? {
  accessToken: process.env.DROPBOX_ACCESS_TOKEN,
  refreshToken: '',
  expiresAt: Date.now() + (4 * 60 * 60 * 1000), // 4 hours from now
  scope: ['files.content.read', 'files.content.write']
} : loadTokenData();

// Error messages map for better error handling
const ERROR_MESSAGES = {
  TOKEN_EXPIRED: 'Access token has expired. Attempting to refresh...',
  REFRESH_FAILED: 'Failed to refresh access token after multiple attempts.',
  INVALID_GRANT: 'The refresh token is invalid or has been revoked. Please re-authenticate.',
  NETWORK_ERROR: 'Network error occurred while refreshing token. Will retry...',
  RATE_LIMIT: 'Rate limit exceeded. Please try again later.',
  SERVER_ERROR: 'API server error occurred. Will retry...'
};

function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

function loadTokenData(): TokenData | null {
  try {
    // Use logger instead of console.error to avoid polluting the JSON structure
    if (process.env.NODE_ENV === 'development') {
      console.error('Loading tokens from:', TOKEN_STORE_PATH);
    }

    if (fs.existsSync(TOKEN_STORE_PATH)) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Token file exists');
      }

      const rawData = fs.readFileSync(TOKEN_STORE_PATH, 'utf-8');

      if (process.env.NODE_ENV === 'development') {
        console.error('Raw token data length:', rawData.length);
      }

      const encryptedData = JSON.parse(rawData) as EncryptedTokenData;

      if (process.env.NODE_ENV === 'development') {
        console.error('Parsed encrypted data:', {
          hasIv: !!encryptedData.iv,
          encryptedDataLength: encryptedData.encryptedData?.length
        });
      }

      const decrypted = decryptData(encryptedData) as TokenData;

      if (process.env.NODE_ENV === 'development') {
        console.error('Token data decrypted successfully');
      }

      return decrypted;
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.error('Token file not found');
      }
    }
  } catch (error) {
    console.error('Error loading token data:', error);
    if (process.env.NODE_ENV === 'development') {
      console.error('Current working directory:', process.cwd());
    }

    throw new McpError(
      ErrorCode.InternalError,
      'Failed to load token data. The token file may be corrupted or encryption key may be invalid.'
    );
  }
  return null;
}

function saveTokenData(data: TokenData): void {
  try {
    const encryptedData = encryptData(data);
    fs.writeFileSync(TOKEN_STORE_PATH, JSON.stringify(encryptedData, null, 2));
    tokenData = data;
  } catch (error) {
    console.error('Error saving token data:', error);
    throw new McpError(
      ErrorCode.InternalError,
      'Failed to save token data. Please check if the encryption key is properly set.'
    );
  }
}

function generateAuthUrl(): { url: string; codeVerifier: string } {
  const { codeVerifier, codeChallenge } = generatePKCE();
  const authUrl = new URL('https://www.dropbox.com/oauth2/authorize');

  // During setup, use process.env directly
  const isSetup = process.argv[1]?.endsWith('setup.js');
  const clientId = isSetup ? process.env.DROPBOX_APP_KEY : validatedAppKey;

  authUrl.searchParams.append('client_id', clientId!);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('redirect_uri', 'http://localhost:3000/auth/callback');
  authUrl.searchParams.append('code_challenge', codeChallenge);
  authUrl.searchParams.append('code_challenge_method', 'S256');
  authUrl.searchParams.append('token_access_type', 'offline');
  return {
    url: authUrl.toString(),
    codeVerifier
  };
}

async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<TokenData> {
  try {
    // During setup, use process.env directly
    const isSetup = process.argv[1]?.endsWith('setup.js');
    const clientId = isSetup ? process.env.DROPBOX_APP_KEY : validatedAppKey;
    const clientSecret = isSetup ? process.env.DROPBOX_APP_SECRET : validatedAppSecret;

    const params = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: 'http://localhost:3000/auth/callback',
      code_verifier: codeVerifier
    });

    const response = await axios.post(
      'https://api.dropboxapi.com/oauth2/token',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const tokenData: TokenData = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: Date.now() + (response.data.expires_in * 1000),
      scope: response.data.scope.split(' '),
      codeVerifier // Store code verifier for token refresh
    };

    saveTokenData(tokenData);
    return tokenData;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Error exchanging code for tokens:', error.response?.data);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to exchange authorization code for tokens: ${error.response?.data?.error_description || error.message}`
      );
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error exchanging code for tokens:', errorMessage);
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to exchange authorization code for tokens: ${errorMessage}`
    );
  }
}

async function refreshAccessToken(): Promise<string> {
  if (!tokenData?.refreshToken) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'No refresh token available. Please complete authentication first by visiting the authorization URL.'
    );
  }

  // Check if we're within the retry cooldown period
  const now = Date.now();
  if (tokenData.lastRefreshAttempt &&
    (now - tokenData.lastRefreshAttempt) < TOKEN_REFRESH_CONFIG.retryDelay) {
    throw new TokenRefreshError(
      'Too many refresh attempts. Please wait before trying again.',
      'RATE_LIMIT',
      true
    );
  }

  // Update refresh attempt counters
  tokenData.lastRefreshAttempt = now;
  tokenData.refreshAttempts = (tokenData.refreshAttempts || 0) + 1;

  if (tokenData.refreshAttempts > TOKEN_REFRESH_CONFIG.maxRetries) {
    throw new TokenRefreshError(
      ERROR_MESSAGES.REFRESH_FAILED,
      'MAX_RETRIES_EXCEEDED',
      false
    );
  }

  try {
    const searchParams = new URLSearchParams({
      refresh_token: tokenData.refreshToken,
      grant_type: 'refresh_token',
      client_id: validatedAppKey,
      client_secret: validatedAppSecret
    });

    const response = await axios.post(
      'https://api.dropboxapi.com/oauth2/token',
      searchParams.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000 // 10 second timeout
      }
    );

    // Reset refresh attempt counters on success
    const newTokenData: TokenData = {
      ...tokenData,
      accessToken: response.data.access_token,
      expiresAt: Date.now() + (response.data.expires_in * 1000),
      refreshAttempts: 0,
      lastRefreshAttempt: undefined
    };

    saveTokenData(newTokenData);
    return newTokenData.accessToken;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error;
      const statusCode = axiosError.response?.status ?? 0;
      const errorData = axiosError.response?.data as { error?: string } | undefined;

      // Handle specific error cases
      if (statusCode === 401 && errorData?.error === 'invalid_grant') {
        throw new TokenRefreshError(
          ERROR_MESSAGES.INVALID_GRANT,
          'INVALID_GRANT',
          false
        );
      } else if (statusCode === 429) {
        throw new TokenRefreshError(
          ERROR_MESSAGES.RATE_LIMIT,
          'RATE_LIMIT',
          true
        );
      } else if (statusCode >= 500) {
        throw new TokenRefreshError(
          ERROR_MESSAGES.SERVER_ERROR,
          'SERVER_ERROR',
          true
        );
      } else if (!axiosError.response) {
        throw new TokenRefreshError(
          ERROR_MESSAGES.NETWORK_ERROR,
          'NETWORK_ERROR',
          true
        );
      }
    }

    // Generic error case
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new TokenRefreshError(
      `Token refresh failed: ${errorMessage}`,
      'UNKNOWN_ERROR',
      true
    );
  }
}

async function getValidAccessToken(): Promise<string> {
  if (!tokenData) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'No token data available. Please complete authentication first by visiting the authorization URL.'
    );
  }

  const refreshThreshold = TOKEN_REFRESH_CONFIG.thresholdMinutes * 60 * 1000;

  // Check if token is expired or will expire soon
  if (Date.now() >= (tokenData.expiresAt - refreshThreshold)) {
    console.log(ERROR_MESSAGES.TOKEN_EXPIRED);

    let retryCount = 0;
    while (retryCount < TOKEN_REFRESH_CONFIG.maxRetries) {
      try {
        return await refreshAccessToken();
      } catch (error: unknown) {
        if (error instanceof TokenRefreshError) {
          if (!error.retryable) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              error.message
            );
          }
          retryCount++;
          if (retryCount < TOKEN_REFRESH_CONFIG.maxRetries) {
            await new Promise(resolve =>
              setTimeout(resolve, TOKEN_REFRESH_CONFIG.retryDelay)
            );
            continue;
          }
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Token refresh failed after ${retryCount} attempts: ${errorMessage}`
        );
      }
    }

    throw new McpError(
      ErrorCode.InvalidRequest,
      ERROR_MESSAGES.REFRESH_FAILED
    );
  }

  return tokenData.accessToken;
}

export {
  generateAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getValidAccessToken,
  loadTokenData,
  saveTokenData,
  TokenData
};
