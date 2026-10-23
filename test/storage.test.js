process.on('beforeExit', (code) => process.exit(code || 0));

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const ProjectStore = require('../src/core/storage/project-store');

const testBaseDir = path.join(__dirname, '../data/test_storage_run');

test('ProjectStore - lifecycle: create, read, write, patch, diff, checkpoint, export', async () => {
  if (fs.existsSync(testBaseDir)) {
    fs.rmSync(testBaseDir, { recursive: true, force: true });
  }
  const store = new ProjectStore(testBaseDir);

  // 1. Create project
  const project = await store.createProject({
    id: 'test-p1',
    name: 'Research Paper',
    compiler: 'tectonic',
    rootResourcePath: 'main.tex',
    initialFiles: {
      'main.tex': '\\documentclass{article}\n\\begin{document}\nTitle: Alpha\n\\end{document}\n'
    }
  });
  assert.strictEqual(project.id, 'test-p1');
  assert.strictEqual(project.name, 'Research Paper');

  // 2. Read file
  const content = await store.readFile('test-p1', 'main.tex');
  assert.match(content, /Title: Alpha/);

  // 3. Patch file
  await store.patchFile('test-p1', 'main.tex', 'Title: Alpha', 'Title: Beta', false, 'feat: rename title to Beta');
  const patched = await store.readFile('test-p1', 'main.tex');
  assert.match(patched, /Title: Beta/);

  // 4. Inspect git diff
  const diff = await store.getDiff('test-p1');
  assert.match(diff, /-Title: Alpha/);
  assert.match(diff, /\+Title: Beta/);

  // 5. Create Checkpoint
  const cp = await store.createCheckpoint('test-p1', 'original');
  assert.strictEqual(cp.checkpoint, 'original');

  // 6. Write additional file
  await store.writeFile('test-p1', 'chapters/intro.tex', 'Introduction text', 'feat: add intro');
  const files = await store.listFiles('test-p1');
  const filePaths = files.map(f => f.path);
  assert.ok(filePaths.includes('main.tex'));
  assert.ok(filePaths.includes(path.normalize('chapters/intro.tex')));

  // 7. Export ZIP
  const zipPath = path.join(testBaseDir, 'test-p1.zip');
  const exportRes = await store.exportZip('test-p1', zipPath);
  assert.ok(fs.existsSync(zipPath));
  assert.ok(exportRes.bytes > 0);

  // 8. Delete project
  const deleted = await store.deleteProject('test-p1');
  assert.strictEqual(deleted, true);
  assert.strictEqual(fs.existsSync(store.getProjectDir('test-p1')), false);
});
