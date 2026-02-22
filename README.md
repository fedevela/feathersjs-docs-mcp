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

## Run (local stdio)

```bash
FEATHERS_MCP_TRANSPORT=stdio npm start
```

## Test

```bash
npm run test:e2e
```

---

## Local MCP quickstart

This package is designed to run as a **local MCP server** through your MCP client.

### Configure your MCP client to run this local build

```json
{
  "mcpServers": {
    "feathersjs-docs": {
      "command": "node",
      "args": ["/absolute/path/to/feathersjs-mcp/dist/index.js"],
      "env": {
        "FEATHERS_MCP_TRANSPORT": "stdio",
        "FEATHERS_REPO_BRANCH": "dove"
      }
    }
  }
}
```

Build first (`npm run build`) so `dist/index.js` exists, then restart your IDE or MCP client.

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

For local MCP usage over stdio, set `FEATHERS_MCP_TRANSPORT=stdio`.

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

## License

MIT
