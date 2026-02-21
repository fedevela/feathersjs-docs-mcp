import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { PageMeta } from '../types.js';
import { sha256, toUri } from '../utils.js';

/**
 * Extract markdown headings from body content.
 */
function extractHeadings(content: string): string[] {
  return content
    .split('\n')
    .filter((line) => /^#{1,6}\s+/.test(line))
    .map((line) => line.replace(/^#{1,6}\s+/, '').trim());
}

/**
 * Parse a markdown file into normalized page metadata used by the index.
 */
export function parseMarkdownFile(filePath: string, docsDir: string): PageMeta {
  const raw = fs.readFileSync(filePath, 'utf8');
  const stat = fs.statSync(filePath);
  const relativePath = path.relative(docsDir, filePath);
  const uri = toUri(relativePath);

  const parsed = matter(raw);
  const body = parsed.content.trim();
  const headings = extractHeadings(body);
  const title =
    (typeof parsed.data.title === 'string' ? parsed.data.title : undefined) ??
    headings[0] ??
    path.basename(filePath, '.md');
  const checksum = sha256(raw);

  const page: PageMeta = {
    uri,
    title,
    relativePath,
    headings,
    checksum,
    lastModified: stat.mtimeMs
  };

  return page;
}
