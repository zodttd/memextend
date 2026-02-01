// packages/core/src/storage/sqlite.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import Database from 'better-sqlite3';
import type { Memory, Project, GlobalProfile, SearchResult } from '../memory/types.js';

export class SQLiteStorage {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        source_tool TEXT,
        created_at TEXT NOT NULL,
        session_id TEXT,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS global_profile (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        content,
        content='memories',
        content_rowid='rowid'
      );

      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
        INSERT INTO memories_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
      END;
    `);
  }

  getTables(): string[] {
    const rows = this.db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' OR type='virtual table'
    `).all() as { name: string }[];
    return rows.map(r => r.name);
  }

  insertMemory(memory: Memory): void {
    const stmt = this.db.prepare(`
      INSERT INTO memories (id, project_id, content, type, source_tool, created_at, session_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      memory.id,
      memory.projectId,
      memory.content,
      memory.type,
      memory.sourceTool,
      memory.createdAt,
      memory.sessionId,
      memory.metadata ? JSON.stringify(memory.metadata) : null
    );
  }

  getMemory(id: string): Memory | null {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToMemory(row);
  }

  getAllMemories(projectId?: string, limit: number = 100): Memory[] {
    let query = 'SELECT * FROM memories';
    const params: any[] = [];

    if (projectId) {
      query += ' WHERE project_id = ?';
      params.push(projectId);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => this.rowToMemory(row));
  }

  searchFTS(query: string, limit: number = 10): SearchResult[] {
    const rows = this.db.prepare(`
      SELECT m.*, bm25(memories_fts) as score
      FROM memories_fts fts
      JOIN memories m ON m.rowid = fts.rowid
      WHERE memories_fts MATCH ?
      ORDER BY score
      LIMIT ?
    `).all(query, limit) as any[];

    return rows.map(row => ({
      memory: this.rowToMemory(row),
      score: Math.abs(row.score),
      source: 'fts' as const
    }));
  }

  getRecentMemories(projectId: string | null, limit: number = 0, days: number = 0): Memory[] {
    // Build query conditionally based on whether days is 0 (unlimited)
    let query = 'SELECT * FROM memories';
    const params: any[] = [];
    const conditions: string[] = [];

    // Days filter (0 = unlimited/no time constraint)
    if (days > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      conditions.push('created_at > ?');
      params.push(cutoff.toISOString());
    }

    // Project filter
    if (projectId !== null) {
      conditions.push('project_id = ?');
      params.push(projectId);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    // Limit (0 = unlimited)
    if (limit > 0) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => this.rowToMemory(row));
  }

  deleteMemory(id: string): boolean {
    const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    return result.changes > 0;
  }

  updateMemory(id: string, content: string): boolean {
    // The FTS index is automatically updated by the memories_au trigger
    const result = this.db.prepare(
      'UPDATE memories SET content = ? WHERE id = ?'
    ).run(content, id);

    return result.changes > 0;
  }

  deleteAllMemories(projectId?: string): number {
    if (projectId) {
      const result = this.db.prepare('DELETE FROM memories WHERE project_id = ?').run(projectId);
      return result.changes;
    } else {
      const result = this.db.prepare('DELETE FROM memories').run();
      return result.changes;
    }
  }

  deleteMemoriesBefore(date: Date, projectId?: string): number {
    const timestamp = date.toISOString();
    if (projectId) {
      const result = this.db.prepare(
        'DELETE FROM memories WHERE created_at < ? AND project_id = ?'
      ).run(timestamp, projectId);
      return result.changes;
    } else {
      const result = this.db.prepare('DELETE FROM memories WHERE created_at < ?').run(timestamp);
      return result.changes;
    }
  }

  // Project methods
  insertProject(project: Project): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO projects (id, name, path, created_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(project.id, project.name, project.path, project.createdAt);
  }

  getProject(id: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      createdAt: row.created_at
    };
  }

  // Global profile methods
  insertGlobalProfile(profile: GlobalProfile): void {
    const stmt = this.db.prepare(`
      INSERT INTO global_profile (id, key, content, created_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(profile.id, profile.key, profile.content, profile.createdAt);
  }

  getGlobalProfiles(limit: number = 10): GlobalProfile[] {
    const rows = this.db.prepare(`
      SELECT * FROM global_profile ORDER BY created_at DESC LIMIT ?
    `).all(limit) as any[];
    return rows.map(row => ({
      id: row.id,
      key: row.key,
      content: row.content,
      createdAt: row.created_at
    }));
  }

  getMemoryCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM memories').get() as any;
    return row.count;
  }

  getMemoryCountByProject(projectId: string): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM memories WHERE project_id = ?'
    ).get(projectId) as any;
    return row.count;
  }

  /**
   * Get IDs of oldest memories for a project, exceeding the limit
   * @returns Array of memory IDs to delete (oldest first)
   */
  getOldestMemoryIds(projectId: string | null, limit: number): string[] {
    let query: string;
    let params: any[];

    if (projectId) {
      query = `
        SELECT id FROM memories
        WHERE project_id = ?
        ORDER BY created_at ASC
        LIMIT ?
      `;
      params = [projectId, limit];
    } else {
      query = `
        SELECT id FROM memories
        ORDER BY created_at ASC
        LIMIT ?
      `;
      params = [limit];
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => row.id);
  }

  /**
   * Prune memories to stay within limits
   * @returns Number of memories deleted
   */
  pruneMemories(options: {
    maxPerProject?: number;
    maxTotal?: number;
    projectId?: string;
  }): { deleted: number; deletedIds: string[] } {
    const deletedIds: string[] = [];

    // Prune per-project if limit specified
    if (options.maxPerProject && options.maxPerProject > 0 && options.projectId) {
      const count = this.getMemoryCountByProject(options.projectId);
      if (count > options.maxPerProject) {
        const excess = count - options.maxPerProject;
        const idsToDelete = this.getOldestMemoryIds(options.projectId, excess);
        for (const id of idsToDelete) {
          this.deleteMemory(id);
          deletedIds.push(id);
        }
      }
    }

    // Prune total if limit specified
    if (options.maxTotal && options.maxTotal > 0) {
      const count = this.getMemoryCount();
      if (count > options.maxTotal) {
        const excess = count - options.maxTotal;
        const idsToDelete = this.getOldestMemoryIds(null, excess);
        for (const id of idsToDelete) {
          if (!deletedIds.includes(id)) {
            this.deleteMemory(id);
            deletedIds.push(id);
          }
        }
      }
    }

    return { deleted: deletedIds.length, deletedIds };
  }

  private rowToMemory(row: any): Memory {
    return {
      id: row.id,
      projectId: row.project_id,
      content: row.content,
      type: row.type,
      sourceTool: row.source_tool,
      createdAt: row.created_at,
      sessionId: row.session_id,
      metadata: row.metadata ? JSON.parse(row.metadata) : null
    };
  }

  close(): void {
    this.db.close();
  }
}
