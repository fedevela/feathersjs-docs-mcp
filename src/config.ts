import path from 'node:path';

/**
 * Runtime configuration used by the Feathers docs MCP server.
 */
export interface AppConfig {
  /** MCP transport to start (`stdio` or `httpStream`). */
  transport: 'stdio' | 'httpStream';
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
  /** HTTP host for `httpStream` transport. */
  httpHost: string;
  /** HTTP port for `httpStream` transport. */
  httpPort: number;
  /** MCP endpoint path for `httpStream` transport. */
  httpEndpoint: `/${string}`;
  /** Whether to run FastMCP in stateless HTTP mode. */
  httpStateless: boolean;
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
 * Parse a boolean from an environment variable with fallback handling.
 */
function boolFromEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) return fallback;
  const normalized = value.toLowerCase().trim();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

/**
 * Parse MCP transport mode from environment.
 */
function transportFromEnv(): 'stdio' | 'httpStream' {
  const value = process.env.FEATHERS_MCP_TRANSPORT;
  if (!value) return 'httpStream';
  if (value === 'stdio' || value === 'httpStream') return value;
  throw new Error(
    `Invalid FEATHERS_MCP_TRANSPORT: "${value}". Expected "stdio" or "httpStream".`
  );
}

/**
 * Parse and normalize MCP endpoint path.
 */
function endpointFromEnv(): `/${string}` {
  const value = process.env.FEATHERS_MCP_HTTP_ENDPOINT;
  if (!value) return '/mcp';
  const trimmed = value.trim();
  if (!trimmed.startsWith('/')) {
    throw new Error(
      `Invalid FEATHERS_MCP_HTTP_ENDPOINT: "${value}". Expected path starting with "/".`
    );
  }
  return trimmed as `/${string}`;
}

/**
 * Build the application configuration from environment variables.
 */
export function getConfig(): AppConfig {
  const baseCache = process.env.FEATHERS_MCP_CACHE_DIR
    ? path.resolve(process.env.FEATHERS_MCP_CACHE_DIR)
    : path.resolve(process.cwd(), '.cache', 'feathersjs-docs-mcp');

  const repoDir = path.join(baseCache, 'feathers-repo');
  const docsDir = path.join(repoDir, 'docs');

  return {
    transport: transportFromEnv(),
    repoUrl: process.env.FEATHERS_REPO_URL ?? 'https://github.com/feathersjs/feathers.git',
    repoBranch: process.env.FEATHERS_REPO_BRANCH ?? 'dove',
    cacheDir: baseCache,
    repoDir,
    docsDir,
    topK: intFromEnv('TOP_K', 6),
    httpHost: process.env.FEATHERS_MCP_HTTP_HOST ?? '127.0.0.1',
    httpPort: intFromEnv('FEATHERS_MCP_HTTP_PORT', 8123),
    httpEndpoint: endpointFromEnv(),
    httpStateless: boolFromEnv('FEATHERS_MCP_HTTP_STATELESS', false)
  };
}
