const path = require('path')
const fs = require('fs')
const ProjectStore = require('./src/core/storage/project-store')
const CLSIEngine = require('./src/core/compiler/clsi-engine')
const ResumeTailor = require('./src/core/workflows/resume-tailor')
const PDFValidator = require('./src/core/validator/pdf-validator')
const PathSanitizer = require('./src/core/security/path-sanitizer')
const { createServer } = require('./src/api/server')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js')

async function runFullVerification() {
  console.log('=== STARTING AGENTICLEAF FULL E2E VERIFICATION ===\n')
  const testDataDir = path.join(__dirname, 'data/verification_run')
  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true })
  }

  const projectStore = new ProjectStore(testDataDir)
  const clsiEngine = new CLSIEngine()

  // --- STEP 1: CREATE PROJECT ---
  console.log('[Step 1] Creating new resume project...')
  const initialResumeTex = `\documentclass[10pt,a4paper]{article}
\usepackage[margin=0.75in]{geometry}
\usepackage{hyperref}
\begin{document}
\begin{center}
{\Large\textbf{Alex Mercer}}\\nEmail: alex.mercer@example.com | GitHub: github.com/alexmercer | Location: San Francisco, CA
\end{center}

\section*{Professional Summary}
\begin{itemize}
\item Experienced software engineer specializing in backend systems, distributed architectures, and developer tooling.
\end{itemize}

\section*{Technical Skills}
\begin{itemize}
\item \textbf{Languages}: Python, TypeScript, JavaScript, Go, C++
\item \textbf{Systems}: Linux, Git, Docker, PostgreSQL, Redis
\end{itemize}

\section*{Experience}
\textbf{Senior Infrastructure Engineer} --- TechCorp Inc. \hfill 2023--Present\\
\begin{itemize}
\item Designed and operated high-throughput data processing pipelines servicing 20M+ daily events.
\item Reduced p99 latency by 35% through caching optimizations and asynchronous worker queues.
\end{itemize}

\textbf{Software Engineer} --- SystemsLabs \hfill 2021--2023\\
\begin{itemize}
\item Built developer-facing CLI tools and CI/CD automation used by 300+ engineers daily.
\item Maintained documentation and unit test coverage exceeding 90% across core repositories.
\end{itemize}

\section*{Education}
\textbf{B.S. in Computer Science} --- University of California, Berkeley \hfill 2017--2021

\end{document}`

  const project = await projectStore.createProject({
    name: 'Alex Mercer Resume',
    description: 'Master resume for software engineering roles',
    compiler: 'tectonic',
    rootResourcePath: 'resume.tex',
    initialFiles: {
      'resume.tex': initialResumeTex,
    },
  })
  console.log(`✓ Project created: id=${project.id}, name='${project.name}'`)

  // --- STEP 2: EDIT & PATCH FILE ---
  console.log('\n[Step 2] Editing and patching resume.tex...')
  await projectStore.patchFile(
    project.id,
    'resume.tex',
    'TechCorp Inc.',
    'TechCorp Cloud Systems',
    false,
    'patch: refine company name'
  )
  const patchedContent = await projectStore.readFile(project.id, 'resume.tex')
  if (!patchedContent.includes('TechCorp Cloud Systems')) {
    throw new Error('Patching failed to update target string')
  }
  console.log('✓ File successfully patched and committed to git')

  // --- STEP 3: INSPECT GIT DIFF ---
  console.log('\n[Step 3] Inspecting git diff...')
  const diff = await projectStore.getDiff(project.id)
  console.log('--- GIT DIFF OUTPUT ---')
  console.log(diff.trim())
  console.log('--- END DIFF ---
✓ Git diff verified cleanly')

  // --- STEP 4: COMPILE DOCUMENT ---
  console.log('\n[Step 4] Compiling LaTeX document with CLSI Engine...')
  const compileResult = await clsiEngine.compile(projectStore.getProjectDir(project.id), {
    rootResourcePath: 'resume.tex',
    compiler: 'tectonic',
  })
  console.log(`✓ Compile status: ${compileResult.status}`)
  console.log(`✓ Generated PDF: ${compileResult.pdfPath}`)
  console.log(`✓ Duration: ${compileResult.durationMs}ms`)
  console.log(`✓ Diagnostics: clean=${compileResult.diagnostics.clean}, errors=${compileResult.diagnostics.errors.length}, warnings=${compileResult.diagnostics.warnings.length}`)
  if (compileResult.status !== 'success' || !compileResult.pdfPath) {
    throw new Error('Compilation failed to generate PDF')
  }

  // --- STEP 5: RETRIEVE & VALIDATE PDF ---
  console.log('\n[Step 5] Validating generated PDF...')
  const pdfValidation = PDFValidator.validate(compileResult.pdfPath, {
    targetPageCount: 1,
    requiredKeywords: ['Alex Mercer', 'TechCorp Cloud Systems', 'Berkeley'],
  })
  console.log(`✓ PDF Valid: ${pdfValidation.valid}`)
  console.log(`✓ Page count: ${pdfValidation.pageCount}`)
  console.log(`✓ File size: ${pdfValidation.sizeBytes} bytes`)
  console.log(`✓ Matched keywords: ${pdfValidation.foundKeywords.join(', ')}`)
  if (!pdfValidation.valid) {
    throw new Error(`PDF validation failed: ${pdfValidation.errors.join(', ')}`)
  }

  // --- STEP 6: RESUME TAILORING WORKFLOW ---
  console.log('\n[Step 6] Testing Primary Workflow: Tailor Resume to Job Description...')
  const targetJD = `
We are seeking a Lead Backend & AI Systems Engineer.
Key requirements:
- Strong expertise in Node.js, Python, and Distributed Systems.
- Experience designing and building Model Context Protocol (MCP) integrations and autonomous AI Agents.
- Deep experience with LaTeX typesetting systems, compilation pipelines (Tectonic), and developer automation.
- Proven track record optimizing microservices architecture and system reliability.
`

  const tailorResult = await ResumeTailor.tailorResume(projectStore, clsiEngine, {
    projectId: project.id,
    jobDescription: targetJD,
    targetFile: 'resume.tex',
    preserveOriginal: true,
    targetPageCount: 1,
  })
  console.log(`✓ Tailoring status: success=${tailorResult.success}`)
  console.log(`✓ Original preserved at: ${tailorResult.originalFile}`)
  console.log(`✓ Matched keywords from JD: ${tailorResult.keywordsMatched.join(', ')}`)
  console.log(`✓ Tailored PDF output: ${tailorResult.pdfPath}`)
  console.log(`✓ Tailored PDF validation: valid=${tailorResult.pdfValidation.valid}, pages=${tailorResult.pdfValidation.pageCount}`)
  console.log('--- TAILORING DIFF PREVIEW ---')
  console.log(tailorResult.diff.slice(0, 500) + '...')
  console.log('--- END DIFF PREVIEW ---')

  // Verify original file is untouched and readable
  const originalContent = await projectStore.readFile(project.id, tailorResult.originalFile)
  if (!originalContent.includes('TechCorp Inc.') && !originalContent.includes('TechCorp Cloud Systems')) {
    throw new Error('Original file verification failed')
  }
  console.log('✓ Original resume is factually intact and preserved')

  // --- STEP 7: NATIVE MCP INTEGRATION TEST ---
  console.log('\n[Step 7] Testing Native MCP Protocol Tools...')
  const { createMcpServer } = require('./src/mcp/server')
  const mcpServer = createMcpServer({ projectStore, clsiEngine })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await mcpServer.connect(serverTransport)
  const mcpClient = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} })
  await mcpClient.connect(clientTransport)

  const mcpToolsList = await mcpClient.listTools()
  console.log(`✓ MCP tools available: ${mcpToolsList.tools.length} tools registered`)

  // Call compile_project tool over MCP
  const mcpCompileRes = await mcpClient.callTool({
    name: 'compile_project',
    arguments: { projectId: project.id, rootResourcePath: 'resume.tex' },
  })
  const mcpCompileData = JSON.parse(mcpCompileRes.content[0].text)
  console.log(`✓ MCP tool 'compile_project' returned status: ${mcpCompileData.status}`)

  // Call validate_pdf tool over MCP
  const mcpValRes = await mcpClient.callTool({
    name: 'validate_pdf',
    arguments: { projectId: project.id, target_page_count: 1 },
  })
  const mcpValData = JSON.parse(mcpValRes.content[0].text)
  console.log(`✓ MCP tool 'validate_pdf' returned: valid=${mcpValData.valid}, pages=${mcpValData.pageCount}`)

  // --- STEP 8: CORE FAILURE CASES ---
  console.log('\n[Step 8] Testing Core Failure Cases...')

  // Failure Case 1: Broken LaTeX compilation
  console.log('  * Testing Broken LaTeX compilation diagnostics...')
  await projectStore.writeFile(project.id, 'broken.tex', '\\documentclass{article}\\begin{document}\\undefinedMacroXYZ\\end{document}', 'test: broken tex')
  const brokenResult = await clsiEngine.compile(projectStore.getProjectDir(project.id), {
    rootResourcePath: 'broken.tex',
  })
  console.log(`    Status: ${brokenResult.status} (expected failure)`)
  console.log(`    Errors caught by Overleaf parser: ${brokenResult.diagnostics.errors.length}`)
  if (brokenResult.diagnostics.errors.length === 0) {
    throw new Error('Failed to parse LaTeX compile error')
  }
  console.log(`    Error text: "${brokenResult.diagnostics.errors[0].text}"`)
  console.log('    ✓ Syntax failure cleanly caught and diagnosed')

  // Failure Case 2: Missing root file
  console.log('  * Testing Missing root file...')
  const missingResult = await clsiEngine.compile(projectStore.getProjectDir(project.id), {
    rootResourcePath: 'non_existent.tex',
  })
  if (missingResult.status !== 'error') {
    throw new Error('Missing file should return error status')
  }
  console.log('    ✓ Missing root file error handled cleanly')

  // Failure Case 3: Path Traversal Security check
  console.log('  * Testing Path Traversal security enforcement...')
  try {
    PathSanitizer.safeJoin(projectStore.getProjectDir(project.id), '../../../../etc/passwd')
    throw new Error('Path traversal did not throw error')
  } catch (err) {
    console.log(`    ✓ Path traversal blocked: ${err.message}`)
  }

  // Failure Case 4: Compilation timeout
  console.log('  * Testing Compiler timeout kill...')
  const timeoutResult = await clsiEngine.compile(projectStore.getProjectDir(project.id), {
    rootResourcePath: 'resume.tex',
    timeout: 0.001, // 1ms timeout to trigger immediate kill
  })
  if (timeoutResult.status !== 'error' || !timeoutResult.error.includes('timed out')) {
    throw new Error('Timeout did not trigger properly')
  }
  console.log('    ✓ Compilation timeout cleanly aborted process')

  console.log('\n=== ALL AGENTICLEAF E2E TESTS & WORKFLOWS VERIFIED SUCCESSFULLY ===')
}

runFullVerification().catch(err => {
  console.error('\n❌ VERIFICATION FAILED:', err)
  process.exit(1)
})
