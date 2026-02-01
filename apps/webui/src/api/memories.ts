// apps/webui/src/api/memories.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { Router, Request, Response } from 'express';
import type { Memory } from '@memextend/core';

export const memoriesRouter = Router();

// Helper to get storage instances
async function getStorage(req: Request) {
  const { SQLiteStorage, SqliteVecStorage } = await import('@memextend/core');
  const sqlite = new SQLiteStorage(req.app.locals.dbPath);
  const vectorStore = await SqliteVecStorage.create(req.app.locals.vectorsPath);
  return { sqlite, vectorStore };
}

// GET /api/memories - List memories with pagination
memoriesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { sqlite, vectorStore } = await getStorage(req);

    const limit = parseInt(req.query.limit as string || '50', 10);
    const offset = parseInt(req.query.offset as string || '0', 10);
    const projectId = req.query.projectId as string | undefined;
    const type = req.query.type as string | undefined;
    const tool = req.query.tool as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    // Get all memories with project filter
    let memories = sqlite.getAllMemories(projectId, limit + offset);

    // Apply type filter
    if (type) {
      memories = memories.filter(m => m.type === type);
    }

    // Apply tool filter
    if (tool) {
      memories = memories.filter(m => m.sourceTool === tool);
    }

    // Apply date filters
    if (startDate) {
      const start = new Date(startDate);
      memories = memories.filter(m => new Date(m.createdAt) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      memories = memories.filter(m => new Date(m.createdAt) <= end);
    }

    // Apply pagination
    const paginatedMemories = memories.slice(offset, offset + limit);

    const total = sqlite.getMemoryCount();

    sqlite.close();
    await vectorStore.close();

    res.json({
      memories: paginatedMemories,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + limit < total
      }
    });
  } catch (error) {
    console.error('Error fetching memories:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// POST /api/memories - Create a new memory
memoriesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { content, projectId, type = 'manual' } = req.body;

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Content is required and must be a string' });
      return;
    }

    const { SQLiteStorage, SqliteVecStorage, LocalEmbedding } = await import('@memextend/core');
    const { randomUUID } = await import('crypto');

    const sqlite = new SQLiteStorage(req.app.locals.dbPath);
    const vectorStore = await SqliteVecStorage.create(req.app.locals.vectorsPath);
    const embedder = await LocalEmbedding.create(req.app.locals.memextendDir);

    const memoryId = randomUUID();
    const memory = {
      id: memoryId,
      projectId: projectId || null,
      content,
      type: 'manual' as const,  // Always use 'manual' type for user-created memories
      sourceTool: null,
      createdAt: new Date().toISOString(),
      sessionId: null,
      metadata: null
    };

    // Save to SQLite
    sqlite.insertMemory(memory);

    // Generate and save embedding
    const embedding = await embedder.embed(content);
    await vectorStore.insertVector(memoryId, embedding);

    sqlite.close();
    await vectorStore.close();

    res.status(201).json({ success: true, id: memoryId, memory });
  } catch (error) {
    console.error('Error creating memory:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// GET /api/memories/:id - Get single memory
memoriesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { sqlite, vectorStore } = await getStorage(req);
    const memory = sqlite.getMemory(req.params.id);
    sqlite.close();
    await vectorStore.close();

    if (!memory) {
      res.status(404).json({ error: 'Memory not found' });
      return;
    }

    res.json(memory);
  } catch (error) {
    console.error('Error fetching memory:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// PUT /api/memories/:id - Update memory content
memoriesRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const { content } = req.body;

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Content is required and must be a string' });
      return;
    }

    const { sqlite, vectorStore } = await getStorage(req);

    // Check if memory exists
    const existing = sqlite.getMemory(req.params.id);
    if (!existing) {
      sqlite.close();
      await vectorStore.close();
      res.status(404).json({ error: 'Memory not found' });
      return;
    }

    const updated = sqlite.updateMemory(req.params.id, content);
    sqlite.close();
    await vectorStore.close();

    if (updated) {
      res.json({ success: true, id: req.params.id });
    } else {
      res.status(500).json({ error: 'Failed to update memory' });
    }
  } catch (error) {
    console.error('Error updating memory:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// DELETE /api/memories/:id - Delete single memory
memoriesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { sqlite, vectorStore } = await getStorage(req);

    // Check if memory exists
    const existing = sqlite.getMemory(req.params.id);
    if (!existing) {
      sqlite.close();
      await vectorStore.close();
      res.status(404).json({ error: 'Memory not found' });
      return;
    }

    const deleted = sqlite.deleteMemory(req.params.id);
    if (deleted) {
      // Also delete the vector embedding
      await vectorStore.deleteVector(req.params.id);
    }
    sqlite.close();
    await vectorStore.close();

    if (deleted) {
      res.json({ success: true, id: req.params.id });
    } else {
      res.status(500).json({ error: 'Failed to delete memory' });
    }
  } catch (error) {
    console.error('Error deleting memory:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// DELETE /api/memories - Bulk delete with filters
memoriesRouter.delete('/', async (req: Request, res: Response) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const before = req.query.before as string | undefined;

    const { sqlite, vectorStore } = await getStorage(req);

    let deleted = 0;

    if (before) {
      const date = new Date(before);
      if (isNaN(date.getTime())) {
        sqlite.close();
        await vectorStore.close();
        res.status(400).json({ error: 'Invalid date format' });
        return;
      }
      deleted = sqlite.deleteMemoriesBefore(date, projectId);
    } else {
      deleted = sqlite.deleteAllMemories(projectId);
    }

    sqlite.close();
    await vectorStore.close();

    // Note: Bulk delete doesn't delete vectors individually
    // Orphaned vectors are harmless but take up space
    res.json({ success: true, deleted });
  } catch (error) {
    console.error('Error bulk deleting memories:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});
