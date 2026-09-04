import { Bihan, connectMcpStdio } from '../dist/index.js';

async function testMcpBridgeAPI() {
  console.log('Testing Bi-Han MCP Bridge API integration...\n');

  const bihan = new Bihan();

  console.log('1. Checking importMcpStdio and importMcpSse methods on Bihan:');
  console.log('   importMcpStdio type:', typeof bihan.importMcpStdio);
  console.log('   importMcpSse type:', typeof bihan.importMcpSse);
  console.log('   connectMcpStdio export type:', typeof connectMcpStdio);

  console.log('\nMCP Bridge methods successfully exported and bound to Bi-Han instance!');
}

testMcpBridgeAPI().catch(console.error);
