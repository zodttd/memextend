// packages/adapters/cursor/src/mcp/server.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';

import { SQLiteStorage, SQLiteVecStorage, MemoryRetriever, createEmbedFunction, formatContextForInjection, getProjectId } from '@memextend/core';

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');
const VECTORS_PATH = join(MEMEXTEND_DIR, 'vectors');
const MODELS_PATH = join(MEMEXTEND_DIR, 'models');

// Lazy-loaded storage instances
let sqlite: SQLiteStorage | null = null;
let vectorStore: SQLiteVecStorage | null = null;
let retriever: MemoryRetriever | null = null;
let embedder: Awaited<ReturnType<typeof createEmbedFunction>> | null = null;

async function getStorage(): Promise<{
  sqlite: SQLiteStorage;
  vectorStore: SQLiteVecStorage;
  retriever: MemoryRetriever;
  embedder: Awaited<ReturnType<typeof createEmbedFunction>>;
}> {
  if (!sqlite || !vectorStore || !retriever || !embedder) {
    if (!existsSync(DB_PATH)) {
      throw new Error('memextend not initialized. Run `memextend init` first.');
    }

    sqlite = new SQLiteStorage(DB_PATH);
    vectorStore = await SQLiteVecStorage.create(VECTORS_PATH);
    embedder = await createEmbedFunction(MODELS_PATH);
    retriever = new MemoryRetriever(sqlite, vectorStore, embedder.embedQuery);
  }

  return { sqlite, vectorStore, retriever, embedder };
}

/**
 * Get current workspace from environment or cwd
 */
function getCurrentWorkspace(): string {
  // Cursor may set these environment variables
  return process.env.CURSOR_WORKSPACE_PATH ||
         process.env.VSCODE_WORKSPACE_PATH ||
         process.env.PWD ||
         process.cwd();
}

// Version injected at build time by esbuild
declare const MEMEXTEND_VERSION: string;

const server = new Server(
  {
    name: 'memextend',
    version: MEMEXTEND_VERSION,
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'memextend_search',
        description: 'Search through your memories. Use this to: (1) recall past work, decisions, patterns, or context, (2) understand project history and previous approaches, (3) debug issues by finding related past attempts and solutions, (4) get context when returning to a project. Always search before asking the user about project history.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query - natural language works best (e.g., "Redis caching setup", "authentication patterns")',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 5, max: 20)',
            },
            project_only: {
              type: 'boolean',
              description: 'Only search within current project (default: false)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'memextend_save',
        description: 'Save a memory for this project. Use this when the user asks you to "memorize", "remember", "memextend save", or save something to memory. Use this to remember important decisions, architectural patterns, code conventions, or context that should persist across sessions. Manual saves are never automatically deleted.',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The memory content to save - be descriptive and include relevant context',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional tags for categorization (e.g., ["architecture", "decision"])',
            },
          },
          required: ['content'],
        },
      },
      {
        name: 'memextend_save_global',
        description: 'Save a global preference or fact that applies across ALL projects (e.g., coding style preferences, common patterns you use).',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The preference or fact to remember globally',
            },
            type: {
              type: 'string',
              enum: ['preference', 'pattern', 'fact'],
              description: 'Type of global memory: preference (coding style), pattern (reusable approach), fact (general info)',
            },
          },
          required: ['content', 'type'],
        },
      },
      {
        name: 'memextend_recall',
        description: 'Get recent context for the current project. Call this at the start of a session to recall what you worked on previously.',
        inputSchema: {
          type: 'object',
          properties: {
            days: {
              type: 'number',
              description: 'Number of days to look back (default: 7)',
            },
            include_global: {
              type: 'boolean',
              description: 'Include global preferences (default: true)',
            },
          },
        },
      },
      {
        name: 'memextend_forget',
        description: 'Delete a specific memory by ID. Use with caution.',
        inputSchema: {
          type: 'object',
          properties: {
            memoryId: {
              type: 'string',
              description: 'The ID of the memory to delete',
            },
          },
          required: ['memoryId'],
        },
      },
      {
        name: 'memextend_status',
        description: 'Get memextend status and memory statistics for the current project.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// List resources (provides context about the memory system)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'memextend://context',
        name: 'Session Context',
        description: 'Recent memories and preferences for context injection',
        mimeType: 'text/plain',
      },
      {
        uri: 'memextend://status',
        name: 'Memory Status',
        description: 'Current memory database status',
        mimeType: 'application/json',
      },
    ],
  };
});

// Read resources
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    const { sqlite, retriever } = await getStorage();
    const workspace = getCurrentWorkspace();
    const projectId = getProjectId(workspace);

    if (uri === 'memextend://context') {
      const context = await retriever.getContextForSession(projectId, {
        includeGlobal: true
      });

      const formatted = formatContextForInjection(context);

      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: formatted,
          },
        ],
      };
    }

    if (uri === 'memextend://status') {
      const memoryCount = sqlite.getMemoryCount();

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              initialized: true,
              memoryCount,
              projectId,
              workspace,
            }, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown resource: ${uri}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: `Error: ${message}`,
        },
      ],
    };
  }
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const workspace = getCurrentWorkspace();
    const projectId = getProjectId(workspace);

    switch (name) {
      case 'memextend_search': {
        const { retriever, sqlite } = await getStorage();
        const query = args?.query as string;
        const limit = Math.min((args?.limit as number) ?? 5, 20);
        const projectOnly = args?.project_only as boolean ?? false;

        const results = await retriever.hybridSearch(query, {
          limit,
          projectId: projectOnly ? projectId : undefined,
        });

        if (results.length === 0) {
          return { content: [{ type: 'text', text: 'No memories found matching your query. Try different keywords or broader terms.' }] };
        }

        const formatted = results.map((r, i) => {
          const date = new Date(r.memory.createdAt).toLocaleDateString();
          const projectInfo = r.memory.projectId === projectId ? '[this project]' : '[other project]';
          const preview = r.memory.content.split('\n').slice(0, 3).join('\n');
          return `${i + 1}. ${projectInfo} [${date}] (relevance: ${(r.score * 100).toFixed(0)}%)\nID: ${r.memory.id}\n${preview}`;
        }).join('\n\n---\n\n');

        return { content: [{ type: 'text', text: `Found ${results.length} memories:\n\n${formatted}` }] };
      }

      case 'memextend_save': {
        const { sqlite, vectorStore, embedder } = await getStorage();
        const content = args?.content as string;
        const tags = args?.tags as string[] ?? [];

        if (!content || content.length < 10) {
          return { content: [{ type: 'text', text: 'Memory content too short. Please provide more context (at least 10 characters).' }], isError: true };
        }
        if (content.length > 50000) {
          return { content: [{ type: 'text', text: 'Memory content too long (maximum 50KB).' }], isError: true };
        }

        // Ensure project is registered
        const project = sqlite.getProject(projectId);
        if (!project) {
          sqlite.insertProject({
            id: projectId,
            name: basename(workspace),
            path: workspace,
            createdAt: new Date().toISOString()
          });
        }

        const memoryId = randomUUID();
        const memoryContent = tags.length > 0 ? `[Tags: ${tags.join(', ')}]\n${content}` : content;

        sqlite.insertMemory({
          id: memoryId,
          projectId,
          content: memoryContent,
          type: 'manual',
          sourceTool: null,
          createdAt: new Date().toISOString(),
          sessionId: null,
          metadata: tags.length > 0 ? { tags } : null,
        });

        const vector = await embedder.embed(content);
        await vectorStore.insertVector(memoryId, vector);

        return { content: [{ type: 'text', text: `Memory saved successfully!\nID: ${memoryId}\nProject: ${basename(workspace)}` }] };
      }

      case 'memextend_save_global': {
        const { sqlite } = await getStorage();
        const content = args?.content as string;
        const type = args?.type as 'preference' | 'pattern' | 'fact';

        if (!content || content.length < 5) {
          return { content: [{ type: 'text', text: 'Content too short. Please provide more detail.' }], isError: true };
        }
        if (content.length > 10000) {
          return { content: [{ type: 'text', text: 'Content too long (maximum 10KB for global profiles).' }], isError: true };
        }

        const profileId = randomUUID();
        sqlite.insertGlobalProfile({
          id: profileId,
          key: type,
          content,
          createdAt: new Date().toISOString(),
        });

        return { content: [{ type: 'text', text: `Global ${type} saved: "${content}"` }] };
      }

      case 'memextend_recall': {
        const { retriever } = await getStorage();
        const days = (args?.days as number) ?? 7;
        const includeGlobal = (args?.include_global as boolean) ?? true;

        const context = await retriever.getContextForSession(projectId, {
          recentDays: days,
          includeGlobal,
        });

        if (context.recentMemories.length === 0 && context.globalProfile.length === 0) {
          return { content: [{ type: 'text', text: `No memories found for this project in the last ${days} days. This might be a new project or you haven't saved any memories yet.` }] };
        }

        const formatted = formatContextForInjection(context);
        return { content: [{ type: 'text', text: formatted }] };
      }

      case 'memextend_forget': {
        const { sqlite, vectorStore } = await getStorage();
        const memoryId = args?.memoryId as string;

        if (!memoryId) {
          return { content: [{ type: 'text', text: 'Memory ID is required.' }], isError: true };
        }

        const deleted = sqlite.deleteMemory(memoryId);
        if (deleted) {
          // Also delete the vector embedding
          await vectorStore.deleteVector(memoryId);
          return { content: [{ type: 'text', text: `Memory ${memoryId} deleted successfully.` }] };
        } else {
          return { content: [{ type: 'text', text: `Memory ${memoryId} not found.` }] };
        }
      }

      case 'memextend_status': {
        const { sqlite, vectorStore, embedder } = await getStorage();
        const memoryCount = sqlite.getMemoryCount();
        const vectorCount = await vectorStore.getVectorCount();

        const projectMemories = sqlite.getAllMemories(projectId, 1000);
        const projectMemoryCount = projectMemories.length;

        return {
          content: [{
            type: 'text',
            text: `memextend Status
================
Project: ${basename(workspace)}
Project ID: ${projectId}
Project memories: ${projectMemoryCount}

Global Stats:
- Total memories: ${memoryCount}
- Vector embeddings: ${vectorCount}
- Semantic search: ${embedder.isReal ? 'Enabled (real embeddings)' : 'Fallback mode (hash-based)'}

Storage:
- Database: ${DB_PATH}
- Vectors: ${VECTORS_PATH}
- Models: ${MODELS_PATH}`
          }]
        };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
