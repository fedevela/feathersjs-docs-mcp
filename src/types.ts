/**
 * Parsed metadata for a single documentation markdown page.
 */
export interface PageMeta {
  /** Stable MCP resource URI (e.g. `feathers-doc://docs/api/index.md`). */
  uri: string;
  /** Display title resolved from frontmatter, heading, or filename. */
  title: string;
  /** Path relative to the repository `docs/` directory. */
  relativePath: string;
  /** Markdown headings extracted from the page body. */
  headings: string[];
  /** SHA-256 checksum of raw file content. */
  checksum: string;
  /** Last modified timestamp in milliseconds from filesystem metadata. */
  lastModified: number;
}
