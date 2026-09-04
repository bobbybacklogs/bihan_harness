#!/usr/bin/env node
import { runServerCli } from './server.js';

runServerCli().catch((err) => {
  console.error('Bi-Han MCP Server error:', err);
  process.exit(1);
});
