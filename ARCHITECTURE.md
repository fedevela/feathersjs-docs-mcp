# ARCHITECTURE

This document describes the architecture of `feathersjs-mcp`, a read-only MCP server that indexes and serves FeathersJS documentation.

## 1. Purpose and scope

`feathersjs-mcp` provides structured access to Feathers documentation through MCP:

- **Tools** for listing, reading, refreshing, and inspecting docs status
- **Resource template** for URI-based markdown retrieval

The server is intentionally focused on documentation publishing and retrieval. It does not provide mutation APIs or generation workflows.

---

## 2. High-level architecture

The system is organized into three layers:

1. **Transport + MCP API layer** (`src/index.ts`)
   - Registers tools/resources
   - Validates tool inputs (FastMCP + Zod schemas)
   - Formats MCP responses

2. **Docs indexing pipeline** (`src/docs/*`)
   - Sync repository (`sync.ts`)
   - Discover markdown files (`discover.ts`)
   - Parse file metadata (`parse.ts`)

3. **Core config/types/utils** (`src/config.ts`, `src/types.ts`, `src/utils.ts`)
   - Runtime configuration
   - Shared metadata model
   - Utility helpers (hashing, URI normalization)

All indexed state is kept in-memory in the server process.

---

## 3. Runtime lifecycle

### Startup flow

On process start (`src/index.ts`):

1. Read environment configuration via `getConfig()`.
2. Run `refreshDocs()`:
   - `syncDocsRepo(config)` clones/fetches repository
   - Resolve docs directory (`<repoDir>/docs`)
   - Discover markdown files recursively
   - Parse each file into `PageMeta`
   - Store page index in memory
3. Create `FastMCP` server and register resources/tools.
4. Start stdio transport (`transportType: "stdio"`).

### Refresh flow

When `refresh_docs_index` tool is called, the same indexing pipeline is re-executed and in-memory data is replaced atomically at function level.

---

## 4. Data model

Primary model: `PageMeta` (`src/types.ts`)

- `uri`: stable MCP URI (`feathers-doc://docs/...`)
- `title`: resolved title (frontmatter > first heading > filename)
- `relativePath`: file path relative to `docs/`
- `headings`: extracted markdown headings
- `checksum`: SHA-256 of raw file content
- `lastModified`: filesystem modified time (ms)

This model is generated during parsing and used by listing/searching tools.

---

## 5. Components and responsibilities

## `src/index.ts`

- Owns runtime state:
  - `pages: PageMeta[]`
  - `commit`, `lastSyncAt`
  - `docsDirResolved`, `discoveryWarnings`
- Registers MCP API surface:
  - `list_docs`
  - `read_doc`
  - `refresh_docs_index`
  - `get_docs_status`
  - `feathers-doc://docs/{path}` resource template
- Enforces safe URI-to-file resolution (`resolveDocFilePath`) with path traversal protection.

## `src/docs/sync.ts`

- Handles git synchronization via `isomorphic-git`:
  - Clone when repository is missing
  - Fetch + force checkout to remote branch commit when repository exists
- Returns `SyncResult` with commit hash and change detection.

## `src/docs/discover.ts`

- Recursively scans docs directory for `.md` files.
- Returns sorted file list for deterministic indexing.

## `src/docs/parse.ts`

- Parses markdown with `gray-matter`.
- Extracts headings from markdown body.
- Resolves title with fallback strategy.
- Builds normalized `PageMeta` object.

## `src/config.ts`

- Reads and normalizes environment variables.
- Produces resolved filesystem paths (`cacheDir`, `repoDir`, `docsDir`).

## `src/utils.ts`

- Utility helpers:
  - SHA-256 hashing
  - Docs URI normalization
  - Text snippet helper for compact previews

---

## 6. MCP interface contract

### Tools

- `list_docs(query?, limit?, offset?)`
  - Filter and paginate docs pages
  - Returns paged `results` plus folder `groups` built from the full filtered set

- `read_doc(uri)`
  - Reads markdown content for a docs URI

- `refresh_docs_index(forceRebuild?)`
  - Re-syncs repository and rebuilds index

- `get_docs_status()`
  - Exposes sync/index health and metadata

### Resource template

- `feathers-doc://docs/{path}`
  - Returns `text/markdown` contents

---

## 7. Caching and state strategy

- **Filesystem cache**: local git checkout under configured cache directory
- **Memory cache**: parsed page metadata loaded on startup/refresh

This gives fast list/read operations after initial sync while keeping source-of-truth in git.

---

## 8. Safety and constraints

- Read-only behavior for docs consumption
- URI prefix validation: must start with `feathers-doc://docs/`
- Absolute path resolution + root prefix check to prevent traversal
- Logs emitted to `stderr` to avoid stdio framing interference

---

## 9. Operational considerations

- **Startup dependency**: requires git access to target repo/branch
- **Branch pinning**: controlled via `FEATHERS_REPO_BRANCH`
- **Pagination**: hard `limit` cap of 20 in tool schema
- **Section navigation semantics**: `groups` is not paginated; it reflects the entire filtered corpus
- **Determinism**: markdown file list is sorted before parse/index

---

## 10. Testing strategy

E2E tests (Vitest) validate MCP behavior and docs workflows:

- Capability discovery
- Status/list/read happy path
- Refresh + status verification

Transcript logging is available under `artifacts/e2e-transcript.jsonl`.

---

## 11. Extension points

Potential future enhancements:

- Section-first tool endpoint (`list_sections`)
- Additional metadata extraction (tags, frontmatter fields)
- Incremental index updates by checksum diff
- Structured JSON schemas for output payloads in docs

---

## 12. Dependencies

This section summarizes the main runtime and development dependencies and how they map to architecture responsibilities.

### Runtime dependencies

- `fastmcp`
  - Provides MCP framework primitives for tools/resources and transport startup
  - Used in `src/index.ts` to expose tools/resources and run stdio transport

- `zod`
  - Tool input schemas consumed directly by FastMCP
  - Used in `src/index.ts` for `list_docs`, `read_doc`, and `refresh_docs_index` parameter validation

- `gray-matter`
  - Frontmatter parsing for markdown files
  - Used in `src/docs/parse.ts` to resolve page metadata/title

- `isomorphic-git`
  - Portable, library-based git operations (clone/fetch/checkout)
  - Used in `src/docs/sync.ts` to avoid reliance on system `git` binary

### Development dependencies

- `typescript`
  - Static typing and compilation (`npm run build`)

- `tsx`
  - Fast TypeScript execution for local development (`npm run dev` uses `tsx src/index.ts`)

- `vitest`
  - Test runner used by e2e suite (`npm run test:e2e`)

- `@playwright/test`
  - Included for e2e/testing workflows and tooling compatibility

- `@types/node`
  - Type definitions for Node.js built-ins

### Platform/runtime assumptions

- Node.js runtime with access to `fs` and `path`
- Network access to the configured git remote for repository synchronization

---

## 13. Packaging and publishing architecture

The package is structured to be publish-ready in npm while keeping runtime behavior minimal:

- **Entry point**: `dist/index.js` (compiled from `src/index.ts`)
- **Type declarations**: `dist/index.d.ts`
- **CLI binary**: `feathersjs-mcp` mapped to `dist/index.js`
- **Published files**: constrained via `package.json#files` to reduce package size/noise

`prepublishOnly` enforces quality gates before release:

1. TypeScript build (`npm run build`)
2. End-to-end MCP validation (`npm run test:e2e`)

This ensures consumers install a validated artifact consistent with the runtime architecture described above.
