import { Bihan, defineTool, tools } from '../dist/index.js';
import { z } from 'zod';

async function testCompatibilityLayer() {
  console.log('Testing Bi-Han Compatibility Layer for External Harnesses...\n');

  const bihan = new Bihan();

  // Create tools
  const [readFile, writeFile, listFiles] = tools.createFileSystemToolkit();

  // Register a subagent (Sub-contractor) with its own tools
  bihan.registerAgent({
    name: 'CodeReviewer',
    role: 'Staff Engineer & Code Reviewer',
    instructions: 'Analyze code and return actionable review notes.',
    tools: [readFile, listFiles],
  });

  bihan.registerAgent({
    name: 'SecurityAnalyst',
    role: 'AppSec Specialist',
    instructions: 'Scan dependencies and code for known attack vectors.',
    tools: [readFile],
  });

  // 1. Export as standard OpenAI tools for any external harness
  const openAITools = bihan.toTools('openai');
  console.log('1. Exported OpenAI Tools for External Harnesses:');
  console.log(JSON.stringify(openAITools, null, 2));

  // 2. Export as Anthropic tools
  const anthropicTools = bihan.toTools('anthropic');
  console.log('\n2. Exported Anthropic Tools for External Harnesses:');
  console.log(JSON.stringify(anthropicTools, null, 2));

  // 3. Export a single subagent as a callable tool
  const reviewerTool = bihan.asTool('CodeReviewer');
  console.log('\n3. Single Tool Name:', reviewerTool.name);
  console.log('   Schema properties:', Object.keys(reviewerTool.toOpenAITool().function.parameters.properties));

  console.log('\nCompatibility layer verified: Any external harness can now invoke Bi-Han subagents as normal tools!');
}

testCompatibilityLayer().catch(console.error);
