import { EventEmitter } from 'events';
import { ModelHitch, runToolLoop } from 'modelhitch';
import { z } from 'zod';
import { Tool, ToolExecutionContext, AnyTool } from './tool.js';
import { InferenceAdapter, InferenceRequest, InferenceResponse } from './inference.js';

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  name?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string | Record<string, any>;
  }>;
  toolCallId?: string;
}

export type LanePreset = 'fast' | 'reasoning' | 'coding' | 'local' | 'cheap' | (string & {});

export interface AgentConfig {
  name: string;
  role?: string;
  instructions: string;
  model?: string;
  lane?: LanePreset;
  tools?: AnyTool[];
  maxTurns?: number;
  inference?: InferenceAdapter;
  bihan?: any;
}

export interface AgentRunResult {
  agent: string;
  final: any;
  content: string;
  turns: number;
  messages: AgentMessage[];
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface AgentRunStructuredResult<T = any> extends AgentRunResult {
  data: T;
}

export class Agent extends EventEmitter {
  public readonly name: string;
  public readonly role: string;
  public readonly instructions: string;
  public readonly model?: string;
  public readonly lane?: string;
  public readonly maxTurns: number;
  public readonly inference?: InferenceAdapter;
  private toolsMap: Map<string, AnyTool> = new Map();
  private bihan: any;

  constructor(config: AgentConfig) {
    super();
    this.name = config.name;
    this.role = config.role || 'General Sub-Agent';
    this.instructions = config.instructions;
    this.model = config.model;
    this.lane = config.lane;
    this.maxTurns = config.maxTurns ?? 12;
    this.inference = config.inference;
    this.bihan = config.bihan;

    if (config.tools) {
      for (const t of config.tools) {
        this.addTool(t);
      }
    }
  }

  addTool(tool: AnyTool): this {
    this.toolsMap.set(tool.name, tool);
    return this;
  }

  getTools(): AnyTool[] {
    return Array.from(this.toolsMap.values());
  }

  /**
   * Run the agent with a prompt or message array using ModelHitch tool-loop.
   */
  /**
   * Export this subagent as a standard Tool that any external harness can call.
   */
  asTool(options: { toolName?: string; description?: string } = {}): AnyTool {
    return new Tool({
      name: options.toolName || `invoke_${this.name}`,
      description:
        options.description ||
        `Delegate a task to the ${this.name} agent (${this.role}). It runs with specialized tools and returns a synthesized result.\n\nAgent Instructions: ${this.instructions}`,
      parameters: z.object({
        task: z.string().describe(`Specific instructions or question for the ${this.name} agent to solve`),
      }),
      execute: async ({ task }, context) => {
        const result = await this.run(task, {
          caller: context.agentName || 'ExternalHarness',
        });
        return result.content;
      },
    });
  }

  async run(
    input: string | AgentMessage[],
    options: {
      client?: any;
      inference?: InferenceAdapter;
      caller?: string;
      metadata?: Record<string, any>;
      onChunk?: (chunk: string) => void;
    } = {}
  ): Promise<AgentRunResult> {
    const client = options.client || this.bihan?.getClient() || new ModelHitch();

    const initialMessages: AgentMessage[] = [
      {
        role: 'system',
        content: `You are ${this.name}, a specialized agent acting as: ${this.role}.\n\nInstructions:\n${this.instructions}`,
      },
    ];

    if (typeof input === 'string') {
      initialMessages.push({ role: 'user', content: input });
    } else {
      initialMessages.push(...input);
    }

    const tools = this.getTools().map((t) => t.toModelHitch());

    const executeTool = async (name: string, rawArgs: any) => {
      const tool = this.toolsMap.get(name);
      if (!tool) {
        return JSON.stringify({ error: true, message: `Tool "${name}" not found on agent ${this.name}` });
      }

      const context: ToolExecutionContext = {
        agentName: this.name,
        caller: options.caller,
        metadata: options.metadata,
        bihan: this.bihan,
      };

      this.emit('tool_call', { agent: this.name, tool: name, args: rawArgs });
      const result = await tool.run(rawArgs, context);
      this.emit('tool_result', { agent: this.name, tool: name, result });
      return result;
    };

    const activeInference: InferenceAdapter | undefined =
      options.inference || this.inference || this.bihan?.getInference();

    // If a custom inference adapter (AGY, OpenAI, custom gateway) is provided:
    if (activeInference) {
      const messages: AgentMessage[] = [...initialMessages];
      let totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      let lastContent = '';
      let turns = 0;

      for (let turn = 1; turn <= this.maxTurns; turn++) {
        turns = turn;
        const response: InferenceResponse = await activeInference({
          messages,
          tools: tools.length > 0 ? tools : undefined,
          model: this.model,
          lane: this.lane,
          metadata: options.metadata,
        });

        if (response.usage) {
          totalUsage.inputTokens += response.usage.inputTokens ?? 0;
          totalUsage.outputTokens += response.usage.outputTokens ?? 0;
          totalUsage.totalTokens += response.usage.totalTokens ?? 0;
        }

        if (response.content) {
          lastContent = response.content;
          this.emit('chunk', { agent: this.name, text: response.content });
          if (options.onChunk) options.onChunk(response.content);
        }

        const assistantMsg: AgentMessage = {
          role: 'assistant',
          content: response.content || undefined,
          toolCalls: response.toolCalls,
        };
        messages.push(assistantMsg);

        this.emit('turn', { agent: this.name, turn, result: { message: assistantMsg } });

        // If no tool calls were made, the turn sequence is complete
        if (!response.toolCalls || response.toolCalls.length === 0) {
          break;
        }

        // Execute returned tool calls
        for (const call of response.toolCalls) {
          const output = await executeTool(call.name, call.arguments);
          this.emit('tool', { agent: this.name, turn, call, output });
          messages.push({
            role: 'tool',
            content: output,
            toolCallId: call.id,
          });
        }
      }

      return {
        agent: this.name,
        final: { message: { content: lastContent } },
        content: lastContent,
        turns,
        messages,
        usage: totalUsage,
      };
    }

    // Default: ModelHitch engine
    const requestPayload: any = {
      messages: initialMessages,
      tools: tools.length > 0 ? tools : undefined,
    };

    if (this.model) requestPayload.model = this.model;
    if (this.lane) requestPayload.lane = this.lane;

    let finalOutput = '';
    let runDoneData: any = null;

    for await (const event of runToolLoop(client, requestPayload, executeTool, {
      maxTurns: this.maxTurns,
    })) {
      if (event.type === 'chunk') {
        const chunk = event.chunk;
        if (chunk.type === 'text-delta' && chunk.text) {
          finalOutput += chunk.text;
          this.emit('chunk', { agent: this.name, text: chunk.text });
          if (options.onChunk) options.onChunk(chunk.text);
        }
      } else if (event.type === 'turn') {
        this.emit('turn', { agent: this.name, turn: event.turn, result: event.result });
      } else if (event.type === 'tool') {
        this.emit('tool', { agent: this.name, turn: event.turn, call: event.call, output: event.output });
      } else if (event.type === 'done') {
        runDoneData = event;
      }
    }

    const finalMessage = runDoneData?.final?.message?.content || finalOutput;

    return {
      agent: this.name,
      final: runDoneData?.final,
      content: typeof finalMessage === 'string' ? finalMessage : JSON.stringify(finalMessage),
      turns: runDoneData?.turns ?? 0,
      messages: runDoneData?.messages ?? [],
      usage: runDoneData?.usage ?? {},
    };
  }

  /**
   * Run the agent and enforce a strict structured output schema (Zod schema).
   * Automatically guides the model to return valid JSON and parses/validates the final output.
   */
  async runStructured<TSchema extends z.ZodTypeAny>(
    input: string | AgentMessage[],
    schema: TSchema,
    options: {
      client?: any;
      caller?: string;
      metadata?: Record<string, any>;
      maxParseAttempts?: number;
    } = {}
  ): Promise<AgentRunStructuredResult<z.infer<TSchema>>> {
    const jsonSchemaStr = JSON.stringify(
      (await import('zod-to-json-schema')).zodToJsonSchema(schema as any, { target: 'openApi3' }),
      null,
      2
    );

    const schemaInstruction = `\n\nCRITICAL REQUIREMENT: Your final response MUST be a single valid JSON object strictly matching this schema, without any conversational preamble or backticks:\n${jsonSchemaStr}`;

    const enrichedInput =
      typeof input === 'string'
        ? `${input}${schemaInstruction}`
        : [
            ...input,
            {
              role: 'user' as const,
              content: schemaInstruction,
            },
          ];

    const runResult = await this.run(enrichedInput, options);

    // Parse and validate data
    let parsed: any;
    try {
      const rawText = runResult.content.trim();
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
      parsed = JSON.parse(cleaned);
    } catch (err: any) {
      throw new Error(
        `Failed to parse structured output from agent "${this.name}". Raw output was:\n${runResult.content}\nError: ${err.message}`
      );
    }

    const validatedData = schema.parse(parsed);

    return {
      ...runResult,
      data: validatedData,
    };
  }
}
