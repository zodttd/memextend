// packages/core/src/embedding/local.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { join } from 'path';
import { existsSync, createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { pipeline } from 'stream/promises';

const MODEL_URL = 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q8_0.gguf';
const MODEL_FILENAME = 'nomic-embed-text-v1.5.Q8_0.gguf';

export interface EmbeddingOptions {
  modelsDir?: string;
  dimensions?: number;
}

export class LocalEmbedding {
  // Using any to avoid ESM/CJS type issues with dynamic imports
  private model: any;
  private context: any;
  private readonly dimensions: number;

  private constructor(model: any, context: any, dimensions: number) {
    this.model = model;
    this.context = context;
    this.dimensions = dimensions;
  }

  static async create(modelsDir: string): Promise<LocalEmbedding> {
    const modelPath = join(modelsDir, MODEL_FILENAME);

    // Download model if not exists
    if (!existsSync(modelPath)) {
      await LocalEmbedding.downloadModel(modelsDir, modelPath);
    }

    // Dynamic import of node-llama-cpp to avoid ESM/CJS issues
    const { getLlama, LlamaLogLevel } = await import('node-llama-cpp');

    // Suppress node-llama-cpp warnings (tokenizer warnings are expected with this model)
    const llama = await getLlama({
      logLevel: LlamaLogLevel.error  // Only show errors, not warnings
    });
    const model = await llama.loadModel({ modelPath });
    const context = await model.createEmbeddingContext();

    // Nomic embed text v1.5 produces 768-dim vectors, but we'll use 384 for efficiency
    return new LocalEmbedding(model, context, 384);
  }

  private static async downloadModel(modelsDir: string, modelPath: string): Promise<void> {
    await mkdir(modelsDir, { recursive: true });

    console.log(`Downloading embedding model to ${modelPath}...`);
    console.log('This is a one-time download (~274MB)');

    const response = await fetch(MODEL_URL);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download model: ${response.statusText}`);
    }

    const fileStream = createWriteStream(modelPath);
    // @ts-ignore - Node.js streams compatibility
    await pipeline(response.body, fileStream);

    console.log('Model downloaded successfully');
  }

  /**
   * Generate embedding for a document/memory
   */
  async embed(text: string): Promise<number[]> {
    const prefixedText = `search_document: ${text}`;
    const embedding = await this.context.getEmbeddingFor(prefixedText);
    // Truncate or pad to target dimensions
    const vector = Array.from(embedding.vector as number[]).slice(0, this.dimensions);
    return this.normalize(vector);
  }

  /**
   * Generate embedding for a search query
   */
  async embedQuery(text: string): Promise<number[]> {
    const prefixedText = `search_query: ${text}`;
    const embedding = await this.context.getEmbeddingFor(prefixedText);
    const vector = Array.from(embedding.vector as number[]).slice(0, this.dimensions);
    return this.normalize(vector);
  }

  /**
   * Batch embed multiple texts (documents)
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }

  /**
   * Get the embedding dimensions
   */
  getDimensions(): number {
    return this.dimensions;
  }

  /**
   * Normalize vector to unit length (for cosine similarity)
   */
  private normalize(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return vector;
    return vector.map(v => v / norm);
  }

  async close(): Promise<void> {
    await this.context.dispose();
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions must match: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot; // Already normalized, so this is cosine similarity
}

/**
 * Check if the embedding model is available (downloaded)
 */
export function isModelAvailable(modelsDir: string): boolean {
  const modelPath = join(modelsDir, MODEL_FILENAME);
  return existsSync(modelPath);
}

/**
 * Create an embed function that uses real embeddings if available,
 * otherwise falls back to a deterministic hash-based mock.
 * This is useful for hooks that need fast startup but still work
 * without the model downloaded.
 */
export async function createEmbedFunction(modelsDir: string): Promise<{
  embed: (text: string) => Promise<number[]>;
  embedQuery: (text: string) => Promise<number[]>;
  isReal: boolean;
  close: () => Promise<void>;
}> {
  // Try to use real embeddings if model exists
  if (isModelAvailable(modelsDir)) {
    try {
      const embedding = await LocalEmbedding.create(modelsDir);
      return {
        embed: (text: string) => embedding.embed(text),
        embedQuery: (text: string) => embedding.embedQuery(text),
        isReal: true,
        close: () => embedding.close()
      };
    } catch (error) {
      console.error('[memextend] Failed to load embedding model, using fallback:', error);
    }
  }

  // Fallback: deterministic hash-based embedding
  // This allows the system to work without the model, but with reduced semantic quality
  const { createHash } = await import('crypto');

  const hashEmbed = (text: string, prefix: string): number[] => {
    const hash = createHash('sha256').update(prefix + text).digest();
    const vector = Array.from(hash).slice(0, 32);
    // Expand to 384 dimensions using multiple hash rounds
    const expanded: number[] = [];
    for (let i = 0; i < 12; i++) {
      const roundHash = createHash('sha256').update(text + i.toString()).digest();
      expanded.push(...Array.from(roundHash).slice(0, 32));
    }
    // Normalize
    const norm = Math.sqrt(expanded.reduce((sum, v) => sum + v * v, 0));
    return expanded.map(v => v / norm / 255);
  };

  return {
    embed: async (text: string) => hashEmbed(text, 'doc:'),
    embedQuery: async (text: string) => hashEmbed(text, 'query:'),
    isReal: false,
    close: async () => {}
  };
}
