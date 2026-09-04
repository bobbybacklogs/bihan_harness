import { AgentMessage } from './agent.js';
import { ModelHitchTool } from './tool.js';

export interface InferenceToolCall {
  id: string;
  name: string;
  arguments: string | Record<string, any>;
}

export interface InferenceRequest {
  messages: AgentMessage[];
  tools?: ModelHitchTool[];
  model?: string;
  lane?: string;
  temperature?: number;
  metadata?: Record<string, any>;
}

export interface InferenceResponse {
  content?: string | null;
  toolCalls?: InferenceToolCall[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export type InferenceHandler = (
  request: InferenceRequest
) => Promise<InferenceResponse>;

export type StreamInferenceChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; toolCall: InferenceToolCall }
  | { type: 'usage'; usage: InferenceResponse['usage'] };

export type StreamInferenceHandler = (
  request: InferenceRequest
) => AsyncIterable<StreamInferenceChunk>;

export type InferenceAdapter = InferenceHandler;
