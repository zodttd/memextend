// packages/adapters/claude-code/src/hooks/logger.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const LOGS_DIR = join(MEMEXTEND_DIR, 'logs');
const CONFIG_PATH = join(MEMEXTEND_DIR, 'config.json');

let debugEnabled: boolean | null = null;

function isDebugEnabled(): boolean {
  if (debugEnabled !== null) return debugEnabled;

  try {
    if (existsSync(CONFIG_PATH)) {
      const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
      debugEnabled = config.debug === true;
    } else {
      debugEnabled = false;
    }
  } catch {
    debugEnabled = false;
  }

  return debugEnabled;
}

function ensureLogsDir(): void {
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }
}

export function log(hook: string, message: string, data?: Record<string, unknown>): void {
  if (!isDebugEnabled()) return;

  try {
    ensureLogsDir();
    const timestamp = new Date().toISOString();
    const logFile = join(LOGS_DIR, 'hooks.log');
    const entry = data
      ? `[${timestamp}] [${hook}] ${message} ${JSON.stringify(data)}\n`
      : `[${timestamp}] [${hook}] ${message}\n`;
    appendFileSync(logFile, entry);
  } catch {
    // Silently ignore logging errors
  }
}

export function logError(hook: string, error: unknown): void {
  // Always log errors, regardless of debug setting
  try {
    ensureLogsDir();
    const timestamp = new Date().toISOString();
    const logFile = join(LOGS_DIR, 'hooks.log');
    const errorMsg = error instanceof Error ? error.message : String(error);
    const entry = `[${timestamp}] [${hook}] ERROR: ${errorMsg}\n`;
    appendFileSync(logFile, entry);
  } catch {
    // Silently ignore logging errors
  }
}
