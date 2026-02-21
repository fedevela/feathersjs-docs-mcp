import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { AppConfig } from '../config.js';

/**
 * Result returned after synchronizing the docs repository.
 */
export interface SyncResult {
  /** Commit hash currently checked out after sync. */
  commit: string;
  /** Whether repository HEAD changed during sync. */
  changed: boolean;
}

/**
 * Run a git command and return trimmed stdout.
 */
function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8'
  }).trim();
}

/**
 * Ensure Feathers docs repository exists locally and is updated to target branch.
 *
 * If repository does not exist, it performs a shallow clone.
 * Otherwise, it fetches and hard-resets to `origin/<branch>`.
 */
export function syncDocsRepo(config: AppConfig): SyncResult {
  fs.mkdirSync(config.cacheDir, { recursive: true });
  const gitDir = path.join(config.repoDir, '.git');

  if (!fs.existsSync(gitDir)) {
    git(['clone', '--depth', '1', '--branch', config.repoBranch, config.repoUrl, config.repoDir]);
    const commit = git(['rev-parse', 'HEAD'], config.repoDir);
    return { commit, changed: true };
  }

  const before = git(['rev-parse', 'HEAD'], config.repoDir);
  git(['fetch', 'origin', config.repoBranch, '--depth', '1'], config.repoDir);
  git(['reset', '--hard', `origin/${config.repoBranch}`], config.repoDir);
  const after = git(['rev-parse', 'HEAD'], config.repoDir);

  return { commit: after, changed: before !== after };
}
