// apps/webui/src/api/search.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { Router, Request, Response } from 'express';

export const searchRouter = Router();

// GET /api/search - Search memories
searchRouter.get('/', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const scope = req.query.scope as string || 'all'; // 'all', 'global', 'project'
    const projectId = req.query.projectId as string | undefined;
    const limit = parseInt(req.query.limit as string || '20', 10);

    if (!query) {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    const { SQLiteStorage, SqliteVecStorage, MemoryRetriever, createEmbedFunction } = await import('@memextend/core');

    const sqlite = new SQLiteStorage(req.app.locals.dbPath);
    const vectorStore = await SqliteVecStorage.create(req.app.locals.vectorsPath);

    // Create embedding function
    const embedder = await createEmbedFunction(req.app.locals.modelsPath);
    const retriever = new MemoryRetriever(sqlite, vectorStore, embedder.embedQuery);

    let results;

    if (scope === 'global') {
      // Search global profiles
      const profiles = sqlite.getGlobalProfiles(limit);
      const filtered = profiles.filter(p =>
        p.content.toLowerCase().includes(query.toLowerCase()) ||
        p.key.toLowerCase().includes(query.toLowerCase())
      );

      sqlite.close();
      await vectorStore.close();
      await embedder.close();

      res.json({
        results: filtered.map((p, i) => ({
          type: 'global_profile',
          item: p,
          score: 1 - (i * 0.1) // Approximate score
        })),
        query,
        scope,
        total: filtered.length,
        usingRealEmbeddings: embedder.isReal
      });
      return;
    }

    // Hybrid search for project or all memories
    const searchProjectId = scope === 'project' ? projectId : undefined;
    results = await retriever.hybridSearch(query, { limit, projectId: searchProjectId });

    sqlite.close();
    await vectorStore.close();
    await embedder.close();

    res.json({
      results: results.map(r => ({
        type: 'memory',
        item: r.memory,
        score: r.score,
        source: r.source
      })),
      query,
      scope,
      projectId: searchProjectId,
      total: results.length,
      usingRealEmbeddings: embedder.isReal
    });
  } catch (error) {
    console.error('Error searching memories:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// POST /api/search/fts - Full-text search only (faster, no embeddings)
searchRouter.post('/fts', async (req: Request, res: Response) => {
  try {
    const { query, limit = 20 } = req.body;

    if (!query) {
      res.status(400).json({ error: 'Query is required' });
      return;
    }

    const { SQLiteStorage } = await import('@memextend/core');
    const sqlite = new SQLiteStorage(req.app.locals.dbPath);

    const results = sqlite.searchFTS(query, limit);

    sqlite.close();

    res.json({
      results: results.map(r => ({
        type: 'memory',
        item: r.memory,
        score: r.score,
        source: 'fts'
      })),
      query,
      total: results.length
    });
  } catch (error) {
    console.error('Error in FTS search:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});
