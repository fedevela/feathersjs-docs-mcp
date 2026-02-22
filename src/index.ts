#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getConfig } from './config.js';
import { syncDocsRepo } from './docs/sync.js';
import { discoverMarkdownFiles } from './docs/discover.js';
import { parseMarkdownFile } from './docs/parse.js';
import { PageMeta } from './types.js';

const listDocsParams = z.object({
  query: z.string().optional(),
  limit: z.number().int().min(1).max(20).optional(),
  offset: z.number().int().min(0).optional()
});

const readDocParams = z.object({
  uri: z.string().startsWith('feathers-doc://docs/')
});

const refreshDocsParams = z.object({
  forceRebuild: z.boolean().optional()
});

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

/** FastMCP server instance configured for stdio transport. */
const server = new FastMCP({
  name: 'feathersjs-docs-mcp',
  version: '0.1.0'
});

server.addResourceTemplate({
  uriTemplate: 'feathers-doc://docs/{path}',
  name: 'Feathers Documentation Page',
  mimeType: 'text/markdown',
  arguments: [
    {
      name: 'path',
      required: true
    }
  ],
  async load({ path: docPath }) {
    const filePath = resolveDocFilePath(docsDirResolved, `feathers-doc://docs/${docPath}`);
    const text = fs.readFileSync(filePath, 'utf8');
    return {
      text
    };
  }
});

server.addTool({
  name: 'list_docs',
  description: 'Lists available FeathersJS docs pages with optional text filtering',
  parameters: listDocsParams,
  async execute(args) {
    const { query, limit, offset } = args;

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

    // Apply cursor-style pagination over filtered results for the `results` field.
    const start = offset ?? 0;
    const size = limit ?? config.topK;
    const results = filtered.slice(start, start + size).map((page) => ({
      uri: page.uri,
      title: page.title,
      relativePath: page.relativePath,
      headings: page.headings.slice(0, 8)
    }));

    // Build `groups` from the full filtered set (not only paged results)
    // so clients can render complete section navigation independently of page size.
    const groupMap = new Map<string, Array<(typeof results)[number]>>();
    for (const page of filtered) {
      const folder = path.posix.dirname(page.relativePath.replaceAll('\\', '/'));
      const key = folder === '.' ? '/' : folder;
      const existing = groupMap.get(key) ?? [];
      existing.push({
        uri: page.uri,
        title: page.title,
        relativePath: page.relativePath,
        headings: page.headings.slice(0, 8)
      });
      groupMap.set(key, existing);
    }

    const groups = Array.from(groupMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([folder, pagesInFolder]) => ({
        folder,
        count: pagesInFolder.length,
        pages: pagesInFolder.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
      }));

    // Return a JSON string payload as text content for broad MCP client compatibility.
    return JSON.stringify(
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
    );
  }
});

server.addTool({
  name: 'read_doc',
  description: 'Reads a markdown page by feathers-doc URI',
  parameters: readDocParams,
  async execute({ uri }) {
    // Resolve and read the markdown page addressed by the docs URI.
    const filePath = resolveDocFilePath(docsDirResolved, uri);
    const text = fs.readFileSync(filePath, 'utf8');
    return JSON.stringify({ uri, content: text }, null, 2);
  }
});

server.addTool({
  name: 'refresh_docs_index',
  description: 'Pull latest Feathers docs and refresh in-memory catalog',
  parameters: refreshDocsParams,
  async execute({ forceRebuild }) {
    // Re-sync repository and fully rebuild in-memory page index.
    await refreshDocs();
    return JSON.stringify(
      {
        ok: true,
        forceRebuild: forceRebuild ?? false,
        commit,
        lastSyncAt,
        pages: pages.length
      },
      null,
      2
    );
  }
});

server.addTool({
  name: 'get_docs_status',
  description: 'Returns repository/index health and metadata',
  async execute() {
    // Report current repository/index state for diagnostics.
    return JSON.stringify(
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
    );
  }
});

server.start({ transportType: 'stdio' });
console.error('feathersjs-docs-mcp running on stdio');
