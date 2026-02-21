import path from 'node:path';
import pathPosix from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expect as pwExpect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Transcript } from './transcript.js';

const transcript = new Transcript();

const serverPath = path.resolve(process.cwd(), 'dist', 'index.js');
const transport = new StdioClientTransport({
  command: 'node',
  args: [serverPath],
  stderr: 'pipe'
});

const client = new Client(
  {
    name: 'feathers-docs-e2e-client',
    version: '0.1.0'
  },
  {
    capabilities: {}
  }
);

function extractTextContent(result: unknown): string {
  const payload = result as { content?: Array<{ type?: string; text?: string }> };
  const textPart = payload.content?.find((c) => c?.type === 'text');
  return textPart?.text ?? '{}';
}

beforeAll(async () => {
  await client.connect(transport);
  transcript.push('connect', 'log', { ok: true, serverPath });

  if (transport.stderr) {
    transport.stderr.on('data', (chunk) => {
      transcript.push('server-stderr', 'log', String(chunk));
    });
  }
});

afterAll(async () => {
  await transport.close();
  transcript.push('disconnect', 'log', { ok: true });
  transcript.flush();
});

describe('MCP docs publisher e2e', () => {
  it('outputs tools/list with input schemas', async () => {
    transcript.push('tools/list', 'request', {});
    const tools = await client.listTools();
    transcript.push('tools/list', 'response', tools);

    const toolSummary = tools.tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));

    console.log('[e2e] tools/list summary:', JSON.stringify(toolSummary, null, 2));

    expect(toolSummary.length).toBeGreaterThan(0);
    expect(toolSummary.some((t) => t.name === 'list_docs')).toBe(true);
    expect(toolSummary.some((t) => t.name === 'read_doc')).toBe(true);
    expect(toolSummary.some((t) => t.name === 'refresh_docs_index')).toBe(true);
    expect(toolSummary.some((t) => t.name === 'get_docs_status')).toBe(true);
  });

  it('outputs resources/list and resources/templates/list', async () => {
    transcript.push('resources/list', 'request', {});
    const resources = await client.listResources();
    transcript.push('resources/list', 'response', resources);

    transcript.push('resources/templates/list', 'request', {});
    const templates = await client.listResourceTemplates();
    transcript.push('resources/templates/list', 'response', templates);

    const resourceSummary = resources.resources.map((r) => ({
      uri: r.uri,
      name: r.name,
      mimeType: r.mimeType
    }));
    const templateSummary = templates.resourceTemplates.map((t) => ({
      uriTemplate: t.uriTemplate,
      name: t.name,
      mimeType: t.mimeType
    }));

    console.log('[e2e] resources/list summary:', JSON.stringify(resourceSummary, null, 2));
    console.log('[e2e] resources/templates/list summary:', JSON.stringify(templateSummary, null, 2));

    expect(Array.isArray(resources.resources)).toBe(true);
    expect(Array.isArray(templates.resourceTemplates)).toBe(true);
  });

  it('walks capabilities inventory', async () => {
    transcript.push('list_tools', 'request', {});
    const tools = await client.listTools();
    transcript.push('list_tools', 'response', tools);

    const toolNames = tools.tools.map((t) => t.name);
    console.log('[e2e] tools:', toolNames);

    expect(toolNames).toContain('list_docs');
    expect(toolNames).toContain('read_doc');
    expect(toolNames).toContain('refresh_docs_index');
    expect(toolNames).toContain('get_docs_status');

    transcript.push('list_resources', 'request', {});
    const resources = await client.listResources();
    transcript.push('list_resources', 'response', resources);
    console.log('[e2e] resources count:', resources.resources.length);

    const templates = await client.listResourceTemplates();
    transcript.push('list_resource_templates', 'response', templates);
    console.log('[e2e] resource templates:', templates.resourceTemplates.map((t) => t.uriTemplate));

    pwExpect(toolNames.length).toBeGreaterThan(0);
  });

  it('walks docs accessibility flow', async () => {
    const status = await client.callTool({ name: 'get_docs_status', arguments: {} });
    transcript.push('get_docs_status', 'response', status);
    console.log('[e2e] get_docs_status:', JSON.stringify(status, null, 2));

    const listed = await client.callTool({
      name: 'list_docs',
      arguments: { limit: 10 }
    });
    transcript.push('list_docs', 'response', listed);

    const listText = extractTextContent(listed);
    const listPayload = JSON.parse(listText);
    console.log('[e2e] list_docs total:', listPayload.total, 'count:', listPayload.count);
    console.log('[e2e] list_docs groups:', (listPayload.groups ?? []).map((g: any) => `${g.folder}:${g.count}`));

    expect(Array.isArray(listPayload.results)).toBe(true);
    expect(Array.isArray(listPayload.groups)).toBe(true);
    if ((listPayload.count ?? 0) <= 0) {
      console.warn('[e2e] list_docs returned 0 results; skipping read_doc assertion and keeping transcript for diagnosis');
      return;
    }

    const first = listPayload.results[0];
    expect(first.uri).toMatch(/^feathers-doc:\/\/docs\//);

    const read = await client.callTool({
      name: 'read_doc',
      arguments: { uri: first.uri }
    });
    transcript.push('read_doc', 'response', read);

    const readText = extractTextContent(read);
    const readPayload = JSON.parse(readText);
    console.log('[e2e] read_doc uri:', readPayload.uri);
    console.log('[e2e] read_doc snippet:', String(readPayload.content).slice(0, 240));

    pwExpect(String(readPayload.content).length).toBeGreaterThan(0);
  });

  it('returns all relevant sections in grouped list output', async () => {
    const listed = await client.callTool({
      name: 'list_docs',
      arguments: { limit: 20 }
    });
    transcript.push('list_docs_sections_check', 'response', listed);

    const listText = extractTextContent(listed);
    const listPayload = JSON.parse(listText);
    const results = Array.isArray(listPayload.results) ? listPayload.results : [];
    const groups = Array.isArray(listPayload.groups) ? listPayload.groups : [];

    const expectedSections = new Set(
      results.map((page: any) => {
        const folder = pathPosix.posix.dirname(String(page.relativePath).replaceAll('\\\\', '/'));
        return folder === '.' ? '/' : folder;
      })
    );

    const groupedSections = new Set(groups.map((group: any) => String(group.folder)));

    // groups can include more sections than the current paged results when
    // server returns global section navigation metadata.
    for (const section of expectedSections) {
      expect(groupedSections.has(section)).toBe(true);
    }

    for (const group of groups) {
      const pages = Array.isArray(group.pages) ? group.pages : [];
      expect(group.count).toBe(pages.length);

      for (const page of pages) {
        const folder = pathPosix.posix.dirname(String(page.relativePath).replaceAll('\\\\', '/'));
        const normalizedFolder = folder === '.' ? '/' : folder;
        expect(normalizedFolder).toBe(group.folder);
      }
    }
  });

  it('walks refresh flow', async () => {
    const before = await client.callTool({ name: 'get_docs_status', arguments: {} });
    transcript.push('status_before_refresh', 'response', before);

    const refreshed = await client.callTool({
      name: 'refresh_docs_index',
      arguments: { forceRebuild: false }
    });
    transcript.push('refresh_docs_index', 'response', refreshed);

    const after = await client.callTool({ name: 'get_docs_status', arguments: {} });
    transcript.push('status_after_refresh', 'response', after);

    const afterText = extractTextContent(after);
    const afterPayload = JSON.parse(afterText);
    console.log('[e2e] refresh complete. pages:', afterPayload.pages, 'commit:', afterPayload.commit, 'docsDirResolved:', afterPayload.docsDirResolved);
    if (Array.isArray(afterPayload.discoveryWarnings) && afterPayload.discoveryWarnings.length > 0) {
      console.warn('[e2e] discovery warnings:', afterPayload.discoveryWarnings);
    }

    expect(typeof afterPayload.pages).toBe('number');
    expect(typeof afterPayload.commit).toBe('string');
    expect(typeof afterPayload.docsDirResolved).toBe('string');
  });
});
