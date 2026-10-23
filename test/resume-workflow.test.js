process.on('beforeExit', (code) => process.exit(code || 0));

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('fs');

const ProjectStore = require('../src/core/storage/project-store');
const CLSIEngine = require('../src/core/compiler/clsi-engine');
const ResumeTailor = require('../src/core/workflows/resume-tailor');

test('ResumeTailor - full workflow: tailor resume to job description, preserve original, validate PDF', async () => {
  const testDataDir = path.join(__dirname, '../data/test_resume_workflow_' + Date.now());
  const projectStore = new ProjectStore(testDataDir);
  const clsiEngine = new CLSIEngine();

  const initialResume = [
    '\\documentclass{article}',
    '\\begin{document}',
    '\\begin{center}',
    '{\\Large\\textbf{Jane Doe}}\\\\',
    'Email: jane.doe@example.com',
    '\\end{center}',
    '\\section*{Professional Summary}',
    '\\begin{itemize}',
    '\\item Software developer with experience building applications and maintaining code.',
    '\\end{itemize}',
    '\\section*{Technical Skills}',
    '\\begin{itemize}',
    '\\item \\textbf{Languages}: Python, JavaScript, C++',
    '\\item \\textbf{Tools}: Git, Linux',
    '\\end{itemize}',
    '\\section*{Experience}',
    '\\textbf{Systems Corp} --- Software Engineer \\hfill 2022--Present\\\\',
    '\\begin{itemize}',
    '\\item Built and maintained internal backend APIs.',
    '\\item Reduced system downtime by improving automated testing.',
    '\\end{itemize}',
    '\\section*{Education}',
    '\\textbf{B.S. in Computer Science} --- MIT \\hfill 2018--2022',
    '\\end{document}'
  ].join('\n');

  const project = await projectStore.createProject({
    name: 'Jane Doe Resume',
    rootResourcePath: 'resume.tex',
    compiler: 'tectonic',
    initialFiles: {
      'resume.tex': initialResume
    }
  });

  const jobDescription = `
We are hiring a Lead Backend Engineer to build Distributed Systems and AI Agents.
Required competencies:
- Node.js, TypeScript, Python
- Microservices, Redis, PostgreSQL
- Model Context Protocol (MCP) integrations
- High Availability and Performance Optimization
`;

  const result = await ResumeTailor.tailorResume(projectStore, clsiEngine, {
    projectId: project.id,
    jobDescription,
    targetFile: 'resume.tex',
    preserveOriginal: true,
    targetPageCount: 1
  });

  // 1. Verify workflow reported success
  assert.strictEqual(result.success, true);
  assert.ok(result.pdfPath);
  assert.ok(result.keywordsMatched.length > 0);
  assert.ok(result.keywordsMatched.includes('Node.js'));
  assert.ok(result.keywordsMatched.includes('Distributed Systems'));

  // 2. Verify original copy exists and is intact
  const originalCopy = await projectStore.readFile(project.id, result.originalFile);
  assert.strictEqual(originalCopy, initialResume);
  assert.ok(originalCopy.includes('Systems Corp'));

  // 3. Verify git diff is populated
  assert.ok(result.diff.length > 0);
  assert.ok(result.diff.includes('Core Competencies') || result.diff.includes('Node.js'));

  // 4. Verify PDF validation
  assert.strictEqual(result.pdfValidation.valid, true);
  assert.strictEqual(result.pdfValidation.pageCount, 1);
  assert.ok(result.pdfValidation.sizeBytes > 1000);

  // 5. Verify factual integrity (companies, dates, degrees preserved)
  const tailoredSource = await projectStore.readFile(project.id, 'resume.tex');
  assert.ok(tailoredSource.includes('Systems Corp'));
  assert.ok(tailoredSource.includes('2022--Present'));
  assert.ok(tailoredSource.includes('MIT'));

  // Cleanup
  fs.rmSync(testDataDir, { recursive: true, force: true });
});
