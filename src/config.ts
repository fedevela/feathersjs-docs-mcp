import path from 'node:path';

/**
 * Runtime configuration used by the Feathers docs MCP server.
 */
export interface AppConfig {
  /** Git repository URL that contains the `docs/` directory. */
  repoUrl: string;
  /** Branch to fetch/reset to when syncing docs. */
  repoBranch: string;
  /** Root cache directory for local server artifacts. */
  cacheDir: string;
  /** Local checkout path for the Feathers repository. */
  repoDir: string;
  /** Resolved docs directory (`<repoDir>/docs`). */
  docsDir: string;
  /** Default page size used by `list_docs` when no limit is provided. */
  topK: number;
}

/**
 * Parse an integer from an environment variable with fallback handling.
 */
function intFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Build the application configuration from environment variables.
 */
export function getConfig(): AppConfig {
  const baseCache = process.env.FEATHERS_MCP_CACHE_DIR
    ? path.resolve(process.env.FEATHERS_MCP_CACHE_DIR)
    : path.resolve(process.cwd(), '.cache', 'feathers-mcp');

  const repoDir = path.join(baseCache, 'feathers-repo');
  const docsDir = path.join(repoDir, 'docs');

  return {
    repoUrl: process.env.FEATHERS_REPO_URL ?? 'https://github.com/feathersjs/feathers.git',
    repoBranch: process.env.FEATHERS_REPO_BRANCH ?? 'dove',
    cacheDir: baseCache,
    repoDir,
    docsDir,
    topK: intFromEnv('TOP_K', 6)
  };
}