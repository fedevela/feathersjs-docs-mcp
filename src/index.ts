#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getConfig } from './config.js';
import { syncDocsRepo } from './docs/sync.js';
import { discoverMarkdownFiles } from './docs/discover.js';
import { parseMarkdownFile } from './docs/parse.js';
import { PageMeta } from './types.js';

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
  const sync = syncDocsRepo(config);
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
    inputSchema: {
      query: z.string().optional(),
      limit: z.number().int().min(1).max(20).optional(),
      offset: z.number().int().min(0).optional()
    }
  },
  async ({ query, limit, offset }) => {
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
        {
          type: 'text',
          text: JSON.stringify(
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
        }
      ]
    };
  }
);

server.registerTool(
  'read_doc',
  {
    title: 'Read Feathers documentation page',
    description: 'Reads a markdown page by feathers-doc URI',
    inputSchema: {
      uri: z.string().startsWith('feathers-doc://docs/')
    }
  },
  async ({ uri }) => {
    // Resolve and read the markdown page addressed by the docs URI.
    const filePath = resolveDocFilePath(docsDirResolved, uri);
    const text = fs.readFileSync(filePath, 'utf8');
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ uri, content: text }, null, 2)
        }
      ]
    };
  }
);

server.registerTool(
  'refresh_docs_index',
  {
    title: 'Refresh docs',
    description: 'Pull latest Feathers docs and refresh in-memory catalog',
    inputSchema: {
      forceRebuild: z.boolean().optional()
    }
  },
  async ({ forceRebuild }) => {
    // Re-sync repository and fully rebuild in-memory page index.
    await refreshDocs();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
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
        }
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
        {
          type: 'text',
          text: JSON.stringify(
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
        }
      ]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('feathers-docs-mcp running on stdio');
