// packages/adapters/claude-code/src/mcp/server.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import { SQLiteStorage, LanceDBStorage, MemoryRetriever, createEmbedFunction } from '@memextend/core';

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');
const VECTORS_PATH = join(MEMEXTEND_DIR, 'vectors');
const MODELS_PATH = join(MEMEXTEND_DIR, 'models');

// Lazy-loaded storage instances
let sqlite: SQLiteStorage | null = null;
let lancedb: LanceDBStorage | null = null;
let retriever: MemoryRetriever | null = null;
let embedder: Awaited<ReturnType<typeof createEmbedFunction>> | null = null;

async function getStorage(): Promise<{
  sqlite: SQLiteStorage;
  lancedb: LanceDBStorage;
  retriever: MemoryRetriever;
  embedder: Awaited<ReturnType<typeof createEmbedFunction>>;
}> {
  if (!sqlite || !lancedb || !retriever || !embedder) {
    if (!existsSync(DB_PATH)) {
      throw new Error('memextend not initialized. Run `memextend init` first.');
    }

    sqlite = new SQLiteStorage(DB_PATH);
    lancedb = await LanceDBStorage.create(VECTORS_PATH);
    embedder = await createEmbedFunction(MODELS_PATH);
    retriever = new MemoryRetriever(sqlite, lancedb, embedder.embedQuery);
  }

  return { sqlite, lancedb, retriever, embedder };
}

const server = new Server(
  {
    name: 'memextend',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'memextend_search',
        description: 'Search through your memories. Use this to recall past work, decisions, or context.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (e.g., "Redis caching", "authentication setup")',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 5)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'memextend_save',
        description: 'Save a memory for this project. Use this to remember important decisions, patterns, or context.',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The memory content to save',
            },
            projectId: {
              type: 'string',
              description: 'Project ID (optional, defaults to current project)',
            },
          },
          required: ['content'],
        },
      },
      {
        name: 'memextend_save_global',
        description: 'Save a global preference or fact that applies across all projects.',
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
              description: 'Type of global memory',
            },
          },
          required: ['content', 'type'],
        },
      },
      {
        name: 'memextend_forget',
        description: 'Delete a specific memory by ID.',
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
        description: 'Get memextend status and memory statistics.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'memextend_search': {
        const { retriever } = await getStorage();
        const query = args?.query as string;
        const limit = (args?.limit as number) ?? 5;

        const results = await retriever.hybridSearch(query, { limit });

        if (results.length === 0) {
          return { content: [{ type: 'text', text: 'No memories found matching your query.' }] };
        }

        const formatted = results.map((r, i) => {
          const date = new Date(r.memory.createdAt).toLocaleDateString();
          return `${i + 1}. [${date}] (score: ${r.score.toFixed(3)})\n   ${r.memory.content.split('\n')[0]}`;
        }).join('\n\n');

        return { content: [{ type: 'text', text: `Found ${results.length} memories:\n\n${formatted}` }] };
      }

      case 'memextend_save': {
        const { sqlite, lancedb, embedder } = await getStorage();
        const content = args?.content as string;
        const projectId = args?.projectId as string ?? 'default';

        // Validate content
        if (!content || content.length < 10) {
          return { content: [{ type: 'text', text: 'Memory content too short (minimum 10 characters).' }], isError: true };
        }
        if (content.length > 50000) {
          return { content: [{ type: 'text', text: 'Memory content too long (maximum 50KB).' }], isError: true };
        }

        const memoryId = randomUUID();
        sqlite.insertMemory({
          id: memoryId,
          projectId,
          content,
          type: 'manual',
          sourceTool: null,
          createdAt: new Date().toISOString(),
          sessionId: null,
          metadata: null,
        });

        const vector = await embedder.embed(content);
        await lancedb.insertVector(memoryId, vector);

        return { content: [{ type: 'text', text: `Memory saved with ID: ${memoryId}` }] };
      }

      case 'memextend_save_global': {
        const { sqlite } = await getStorage();
        const content = args?.content as string;
        const type = args?.type as 'preference' | 'pattern' | 'fact';

        // Validate content
        if (!content || content.length < 5) {
          return { content: [{ type: 'text', text: 'Content too short (minimum 5 characters).' }], isError: true };
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

      case 'memextend_forget': {
        const { sqlite, lancedb } = await getStorage();
        const memoryId = args?.memoryId as string;

        const deleted = sqlite.deleteMemory(memoryId);
        if (deleted) {
          // Also delete the vector embedding
          await lancedb.deleteVector(memoryId);
          return { content: [{ type: 'text', text: `Memory ${memoryId} deleted.` }] };
        } else {
          return { content: [{ type: 'text', text: `Memory ${memoryId} not found.` }] };
        }
      }

      case 'memextend_status': {
        const { sqlite, lancedb, embedder } = await getStorage();
        const memoryCount = sqlite.getMemoryCount();
        const vectorCount = await lancedb.getVectorCount();

        return {
          content: [{
            type: 'text',
            text: `memextend Status:
- Total memories: ${memoryCount}
- Vector embeddings: ${vectorCount}
- Using real embeddings: ${embedder.isReal ? 'Yes' : 'No (fallback mode)'}
- Database: ${DB_PATH}
- Vectors: ${VECTORS_PATH}`
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
