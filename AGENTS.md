# AgenticLeaf Project Documentation

## Overview
AgenticLeaf is an agent-first, self-hosted LaTeX editor and compilation engine based on Overleaf Community Edition (CLSI and parsers). It is built specifically for autonomous AI agents (especially Hermes Agent) with native Model Context Protocol (MCP) and REST APIs.

## Conventions
- Working directory: `/home/server/Programming/AgenticLeaf`
- Node environment: Node.js with `NODE_OPTIONS="-r /home/server/.local/lib/clean-exit.js"` for clean event-loop termination.
- Compiler: Tectonic 0.17.0 located at `/home/server/.local/bin/tectonic`.
- Storage: Git-backed project directories under `data/projects`.
- Licensing: GNU AGPLv3 with Overleaf copyright attribution in `NOTICE`.

## Core Architecture
- `src/core/parsers/`: Ported Overleaf log parsers for LaTeX, BibTeX, and ChkTeX diagnostics.
- `src/core/security/path-sanitizer.js`: Path traversal and injection boundary containment.
- `src/core/compiler/clsi-engine.js`: Overleaf CLSI compile pipeline with Tectonic, process isolation, and timeout enforcement.
- `src/core/storage/project-store.js`: Git-backed project and file store with automatic versioning, diffing, checkpointing, and zip export.
- `src/core/validator/pdf-validator.js`: PDF validation with ToUnicode/FlateDecode stream extraction and page count / keyword verification.
- `src/core/workflows/resume-tailor.js`: Primary resume tailoring workflow preserving factual history and original file.
- `src/api/server.js`: Express 5 REST API with Overleaf CLSI endpoints and agent endpoints.
- `src/mcp/server.js`: Native Model Context Protocol (MCP) server exposing 14 tools over stdio.
- `bin/agenticleaf.js`: CLI executable supporting `serve`, `mcp`, `compile`, and `tailor`.

## Test Commands
- Run all unit and integration tests:
  ```bash
  npm test
  ```
- Run full end-to-end verification suite:
  ```bash
  npm run test:e2e
  ```
