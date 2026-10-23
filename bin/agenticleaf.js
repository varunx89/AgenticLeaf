#!/usr/bin/env node
process.on('beforeExit', (code) => process.exit(code || 0));

const path = require('path')
const fs = require('fs')
const { startServer } = require('../src/api/server')
const { startMcpServer } = require('../src/mcp/server')
const ProjectStore = require('../src/core/storage/project-store')
const CLSIEngine = require('../src/core/compiler/clsi-engine')
const ResumeTailor = require('../src/core/workflows/resume-tailor')

const args = process.argv.slice(2)
const command = args[0] || 'help'

async function main() {
  switch (command) {
    case 'serve': {
      const portArgIdx = args.indexOf('--port')
      const port = portArgIdx !== -1 ? parseInt(args[portArgIdx + 1], 10) : (process.env.PORT || 3013)
      startServer(port)
      break
    }

    case 'mcp': {
      await startMcpServer()
      break
    }

    case 'compile': {
      const projectId = args[1]
      if (!projectId) {
        console.error('Usage: agenticleaf compile <projectId> [--compiler tectonic] [--root main.tex]')
        process.exit(1)
      }
      const compilerIdx = args.indexOf('--compiler')
      const compiler = compilerIdx !== -1 ? args[compilerIdx + 1] : 'tectonic'
      const rootIdx = args.indexOf('--root')
      const rootResourcePath = rootIdx !== -1 ? args[rootIdx + 1] : 'main.tex'

      const store = new ProjectStore()
      const engine = new CLSIEngine()
      const projectDir = store.getProjectDir(projectId)

      console.log(`Compiling project '${projectId}' with ${compiler}...`)
      const result = await engine.compile(projectDir, { compiler, rootResourcePath })
      console.log(`Status: ${result.status}`)
      if (result.pdfPath) console.log(`PDF: ${result.pdfPath}`)
      console.log(`Diagnostics clean: ${result.diagnostics.clean}`)
      if (!result.diagnostics.clean) {
        console.log(`Errors: ${result.diagnostics.errors.length}, Warnings: ${result.diagnostics.warnings.length}`)
      }
      process.exit(result.status === 'failure' || result.status === 'error' ? 1 : 0)
      break
    }

    case 'tailor': {
      const projectId = args[1]
      const jdIdx = args.indexOf('--jd')
      if (!projectId || jdIdx === -1 || !args[jdIdx + 1]) {
        console.error('Usage: agenticleaf tailor <projectId> --jd <path_to_jd.txt_or_string>')
        process.exit(1)
      }
      let jd = args[jdIdx + 1]
      if (fs.existsSync(jd)) {
        jd = fs.readFileSync(jd, 'utf-8')
      }
      const store = new ProjectStore()
      const engine = new CLSIEngine()
      console.log(`Tailoring resume for project '${projectId}'...`)
      const result = await ResumeTailor.tailorResume(store, engine, {
        projectId,
        jobDescription: jd,
        targetFile: 'resume.tex',
        targetPageCount: 1
      })
      console.log(`Success: ${result.success}`)
      console.log(`PDF: ${result.pdfPath}`)
      console.log(`Original preserved at: ${result.originalFile}`)
      console.log(`Matched keywords: ${result.keywordsMatched.join(', ')}`)
      process.exit(result.success ? 0 : 1)
      break
    }

    case 'help':
    default: {
      console.log(`AgenticLeaf - Agent-first LaTeX Editor & Compilation Engine

Commands:
  serve [--port <port>]    Start REST API server (default 3013)
  mcp                      Start native Model Context Protocol (stdio) server
  compile <projectId>      Compile a LaTeX project
  tailor <projectId> --jd  Tailor resume to job description
  help                     Show this help screen
`)
      process.exit(0)
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
