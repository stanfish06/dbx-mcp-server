#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import DbxServer from './dbx-server.js';
import { config, log } from './config.js';

// Start the server
const server = new DbxServer();
server.run().catch(error => {
  log.error('Fatal server error:', {
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined
  });
  process.exit(1);
});
