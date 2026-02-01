// apps/webui/src/api/projects.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { Router, Request, Response } from 'express';

export const projectsRouter = Router();

// Helper to get SQLiteStorage instance
async function getStorage(req: Request) {
  const { SQLiteStorage } = await import('@memextend/core');
  return new SQLiteStorage(req.app.locals.dbPath);
}

// GET /api/projects - List all projects
projectsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const sqlite = await getStorage(req);

    // Get all memories to extract unique projects
    const memories = sqlite.getAllMemories(undefined, 10000);

    // Get unique project IDs
    const projectIds = new Set<string>();
    const projectMemoryCounts: Record<string, number> = {};

    for (const memory of memories) {
      if (memory.projectId) {
        projectIds.add(memory.projectId);
        projectMemoryCounts[memory.projectId] = (projectMemoryCounts[memory.projectId] || 0) + 1;
      }
    }

    // Get project details for each unique project ID
    const projects = [];
    for (const id of projectIds) {
      const project = sqlite.getProject(id);
      projects.push({
        id,
        name: project?.name || 'Unknown Project',
        path: project?.path || 'Unknown Path',
        createdAt: project?.createdAt || null,
        memoryCount: projectMemoryCounts[id] || 0
      });
    }

    // Sort by memory count descending
    projects.sort((a, b) => b.memoryCount - a.memoryCount);

    sqlite.close();

    res.json({ projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// GET /api/projects/:id - Get single project with its memories
projectsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const sqlite = await getStorage(req);

    const project = sqlite.getProject(req.params.id);
    const memories = sqlite.getAllMemories(req.params.id, 100);

    sqlite.close();

    if (!project && memories.length === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json({
      id: req.params.id,
      name: project?.name || 'Unknown Project',
      path: project?.path || 'Unknown Path',
      createdAt: project?.createdAt || null,
      memoryCount: memories.length,
      recentMemories: memories.slice(0, 10)
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// GET /api/projects/:id/memories - Get project memories with pagination
projectsRouter.get('/:id/memories', async (req: Request, res: Response) => {
  try {
    const sqlite = await getStorage(req);

    const limit = parseInt(req.query.limit as string || '50', 10);
    const offset = parseInt(req.query.offset as string || '0', 10);

    const memories = sqlite.getAllMemories(req.params.id, limit + offset);
    const paginatedMemories = memories.slice(offset, offset + limit);

    sqlite.close();

    res.json({
      memories: paginatedMemories,
      pagination: {
        limit,
        offset,
        total: memories.length,
        hasMore: offset + limit < memories.length
      }
    });
  } catch (error) {
    console.error('Error fetching project memories:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// DELETE /api/projects/:id - Delete a project and all its memories
projectsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { SQLiteStorage, SQLiteVecStorage } = await import('@memextend/core');
    const sqlite = new SQLiteStorage(req.app.locals.dbPath);
    const vectorStore = await SQLiteVecStorage.create(req.app.locals.vectorsPath);

    // Get all memory IDs for this project before deleting (for vector cleanup)
    const memories = sqlite.getAllMemories(req.params.id, 100000);
    const memoryIds = memories.map(m => m.id);

    // Delete the project and its memories from SQLite
    const result = sqlite.deleteProject(req.params.id);

    // Delete vectors for all those memories
    let vectorsDeleted = 0;
    for (const memoryId of memoryIds) {
      try {
        await vectorStore.deleteVector(memoryId);
        vectorsDeleted++;
      } catch {
        // Ignore vector deletion errors
      }
    }

    sqlite.close();
    await vectorStore.close();

    if (!result.projectDeleted && result.memoriesDeleted === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json({
      success: true,
      projectDeleted: result.projectDeleted,
      memoriesDeleted: result.memoriesDeleted,
      vectorsDeleted
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});
