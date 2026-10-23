# AgenticLeaf MCP Server Reference

AgenticLeaf provides a native [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server implementation via `@modelcontextprotocol/sdk`. It allows AI agents, especially Hermes Agent and Claude, to interact directly with the LaTeX compilation engine and document store over standard I/O (`stdio`).

---

## Configuration

### Hermes Agent Configuration
Add the following snippet to your Hermes Agent configuration (e.g. `config.yaml`):

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

### Claude Desktop Configuration
Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agenticleaf": {
      "command": "node",
      "args": ["/home/server/Programming/AgenticLeaf/bin/agenticleaf.js", "mcp"],
      "env": {
        "NODE_OPTIONS": "-r /home/server/.local/lib/clean-exit.js"
      }
    }
  }
}
```

---

## Registered MCP Tools

### 1. `create_project`
Create a new LaTeX project in AgenticLeaf with Git tracking initialized.
- **Arguments**:
  - `name` (string, required): Human-readable name of project.
  - `description` (string, optional): Project description.
  - `compiler` (string, optional): 'tectonic' (default), 'pdflatex', 'xelatex', 'lualatex'.
  - `rootResourcePath` (string, optional): Root document file (default `main.tex`).
  - `initialFiles` (object, optional): Key-value map of relative file path -> file content.

### 2. `list_projects`
List all existing LaTeX projects and metadata.
- **Arguments**: None.

### 3. `get_project`
Get project details, configuration, and list of files.
- **Arguments**:
  - `projectId` (string, required): Project identifier.

### 4. `read_project_file`
Read file content from a project.
- **Arguments**:
  - `projectId` (string, required): Project identifier.
  - `filePath` (string, required): Relative path inside project.

### 5. `write_project_file`
Write or overwrite a file in a project and commit to Git.
- **Arguments**:
  - `projectId` (string, required): Project identifier.
  - `filePath` (string, required): Relative path inside project.
  - `content` (string, required): File text content.
  - `commitMessage` (string, optional): Descriptive Git commit message.

### 6. `patch_project_file`
Apply targeted find-and-replace edit to a project file and commit to Git.
- **Arguments**:
  - `projectId` (string, required): Project identifier.
  - `filePath` (string, required): Relative path inside project.
  - `old_string` (string, required): Exact text to find.
  - `new_string` (string, required): Replacement text.
  - `replace_all` (boolean, optional): Replace all occurrences (default `false`).
  - `commitMessage` (string, optional): Git commit message.

### 7. `delete_project_file`
Delete a file from the project and commit deletion to Git.
- **Arguments**:
  - `projectId` (string, required): Project identifier.
  - `filePath` (string, required): Relative path inside project.
  - `commitMessage` (string, optional): Git commit message.

### 8. `get_project_diff`
Inspect Git diff of changes made to the project.
- **Arguments**:
  - `projectId` (string, required): Project identifier.
  - `fromCommit` (string, optional): Starting commit/tag (default `HEAD~1`).
  - `toCommit` (string, optional): Target commit/tag (default `HEAD`).

### 9. `compile_project`
Compile the LaTeX document using Overleaf CLSI engine and return status, PDF path, and parsed diagnostics.
- **Arguments**:
  - `projectId` (string, required): Project identifier.
  - `compiler` (string, optional): 'tectonic', 'pdflatex', 'xelatex', 'lualatex'.
  - `rootResourcePath` (string, optional): Root .tex file.
  - `timeout` (number, optional): Max compile time in seconds (default `60`).

### 10. `get_compile_diagnostics`
Get parsed LaTeX, BibTeX, and typesetting diagnostics from latest compile.
- **Arguments**:
  - `projectId` (string, required): Project identifier.

### 11. `export_pdf`
Get the absolute path and metadata of the compiled PDF for a project.
- **Arguments**:
  - `projectId` (string, required): Project identifier.

### 12. `export_project_zip`
Export all project files as a downloadable zip archive.
- **Arguments**:
  - `projectId` (string, required): Project identifier.
  - `outputZipPath` (string, optional): Destination file path.

### 13. `tailor_resume`
Automatically tailor a LaTeX resume to a job description, preserving factual history and original file, validating PDF output.
- **Arguments**:
  - `projectId` (string, required): Project identifier.
  - `job_description` (string, required): Job description text.
  - `target_file` (string, optional): File to tailor (default `resume.tex`).
  - `target_page_count` (number, optional): Page budget constraint (default `1`).

### 14. `validate_pdf`
Validate compiled PDF integrity, page count, and required keywords extraction.
- **Arguments**:
  - `projectId` (string, required): Project identifier.
  - `target_page_count` (number, optional): Expected page count.
  - `required_keywords` (array of strings, optional): Keywords required in PDF.
