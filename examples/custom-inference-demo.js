import { Bihan, defineTool } from '../dist/index.js';
import { z } from 'zod';

async function testCustomInference() {
  console.log('Testing Bi-Han with Custom Inference Adapter (e.g. AGY, OpenAI, or In-House)...\n');

  // Simulate a custom inference engine (e.g., AGY / Vertex / Local Gateway)
  let callCount = 0;
  const customAGYInference = async (req) => {
    callCount++;
    console.log(`[CustomEngine] Turn ${callCount} received ${req.messages.length} messages and ${req.tools?.length || 0} tools`);

    // Turn 1: Call the calculate tool
    if (callCount === 1) {
      return {
        content: 'Let me run the numbers using the calculation tool.',
        toolCalls: [
          {
            id: 'call_123',
            name: 'calculate',
            arguments: JSON.stringify({ a: 40, b: 2 }),
          },
        ],
      };
    }

    // Turn 2: Synthesize answer after tool response
    return {
      content: 'The calculated result is 42. Calculation confirmed.',
      usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
    };
  };

  const bihan = new Bihan({
    inference: customAGYInference, // Plugged in directly!
  });

  const calcTool = defineTool({
    name: 'calculate',
    description: 'Add two numbers',
    parameters: z.object({ a: z.number(), b: z.number() }),
    execute: async ({ a, b }) => ({ result: a + b }),
  });

  const worker = bihan.registerAgent({
    name: 'MathOperative',
    role: 'Precision Math Agent',
    instructions: 'Compute values using the calculate tool.',
    tools: [calcTool],
  });

  console.log('Running agent with custom inference engine...');
  const result = await worker.run('What is 40 + 2?');

  console.log('\nAgent Result Content:', result.content);
  console.log('Turns taken:', result.turns);
  console.log('Usage stats:', result.usage);
  console.log('\nCustom inference integration verified successfully!');
}

testCustomInference().catch(console.error);
