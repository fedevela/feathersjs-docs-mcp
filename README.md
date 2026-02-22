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

## Test

```bash
npm run test:e2e
```

---

## Configuration

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
