import crypto from 'node:crypto';

/**
 * Create a deterministic SHA-256 hash for a string payload.
 */
export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Convert a docs-relative path to the MCP resource URI format.
 */
export function toUri(relativePath: string): string {
  return `feathers-doc://docs/${relativePath.replaceAll('\\', '/')}`;
}

/**
 * Build a compact excerpt around a query match for display/search previews.
 */
export function snippet(text: string, query: string, max = 280): string {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0 || text.length <= max) return text.slice(0, max);
  const start = Math.max(0, idx - Math.floor(max / 3));
  return text.slice(start, start + max);
}
