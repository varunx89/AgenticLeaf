process.on('beforeExit', (code) => process.exit(code || 0));

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { createMcpServer } = require('../src/mcp/server');
const ProjectStore = require('../src/core/storage/project-store');
const CLSIEngine = require('../src/core/compiler/clsi-engine');

test('MCP Server - tools registration and execution over protocol', async () => {
  const testDataDir = path.join(__dirname, '../data/test_mcp_' + Date.now());
  const projectStore = new ProjectStore(testDataDir);
  const clsiEngine = new CLSIEngine();

  const server = createMcpServer({ projectStore, clsiEngine });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'agent-client', version: '1.0.0' }, { capabilities: {} });
  await client.connect(clientTransport);

  try {
    // 1. List tools
    const toolsRes = await client.listTools();
    assert.ok(Array.isArray(toolsRes.tools));
    assert.strictEqual(toolsRes.tools.length, 14);
    const toolNames = toolsRes.tools.map(t => t.name);
    assert.ok(toolNames.includes('create_project'));
    assert.ok(toolNames.includes('compile_project'));
    assert.ok(toolNames.includes('tailor_resume'));
    assert.ok(toolNames.includes('validate_pdf'));

    // 2. Create project tool
    const createRes = await client.callTool({
      name: 'create_project',
      arguments: {
        name: 'MCP Document',
        compiler: 'tectonic',
        rootResourcePath: 'main.tex',
        initialFiles: {
          'main.tex': '\\documentclass{article}\n\\begin{document}\nMCP Document Original\n\\end{document}\n'
        }
      }
    });
    assert.ok(!createRes.isError);
    const projectMeta = JSON.parse(createRes.content[0].text);
    const projectId = projectMeta.id;
    assert.ok(projectId);

    // 3. Patch project file tool
    const patchRes = await client.callTool({
      name: 'patch_project_file',
      arguments: {
        projectId,
        filePath: 'main.tex',
        old_string: 'MCP Document Original',
        new_string: 'MCP Document Patched by Agent'
      }
    });
    assert.ok(!patchRes.isError);

    // 4. Get diff tool
    const diffRes = await client.callTool({
      name: 'get_project_diff',
      arguments: { projectId }
    });
    assert.ok(!diffRes.isError);
    assert.ok(diffRes.content[0].text.includes('MCP Document Patched by Agent'));

    // 5. Compile project tool
    const compileRes = await client.callTool({
      name: 'compile_project',
      arguments: { projectId }
    });
    assert.ok(!compileRes.isError);
    const compileData = JSON.parse(compileRes.content[0].text);
    assert.strictEqual(compileData.status, 'success');
    assert.ok(compileData.pdfPath);

    // 6. Validate PDF tool
    const valRes = await client.callTool({
      name: 'validate_pdf',
      arguments: {
        projectId,
        target_page_count: 1,
        required_keywords: ['MCP', 'Document']
      }
    });
    assert.ok(!valRes.isError);
    const valData = JSON.parse(valRes.content[0].text);
    assert.strictEqual(valData.valid, true);
    assert.strictEqual(valData.pageCount, 1);

    // 7. Export PDF tool
    const exportRes = await client.callTool({
      name: 'export_pdf',
      arguments: { projectId }
    });
    assert.ok(!exportRes.isError);
    const exportData = JSON.parse(exportRes.content[0].text);
    assert.ok(exportData.path);
    assert.ok(exportData.sizeBytes > 100);
  } finally {
    await client.close();
    await server.close();
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }
});
