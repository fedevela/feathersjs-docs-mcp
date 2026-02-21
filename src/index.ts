#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import typia from 'typia';
import { getConfig } from './config.js';
import { syncDocsRepo } from './docs/sync.js';
import { discoverMarkdownFiles } from './docs/discover.js';
import { parseMarkdownFile } from './docs/parse.js';
import { PageMeta } from './types.js';

type ListDocsArgs = {
  query?: string;
  limit?: number;
  offset?: number;
};

type ReadDocArgs = {
  uri: string;
};

type RefreshDocsArgs = {
  forceRebuild?: boolean;
};

type TypiaValidationResult<T> = {
  success: boolean;
  data?: unknown;
  errors?: Array<{ path?: string; expected?: string; value?: unknown }>;
};

const validateListDocsArgs = typia.createValidate<ListDocsArgs>();
const validateReadDocArgs = typia.createValidate<ReadDocArgs>();
const validateRefreshDocsArgs = typia.createValidate<RefreshDocsArgs>();

const passthroughInputSchema = {
  parse(input: unknown) {
    return input;
  },
  safeParse(input: unknown) {
    return { success: true as const, data: input };
  },
  async safeParseAsync(input: unknown) {
    return { success: true as const, data: input };
  }
} as any;

const textContent = (text: string) => ({ type: 'text' as const, text });

function assertValid<T>(
  validator: (input: unknown) => TypiaValidationResult<T>,
  input: unknown,
  toolName: string
): T {
  const validated = validator(input);
  if (!validated.success) {
    const first = validated.errors?.[0];
    const detail = first
      ? `path=${first.path ?? '(root)'}, expected=${first.expected ?? 'unknown'}, value=${JSON.stringify(first.value)}`
      : 'unknown validation error';
    throw new Error(`Invalid arguments for ${toolName}: ${detail}`);
  }
  return (validated.data ?? {}) as T;
}

/** Global runtime configuration loaded from environment variables. */
const config = getConfig();
/** Timestamp of the last successful refresh cycle. */
let lastSyncAt = new Date().toISOString();
/** Latest commit hash from synchronized docs repository. */
let commit = '';
/** In-memory docs page index used by MCP tools. */
let pages: PageMeta[] = [];
/** Effective docs directory resolved at runtime. */
let docsDirResolved = config.docsDir;
/** Non-fatal issues discovered while resolving/discovering docs. */
let discoveryWarnings: string[] = [];

/**
 * Resolve the docs directory and update discovery warnings if missing.
 */
function resolveDocsDir(): string {
  if (!fs.existsSync(config.docsDir)) {
    discoveryWarnings = [`Docs directory not found: ${config.docsDir}`];
    return config.docsDir;
  }
  discoveryWarnings = [];
  return config.docsDir;
}

/**
 * Convert a docs URI into an absolute file path with traversal protection.
 */
function resolveDocFilePath(docsDir: string, uri: string): string {
  const prefix = 'feathers-doc://docs/';
  if (!uri.startsWith(prefix)) {
    throw new Error(`Invalid URI: ${uri}`);
  }
  const relativePath = decodeURIComponent(uri.slice(prefix.length));
  const resolved = path.resolve(docsDir, relativePath);
  const root = path.resolve(docsDir);
  if (!resolved.startsWith(root)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

/**
 * Synchronize docs repository and rebuild in-memory metadata index.
 */
async function refreshDocs(): Promise<void> {
  const sync = await syncDocsRepo(config);
  commit = sync.commit;
  docsDirResolved = resolveDocsDir();
  const files = discoverMarkdownFiles(docsDirResolved);
  pages = files.map((file) => parseMarkdownFile(file, docsDirResolved));
  if (files.length === 0) {
    discoveryWarnings.push(`No markdown pages found under: ${docsDirResolved}`);
  }
  lastSyncAt = new Date().toISOString();
}

await refreshDocs();

/** MCP server instance configured for stdio transport. */
const server = new McpServer({
  name: 'feathers-docs-mcp',
  version: '0.1.0'
});

server.registerResource(
  'feathers-doc-page',
  'feathers-doc://docs/{path}',
  {
    title: 'Feathers Documentation Page',
    description: 'Read a FeathersJS markdown documentation page'
  },
  async (uri) => {
    const filePath = resolveDocFilePath(docsDirResolved, uri.href);
    const text = fs.readFileSync(filePath, 'utf8');
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text
        }
      ]
    };
  }
);

server.registerTool(
  'list_docs',
  {
    title: 'List Feathers documentation pages',
    description: 'Lists available FeathersJS docs pages with optional text filtering',
    inputSchema: passthroughInputSchema
  },
  async (args: any, _extra: any) => {
    const { query, limit, offset } = assertValid<ListDocsArgs>(validateListDocsArgs, args ?? {}, 'list_docs');

    if (query !== undefined && typeof query !== 'string') {
      throw new Error('Invalid arguments for list_docs: query must be a string');
    }
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 20)) {
      throw new Error('Invalid arguments for list_docs: limit must be an integer between 1 and 20');
    }
    if (offset !== undefined && (!Number.isInteger(offset) || offset < 0)) {
      throw new Error('Invalid arguments for list_docs: offset must be an integer >= 0');
    }

    // Filter pages by title/path/headings when a query is provided.
    const q = query?.toLowerCase().trim();
    const filtered = pages.filter((page) => {
      if (!q) return true;
      return (
        page.title.toLowerCase().includes(q) ||
        page.relativePath.toLowerCase().includes(q) ||
        page.headings.some((h) => h.toLowerCase().includes(q))
      );
    });

    // Apply cursor-style pagination over filtered results.
    const start = offset ?? 0;
    const size = limit ?? config.topK;
    const results = filtered.slice(start, start + size).map((page) => ({
      uri: page.uri,
      title: page.title,
      relativePath: page.relativePath,
      headings: page.headings.slice(0, 8)
    }));

    // Build section grouping for section-first browsing in clients.
    const groupMap = new Map<string, typeof results>();
    for (const page of results) {
      const folder = path.posix.dirname(page.relativePath.replaceAll('\\', '/'));
      const key = folder === '.' ? '/' : folder;
      const existing = groupMap.get(key) ?? [];
      existing.push(page);
      groupMap.set(key, existing);
    }

    const groups = Array.from(groupMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([folder, pagesInFolder]) => ({
        folder,
        count: pagesInFolder.length,
        pages: pagesInFolder.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
      }));

    return {
      content: [
        textContent(
          JSON.stringify(
            {
              query: query ?? null,
              total: filtered.length,
              offset: start,
              limit: size,
              count: results.length,
              results,
              groups
            },
            null,
            2
          )
        )
      ]
    };
  }
);

server.registerTool(
  'read_doc',
  {
    title: 'Read Feathers documentation page',
    description: 'Reads a markdown page by feathers-doc URI',
    inputSchema: passthroughInputSchema
  },
  async (args: any, _extra: any) => {
    const { uri } = assertValid<ReadDocArgs>(validateReadDocArgs, args ?? {}, 'read_doc');
    if (!uri.startsWith('feathers-doc://docs/')) {
      throw new Error("Invalid arguments for read_doc: uri must start with 'feathers-doc://docs/'");
    }

    // Resolve and read the markdown page addressed by the docs URI.
    const filePath = resolveDocFilePath(docsDirResolved, uri);
    const text = fs.readFileSync(filePath, 'utf8');
    return {
      content: [
        textContent(JSON.stringify({ uri, content: text }, null, 2))
      ]
    };
  }
);

server.registerTool(
  'refresh_docs_index',
  {
    title: 'Refresh docs',
    description: 'Pull latest Feathers docs and refresh in-memory catalog',
    inputSchema: passthroughInputSchema
  },
  async (args: any, _extra: any) => {
    const { forceRebuild } = assertValid<RefreshDocsArgs>(validateRefreshDocsArgs, args ?? {}, 'refresh_docs_index');

    // Re-sync repository and fully rebuild in-memory page index.
    await refreshDocs();
    return {
      content: [
        textContent(
          JSON.stringify(
            {
              ok: true,
              forceRebuild: forceRebuild ?? false,
              commit,
              lastSyncAt,
              pages: pages.length
            },
            null,
            2
          )
        )
      ]
    };
  }
);

server.registerTool(
  'get_docs_status',
  {
    title: 'Get docs index status',
    description: 'Returns repository/index health and metadata',
    inputSchema: {}
  },
  async () => {
    // Report current repository/index state for diagnostics.
    return {
      content: [
        textContent(
          JSON.stringify(
            {
              repoUrl: config.repoUrl,
              branch: config.repoBranch,
              commit,
              lastSyncAt,
              pages: pages.length,
              docsDirResolved,
              docsDirExists: fs.existsSync(docsDirResolved),
              discoveryWarnings,
              cacheDir: config.cacheDir
            },
            null,
            2
          )
        )
      ]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('feathers-docs-mcp running on stdio');
