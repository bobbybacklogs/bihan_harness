import { Bihan, defineTool, tools } from '../dist/index.js';
import { z } from 'zod';

async function main() {
  console.log('🥋 Initializing Bi-Han Harness...\n');

  const bihan = new Bihan({
    maxSubagentDepth: 3,
  });

  // 1. Register specialized tools
  const [readFile, writeFile, listFiles] = tools.createFileSystemToolkit({ baseDir: process.cwd() });
  const [saveMemory, getMemory, listMemory] = tools.createMemoryToolkit();

  // Custom tool example
  const weatherTool = defineTool({
    name: 'check_conditions',
    description: 'Check environmental conditions of a realm or location',
    parameters: z.object({
      realm: z.string().describe('Name of the realm or city'),
    }),
    execute: async ({ realm }) => {
      return { realm, temperature: '-15°C', status: 'Sub-Zero blizzard active' };
    },
  });

  // 2. Register specialized Subagent (Sub-contractor)
  const scout = bihan.registerAgent({
    name: 'ScoutSubZero',
    role: 'Reconnaissance & Environment Specialist',
    instructions: 'You inspect environmental conditions and filesystem assets. Always report concise findings.',
    tools: [weatherTool, listFiles, readFile],
  });

  console.log('✅ Registered Subagent:', scout.name, 'with tools:', scout.getTools().map(t => t.name).join(', '));

  // 3. Listen to events
  bihan.on('subagent_dispatched', (e) => {
    console.log(`[DISPATCH] Grandmaster sent subagent: ${e.target} (depth ${e.depth})`);
  });

  bihan.on('tool_call', (e) => {
    console.log(`[TOOL_CALL] Agent: ${e.agent} -> Tool: ${e.tool}`);
  });

  bihan.on('subagent_completed', (e) => {
    console.log(`[COMPLETE] Subagent ${e.target} completed after ${e.turns} turns`);
  });

  // 4. Test tool schema export
  console.log('\n📦 Exported Tool Schema Example for ModelHitch:');
  console.log(JSON.stringify(weatherTool.toModelHitch(), null, 2));

  console.log('\n❄️ Bi-Han architecture verified and ready for live ModelHitch keys!');
}

main().catch(console.error);
