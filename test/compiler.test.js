process.on('beforeExit', (code) => process.exit(code || 0));

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const CLSIEngine = require('../src/core/compiler/clsi-engine');

test('CLSIEngine - compiles valid LaTeX document with tectonic', async () => {
  const engine = new CLSIEngine();
  const testDir = path.join(__dirname, '../data/test_compile_valid');
  fs.mkdirSync(testDir, { recursive: true });

  const texContent = `\\documentclass{article}
\\begin{document}
Hello AgenticLeaf World
\\end{document}
`;
  fs.writeFileSync(path.join(testDir, 'main.tex'), texContent, 'utf-8');

  const result = await engine.compile(testDir, { rootResourcePath: 'main.tex' });
  assert.strictEqual(result.status, 'success');
  assert.ok(result.pdfPath);
  assert.ok(fs.existsSync(result.pdfPath));
  assert.ok(result.logPath);
  assert.strictEqual(result.diagnostics.clean, true);
  assert.strictEqual(result.diagnostics.errors.length, 0);
});

test('CLSIEngine - detects LaTeX compilation errors with line numbers', async () => {
  const engine = new CLSIEngine();
  const testDir = path.join(__dirname, '../data/test_compile_error');
  fs.mkdirSync(testDir, { recursive: true });

  const brokenTex = `\\documentclass{article}
\\begin{document}
Line 1
Line 2
\\undefinedControlSeqXYZ
Line 4
\\end{document}
`;
  fs.writeFileSync(path.join(testDir, 'main.tex'), brokenTex, 'utf-8');

  const result = await engine.compile(testDir, { rootResourcePath: 'main.tex' });
  assert.strictEqual(result.status, 'failure');
  assert.strictEqual(result.diagnostics.clean, false);
  assert.ok(result.diagnostics.errors.length > 0);
  assert.strictEqual(result.diagnostics.errors[0].line, 5);
});

test('CLSIEngine - handles missing root file error', async () => {
  const engine = new CLSIEngine();
  const testDir = path.join(__dirname, '../data/test_compile_missing');
  fs.mkdirSync(testDir, { recursive: true });

  const result = await engine.compile(testDir, { rootResourcePath: 'does_not_exist.tex' });
  assert.strictEqual(result.status, 'error');
  assert.match(result.error, /not found/i);
});

test('CLSIEngine - enforces timeout on runaway processes', async () => {
  const engine = new CLSIEngine();
  const testDir = path.join(__dirname, '../data/test_compile_timeout');
  fs.mkdirSync(testDir, { recursive: true });

  fs.writeFileSync(path.join(testDir, 'main.tex'), '\documentclass{article}\begin{document}test\end{document}', 'utf-8');
  // Set 1ms timeout to guarantee timeout execution
  const result = await engine.compile(testDir, { rootResourcePath: 'main.tex', timeout: 0.001 });
  assert.strictEqual(result.status, 'error');
  assert.match(result.error, /timed out/i);
});
