import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { z } from 'zod';
import { Tool, AnyTool } from './tool.js';

export interface StdioMcpServerOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  name?: string;
  version?: string;
}

export interface SseMcpServerOptions {
  url: string;
  name?: string;
  version?: string;
}

export interface McpBridgeResult {
  client: Client;
  tools: AnyTool[];
  close: () => Promise<void>;
}

/**
 * Connect to an external MCP (Model Context Protocol) server via stdio transport
 * and convert all exposed tools into native Bi-Han Tool instances.
 */
export async function connectMcpStdio(options: StdioMcpServerOptions): Promise<McpBridgeResult> {
  const cleanEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) cleanEnv[k] = v;
  }
  if (options.env) {
    Object.assign(cleanEnv, options.env);
  }

  const transport = new StdioClientTransport({
    command: options.command,
    args: options.args,
    env: cleanEnv,
  });

  const client = new Client(
    {
      name: options.name || 'bihan-mcp-client',
      version: options.version || '0.1.0',
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);

  const mcpToolsList = await client.listTools();
  const bihanTools: AnyTool[] = [];

  for (const mcpTool of mcpToolsList.tools) {
    // Wrap MCP tool into a native Bi-Han Tool instance
    const tool = new Tool({
      name: mcpTool.name,
      description: mcpTool.description || `MCP Tool: ${mcpTool.name}`,
      parameters: z.any(),
      execute: async (args: any) => {
        const result = await client.callTool({
          name: mcpTool.name,
          arguments: args,
        });

        // Format MCP content blocks into a cohesive result
        if (result.content && Array.isArray(result.content)) {
          const texts = result.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text);
          if (texts.length > 0) return texts.join('\n');
          return result.content;
        }

        return result;
      },
    });

    // Preserve the MCP input schema directly for ModelHitch / OpenAI format
    if (mcpTool.inputSchema) {
      tool.toOpenAITool = () => ({
        type: 'function',
        function: {
          name: mcpTool.name,
          description: mcpTool.description || `MCP Tool: ${mcpTool.name}`,
          parameters: mcpTool.inputSchema as Record<string, any>,
        },
      });

      tool.toAnthropicTool = () => ({
        name: mcpTool.name,
        description: mcpTool.description || `MCP Tool: ${mcpTool.name}`,
        input_schema: mcpTool.inputSchema as Record<string, any>,
      });
    }

    bihanTools.push(tool);
  }

  return {
    client,
    tools: bihanTools,
    close: async () => {
      await client.close();
    },
  };
}

/**
 * Connect to an external MCP server via SSE transport.
 */
export async function connectMcpSse(options: SseMcpServerOptions): Promise<McpBridgeResult> {
  const transport = new SSEClientTransport(new URL(options.url));

  const client = new Client(
    {
      name: options.name || 'bihan-mcp-client',
      version: options.version || '0.1.0',
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);

  const mcpToolsList = await client.listTools();
  const bihanTools: AnyTool[] = [];

  for (const mcpTool of mcpToolsList.tools) {
    const tool = new Tool({
      name: mcpTool.name,
      description: mcpTool.description || `MCP Tool: ${mcpTool.name}`,
      parameters: z.any(),
      execute: async (args: any) => {
        const result = await client.callTool({
          name: mcpTool.name,
          arguments: args,
        });

        if (result.content && Array.isArray(result.content)) {
          const texts = result.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text);
          if (texts.length > 0) return texts.join('\n');
          return result.content;
        }

        return result;
      },
    });

    if (mcpTool.inputSchema) {
      tool.toOpenAITool = () => ({
        type: 'function',
        function: {
          name: mcpTool.name,
          description: mcpTool.description || `MCP Tool: ${mcpTool.name}`,
          parameters: mcpTool.inputSchema as Record<string, any>,
        },
      });

      tool.toAnthropicTool = () => ({
        name: mcpTool.name,
        description: mcpTool.description || `MCP Tool: ${mcpTool.name}`,
        input_schema: mcpTool.inputSchema as Record<string, any>,
      });
    }

    bihanTools.push(tool);
  }

  return {
    client,
    tools: bihanTools,
    close: async () => {
      await client.close();
    },
  };
}
