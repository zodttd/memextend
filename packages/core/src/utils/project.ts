// packages/core/src/utils/project.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { execSync } from 'child_process';
import { createHash } from 'crypto';

/**
 * Get a project ID from a directory path.
 * Uses git root if available, otherwise hashes the path.
 * @param cwd - The directory path to get project ID for
 * @returns A 16-character hex string identifying the project
 */
export function getProjectId(cwd: string): string {
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return createHash('sha256').update(gitRoot).digest('hex').slice(0, 16);
  } catch {
    // Not a git repository, use path hash
    return createHash('sha256').update(cwd).digest('hex').slice(0, 16);
  }
}

/**
 * Get a project ID for the current working directory.
 * @returns A 16-character hex string identifying the project, or null if unable to determine
 */
export function getCurrentProjectId(): string | null {
  try {
    return getProjectId(process.cwd());
  } catch {
    return null;
  }
}
