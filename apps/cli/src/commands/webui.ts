// apps/cli/src/commands/webui.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { spawn, execSync } from 'child_process';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');
const PID_FILE = join(MEMEXTEND_DIR, 'webui.pid');

/**
 * Check if a PID belongs to a memextend webui process
 * Returns true only if the process exists AND is running memextend webui
 */
function isWebuiProcess(pid: number): boolean {
  try {
    // First check if process exists
    process.kill(pid, 0);

    // Now verify it's actually our webui process by checking command line
    // Works on macOS and Linux
    try {
      const cmd = execSync(`ps -p ${pid} -o command=`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      // Check if it's a node process running memextend webui
      // The full path contains "memextend" (e.g., /Users/.../memextend/apps/cli/dist/index.js webui)
      return cmd.includes('memextend') && cmd.includes('webui');
    } catch {
      // ps command failed - process might not exist or we can't read it
      // Fall back to just checking if process exists (less safe but functional)
      return false;
    }
  } catch {
    // Process doesn't exist
    return false;
  }
}

interface WebuiOptions {
  port?: string;
  host?: string;
  foreground?: boolean;
}

export async function webuiCommand(action: string | undefined, options: WebuiOptions): Promise<void> {
  // Handle stop command
  if (action === 'stop') {
    await stopWebui();
    return;
  }

  // Handle status command
  if (action === 'status') {
    await statusWebui();
    return;
  }

  // If action is provided but not recognized, treat it as an error
  if (action && action !== 'start') {
    console.log(chalk.red(`\n  Unknown action: ${action}`));
    console.log(chalk.dim('  Usage: memextend webui [start|stop|status]\n'));
    return;
  }

  // Start the webui
  await startWebui(options);
}

async function stopWebui(): Promise<void> {
  if (!existsSync(PID_FILE)) {
    console.log(chalk.yellow('\n  Web UI is not running (no PID file found).\n'));
    return;
  }

  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);

    // Check if process is actually our webui
    if (!isWebuiProcess(pid)) {
      console.log(chalk.yellow('\n  Web UI is not running (stale PID file). Cleaning up.\n'));
      unlinkSync(PID_FILE);
      return;
    }

    // Kill the process
    process.kill(pid, 'SIGTERM');
    unlinkSync(PID_FILE);
    console.log(chalk.green(`\n  Web UI stopped (PID ${pid}).\n`));
  } catch (error) {
    console.log(chalk.red(`\n  Failed to stop Web UI: ${error instanceof Error ? error.message : error}\n`));
  }
}

async function statusWebui(): Promise<void> {
  if (!existsSync(PID_FILE)) {
    console.log(chalk.dim('\n  Web UI is not running.\n'));
    return;
  }

  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);

    // Check if process is actually our webui
    if (isWebuiProcess(pid)) {
      console.log(chalk.green(`\n  Web UI is running (PID ${pid}).\n`));
    } else {
      console.log(chalk.yellow('\n  Web UI is not running (stale PID file). Cleaning up.\n'));
      unlinkSync(PID_FILE);
    }
  } catch (error) {
    console.log(chalk.red(`\n  Error checking status: ${error instanceof Error ? error.message : error}\n`));
  }
}

async function startWebui(options: WebuiOptions): Promise<void> {
  // Check if memextend is initialized
  if (!existsSync(DB_PATH)) {
    console.log(chalk.yellow('\n  Warning: memextend not initialized. Run `memextend init` first.\n'));
    return;
  }

  const port = parseInt(options.port || '3333', 10);
  const host = options.host || 'localhost';

  if (isNaN(port) || port < 1 || port > 65535) {
    console.log(chalk.red('\n  Error: Invalid port number.\n'));
    return;
  }

  // Run in foreground mode (blocking) - skip PID check since this is called by the background spawner
  if (options.foreground) {
    await runForeground(port, host);
    return;
  }

  // Check if already running (only for background mode)
  if (existsSync(PID_FILE)) {
    const existingPid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
    if (isWebuiProcess(existingPid)) {
      console.log(chalk.yellow(`\n  Web UI is already running (PID ${existingPid}).`));
      console.log(chalk.dim(`  Use 'memextend webui stop' to stop it first.\n`));
      return;
    }
    // Stale PID file (process died or is a different process), clean up
    unlinkSync(PID_FILE);
  }

  // Run in background mode (default)
  await runBackground(port, host);
}

async function runBackground(port: number, host: string): Promise<void> {
  // Get path to this script for spawning
  const cliPath = join(__dirname, '..', 'index.js');

  // Spawn a detached process running webui in foreground mode
  const child = spawn('node', [cliPath, 'webui', '--foreground', '--port', String(port), '--host', host], {
    detached: true,
    stdio: 'ignore',
    cwd: join(__dirname, '..', '..'),  // Set cwd to apps/cli/dist
    env: { ...process.env }
  });

  // Save PID
  if (child.pid) {
    writeFileSync(PID_FILE, String(child.pid));
    child.unref();

    console.log(chalk.bold('\n  memextend Web UI\n'));
    console.log(`  Started in background at ${chalk.blue(`http://${host}:${port}`)}`);
    console.log(chalk.dim(`  PID: ${child.pid}`));
    console.log(chalk.dim(`  Stop with: memextend webui stop\n`));
  } else {
    console.log(chalk.red('\n  Failed to start Web UI in background.\n'));
  }
}

async function runForeground(port: number, host: string): Promise<void> {
  try {
    // Dynamic import of the webui server
    // Path from apps/cli/dist/commands/webui.js to apps/webui/dist/server.js
    const webuiPath = join(__dirname, '..', '..', '..', 'webui', 'dist', 'server.js');

    // Check if webui is built
    if (!existsSync(webuiPath)) {
      console.log(chalk.yellow('\n  Web UI not built. Building now...\n'));

      // Try to build it
      const { execSync } = await import('child_process');
      try {
        execSync('npm run build', {
          cwd: join(__dirname, '..', '..', 'webui'),
          stdio: 'inherit'
        });
      } catch {
        console.log(chalk.red('\n  Failed to build Web UI.'));
        console.log(chalk.dim('  Try running: cd apps/webui && npm install && npm run build\n'));
        return;
      }
    }

    const { startServer } = await import(webuiPath);
    await startServer({ port, host });

  } catch (error) {
    // Log the actual error for debugging
    console.log(chalk.dim(`\n  WebUI server load failed: ${error instanceof Error ? error.message : error}`));
    console.log(chalk.dim('  Using built-in server...\n'));

    try {
      await startInlineServer(port, host);
    } catch (inlineError) {
      console.error(chalk.red(`\n  Error: ${inlineError instanceof Error ? inlineError.message : inlineError}\n`));
      process.exit(1);
    }
  }
}

async function startInlineServer(port: number, host: string): Promise<void> {
  const http = await import('http');
  const path = await import('path');
  const fs = await import('fs');
  const url = await import('url');

  const { SQLiteStorage, LanceDBStorage, MemoryRetriever, createEmbedFunction, isModelAvailable } = await import('@memextend/core');

  const VECTORS_PATH = join(MEMEXTEND_DIR, 'vectors');
  const MODELS_PATH = join(MEMEXTEND_DIR, 'models');

  // Simple inline HTML for the web UI
  const inlineHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>memextend - Web UI</title>
  <style>
    :root { --bg: #0d1117; --card: #161b22; --border: #30363d; --text: #c9d1d9; --dim: #8b949e; --blue: #58a6ff; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); padding: 2rem; }
    h1 { margin-bottom: 1rem; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .stat { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 1.5rem; }
    .stat-value { font-size: 2rem; font-weight: bold; color: var(--blue); }
    .stat-label { color: var(--dim); font-size: 0.875rem; }
    .memories { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 1.5rem; }
    .memory { padding: 1rem; background: var(--bg); border-radius: 6px; margin-bottom: 0.5rem; }
    .memory-meta { font-size: 0.75rem; color: var(--dim); }
    .memory-content { margin-top: 0.5rem; font-size: 0.875rem; }
    .search-box { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
    .search-box input { flex: 1; padding: 0.75rem; background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 6px; }
    .search-box button { padding: 0.75rem 1.5rem; background: var(--blue); border: none; color: white; border-radius: 6px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>memextend Web UI</h1>
  <div class="stats" id="stats"></div>
  <div class="memories">
    <div class="search-box">
      <input type="text" id="search" placeholder="Search memories...">
      <button onclick="search()">Search</button>
    </div>
    <div id="memories"></div>
  </div>
  <script>
    async function loadStats() {
      const res = await fetch('/api/stats');
      const data = await res.json();
      document.getElementById('stats').innerHTML = \`
        <div class="stat"><div class="stat-value">\${data.overview.totalMemories}</div><div class="stat-label">Memories</div></div>
        <div class="stat"><div class="stat-value">\${data.overview.totalVectors}</div><div class="stat-label">Vectors</div></div>
        <div class="stat"><div class="stat-value">\${data.overview.totalProjects}</div><div class="stat-label">Projects</div></div>
        <div class="stat"><div class="stat-value">\${data.storage.total.sizeFormatted}</div><div class="stat-label">Storage</div></div>
      \`;
    }
    async function loadMemories() {
      const res = await fetch('/api/memories?limit=20');
      const data = await res.json();
      document.getElementById('memories').innerHTML = data.memories.map(m => \`
        <div class="memory">
          <div class="memory-meta">\${m.type} | \${new Date(m.createdAt).toLocaleDateString()}</div>
          <div class="memory-content">\${m.content.slice(0, 200)}\${m.content.length > 200 ? '...' : ''}</div>
        </div>
      \`).join('');
    }
    async function search() {
      const q = document.getElementById('search').value;
      if (!q) return loadMemories();
      const res = await fetch('/api/search?q=' + encodeURIComponent(q));
      const data = await res.json();
      document.getElementById('memories').innerHTML = data.results.map(r => \`
        <div class="memory">
          <div class="memory-meta">Score: \${r.score.toFixed(3)} | \${r.item.type}</div>
          <div class="memory-content">\${r.item.content.slice(0, 200)}\${r.item.content.length > 200 ? '...' : ''}</div>
        </div>
      \`).join('');
    }
    loadStats();
    loadMemories();
  </script>
</body>
</html>`;

  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '/';

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      // API routes
      if (pathname.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json');

        const sqlite = new SQLiteStorage(DB_PATH);

        if (pathname === '/api/stats') {
          const memoryCount = sqlite.getMemoryCount();
          const memories = sqlite.getAllMemories(undefined, 10000);
          const globalProfiles = sqlite.getGlobalProfiles(100);

          const lancedb = await LanceDBStorage.create(VECTORS_PATH);
          const vectorCount = await lancedb.getVectorCount();
          await lancedb.close();

          const typeBreakdown: Record<string, number> = {};
          const sourceBreakdown: Record<string, number> = {};
          const projectBreakdown: Record<string, number> = {};
          const dateDistribution: Record<string, number> = {};

          const now = new Date();
          for (let i = 0; i < 30; i++) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            dateDistribution[date.toISOString().split('T')[0]] = 0;
          }

          for (const m of memories) {
            typeBreakdown[m.type] = (typeBreakdown[m.type] || 0) + 1;
            const source = m.sourceTool || 'manual';
            sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1;
            const proj = m.projectId || 'global';
            projectBreakdown[proj] = (projectBreakdown[proj] || 0) + 1;
            const dateStr = m.createdAt.split('T')[0];
            if (dateDistribution[dateStr] !== undefined) dateDistribution[dateStr]++;
          }

          const dbSize = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
          const formatBytes = (b: number) => {
            if (b === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(b) / Math.log(k));
            return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
          };

          sqlite.close();

          res.writeHead(200);
          res.end(JSON.stringify({
            overview: {
              totalMemories: memoryCount,
              totalVectors: vectorCount,
              globalProfiles: globalProfiles.length,
              totalProjects: Object.keys(projectBreakdown).filter(k => k !== 'global').length
            },
            storage: {
              database: { size: dbSize, sizeFormatted: formatBytes(dbSize) },
              vectors: { size: 0, sizeFormatted: '0 B' },
              models: { size: 0, sizeFormatted: '0 B' },
              total: { size: dbSize, sizeFormatted: formatBytes(dbSize) }
            },
            embedding: { modelAvailable: isModelAvailable(MODELS_PATH), modelName: 'nomic-embed-text-v1.5' },
            breakdowns: { byType: typeBreakdown, bySource: sourceBreakdown, byProject: projectBreakdown },
            activity: { last7Days: 0, dateDistribution },
            recentMemories: memories.slice(0, 5).map(m => ({
              id: m.id,
              preview: m.content.split('\n')[0].slice(0, 80),
              type: m.type,
              createdAt: m.createdAt
            }))
          }));
          return;
        }

        if (pathname === '/api/memories') {
          const limit = parseInt(parsedUrl.query.limit as string || '50', 10);
          const offset = parseInt(parsedUrl.query.offset as string || '0', 10);
          const projectId = parsedUrl.query.projectId as string | undefined;

          const memories = sqlite.getAllMemories(projectId, limit + offset).slice(offset, offset + limit);
          const total = sqlite.getMemoryCount();
          sqlite.close();

          res.writeHead(200);
          res.end(JSON.stringify({
            memories,
            pagination: { limit, offset, total, hasMore: offset + limit < total }
          }));
          return;
        }

        if (pathname === '/api/search') {
          const query = parsedUrl.query.q as string;
          if (!query) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Query required' }));
            return;
          }

          const lancedb = await LanceDBStorage.create(VECTORS_PATH);
          const embedder = await createEmbedFunction(MODELS_PATH);
          const retriever = new MemoryRetriever(sqlite, lancedb, embedder.embedQuery);

          const results = await retriever.hybridSearch(query, { limit: 20 });

          sqlite.close();
          await lancedb.close();
          await embedder.close();

          res.writeHead(200);
          res.end(JSON.stringify({
            results: results.map(r => ({
              type: 'memory',
              item: r.memory,
              score: r.score,
              source: r.source
            })),
            query,
            total: results.length,
            usingRealEmbeddings: embedder.isReal
          }));
          return;
        }

        if (pathname === '/api/projects') {
          const memories = sqlite.getAllMemories(undefined, 10000);
          const projectCounts: Record<string, number> = {};

          for (const m of memories) {
            if (m.projectId) {
              projectCounts[m.projectId] = (projectCounts[m.projectId] || 0) + 1;
            }
          }

          const projects = Object.entries(projectCounts).map(([id, count]) => {
            const project = sqlite.getProject(id);
            return {
              id,
              name: project?.name || 'Unknown',
              path: project?.path || 'Unknown',
              memoryCount: count
            };
          });

          sqlite.close();

          res.writeHead(200);
          res.end(JSON.stringify({ projects }));
          return;
        }

        if (pathname === '/api/stats/global') {
          const profiles = sqlite.getGlobalProfiles(50);
          sqlite.close();
          res.writeHead(200);
          res.end(JSON.stringify({ profiles }));
          return;
        }

        sqlite.close();
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      // Serve inline HTML
      res.setHeader('Content-Type', 'text/html');
      res.writeHead(200);
      res.end(inlineHtml);

    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Server error' }));
    }
  });

  server.listen(port, host, () => {
    console.log(chalk.bold('\n  memextend Web UI\n'));
    console.log(`  Server running at ${chalk.blue(`http://${host}:${port}`)}`);
    console.log(chalk.dim('  Press Ctrl+C to stop\n'));
  });
}
