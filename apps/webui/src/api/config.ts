// apps/webui/src/api/config.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { Router, Request, Response } from 'express';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

export const configRouter = Router();

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const CONFIG_PATH = join(MEMEXTEND_DIR, 'config.json');

interface MemextendConfig {
  capture?: {
    captureReasoning?: boolean;
    maxReasoningLength?: number;
    maxToolOutputLength?: number;
    tools?: {
      Edit?: boolean;
      Write?: boolean;
      Bash?: boolean;
      Task?: boolean;
    };
  };
  debug?: boolean;
}

const DEFAULT_CONFIG: MemextendConfig = {
  capture: {
    captureReasoning: true,
    maxReasoningLength: 10000,
    maxToolOutputLength: 2000,
    tools: {
      Edit: false,
      Write: false,
      Bash: false,
      Task: false
    }
  },
  debug: false
};

function loadConfig(): MemextendConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const content = readFileSync(CONFIG_PATH, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
    }
  } catch {
    // Return defaults on error
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config: MemextendConfig): void {
  // Ensure directory exists
  if (!existsSync(MEMEXTEND_DIR)) {
    mkdirSync(MEMEXTEND_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// GET /api/config - Get current configuration
configRouter.get('/', (req: Request, res: Response) => {
  try {
    const config = loadConfig();
    res.json(config);
  } catch (error) {
    console.error('Error loading config:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// PUT /api/config - Update configuration
configRouter.put('/', (req: Request, res: Response) => {
  try {
    const updates = req.body;

    // Load current config and merge with updates
    const currentConfig = loadConfig();
    const newConfig: MemextendConfig = {
      ...currentConfig,
      ...updates,
      capture: {
        ...currentConfig.capture,
        ...updates.capture,
        tools: {
          ...currentConfig.capture?.tools,
          ...updates.capture?.tools
        }
      }
    };

    saveConfig(newConfig);
    res.json({ success: true, config: newConfig });
  } catch (error) {
    console.error('Error saving config:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// GET /api/config/defaults - Get default configuration values
configRouter.get('/defaults', (req: Request, res: Response) => {
  res.json(DEFAULT_CONFIG);
});
