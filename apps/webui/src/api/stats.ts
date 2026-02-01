// apps/webui/src/api/stats.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { Router, Request, Response } from 'express';
import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

export const statsRouter = Router();

// Helper to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper to get directory size
function getDirSize(dir: string): number {
  try {
    const result = execSync(`du -sk "${dir}" 2>/dev/null | cut -f1`, {
      encoding: 'utf-8'
    }).trim();
    return parseInt(result, 10) * 1024 || 0;
  } catch {
    return 0;
  }
}

// GET /api/stats - Get memory statistics
statsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { SQLiteStorage, LanceDBStorage, isModelAvailable } = await import('@memextend/core');

    const sqlite = new SQLiteStorage(req.app.locals.dbPath);
    const lancedb = await LanceDBStorage.create(req.app.locals.vectorsPath);

    // Get counts
    const memoryCount = sqlite.getMemoryCount();
    const vectorCount = await lancedb.getVectorCount();

    // Get global profiles
    const globalProfiles = sqlite.getGlobalProfiles(100);

    // Get all memories for type breakdown
    const memories = sqlite.getAllMemories(undefined, 10000);

    // Type breakdown
    const typeBreakdown: Record<string, number> = {};
    const sourceBreakdown: Record<string, number> = {};
    const projectBreakdown: Record<string, number> = {};

    for (const memory of memories) {
      // Type
      typeBreakdown[memory.type] = (typeBreakdown[memory.type] || 0) + 1;

      // Source tool
      const source = memory.sourceTool || 'manual';
      sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1;

      // Project
      const projectId = memory.projectId || 'global';
      projectBreakdown[projectId] = (projectBreakdown[projectId] || 0) + 1;
    }

    // Date distribution (last 30 days)
    const dateDistribution: Record<string, number> = {};
    const now = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dateDistribution[dateStr] = 0;
    }

    for (const memory of memories) {
      const dateStr = memory.createdAt.split('T')[0];
      if (dateDistribution[dateStr] !== undefined) {
        dateDistribution[dateStr]++;
      }
    }

    // Database sizes
    const dbPath = req.app.locals.dbPath;
    const vectorsPath = req.app.locals.vectorsPath;
    const modelsPath = req.app.locals.modelsPath;

    const dbSize = existsSync(dbPath) ? statSync(dbPath).size : 0;
    const vectorsSize = existsSync(vectorsPath) ? getDirSize(vectorsPath) : 0;
    const modelsSize = existsSync(modelsPath) ? getDirSize(modelsPath) : 0;

    // Check model availability
    const modelAvailable = isModelAvailable(modelsPath);

    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentMemories = memories.filter(m => new Date(m.createdAt) >= sevenDaysAgo);

    sqlite.close();
    await lancedb.close();

    res.json({
      overview: {
        totalMemories: memoryCount,
        totalVectors: vectorCount,
        globalProfiles: globalProfiles.length,
        totalProjects: Object.keys(projectBreakdown).filter(k => k !== 'global').length
      },
      storage: {
        database: {
          size: dbSize,
          sizeFormatted: formatBytes(dbSize)
        },
        vectors: {
          size: vectorsSize,
          sizeFormatted: formatBytes(vectorsSize)
        },
        models: {
          size: modelsSize,
          sizeFormatted: formatBytes(modelsSize)
        },
        total: {
          size: dbSize + vectorsSize + modelsSize,
          sizeFormatted: formatBytes(dbSize + vectorsSize + modelsSize)
        }
      },
      embedding: {
        modelAvailable,
        modelName: 'nomic-embed-text-v1.5'
      },
      breakdowns: {
        byType: typeBreakdown,
        bySource: sourceBreakdown,
        byProject: projectBreakdown
      },
      activity: {
        last7Days: recentMemories.length,
        dateDistribution
      },
      recentMemories: memories.slice(0, 5).map(m => ({
        id: m.id,
        preview: m.content.split('\n')[0].slice(0, 80),
        type: m.type,
        createdAt: m.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// GET /api/stats/global - Get global profiles
statsRouter.get('/global', async (req: Request, res: Response) => {
  try {
    const { SQLiteStorage } = await import('@memextend/core');
    const sqlite = new SQLiteStorage(req.app.locals.dbPath);

    const limit = parseInt(req.query.limit as string || '50', 10);
    const profiles = sqlite.getGlobalProfiles(limit);

    sqlite.close();

    res.json({ profiles });
  } catch (error) {
    console.error('Error fetching global profiles:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});
