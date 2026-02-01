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
  }

  async search(vector: number[], limit: number = 10): Promise<VectorSearchResult[]> {
    if (!this.table) {
      return [];
    }

    const results = await this.table
      .vectorSearch(vector)
      .limit(limit)
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

  async close(): Promise<void> {
    // LanceDB doesn't require explicit close
  }
}
