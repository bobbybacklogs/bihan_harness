import { EventEmitter } from 'events';
import { ModelHitch } from 'modelhitch';
import { z } from 'zod';
import { Agent, AgentConfig, AgentRunResult, LanePreset } from './agent.js';
import { Tool, ToolDefinition, defineTool, AnyTool } from './tool.js';
import { Icebox } from './icebox.js';
import { createIceboxToolkit } from './tools/builtin.js';
import { InferenceAdapter } from './inference.js';
import {
  connectMcpStdio,
  connectMcpSse,
  StdioMcpServerOptions,
  SseMcpServerOptions,
  McpBridgeResult,
} from './mcp.js';

export interface BihanOptions {
  client?: any;
  inference?: InferenceAdapter;
  defaultModel?: string;
  defaultLane?: LanePreset;
  maxSubagentDepth?: number;
  autoProvideIcebox?: boolean;
  lanePresets?: Record<string, string>;
}

export const DEFAULT_LANE_PRESETS: Record<string, string> = {
  fast: 'fast',
  reasoning: 'reasoning',
  coding: 'coding',
  local: 'local',
  cheap: 'cheap',
};

export class Bihan extends EventEmitter {
  private client: any;
  private inference?: InferenceAdapter;
  public readonly defaultModel?: string;
  public readonly defaultLane?: LanePreset;
  public readonly maxSubagentDepth: number;
  public readonly icebox: Icebox;
  private lanePresets: Map<string, string> = new Map();
  private agents: Map<string, Agent> = new Map();
  private sharedTools: Map<string, AnyTool> = new Map();

  constructor(options: BihanOptions = {}) {
    super();
    this.client = options.client || new ModelHitch();
    this.inference = options.inference;
    this.defaultModel = options.defaultModel;
    this.defaultLane = options.defaultLane;
    this.maxSubagentDepth = options.maxSubagentDepth ?? 4;
    this.icebox = new Icebox();

    // Configure lane presets
    const mergedPresets = { ...DEFAULT_LANE_PRESETS, ...(options.lanePresets || {}) };
    for (const [preset, laneValue] of Object.entries(mergedPresets)) {
      this.lanePresets.set(preset, laneValue);
    }

    // Automatically provide icebox tools to shared tools if enabled (default true)
    if (options.autoProvideIcebox !== false) {
      for (const t of createIceboxToolkit(this.icebox)) {
        this.registerTool(t);
      }
    }
  }

  /**
   * Configure or map a custom lane preset (e.g. 'fast' -> 'groq-llama')
   */
  setLanePreset(presetName: string, laneOrModel: string): this {
    this.lanePresets.set(presetName, laneOrModel);
    return this;
  }

  resolveLane(presetOrLane?: string): string | undefined {
    if (!presetOrLane) return undefined;
    return this.lanePresets.get(presetOrLane) || presetOrLane;
  }

  getClient(): any {
    return this.client;
  }

  getInference(): InferenceAdapter | undefined {
    return this.inference;
  }

  setInference(inference?: InferenceAdapter): this {
    this.inference = inference;
    return this;
  }

  /**
   * Register a custom tool into the shared toolkit
   */
  registerTool(toolOrDef: ToolDefinition<any, any> | AnyTool): this {
    const tool = toolOrDef instanceof Tool ? toolOrDef : defineTool(toolOrDef);
    this.sharedTools.set(tool.name, tool);
    return this;
  }

  getTool(name: string): AnyTool | undefined {
    return this.sharedTools.get(name);
  }

  getSharedTools(): AnyTool[] {
    return Array.from(this.sharedTools.values());
  }

  /**
   * Connect to an MCP server (via stdio) and register all its tools into Bi-Han
   */
  async importMcpStdio(options: StdioMcpServerOptions): Promise<McpBridgeResult> {
    const bridge = await connectMcpStdio(options);
    for (const tool of bridge.tools) {
      this.registerTool(tool);
    }
    return bridge;
  }

  /**
   * Connect to an MCP server (via SSE) and register all its tools into Bi-Han
   */
  async importMcpSse(options: SseMcpServerOptions): Promise<McpBridgeResult> {
    const bridge = await connectMcpSse(options);
    for (const tool of bridge.tools) {
      this.registerTool(tool);
    }
    return bridge;
  }

  /**
   * Define or register a subagent (Sub-contractor)
   */
  registerAgent(config: AgentConfig): Agent {
    const rawLane = config.lane || this.defaultLane;
    const resolvedLane = this.resolveLane(rawLane);

    const agent = new Agent({
      ...config,
      model: config.model || this.defaultModel,
      lane: resolvedLane,
      bihan: this,
    });

    this.agents.set(agent.name, agent);

    // Bubble agent events up to the master orchestrator
    agent.on('chunk', (data) => this.emit('chunk', data));
    agent.on('turn', (data) => this.emit('turn', data));
    agent.on('tool_call', (data) => this.emit('tool_call', data));
    agent.on('tool_result', (data) => this.emit('tool_result', data));

    return agent;
  }

  getAgent(name: string): Agent | undefined {
    return this.agents.get(name);
  }

  getAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Compatibility Layer: Export a specific registered subagent as a standard tool
   * for external harnesses that don't have subagent support.
   */
  asTool(agentName: string, options: { toolName?: string; description?: string } = {}): AnyTool {
    const agent = this.getAgent(agentName);
    if (!agent) {
      throw new Error(`Cannot export subagent "${agentName}": Agent is not registered.`);
    }
    return agent.asTool(options);
  }

  /**
   * Compatibility Layer: Export ALL registered subagents as an array of standard tools
   * ready to be fed into any harness (OpenAI, Anthropic, Vercel AI SDK, LangChain, etc.).
   */
  toTools(format: 'bihan' | 'openai' | 'anthropic' = 'bihan'): any[] {
    const tools = this.getAgents().map((agent) => agent.asTool());
    if (format === 'openai') {
      return tools.map((t) => t.toOpenAITool());
    }
    if (format === 'anthropic') {
      return tools.map((t) => t.toAnthropicTool());
    }
    return tools;
  }

  /**
   * Compatibility Layer: Direct dispatcher for external harnesses.
   * When an external harness receives a tool call for an exported subagent,
   * pass the tool name and arguments here to execute the subagent.
   */
  async dispatch(toolNameOrAgentName: string, rawArgs: any): Promise<string> {
    const agentName = toolNameOrAgentName.startsWith('invoke_')
      ? toolNameOrAgentName.replace('invoke_', '')
      : toolNameOrAgentName;

    const agent = this.getAgent(agentName);
    if (!agent) {
      return JSON.stringify({ error: true, message: `Subagent "${agentName}" not found.` });
    }

    const tool = agent.asTool();
    return tool.execute(rawArgs);
  }

  /**
   * Helper to create the meta-tool that allows an agent to invoke any subagent.
   */
  createSubagentDelegationTool(options: { allowedAgents?: string[]; currentDepth?: number } = {}): AnyTool {
    const currentDepth = options.currentDepth ?? 0;

    return defineTool({
      name: 'invoke_subagent',
      description:
        'Delegate a task to a specialized subagent (sub-contractor). The subagent executes its own tool-calling loop and returns a synthesized result.',
      parameters: z.object({
        subagentName: z.string().describe('The name of the registered subagent to invoke'),
        prompt: z.string().describe('Clear, actionable instructions and context for the subagent to fulfill'),
      }),
      execute: async ({ subagentName, prompt }, context) => {
        if (currentDepth >= this.maxSubagentDepth) {
          return {
            error: true,
            message: `Max subagent delegation depth reached (${this.maxSubagentDepth}). Cannot invoke ${subagentName}.`,
          };
        }

        if (options.allowedAgents && !options.allowedAgents.includes(subagentName)) {
          return {
            error: true,
            message: `Subagent "${subagentName}" is not allowed. Available subagents: ${options.allowedAgents.join(', ')}`,
          };
        }

        const agent = this.getAgent(subagentName);
        if (!agent) {
          return {
            error: true,
            message: `Subagent "${subagentName}" is not registered. Available: ${Array.from(this.agents.keys()).join(', ')}`,
          };
        }

        this.emit('subagent_dispatched', {
          caller: context.agentName,
          target: subagentName,
          depth: currentDepth + 1,
        });

        const result: AgentRunResult = await agent.run(prompt, {
          client: this.client,
          caller: context.agentName,
          metadata: { depth: currentDepth + 1 },
        });

        this.emit('subagent_completed', {
          caller: context.agentName,
          target: subagentName,
          turns: result.turns,
        });

        return {
          agent: subagentName,
          result: result.content,
          turns: result.turns,
          tokens: result.usage,
        };
      },
    });
  }

  /**
   * Run a top-level task using an orchestrator agent, giving it access to subagent delegation
   */
  async runTask(
    instructions: string,
    options: {
      orchestratorName?: string;
      model?: string;
      lane?: string;
      tools?: AnyTool[];
      inference?: InferenceAdapter;
    } = {}
  ): Promise<AgentRunResult> {
    const orchestratorName = options.orchestratorName || 'Grandmaster';

    const subagentTool = this.createSubagentDelegationTool();
    const tools = [subagentTool, ...(options.tools || this.getSharedTools())];

    const orchestrator = new Agent({
      name: orchestratorName,
      role: 'Master Orchestrator',
      instructions:
        'You are the Master Orchestrator (Grandmaster). Break down complex tasks into subtasks and delegate to specialized subagents using the invoke_subagent tool. Synthesize their outputs into a final complete answer.',
      model: options.model || this.defaultModel,
      lane: options.lane || this.defaultLane,
      inference: options.inference || this.inference,
      tools,
      bihan: this,
    });

    return orchestrator.run(instructions);
  }
}
