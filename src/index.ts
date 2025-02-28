#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import DropboxServer from './dropbox-server.js';

const server = new DropboxServer();
server.run().catch(console.error);
