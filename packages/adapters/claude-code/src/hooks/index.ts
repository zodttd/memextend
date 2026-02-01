// packages/adapters/claude-code/src/hooks/index.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

// Hooks are standalone scripts, not library exports
// They are bundled and executed by Claude Code directly

export const HOOKS = {
  sessionStart: 'session-start.cjs',
  stop: 'stop.cjs',
} as const;
