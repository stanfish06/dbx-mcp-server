"use strict";
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = exports.config = void 0;
exports.validateConfig = validateConfig;
var dotenv_1 = require("dotenv");
var winston_1 = require("winston");
var path_1 = require("path");
var fs_1 = require("fs");
var types_js_1 = require("@modelcontextprotocol/sdk/types.js");
var security_utils_js_1 = require("./security-utils.js");
// Load environment variables
dotenv_1.default.config();
// Required environment variables
var requiredEnvVars = [
    'DROPBOX_APP_KEY',
    'DROPBOX_APP_SECRET',
    'DROPBOX_REDIRECT_URI',
    'TOKEN_ENCRYPTION_KEY'
];
// Function to validate environment variables
function validateConfig() {
    for (var _i = 0, requiredEnvVars_1 = requiredEnvVars; _i < requiredEnvVars_1.length; _i++) {
        var envVar = requiredEnvVars_1[_i];
        if (!process.env[envVar]) {
            throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, "Missing required environment variable: ".concat(envVar));
        }
    }
}
// Skip validation during setup
var isSetup = (_a = process.argv[1]) === null || _a === void 0 ? void 0 : _a.endsWith('setup.js');
if (!isSetup) {
    validateConfig();
}
// Create logs directory if it doesn't exist
var logsDir = path_1.default.join(path_1.default.dirname(path_1.default.dirname(path_1.default.dirname(new URL(import.meta.url).pathname))), 'logs');
try {
    fs_1.default.mkdirSync(logsDir, { recursive: true });
}
catch (error) {
    var fsError = error;
    console.error('Failed to create logs directory:', fsError);
    throw new types_js_1.McpError(types_js_1.ErrorCode.InternalError, "Failed to create logs directory at ".concat(logsDir, ": ").concat(fsError.message));
}
// Configure Winston logger
var logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    defaultMeta: { service: 'dropbox-mcp-server' },
    transports: [
        // Error logs
        new winston_1.default.transports.File({
            filename: path_1.default.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // Combined logs
        new winston_1.default.transports.File({
            filename: path_1.default.join(logsDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
    ],
});
// Add console transport in development, but only for stderr
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston_1.default.transports.Console({
        format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple()),
        stderrLevels: ['error', 'warn', 'info', 'debug'], // Send all logs to stderr
    }));
}
// Configuration object
// Add required environment variables for safety features
var safetyEnvVars = [
    'DROPBOX_RECYCLE_BIN_PATH',
    'DROPBOX_MAX_DELETES_PER_DAY',
    'DROPBOX_RETENTION_DAYS',
    'DROPBOX_ALLOWED_PATHS',
    'DROPBOX_BLOCKED_PATHS'
];
// Validate safety environment variables with defaults
for (var _i = 0, safetyEnvVars_1 = safetyEnvVars; _i < safetyEnvVars_1.length; _i++) {
    var envVar = safetyEnvVars_1[_i];
    if (!process.env[envVar]) {
        switch (envVar) {
            case 'DROPBOX_RECYCLE_BIN_PATH':
                process.env[envVar] = '/.recycle_bin';
                break;
            case 'DROPBOX_MAX_DELETES_PER_DAY':
                process.env[envVar] = '100';
                break;
            case 'DROPBOX_RETENTION_DAYS':
                process.env[envVar] = '30';
                break;
            case 'DROPBOX_ALLOWED_PATHS':
                process.env[envVar] = '/';
                break;
            case 'DROPBOX_BLOCKED_PATHS':
                process.env[envVar] = '/.recycle_bin,/.system';
                break;
        }
        logger.warn("Using default value for ".concat(envVar, ": ").concat(process.env[envVar]));
    }
}
// Configure audit logging
var auditLogger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    defaultMeta: { service: 'dropbox-mcp-server-audit' },
    transports: [
        new winston_1.default.transports.File({
            filename: path_1.default.join(logsDir, 'audit.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        })
    ],
});
// Parse and decrypt the app secret if it's encrypted
var parseAppSecret = function () {
    var secret = process.env.DROPBOX_APP_SECRET;
    try {
        // Check if the secret is in JSON format (encrypted)
        var parsed = JSON.parse(secret);
        if (parsed.iv && parsed.encryptedData) {
            try {
                return (0, security_utils_js_1.decryptData)(parsed);
            }
            catch (decryptError) {
                console.error('Failed to decrypt app secret:', decryptError);
                throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, 'Failed to decrypt DROPBOX_APP_SECRET. You may need to run the setup script again.');
            }
        }
    }
    catch (e) {
        // If parsing fails, assume it's a plain secret
    }
    return secret;
};
exports.config = {
    dropbox: {
        appKey: process.env.DROPBOX_APP_KEY,
        appSecret: parseAppSecret(),
        redirectUri: process.env.DROPBOX_REDIRECT_URI,
        accessToken: process.env.DROPBOX_ACCESS_TOKEN,
    },
    security: {
        tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY,
        corsAllowedOrigins: ((_b = process.env.CORS_ALLOWED_ORIGINS) === null || _b === void 0 ? void 0 : _b.split(',')) || [],
    },
    tokens: {
        maxRetries: parseInt(process.env.MAX_TOKEN_REFRESH_RETRIES || '3', 10),
        retryDelay: parseInt(process.env.TOKEN_REFRESH_RETRY_DELAY_MS || '1000', 10),
        thresholdMinutes: parseInt(process.env.TOKEN_REFRESH_THRESHOLD_MINUTES || '5', 10),
    },
    paths: {
        tokenStore: path_1.default.join(process.cwd(), '.tokens.json'),
        logs: logsDir,
    },
    safety: {
        recycleBinPath: process.env.DROPBOX_RECYCLE_BIN_PATH,
        maxDeletesPerDay: parseInt(process.env.DROPBOX_MAX_DELETES_PER_DAY, 10),
        retentionDays: parseInt(process.env.DROPBOX_RETENTION_DAYS, 10),
        allowedPaths: process.env.DROPBOX_ALLOWED_PATHS.split(','),
        blockedPaths: process.env.DROPBOX_BLOCKED_PATHS.split(','),
    },
    logger: logger,
    auditLogger: auditLogger,
};
// Export logger separately for convenience
exports.log = exports.config.logger;
