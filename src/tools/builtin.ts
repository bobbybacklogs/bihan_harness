import { Tool } from '../tool.js';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';

const execAsync = promisify(exec);

export function createFileSystemToolkit(options: { baseDir?: string } = {}) {
  const baseDir = options.baseDir || process.cwd();

  const readFileTool = new Tool({
    name: 'read_file',
    description: 'Read the contents of a file within the workspace.',
    parameters: z.object({
      filePath: z.string().describe('Relative or absolute file path to read'),
      startLine: z.number().int().positive().optional().describe('Optional start line (1-based)'),
      endLine: z.number().int().positive().optional().describe('Optional end line (1-based)'),
    }),
    execute: async ({ filePath, startLine, endLine }) => {
      const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
      if (!fs.existsSync(resolved)) {
        return { error: true, message: `File not found: ${filePath}` };
      }
      const content = fs.readFileSync(resolved, 'utf8');
      if (startLine || endLine) {
        const lines = content.split('\n');
        const start = (startLine ?? 1) - 1;
        const end = endLine ?? lines.length;
        return lines.slice(start, end).join('\n');
      }
      return content;
    },
  });

  const writeFileTool = new Tool({
    name: 'write_file',
    description: 'Write or overwrite text to a file within the workspace.',
    parameters: z.object({
      filePath: z.string().describe('Target file path'),
      content: z.string().describe('Text content to write'),
    }),
    execute: async ({ filePath, content }) => {
      const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, content, 'utf8');
      return { success: true, path: filePath, bytesWritten: Buffer.byteLength(content, 'utf8') };
    },
  });

  const listFilesTool = new Tool({
    name: 'list_files',
    description: 'List files and directories in a directory.',
    parameters: z.object({
      dirPath: z.string().default('.').describe('Relative directory path to list'),
    }),
    execute: async ({ dirPath }) => {
      const resolved = path.isAbsolute(dirPath) ? dirPath : path.resolve(baseDir, dirPath);
      if (!fs.existsSync(resolved)) {
        return { error: true, message: `Directory not found: ${dirPath}` };
      }
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      return entries.map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        isFile: e.isFile(),
      }));
    },
  });

  return [readFileTool, writeFileTool, listFilesTool];
}

export function createShellToolkit(options: { baseDir?: string } = {}) {
  const baseDir = options.baseDir || process.cwd();

  const runCommandTool = new Tool({
    name: 'run_command',
    description: 'Execute a shell command and capture stdout/stderr.',
    parameters: z.object({
      command: z.string().describe('The command string to execute'),
      cwd: z.string().optional().describe('Working directory relative to workspace root'),
    }),
    execute: async ({ command, cwd }) => {
      const workingDir = cwd ? path.resolve(baseDir, cwd) : baseDir;
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: workingDir,
          maxBuffer: 1024 * 1024 * 5, // 5MB
        });
        return { success: true, stdout, stderr };
      } catch (err: any) {
        return {
          success: false,
          error: err.message,
          stdout: err.stdout,
          stderr: err.stderr,
          code: err.code,
        };
      }
    },
  });

  return [runCommandTool];
}

export function createMemoryToolkit() {
  const memoryStore = new Map<string, any>();

  const saveMemoryTool = new Tool({
    name: 'save_memory',
    description: 'Persist a key-value record in the agent scratchpad memory.',
    parameters: z.object({
      key: z.string().describe('Memory key/identifier'),
      value: z.any().describe('Value or object to remember'),
    }),
    execute: async ({ key, value }) => {
      memoryStore.set(key, value);
      return { saved: true, key };
    },
  });

  const getMemoryTool = new Tool({
    name: 'get_memory',
    description: 'Retrieve a key-value record from the agent scratchpad memory.',
    parameters: z.object({
      key: z.string().describe('Memory key to look up'),
    }),
    execute: async ({ key }) => {
      if (!memoryStore.has(key)) {
        return { found: false, message: `Key "${key}" does not exist in memory` };
      }
      return { found: true, key, value: memoryStore.get(key) };
    },
  });

  const listMemoryTool = new Tool({
    name: 'list_memory_keys',
    description: 'List all memory keys currently saved in the scratchpad.',
    parameters: z.object({}),
    execute: async () => {
      return Array.from(memoryStore.keys());
    },
  });

  return [saveMemoryTool, getMemoryTool, listMemoryTool];
}

export function createIceboxToolkit(icebox: any) {
  const freezeTool = new Tool({
    name: 'icebox_freeze',
    description:
      'Freeze large data, artifacts, code, or results into the shared Icebox memory instead of putting massive raw text in messages.',
    parameters: z.object({
      key: z.string().describe('Unique key to identify the frozen payload (e.g. "auth_flow_ast", "security_report")'),
      data: z.any().describe('The payload or object to store'),
    }),
    execute: async ({ key, data }, context) => {
      const entry = icebox.freeze(key, data, { frozenBy: context.agentName });
      return {
        frozen: true,
        key: entry.key,
        sizeBytes: entry.sizeBytes,
        frozenBy: entry.frozenBy,
        message: `Successfully frozen ${entry.sizeBytes} bytes into icebox key "${key}". Other subagents can thaw it using "icebox_thaw".`,
      };
    },
  });

  const thawTool = new Tool({
    name: 'icebox_thaw',
    description: 'Thaw (retrieve) data or artifacts stored in the shared Icebox by another subagent.',
    parameters: z.object({
      key: z.string().describe('The icebox key to retrieve'),
    }),
    execute: async ({ key }) => {
      const data = icebox.thaw(key);
      if (data === undefined) {
        return { found: false, message: `No data found in Icebox for key "${key}".` };
      }
      return data;
    },
  });

  const listIceboxTool = new Tool({
    name: 'icebox_list',
    description: 'List all items currently stored in the shared Icebox with size metadata without loading large contents.',
    parameters: z.object({}),
    execute: async () => {
      return icebox.list();
    },
  });

  return [freezeTool, thawTool, listIceboxTool];
}
