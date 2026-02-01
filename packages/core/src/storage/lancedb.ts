// packages/core/src/storage/lancedb.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import * as lancedb from '@lancedb/lancedb';

export interface VectorSearchResult {
  id: string;
  score: number;
}

export class LanceDBStorage {
  private db: lancedb.Connection;
  private table: lancedb.Table | null = null;
  private readonly tableName = 'memories';
  private readonly dimensions = 384;

  private constructor(db: lancedb.Connection) {
    this.db = db;
  }

  static async create(dbPath: string): Promise<LanceDBStorage> {
    const db = await lancedb.connect(dbPath);
    const storage = new LanceDBStorage(db);
    await storage.initialize();
    return storage;
  }

  private async initialize(): Promise<void> {
    const tableNames = await this.db.tableNames();

    if (tableNames.includes(this.tableName)) {
      this.table = await this.db.openTable(this.tableName);
    }
  }

  async insertVector(id: string, vector: number[]): Promise<void> {
    if (vector.length !== this.dimensions) {
      throw new Error(`Vector must have ${this.dimensions} dimensions, got ${vector.length}`);
    }

    const data = [{ id, vector }];

    if (!this.table) {
      this.table = await this.db.createTable(this.tableName, data);
    } else {
      await this.table.add(data);
    }
    // Note: Don't optimize here - causes race conditions with concurrent queries
    // Optimization happens in Stop hook when session ends
  }

  async insertVectors(items: Array<{ id: string; vector: number[] }>): Promise<void> {
    for (const item of items) {
      if (item.vector.length !== this.dimensions) {
        throw new Error(`Vector must have ${this.dimensions} dimensions, got ${item.vector.length}`);
      }
    }

    if (!this.table) {
      this.table = await this.db.createTable(this.tableName, items);
    } else {
      await this.table.add(items);
    }
    // Note: Don't optimize here - causes race conditions with concurrent queries
    // Optimization happens in Stop hook when session ends
  }

  async search(vector: number[], limit: number = 10): Promise<VectorSearchResult[]> {
    if (!this.table) {
      return [];
    }

    // LanceDB requires k > 0, so default 0 to a reasonable max
    const effectiveLimit = limit > 0 ? limit : 100;

    const results = await this.table
      .vectorSearch(vector)
      .limit(effectiveLimit)
      .toArray();

    return (results as Array<Record<string, unknown>>).map(row => ({
      id: row.id as string,
      score: 1 - (row._distance as number) // Convert distance to similarity
    }));
  }

  async deleteVector(id: string): Promise<void> {
    if (!this.table) return;
    // Sanitize the ID to prevent injection (escape single quotes)
    const sanitizedId = id.replace(/'/g, "''");
    await this.table.delete(`id = '${sanitizedId}'`);
  }

  async getVectorCount(): Promise<number> {
    if (!this.table) return 0;
    return await this.table.countRows();
  }

  async getVectorsByIds(ids: string[]): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>();
    if (!this.table || ids.length === 0) return result;

    // Batch queries to avoid extremely long WHERE clauses
    const BATCH_SIZE = 100;

    try {
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        // Sanitize IDs to prevent injection
        const sanitizedIds = batch.map(id => id.replace(/'/g, "''"));
        const filter = sanitizedIds.map(id => `id = '${id}'`).join(' OR ');

        const rows = await this.table
          .query()
          .where(filter)
          .toArray();

        for (const row of rows as Array<Record<string, unknown>>) {
          result.set(row.id as string, row.vector as number[]);
        }
      }
    } catch {
      // Return empty map on error
    }

    return result;
  }

  async close(): Promise<void> {
    // LanceDB doesn't require explicit close
  }

  /**
   * Optimize the LanceDB table to reduce storage.
   * This compacts files, prunes old versions, and optimizes indices.
   * Should be called periodically (e.g., after many inserts or on cleanup command).
   *
   * @param cleanupOlderThan - Date before which old versions should be pruned (default: now)
   */
  async optimize(cleanupOlderThan?: Date): Promise<{ compacted: number; pruned: number } | null> {
    if (!this.table) return null;

    try {
      // Use type assertion since optimize isn't in the type definitions
      const table = this.table as unknown as {
        optimize(options?: { cleanupOlderThan?: Date }): Promise<{
          compaction?: { filesRemoved?: number };
          prune?: { versionsRemoved?: number };
        }>;
      };
      // Default to now to prune all old versions immediately
      const stats = await table.optimize({ cleanupOlderThan: cleanupOlderThan ?? new Date() });
      return {
        compacted: stats?.compaction?.filesRemoved ?? 0,
        pruned: stats?.prune?.versionsRemoved ?? 0,
      };
    } catch (error) {
      console.error('[memextend] LanceDB optimize failed:', error);
      return null;
    }
  }
}
