// packages/core/src/storage/index.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

export { SQLiteStorage } from './sqlite.js';
export { SqliteVecStorage } from './sqlite-vec.js';
export type { VectorSearchResult } from './sqlite-vec.js';

// Legacy alias for backwards compatibility
export { SqliteVecStorage as LanceDBStorage } from './sqlite-vec.js';
