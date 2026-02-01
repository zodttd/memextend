// packages/core/src/storage/sqlite-vec.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

export interface VectorSearchResult {
  id: string;
  score: number;
}

export class SQLiteVecStorage {
  private db: Database.Database;
  private readonly tableName = 'memory_vectors';
  private readonly dimensions = 384;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  static async create(dbPath: string): Promise<SQLiteVecStorage> {
    // Handle both directory paths (legacy directory format) and file paths
    // If path ends with 'vectors' (directory), convert to vectors.db file
    let actualPath = dbPath;
    if (dbPath.endsWith('vectors') || dbPath.endsWith('vectors/')) {
      actualPath = dbPath.replace(/\/?$/, '.db');
    }

    const db = new Database(actualPath);

    // Load sqlite-vec extension
    sqliteVec.load(db);

    const storage = new SQLiteVecStorage(db);
    storage.initialize();
    return storage;
  }

  private initialize(): void {
    // Create virtual table for vector search
    // vec0 is the virtual table module from sqlite-vec
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${this.tableName} USING vec0(
        id TEXT PRIMARY KEY,
        vector FLOAT[${this.dimensions}]
      )
    `);
  }

  async insertVector(id: string, vector: number[]): Promise<void> {
    if (vector.length !== this.dimensions) {
      throw new Error(`Vector must have ${this.dimensions} dimensions, got ${vector.length}`);
    }

    // Convert to Buffer for better-sqlite3 binding
    const float32 = new Float32Array(vector);
    const vectorBuffer = Buffer.from(float32.buffer);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO ${this.tableName} (id, vector)
      VALUES (?, ?)
    `);
    stmt.run(id, vectorBuffer);
  }

  async insertVectors(items: Array<{ id: string; vector: number[] }>): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO ${this.tableName} (id, vector)
      VALUES (?, ?)
    `);

    const insertMany = this.db.transaction((items: Array<{ id: string; vector: number[] }>) => {
      for (const item of items) {
        if (item.vector.length !== this.dimensions) {
          throw new Error(`Vector must have ${this.dimensions} dimensions, got ${item.vector.length}`);
        }
        const float32 = new Float32Array(item.vector);
        const vectorBuffer = Buffer.from(float32.buffer);
        stmt.run(item.id, vectorBuffer);
      }
    });

    insertMany(items);
  }

  async search(vector: number[], limit: number = 10): Promise<VectorSearchResult[]> {
    if (vector.length !== this.dimensions) {
      throw new Error(`Query vector must have ${this.dimensions} dimensions, got ${vector.length}`);
    }

    // Check if table is empty - vec0 KNN queries fail on empty tables
    const count = await this.getVectorCount();
    if (count === 0) {
      return [];
    }

    const effectiveLimit = limit > 0 ? limit : 100;
    const float32 = new Float32Array(vector);
    const vectorBuffer = Buffer.from(float32.buffer);

    // KNN search using sqlite-vec
    // distance is L2 (Euclidean) by default, lower = more similar
    // Using AND k = ? instead of LIMIT for better compatibility with vec0 virtual tables
    const stmt = this.db.prepare(`
      SELECT id, distance
      FROM ${this.tableName}
      WHERE vector MATCH ?
        AND k = ?
      ORDER BY distance
    `);

    const rows = stmt.all(vectorBuffer, effectiveLimit) as Array<{ id: string; distance: number }>;

    // Convert distance to similarity score (1 / (1 + distance))
    // This gives us a score between 0 and 1, where 1 is most similar
    return rows.map(row => ({
      id: row.id,
      score: 1 / (1 + row.distance)
    }));
  }

  async deleteVector(id: string): Promise<void> {
    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`);
    stmt.run(id);
  }

  async getVectorCount(): Promise<number> {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName}`);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  async getVectorsByIds(ids: string[]): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>();
    if (ids.length === 0) return result;

    // Query in batches to avoid SQL limits
    const BATCH_SIZE = 100;

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => '?').join(',');

      const stmt = this.db.prepare(`
        SELECT id, vector FROM ${this.tableName}
        WHERE id IN (${placeholders})
      `);

      const rows = stmt.all(...batch) as Array<{ id: string; vector: ArrayBuffer }>;

      for (const row of rows) {
        // Convert ArrayBuffer back to number array
        const vector = Array.from(new Float32Array(row.vector));
        result.set(row.id, vector);
      }
    }

    return result;
  }

  async close(): Promise<void> {
    this.db.close();
  }

  // No optimize needed - SQLite handles this automatically!
  async optimize(): Promise<{ compacted: number; pruned: number } | null> {
    // Run VACUUM to reclaim space (optional, SQLite auto-manages)
    this.db.exec('VACUUM');
    return { compacted: 0, pruned: 0 };
  }
}
