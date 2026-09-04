import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export interface ToolExecutionContext {
  agentName: string;
  caller?: string;
  metadata?: Record<string, any>;
  bihan: any;
}

export interface ToolDefinition<TParams extends z.ZodTypeAny = z.ZodTypeAny, TResult = any> {
  name: string;
  description: string;
  parameters: TParams;
  execute: (args: z.infer<TParams>, context: ToolExecutionContext) => Promise<TResult> | TResult;
}

export interface ModelHitchTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export type AnyTool = Tool<any, any>;

export class Tool<TParams extends z.ZodTypeAny = any, TResult = any> {
  public readonly name: string;
  public readonly description: string;
  public readonly schema: TParams;
  private readonly handler: (args: z.infer<TParams>, context: ToolExecutionContext) => Promise<TResult> | TResult;

  constructor(definition: ToolDefinition<TParams, TResult>) {
    this.name = definition.name;
    this.description = definition.description;
    this.schema = definition.parameters;
    this.handler = definition.execute;
  }

  toModelHitch(): ModelHitchTool {
    return this.toOpenAITool();
  }

  /**
   * Export as standard OpenAI / OpenAI-compatible tool definition
   */
  toOpenAITool(): {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, any>;
    };
  } {
    const rawSchema = (zodToJsonSchema(this.schema as any, { target: 'openApi3' }) as any) || {};
    delete rawSchema['$schema'];
    const cleanSchema = rawSchema;
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: cleanSchema?.properties ? cleanSchema : { type: 'object', properties: {} },
      },
    };
  }

  /**
   * Export as Anthropic tool definition
   */
  toAnthropicTool(): {
    name: string;
    description: string;
    input_schema: Record<string, any>;
  } {
    const rawSchema = (zodToJsonSchema(this.schema as any, { target: 'openApi3' }) as any) || {};
    delete rawSchema['$schema'];
    return {
      name: this.name,
      description: this.description,
      input_schema: rawSchema?.properties ? rawSchema : { type: 'object', properties: {} },
    };
  }

  /**
   * Direct execution for external harnesses without requiring bihan context
   */
  async execute(rawArgs: any): Promise<any> {
    return this.run(rawArgs, {
      agentName: 'ExternalHarness',
      bihan: undefined,
    });
  }

  async run(rawArgs: any, context: ToolExecutionContext): Promise<any> {
    try {
      const parsedArgs = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
      const validatedArgs = this.schema.parse(parsedArgs || {});
      const result = await this.handler(validatedArgs, context);
      return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    } catch (error: any) {
      return JSON.stringify({
        error: true,
        tool: this.name,
        message: error?.message || String(error),
      });
    }
  }
}

export function defineTool<TParams extends z.ZodTypeAny, TResult = any>(
  definition: ToolDefinition<TParams, TResult>
): Tool<TParams, TResult> {
  return new Tool(definition);
}
