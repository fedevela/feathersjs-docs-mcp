import fs from 'node:fs';
import path from 'node:path';

/**
 * Recursively walk a directory and collect markdown files.
 */
function walk(dir: string, out: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
}

/**
 * Discover all markdown pages under the provided docs directory.
 */
export function discoverMarkdownFiles(docsDir: string): string[] {
  if (!fs.existsSync(docsDir)) return [];
  const files: string[] = [];
  walk(docsDir, files);
  return files.sort();
}
