# AgenticLeaf 🍃

**AgenticLeaf** is an agent-first, self-hosted LaTeX editor and compilation engine adapted from the official Overleaf open-source codebase (CLSI and parsers). It is optimized for autonomous AI agents (especially [Hermes Agent](https://hermes-agent.nousresearch.com/docs)) to create, edit, patch, compile, validate, and export LaTeX documents headlessly and programmatically.

---

## Key Features

- **Overleaf CLSI Compatibility**: Reuses and adapts Overleaf's Common LaTeX Service Interface (CLSI) compile contracts (`POST /project/:id/compile`), output file serving (`GET /project/:id/output/:filename`), and log parsing logic.
- **Native Model Context Protocol (MCP) Server**: Provides 14 native MCP tools over standard I/O (`stdio`), allowing AI agents (Hermes, Claude, etc.) to manage projects, edit files, inspect diffs, compile documents, and validate PDFs without needing manual shell execution.
- **Git-Backed Project Storage**: Every project is automatically backed by an isolated Git repository. Every file write, patch, and deletion is recorded with structured commit messages, enabling instant checkpointing, rolling back, and unified diff inspection.
- **Self-Contained Tectonic Compiler**: Uses the modern Tectonic engine (with on-demand TeX package fetching, fast compilation, and reliable sandboxing) alongside traditional engines (XeLaTeX, pdfLaTeX, LuaLaTeX).
- **Primary Workflow: Factual-Preserving Resume Tailoring**: Automatically tailors a LaTeX resume to any job description:
  - Preserves 100% of factual career history (companies, dates, degrees).
  - Keeps an immutable backup copy of the original resume (`<file>.original.tex`) and a Git tag checkpoint.
  - Optimizes summary and skills sections with active verbs and JD-aligned keywords.
  - Compiles the document headlessly and validates the output (ensuring exact 1-page PDF constraints and keyword density).
- **Deep Log Diagnostics**: Overleaf log parsers categorize errors, line numbers (`l.<number>`), package warnings, and typesetting boxes (`Overfull \hbox`, `Underfull \vbox`).
- **Security Isolation**: `PathSanitizer` enforces strict boundary confinement, blocking path traversal (`../`), null byte injections, and file system escapes. Compilations run with hard timeouts and process isolation.
- **AGPL-3.0 Licensing**: Preserves applicable upstream Overleaf Community Edition licensing obligations with full attribution in `LICENSE` and `NOTICE`.

---

## Architecture

```
+-------------------------------------------------------------+
|                  AI Agents (Hermes, Claude)                 |
+------------------------------+------------------------------+
                               | (MCP stdio or REST API)
+------------------------------v------------------------------+
|                   AgenticLeaf Server & CLI                  |
|                                                             |
|  +------------------------+    +-------------------------+  |
|  | Overleaf CLSI REST API |    | Native MCP Server       |  |
|  | (Express 5.x)          |    | (@modelcontextprotocol) |  |
|  +-----------+------------+    +------------+------------+  |
|              |                              |               |
|  +-----------v------------------------------v------------+  |
|  |                   Workflows Engine                   |  |
|  |   - Resume Tailoring (Factual History & ATS Match)   |  |
|  +-----------+------------------------------+------------+  |
|              |                              |               |
|  +-----------v------------+    +------------v------------+  |
|  | CLSI Compiler Engine   |    | Git-Backed Storage      |  |
|  |   - Tectonic / TeXLive |    |   - Local Project Repos |  |
|  |   - Execution Sandbox  |    |   - Checkpoints & Diffs |  |
|  +-----------+------------+    +-------------------------+  |
|              |                                              |
|  +-----------v------------+    +-------------------------+  |
|  | Overleaf Log Parsers   |    | PDF Stream Validator    |  |
|  |   - LaTeX / Bib / Chk  |    |   - FlateDecode/CMap    |  |
|  +------------------------+    +-------------------------+  |
+-------------------------------------------------------------+
```

---

## Quickstart & CLI

### Prerequisites
- Node.js >= 18
- Git
- Tectonic (installed at `~/.local/bin/tectonic` or on system PATH)

### Installation
```bash
cd /home/server/Programming/AgenticLeaf
npm install
```

### CLI Commands
```bash
# Start REST API server on default port 3013
./bin/agenticleaf.js serve

# Start REST API on a custom port
./bin/agenticleaf.js serve --port 8080

# Start Native MCP server (stdio transport for agents)
./bin/agenticleaf.js mcp

# Compile a project from CLI
./bin/agenticleaf.js compile <projectId> --compiler tectonic

# Tailor a resume to a job description
./bin/agenticleaf.js tailor <projectId> --jd path/to/job_description.txt
```

---

## Native MCP Server Setup for Hermes Agent

To connect AgenticLeaf to Hermes Agent or any MCP client, add the following entry to your MCP configuration (e.g. `~/.hermes/config.yaml` or `hermes mcp add`):

```yaml
mcpServers:
  agenticleaf:
    command: "node"
    args:
      - "/home/server/Programming/AgenticLeaf/bin/agenticleaf.js"
      - "mcp"
    env:
      NODE_OPTIONS: "-r /home/server/.local/lib/clean-exit.js"
```

### Available MCP Tools

| Tool Name | Description | Key Arguments |
|---|---|---|
| `create_project` | Create a new LaTeX project with Git versioning | `name`, `compiler`, `initialFiles` |
| `list_projects` | List all projects and metadata | None |
| `get_project` | Get project metadata and file tree | `projectId` |
| `read_project_file` | Read content of a file | `projectId`, `filePath` |
| `write_project_file` | Write/overwrite file and commit to Git | `projectId`, `filePath`, `content` |
| `patch_project_file` | Targeted find-and-replace edit in file | `projectId`, `filePath`, `old_string`, `new_string` |
| `delete_project_file` | Delete file from project | `projectId`, `filePath` |
| `get_project_diff` | Inspect Git diff of recent edits | `projectId`, `fromCommit`, `toCommit` |
| `compile_project` | Compile project with CLSI engine | `projectId`, `compiler`, `rootResourcePath` |
| `get_compile_diagnostics`| Retrieve parsed errors/warnings from log | `projectId` |
| `export_pdf` | Retrieve compiled PDF path and metadata | `projectId` |
| `export_project_zip` | Export project as zip archive | `projectId` |
| `tailor_resume` | Automatically tailor resume to JD | `projectId`, `job_description`, `target_page_count` |
| `validate_pdf` | Validate PDF integrity, page count, and keywords | `projectId`, `target_page_count`, `required_keywords` |

See [`docs/MCP.md`](docs/MCP.md) for full tool schemas and sample agent invocations.

---

## Overleaf CLSI Compatibility

AgenticLeaf implements the upstream Overleaf CLSI compile specification:

### 1. Compile Request: `POST /project/:projectId/compile`
```json
{
  "compile": {
    "options": {
      "compiler": "tectonic",
      "timeout": 60
    },
    "rootResourcePath": "main.tex",
    "resources": [
      { "path": "main.tex", "content": "\\documentclass{article}..." }
    ]
  }
}
```

### 2. Compile Response
```json
{
  "compile": {
    "status": "success",
    "outputFiles": [
      { "type": "pdf", "filename": "output.pdf", "url": "/project/proj_1/output/output.pdf", "size": 16688 },
      { "type": "log", "filename": "output.log", "url": "/project/proj_1/output/output.log", "size": 2048 }
    ],
    "diagnostics": {
      "clean": true,
      "errors": [],
      "warnings": []
    },
    "durationMs": 1240
  }
}
```

### 3. Output Retrieval: `GET /project/:projectId/output/:filename`
Streams the requested output artifact (`output.pdf`, `output.log`, `main.pdf`) with proper MIME types (`application/pdf`, `text/plain`).

See [`docs/API.md`](docs/API.md) for complete REST API reference.

---

## Verification & Testing

Run the comprehensive test suite:
```bash
# Run unit and integration tests
npm test

# Run end-to-end full workflow verification
npm run test:e2e
```

All 18 unit/integration tests and the 8-step end-to-end verification suite run deterministically and exercise the complete application workflow.

---

## Licensing & Attribution

AgenticLeaf is licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).
This project adapts and derives components from the Overleaf Community Edition (Common LaTeX Service Interface - CLSI and clsi-parsers), Copyright (c) 2014-2024 Overleaf (Digital Science / Overleaf Ltd). See [NOTICE](NOTICE) for complete attribution.
