// apps/cli/src/commands/forget.ts
// Copyright (c) 2026 ZodTTD LLC. MIT License.

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { createInterface } from 'readline';

const MEMEXTEND_DIR = join(homedir(), '.memextend');
const DB_PATH = join(MEMEXTEND_DIR, 'memextend.db');
const VECTORS_PATH = join(MEMEXTEND_DIR, 'vectors');

interface ForgetOptions {
  all?: boolean;
  project?: boolean;
  before?: string;
  deleteProject?: string;
  clearGlobal?: boolean;
}

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export async function forgetCommand(memoryId: string | undefined, options: ForgetOptions): Promise<void> {
  if (!existsSync(DB_PATH)) {
    console.log(chalk.yellow('\n  ⚠ memextend not initialized. Run `memextend init` first.\n'));
    return;
  }

  try {
    const { SQLiteStorage, LanceDBStorage, getCurrentProjectId } = await import('@memextend/core');
    const sqlite = new SQLiteStorage(DB_PATH);
    const vectorStore = await LanceDBStorage.create(VECTORS_PATH);

    // Clear global profile: --clear-global
    if (options.clearGlobal) {
      const profiles = sqlite.getGlobalProfiles(1000);
      if (profiles.length === 0) {
        console.log(chalk.yellow('\n  No global profile entries to clear.\n'));
        sqlite.close();
        await vectorStore.close();
        return;
      }

      console.log(chalk.red(`\n  ⚠ This will delete ${profiles.length} global profile entries!`));
      const confirmed = await confirm(chalk.yellow('  Are you sure?'));

      if (!confirmed) {
        console.log(chalk.dim('\n  Cancelled.\n'));
        sqlite.close();
        await vectorStore.close();
        return;
      }

      const deleted = sqlite.deleteAllGlobalProfiles();
      sqlite.close();
      await vectorStore.close();
      console.log(chalk.green(`\n  ✓ Cleared ${deleted} global profile entries.\n`));
      return;
    }

    // Delete project: --delete-project <name>
    if (options.deleteProject) {
      const projectName = options.deleteProject;
      const project = sqlite.getProjectByName(projectName);

      if (!project) {
        console.log(chalk.yellow(`\n  ⚠ Project not found: ${projectName}\n`));
        console.log(chalk.dim('  Available projects:'));
        const allProjects = sqlite.getAllProjects();
        if (allProjects.length === 0) {
          console.log(chalk.dim('    (none)'));
        } else {
          allProjects.forEach(p => {
            const count = sqlite.getMemoryCountByProject(p.id);
            console.log(chalk.dim(`    - ${p.name} (${count} memories)`));
          });
        }
        console.log('');
        sqlite.close();
        await vectorStore.close();
        return;
      }

      const memoryCount = sqlite.getMemoryCountByProject(project.id);
      console.log(chalk.red(`\n  ⚠ This will delete all ${memoryCount} memories from project "${project.name}"!`));
      const confirmed = await confirm(chalk.yellow('  Are you sure?'));

      if (!confirmed) {
        console.log(chalk.dim('\n  Cancelled.\n'));
        sqlite.close();
        await vectorStore.close();
        return;
      }

      // Get all memory IDs for this project before deleting (for vector cleanup)
      const memories = sqlite.getAllMemories(project.id, 100000);
      const memoryIds = memories.map(m => m.id);

      // Delete the project and its memories
      const result = sqlite.deleteProject(project.id);

      // Delete vectors for all those memories
      let vectorsDeleted = 0;
      for (const id of memoryIds) {
        try {
          await vectorStore.deleteVector(id);
          vectorsDeleted++;
        } catch {
          // Ignore vector deletion errors
        }
      }

      sqlite.close();
      await vectorStore.close();
      console.log(chalk.green(`\n  ✓ Deleted ${result.memoriesDeleted} memories from project "${project.name}".\n`));
      return;
    }

    // Bulk delete: --all
    if (options.all) {
      const projectId = options.project ? getCurrentProjectId() : undefined;
      const scope = projectId ? 'current project' : 'ALL projects';

      console.log(chalk.red(`\n  ⚠ This will delete ALL memories from ${scope}!`));
      const confirmed = await confirm(chalk.yellow('  Are you sure?'));

      if (!confirmed) {
        console.log(chalk.dim('\n  Cancelled.\n'));
        sqlite.close();
        await vectorStore.close();
        return;
      }

      // Note: Bulk delete doesn't delete vectors individually - would need to iterate
      // For now, just delete from SQLite (vectors become orphaned but harmless)
      const deleted = sqlite.deleteAllMemories(projectId ?? undefined);
      sqlite.close();
      await vectorStore.close();
      console.log(chalk.green(`\n  ✓ Deleted ${deleted} memories.\n`));
      console.log(chalk.dim('  Note: Run `memextend init` to rebuild vector index if needed.\n'));
      return;
    }

    // Bulk delete: --before <date>
    if (options.before) {
      const date = new Date(options.before);
      if (isNaN(date.getTime())) {
        console.log(chalk.red(`\n  ✗ Invalid date: ${options.before}. Use YYYY-MM-DD format.\n`));
        sqlite.close();
        await vectorStore.close();
        return;
      }

      const projectId = options.project ? getCurrentProjectId() : undefined;
      const scope = projectId ? 'current project' : 'all projects';

      console.log(chalk.yellow(`\n  This will delete memories before ${options.before} from ${scope}.`));
      const confirmed = await confirm(chalk.yellow('  Are you sure?'));

      if (!confirmed) {
        console.log(chalk.dim('\n  Cancelled.\n'));
        sqlite.close();
        await vectorStore.close();
        return;
      }

      // Note: Bulk delete doesn't delete vectors individually - would need to iterate
      const deleted = sqlite.deleteMemoriesBefore(date, projectId ?? undefined);
      sqlite.close();
      await vectorStore.close();
      console.log(chalk.green(`\n  ✓ Deleted ${deleted} memories.\n`));
      console.log(chalk.dim('  Note: Run `memextend init` to rebuild vector index if needed.\n'));
      return;
    }

    // Single delete by ID
    if (!memoryId) {
      console.log(chalk.yellow('\n  ⚠ Please provide a memory ID, or use options for bulk delete.\n'));
      console.log(chalk.dim('  Usage:'));
      console.log(chalk.dim('    memextend forget <memory-id>           Delete a single memory'));
      console.log(chalk.dim('    memextend forget --all                 Delete ALL memories'));
      console.log(chalk.dim('    memextend forget --all --project       Delete all memories in current project'));
      console.log(chalk.dim('    memextend forget --before 2025-01-01   Delete memories before date'));
      console.log(chalk.dim('    memextend forget --delete-project <name>  Delete all memories in a project'));
      console.log(chalk.dim('    memextend forget --clear-global        Clear all global profile entries\n'));
      sqlite.close();
      await vectorStore.close();
      return;
    }

    // Check if memory exists
    const memory = sqlite.getMemory(memoryId);
    if (!memory) {
      console.log(chalk.yellow(`\n  ⚠ Memory not found: ${memoryId}\n`));
      sqlite.close();
      await vectorStore.close();
      return;
    }

    // Show memory preview
    const preview = memory.content.split('\n')[0].slice(0, 60);
    console.log(chalk.dim(`\n  Deleting: ${preview}...`));

    // Delete memory and its vector
    const deleted = sqlite.deleteMemory(memoryId);
    if (deleted) {
      await vectorStore.deleteVector(memoryId);
    }
    sqlite.close();
    await vectorStore.close();

    if (deleted) {
      console.log(chalk.green(`  ✓ Memory ${memoryId} deleted.\n`));
    } else {
      console.log(chalk.red(`  ✗ Failed to delete memory.\n`));
    }

  } catch (error) {
    console.error(chalk.red(`\n  Error: ${error instanceof Error ? error.message : error}\n`));
    process.exit(1);
  }
}
