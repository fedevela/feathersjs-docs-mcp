# feathersjs-docs-mcp

Read-only MCP server for discovering and reading **FeathersJS documentation** from the official Feathers repository.

---

## Features

- Syncs the Feathers docs repository into a local cache
- Indexes markdown pages from `docs/`
- Exposes MCP tools for listing, reading, refreshing, and status checks
- Exposes `feathers-doc://docs/{path}` as a markdown resource template

## MCP Tools

- `list_docs(query?, limit?, offset?)`
- `read_doc(uri)`
- `refresh_docs_index(forceRebuild?)`
- `get_docs_status()`

---

## Installation

```bash
npm install
```

## Build

```bash
npm run build
```

## Run

```bash
npm start
```

### Run with explicit transport

`feathersjs-docs-mcp` does not auto-detect transport at runtime. Set transport explicitly:

```bash
# Default standalone streamable HTTP transport for shared localhost access
npm start

# Explicitly force stdio transport
FEATHERS_MCP_TRANSPORT=stdio npm start
```

When running with `httpStream`:

- MCP streamable HTTP endpoint: `http://127.0.0.1:8123/mcp` (customizable)
- SSE compatibility endpoint: `http://127.0.0.1:8123/sse` (provided by FastMCP)

## Test

```bash
npm run test:e2e
```

---

## Configuration

- `FEATHERS_MCP_TRANSPORT` (default: `httpStream`, values: `stdio` | `httpStream`)
- `FEATHERS_MCP_HTTP_HOST` (default: `127.0.0.1`)
- `FEATHERS_MCP_HTTP_PORT` (default: `8123`)
- `FEATHERS_MCP_HTTP_ENDPOINT` (default: `/mcp`)
- `FEATHERS_MCP_HTTP_STATELESS` (default: `false`)
- `FEATHERS_REPO_URL` (default: `https://github.com/feathersjs/feathers.git`)
- `FEATHERS_REPO_BRANCH` (default: `dove`)
- `FEATHERS_MCP_CACHE_DIR` (default: `./.cache/feathersjs-docs-mcp`)
- `TOP_K` (default: `6`)

---

## Example MCP client config

```json
{
  "mcpServers": {
    "feathers-docs": {
      "command": "node",
      "args": ["/home/bob/feathersjs-docs-mcp/dist/index.js"],
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

## NPM publishing notes

This package is configured for publishing with:

- `repository`, `homepage`, and `bugs` metadata
- curated `files` list
- `bin` command: `feathersjs-docs-mcp`
- `engines` requirement (`node >= 20`)
- `prepublishOnly` hook (`build + e2e tests`)

Before publishing:

```bash
npm run build
npm run test:e2e
npm publish
```

---

## License

MIT
