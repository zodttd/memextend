// apps/webui/src/server.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import express, { Request, Response, NextFunction } from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { existsSync, statSync } from 'fs';
import { memoriesRouter } from './api/memories.js';
import { projectsRouter } from './api/projects.js';
import { searchRouter } from './api/search.js';
import { statsRouter } from './api/stats.js';
import { configRouter } from './api/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const MEMEXTEND_DIR = join(homedir(), '.memextend');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');
const VECTORS_PATH = join(MEMEXTEND_DIR, 'vectors');
const MODELS_PATH = join(MEMEXTEND_DIR, 'models');

export interface ServerConfig {
  port: number;
  host: string;
}

export async function createServer(config: ServerConfig = { port: 3333, host: 'localhost' }) {
  const app = express();

  // Middleware
  app.use(express.json());

  // CORS for local development
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Check if memextend is initialized
  if (!existsSync(DB_PATH)) {
    console.error('Error: memextend not initialized. Run `memextend init` first.');
    process.exit(1);
  }

  // Store paths in app locals for routes to access
  app.locals.dbPath = DB_PATH;
  app.locals.vectorsPath = VECTORS_PATH;
  app.locals.modelsPath = MODELS_PATH;
  app.locals.memextendDir = MEMEXTEND_DIR;

  // API routes
  app.use('/api/memories', memoriesRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/config', configRouter);

  // Serve static files
  const publicDir = join(__dirname, 'public');
  app.use(express.static(publicDir));

  // SPA fallback - serve index.html for all other routes
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(join(publicDir, 'index.html'));
  });

  // Error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Server error:', err);
    res.status(500).json({ error: err.message });
  });

  return app;
}

export async function startServer(config: ServerConfig = { port: 3333, host: 'localhost' }) {
  const app = await createServer(config);

  return new Promise<void>((resolve) => {
    app.listen(config.port, config.host, () => {
      console.log(`\n  memextend Web UI\n`);
      console.log(`  Server running at http://${config.host}:${config.port}`);
      console.log(`  Press Ctrl+C to stop\n`);
      resolve();
    });
  });
}

// Run if executed directly
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('server.js') ||
  process.argv[1].endsWith('server.ts')
);

if (isMainModule) {
  const port = parseInt(process.env.PORT || '3333', 10);
  const host = process.env.HOST || 'localhost';
  startServer({ port, host }).catch(console.error);
}
