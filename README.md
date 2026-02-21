# feathers-docs-mcp

Read-only MCP server for discovering and reading **FeathersJS documentation** from the official Feathers repository.

It is designed for tooling and AI assistants that need reliable, structured access to docs through MCP tools/resources.

---

## What this server does

- Clones (or updates) the Feathers repository into a local cache
- Scans `docs/` for markdown pages
- Parses metadata for each page (title, headings, checksum, modified time)
- Exposes MCP tools to list/read docs and inspect server status
- Exposes a resource template for direct URI-based doc retrieval

## Non-goals

- No vector embeddings or semantic ranking pipeline
- No documentation mutation/write APIs
- No model inference layer

---

## MCP capabilities

### Tools

#### `list_docs`
Lists available Feathers docs pages with optional text filtering and pagination.

**Input**
- `query?: string` — filters by title, relative path, and headings
- `limit?: number` — max items to return (1–20)
- `offset?: number` — pagination offset (>= 0)

**Output**
- `total`, `offset`, `limit`, `count`
- `results[]`: `{ uri, title, relativePath, headings }`
- `groups[]`: grouped view by folder (`section -> page count + pages`)

---

#### `read_doc`
Reads a documentation markdown page by URI.

**Input**
- `uri: string` — must start with `feathers-doc://docs/`

**Output**
- `{ uri, content }` with full markdown text

---

#### `refresh_docs_index`
Pulls latest docs from git and rebuilds in-memory page index.

**Input**
- `forceRebuild?: boolean` (currently informational)

**Output**
- `{ ok, forceRebuild, commit, lastSyncAt, pages }`

---

#### `get_docs_status`
Returns repository/index health metadata.

**Output**
- `repoUrl`, `branch`, `commit`, `lastSyncAt`
- `pages`, `docsDirResolved`, `docsDirExists`
- `discoveryWarnings[]`, `cacheDir`

### Resource template

- `feathers-doc://docs/{path}`

Use this to retrieve markdown directly as a resource (MIME: `text/markdown`).

---

## Installation

```bash
npm install
```

## Build

```bash
npm run build
```

### Validation stack

- MCP server/runtime is built with **FastMCP**.
- Tool argument validation uses **Zod** schemas passed directly to FastMCP.
- No manual SDK passthrough schema shims are required.

## Run (stdio MCP server)

```bash
npm start
```

---

## Configuration

Environment variables:

- `FEATHERS_REPO_URL` (default: `https://github.com/feathersjs/feathers.git`)
- `FEATHERS_REPO_BRANCH` (default: `dove`)
- `FEATHERS_MCP_CACHE_DIR` (default: `./.cache/feathers-mcp`)
- `TOP_K` (default: `6`)

### Notes on configuration

- `TOP_K` defines the default page count when `list_docs.limit` is not provided.
- Docs directory is strict and expected at `<cacheDir>/feathers-repo/docs`.

---

## Example MCP client configuration

```json
{
  "mcpServers": {
    "feathers-docs": {
      "command": "node",
      "args": ["/home/bob/feathers-mcp/dist/index.js"],
      "disabled": false,
      "autoApprove": [],
      "env": {
        "FEATHERS_REPO_BRANCH": "dove"
      }
    }
  }
}
```

---

## Runtime flow

1. Server starts and resolves config.
2. Repository is cloned if missing, otherwise fetched and force-aligned to target branch.
3. Markdown docs are discovered recursively under `docs/`.
4. Metadata is parsed for each page.
5. Tools/resources serve indexed data from memory.

---

## Security and safety

- Read-only behavior for docs content.
- URI-to-file resolution prevents path traversal.
- Operational logs go to `stderr` to avoid corrupting stdio MCP framing.

---

## Development and testing

### E2E tests (Vitest)

```bash
npm run test:e2e
```

Watch mode:

```bash
npm run test:e2e:watch
```

Coverage includes:

- capability discovery (`listTools`, `listResources`, `listResourceTemplates`)
- docs flow (`get_docs_status` -> `list_docs` -> `read_doc`)
- refresh flow (`refresh_docs_index` -> `get_docs_status`)

Transcript artifact:

- `artifacts/e2e-transcript.jsonl`

---

## Project structure

- `src/index.ts` — MCP server bootstrap and tool/resource registration
- `src/config.ts` — env parsing + runtime configuration
- `src/docs/sync.ts` — `isomorphic-git` clone/fetch/force-checkout lifecycle
- `src/docs/discover.ts` — recursive markdown file discovery
- `src/docs/parse.ts` — markdown parsing + metadata extraction
- `src/types.ts` — shared domain types
- `src/utils.ts` — helpers (URI, hashing, snippets)

---

## License

MIT (or your project license if different).
