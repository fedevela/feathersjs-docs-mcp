import fs from 'node:fs';
import path from 'node:path';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
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
 * Ensure Feathers docs repository exists locally and is updated to target branch.
 *
 * If repository does not exist, it performs a shallow clone.
 * Otherwise, it fetches and hard-resets to `origin/<branch>`.
 */
export async function syncDocsRepo(config: AppConfig): Promise<SyncResult> {
  fs.mkdirSync(config.cacheDir, { recursive: true });
  const gitDir = path.join(config.repoDir, '.git');

  if (!fs.existsSync(gitDir)) {
    await git.clone({
      fs,
      http,
      dir: config.repoDir,
      url: config.repoUrl,
      ref: config.repoBranch,
      singleBranch: true,
      depth: 1
    });
    const commit = await git.resolveRef({ fs, dir: config.repoDir, ref: 'HEAD' });
    return { commit, changed: true };
  }

  const before = await git.resolveRef({ fs, dir: config.repoDir, ref: 'HEAD' }).catch(() => '');

  await git.fetch({
    fs,
    http,
    dir: config.repoDir,
    url: config.repoUrl,
    ref: config.repoBranch,
    singleBranch: true,
    depth: 1,
    prune: true,
    tags: false
  });

  const remoteRef = `refs/remotes/origin/${config.repoBranch}`;
  const remoteOid = await git.resolveRef({ fs, dir: config.repoDir, ref: remoteRef });
  await git.checkout({
    fs,
    dir: config.repoDir,
    ref: remoteOid,
    force: true
  });

  const after = await git.resolveRef({ fs, dir: config.repoDir, ref: 'HEAD' });

  return { commit: after, changed: before !== after };
}
