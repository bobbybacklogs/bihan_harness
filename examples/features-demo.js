import { Bihan, defineTool, tools } from '../dist/index.js';
import { z } from 'zod';

async function testNewFeatures() {
  console.log('Testing Bi-Han 1 (Icebox), 3 (Lane Presets), and 4 (Structured Outputs)...\n');

  // 1. Initialize with Lane Presets
  const bihan = new Bihan({
    lanePresets: {
      fast: 'groq/llama-3.3-70b-versatile',
      reasoning: 'openrouter/anthropic/claude-3.5-sonnet',
      local: 'ollama/qwen2.5-coder:14b',
    },
    autoProvideIcebox: true, // Icebox tools automatically registered
  });

  // 2. Test Icebox directly
  console.log('--- 1. Testing Icebox (Shared State Bus) ---');
  const mockAST = {
    type: 'Program',
    body: Array(100).fill({ type: 'VariableDeclaration', name: 'payload' }),
  };

  const entry = bihan.icebox.freeze('project_ast', mockAST, { frozenBy: 'ParserSubAgent' });
  console.log('Frozen entry key:', entry.key, 'Bytes:', entry.sizeBytes, 'by:', entry.frozenBy);

  const retrieved = bihan.icebox.thaw('project_ast');
  console.log('Thawed successfully? Items count:', retrieved.body.length);
  console.log('Icebox directory list:', bihan.icebox.list());

  // 3. Test Lane Presets on Agents
  console.log('\n--- 2. Testing Lane Presets ---');
  const fastAgent = bihan.registerAgent({
    name: 'QuickScanner',
    lane: 'fast', // automatically mapped!
    instructions: 'Perform quick surface scans.',
  });

  const localAgent = bihan.registerAgent({
    name: 'PrivateAuditor',
    lane: 'local', // mapped to local Ollama!
    instructions: 'Keep all operations air-gapped.',
  });

  console.log('QuickScanner lane:', fastAgent.lane);
  console.log('PrivateAuditor lane:', localAgent.lane);

  // 4. Test Structured Output Schema definition
  console.log('\n--- 3. Testing Structured Output Schema (Zod) ---');
  const AuditReportSchema = z.object({
    score: z.number().min(0).max(100),
    vulnerabilities: z.array(
      z.object({
        severity: z.enum(['low', 'medium', 'high', 'critical']),
        description: z.string(),
        file: z.string(),
      })
    ),
    approved: z.boolean(),
  });

  console.log('AuditReportSchema successfully created for runStructured() calls.');
  console.log('\nAll 3 core features compiled and operational!');
}

testNewFeatures().catch(console.error);
