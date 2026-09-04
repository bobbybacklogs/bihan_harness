import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Bihan } from './bihan.js';
import { tools } from './index.js';

export interface ActiveContract {
  contractId: string;
  subagentName: string;
  task: string;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  startTime: number;
  endTime?: number;
  result?: any;
  error?: string;
  turns?: number;
}

export function createBihanMcpServer(customBihan?: Bihan) {
  const bihan = customBihan || new Bihan({ autoProvideIcebox: true });

  // Register standard builtin subagents
  if (!bihan.getAgent('Scout')) {
    const [readFile, writeFile, listFiles] = tools.createFileSystemToolkit();
    bihan.registerAgent({
      name: 'Scout',
      role: 'File & Workspace Explorer',
      instructions: 'Explore workspace files and report structural findings concisely.',
      tools: [readFile, listFiles],
    });
  }

  if (!bihan.getAgent('Coder')) {
    const [readFile, writeFile, listFiles] = tools.createFileSystemToolkit();
    const [runCommand] = tools.createShellToolkit();
    bihan.registerAgent({
      name: 'Coder',
      role: 'Implementation & Refactoring Specialist',
      instructions: 'Perform edits, inspect source code, and run tests or verification commands.',
      tools: [readFile, writeFile, listFiles, runCommand],
    });
  }

  const contracts = new Map<string, ActiveContract>();

  const server = new Server(
    {
      name: 'bihan-mcp-server',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'bihan_list_contractors',
          description: 'List all available specialized sub-contractors (subagents) that can be hired to perform tasks.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'bihan_hire_subcontractor',
          description:
            'Hire a specialized sub-contractor (subagent) to execute a task with its own abundant toolset. Returns a contractId and synthesized outcome.',
          inputSchema: {
            type: 'object',
            properties: {
              contractor: {
                type: 'string',
                description: 'The name of the sub-contractor to hire (e.g.  Scout, Coder)',
              },
              task: {
                type: 'string',
                description: 'Clear, actionable instructions for the sub-contractor to perform',
              },
            },
            required: ['contractor', 'task'],
          },
        },
        {
          name: 'bihan_get_contract',
          description: 'Check the status, output, and execution history of a specific contract.',
          inputSchema: {
            type: 'object',
            properties: {
              contractId: {
                type: 'string',
                description: 'The unique contract ID returned from bihan_hire_subcontractor',
              },
            },
            required: ['contractId'],
          },
        },
        {
          name: 'bihan_cancel_contract',
          description: 'Cancel an active or pending sub-contractor contract.',
          inputSchema: {
            type: 'object',
            properties: {
              contractId: {
                type: 'string',
                description: 'The unique contract ID to cancel',
              },
            },
            required: ['contractId'],
          },
        },
        {
          name: 'bihan_freeze',
          description:
            'Store large data, ASTs, or artifacts into the shared Icebox state bus under a unique key without token bloat.',
          inputSchema: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'Identifier for the stored artifact in the Icebox',
              },
              data: {
                description: 'The data or object payload to freeze',
              },
            },
            required: ['key', 'data'],
          },
        },
        {
          name: 'bihan_thaw',
          description: 'Retrieve an artifact or data previously stored in the shared Icebox by key.',
          inputSchema: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'Identifier of the artifact in the Icebox',
              },
            },
            required: ['key'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // 🛡️ Petty check: Block Claude Desktop / Anthropic client signatures
    const clientMeta = (request.params as any)?._meta || {};
    const clientStr = JSON.stringify(clientMeta).toLowerCase();
    const envStr = JSON.stringify(process.env).toLowerCase();
    if (
      clientStr.includes('claude') ||
      clientStr.includes('anthropic') ||
      process.env.CLAUDE_DESKTOP ||
      process.env.ANTHROPIC_APP
    ) {
      return {
        content: [
          {
            type: 'text',
            text: 'Access Denied: Bi-Han Sub-Zero protocol is exclusively reserved for Gemini / AGY and OpenAI / Codex environments. Scorpion sends his regards.',
          },
        ],
        isError: true,
      };
    }

    const { name, arguments: args } = request.params;

    try {
      if (name === 'bihan_list_contractors') {
        const list = bihan.getAgents().map((a) => ({
          name: a.name,
          role: a.role,
          instructions: a.instructions,
          tools: a.getTools().map((t) => t.name),
        }));
        return {
          content: [{ type: 'text', text: JSON.stringify(list, null, 2) }],
        };
      }

      if (name === 'bihan_hire_subcontractor') {
        const contractorName = (args as any)?.contractor;
        const task = (args as any)?.task;

        const agent = bihan.getAgent(contractorName);
        if (!agent) {
          const available = bihan.getAgents().map((a) => a.name).join(', ');
          return {
            content: [
              {
                type: 'text',
                text: `Error: Contractor "${contractorName}" not found. Available: ${available}`,
              },
            ],
            isError: true,
          };
        }

        const contractId = 'cnt_' + Math.random().toString(36).substring(2, 9);
        const contract: ActiveContract = {
          contractId,
          subagentName: contractorName,
          task,
          status: 'running',
          startTime: Date.now(),
        };
        contracts.set(contractId, contract);

        try {
          const result = await agent.run(task, {
            caller: 'BihanMcpServer',
          });

          contract.status = 'completed';
          contract.endTime = Date.now();
          contract.result = result.content;
          contract.turns = result.turns;

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    contractId,
                    contractor: contractorName,
                    status: 'completed',
                    turns: result.turns,
                    result: result.content,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (execErr: any) {
          contract.status = 'failed';
          contract.endTime = Date.now();
          contract.error = execErr.message;
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ contractId, status: 'failed', error: execErr.message }, null, 2),
              },
            ],
            isError: true,
          };
        }
      }

      if (name === 'bihan_get_contract') {
        const contractId = (args as any)?.contractId;
        const contract = contracts.get(contractId);
        if (!contract) {
          return {
            content: [{ type: 'text', text: `Contract "${contractId}" not found.` }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(contract, null, 2) }],
        };
      }

      if (name === 'bihan_cancel_contract') {
        const contractId = (args as any)?.contractId;
        const contract = contracts.get(contractId);
        if (!contract) {
          return {
            content: [{ type: 'text', text: `Contract "${contractId}" not found.` }],
            isError: true,
          };
        }
        contract.status = 'cancelled';
        contract.endTime = Date.now();
        return {
          content: [{ type: 'text', text: `Contract "${contractId}" has been cancelled.` }],
        };
      }

      if (name === 'bihan_freeze') {
        const key = (args as any)?.key;
        const data = (args as any)?.data;
        const entry = bihan.icebox.freeze(key, data, { frozenBy: 'mcp-caller' });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  frozen: true,
                  key: entry.key,
                  sizeBytes: entry.sizeBytes,
                  message: `Payload successfully frozen into Icebox under key "${key}" (${entry.sizeBytes} bytes).`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === 'bihan_thaw') {
        const key = (args as any)?.key;
        const value = bihan.icebox.thaw(key);
        if (value === undefined) {
          return {
            content: [{ type: 'text', text: `No item found in Icebox under key "${key}".` }],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
            },
          ],
        };
      }

      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Tool error: ${err.message}` }],
        isError: true,
      };
    }
  });

  return {
    server,
    bihan,
    startStdio: async () => {
      const transport = new StdioServerTransport();
      await server.connect(transport);
    },
  };
}

export async function runServerCli() {
  const { startStdio } = createBihanMcpServer();
  await startStdio();
}
