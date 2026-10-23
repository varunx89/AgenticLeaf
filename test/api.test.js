process.on('beforeExit', (code) => process.exit(code || 0));

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { createServer } = require('../src/api/server');
const ProjectStore = require('../src/core/storage/project-store');
const CLSIEngine = require('../src/core/compiler/clsi-engine');

test('REST API - full lifecycle and Overleaf CLSI endpoints', async () => {
  const testDataDir = path.join(__dirname, '../data/test_api_' + Date.now());
  const projectStore = new ProjectStore(testDataDir);
  const clsiEngine = new CLSIEngine();
  const app = createServer({ projectStore, clsiEngine });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData = await healthRes.json();
    assert.strictEqual(healthRes.status, 200);
    assert.strictEqual(healthData.status, 'ok');
    assert.strictEqual(healthData.service, 'AgenticLeaf');

    // 2. Create project
    const createRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'API Test Project',
        compiler: 'tectonic',
        rootResourcePath: 'main.tex',
        initialFiles: {
          'main.tex': '\\documentclass{article}\n\\begin{document}\nAPI Project Content\n\\end{document}\n'
        }
      })
    });
    assert.strictEqual(createRes.status, 201);
    const createData = await createRes.json();
    const projectId = createData.project.id;
    assert.ok(projectId);

    // 3. List projects
    const listRes = await fetch(`${baseUrl}/api/projects`);
    const listData = await listRes.json();
    assert.strictEqual(listRes.status, 200);
    assert.ok(listData.projects.some(p => p.id === projectId));

    // 4. Read project file
    const readRes = await fetch(`${baseUrl}/api/projects/${projectId}/files/main.tex`);
    const readData = await readRes.json();
    assert.strictEqual(readRes.status, 200);
    assert.ok(readData.content.includes('API Project Content'));

    // 5. Patch file
    const patchRes = await fetch(`${baseUrl}/api/projects/${projectId}/files/main.tex`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        old_string: 'API Project Content',
        new_string: 'Patched Content for Compile',
        replace_all: false
      })
    });
    assert.strictEqual(patchRes.status, 200);

    // 6. Inspect diff
    const diffRes = await fetch(`${baseUrl}/api/projects/${projectId}/diff`);
    const diffData = await diffRes.json();
    assert.strictEqual(diffRes.status, 200);
    assert.ok(diffData.diff.includes('Patched Content for Compile'));

    // 7. Overleaf CLSI Compatible Compile: POST /project/:projectId/compile
    const clsiRes = await fetch(`${baseUrl}/project/${projectId}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compile: {
          options: { compiler: 'tectonic' },
          rootResourcePath: 'main.tex',
          resources: [
            {
              path: 'extra.tex',
              content: '% extra comment'
            }
          ]
        }
      })
    });
    assert.strictEqual(clsiRes.status, 200);
    const clsiData = await clsiRes.json();
    assert.strictEqual(clsiData.compile.status, 'success');
    assert.ok(clsiData.compile.outputFiles.length > 0);
    assert.ok(clsiData.compile.outputFiles.some(f => f.type === 'pdf'));

    // 8. Overleaf CLSI Output file retrieval: GET /project/:projectId/output/output.pdf
    const pdfRes = await fetch(`${baseUrl}/project/${projectId}/output/output.pdf`);
    assert.strictEqual(pdfRes.status, 200);
    assert.strictEqual(pdfRes.headers.get('content-type'), 'application/pdf');
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    assert.ok(pdfBuffer.length > 100);
    assert.ok(pdfBuffer.toString('latin1').startsWith('%PDF-'));

    // 9. DELETE project
    const delRes = await fetch(`${baseUrl}/project/${projectId}`, { method: 'DELETE' });
    assert.strictEqual(delRes.status, 200);
  } finally {
    server.close();
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }
});
