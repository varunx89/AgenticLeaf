# AgenticLeaf REST API Reference

AgenticLeaf provides a unified REST API supporting both upstream Overleaf CLSI-compatible endpoints and extended endpoints for AI agents.

Default Port: `3013` (configurable via `PORT` environment variable or `--port` flag).

---

## Upstream Overleaf CLSI Endpoints

### 1. Compile Project
**`POST /project/:projectId/compile`**

Compiles a project using the Overleaf CLSI request format. If resources are specified, they are written to the project before compilation.

#### Request Body
```json
{
  "compile": {
    "options": {
      "compiler": "tectonic",
      "timeout": 60
    },
    "rootResourcePath": "main.tex",
    "resources": [
      {
        "path": "main.tex",
        "content": "\\documentclass{article}\\begin{document}Hello Overleaf CLSI\\end{document}"
      }
    ]
  }
}
```

#### Response (`200 OK`)
```json
{
  "compile": {
    "status": "success",
    "outputFiles": [
      {
        "type": "pdf",
        "filename": "output.pdf",
        "url": "/project/proj_123/output/output.pdf",
        "size": 16688
      },
      {
        "type": "log",
        "filename": "output.log",
        "url": "/project/proj_123/output/output.log",
        "size": 2048
      }
    ],
    "diagnostics": {
      "clean": true,
      "errors": [],
      "warnings": [],
      "typesetting": [],
      "all": []
    },
    "durationMs": 1240
  }
}
```

---

### 2. Retrieve Output File
**`GET /project/:projectId/output/:filename`**

Retrieves compiled artifacts. Content-Type is automatically set to `application/pdf` for `.pdf` files, `text/plain` for `.log` files, and `application/octet-stream` for other files.

---

### 3. Delete Project
**`DELETE /project/:projectId`**

Deletes the specified project directory and its history.

---

## Extended AgenticLeaf Endpoints

### `GET /health`
Returns service health and version.
```json
{
  "status": "ok",
  "service": "AgenticLeaf",
  "version": "1.0.0",
  "timestamp": "2026-10-23T14:50:00.000Z"
}
```

### `GET /api/projects`
Lists all projects.

### `POST /api/projects`
Creates a new project.
```json
{
  "name": "Research Paper",
  "compiler": "tectonic",
  "rootResourcePath": "paper.tex",
  "initialFiles": {
    "paper.tex": "\\documentclass{article}..."
  }
}
```

### `GET /api/projects/:id`
Returns metadata and list of project files with size and modification dates.

### `GET /api/projects/:id/files/*filepath`
Reads file content at relative path.

### `POST /api/projects/:id/files/*filepath`
Writes or replaces file content and commits to Git.
```json
{
  "content": "\\documentclass{article}...",
  "commitMessage": "feat: update introduction"
}
```

### `PATCH /api/projects/:id/files/*filepath`
Applies targeted find-and-replace edit to file and commits to Git.
```json
{
  "old_string": "Original Text",
  "new_string": "Updated Text",
  "replace_all": false,
  "commitMessage": "patch: refine text"
}
```

### `DELETE /api/projects/:id/files/*filepath`
Deletes file and commits deletion to Git.

### `GET /api/projects/:id/diff`
Returns unified Git diff.

### `POST /api/projects/:id/compile`
Compiles project with specified options.

### `GET /api/projects/:id/diagnostics`
Returns structured diagnostics from latest compilation.

### `GET /api/projects/:id/export/pdf`
Downloads compiled PDF.

### `GET /api/projects/:id/export/zip`
Downloads complete project zip archive.

### `POST /api/projects/:id/tailor-resume`
Executes the resume tailoring workflow.
```json
{
  "job_description": "Full text of target job posting...",
  "target_file": "resume.tex",
  "target_page_count": 1,
  "preserve_original": true
}
```
