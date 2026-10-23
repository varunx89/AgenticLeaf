const express = require('express')
const path = require('path')
const fs = require('fs')
const ProjectStore = require('../core/storage/project-store')
const CLSIEngine = require('../core/compiler/clsi-engine')
const ResumeTailor = require('../core/workflows/resume-tailor')
const PDFValidator = require('../core/validator/pdf-validator')
const PathSanitizer = require('../core/security/path-sanitizer')

function createServer(options = {}) {
  const app = express()
  app.use(express.json({ limit: '50mb' }))
  app.use(express.urlencoded({ extended: true, limit: '50mb' }))

  const projectStore = options.projectStore || new ProjectStore()
  const clsiEngine = options.clsiEngine || new CLSIEngine()

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'AgenticLeaf',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    })
  })

  // ==========================================
  // Upstream Overleaf CLSI Compatible Endpoints
  // ==========================================

  // POST /project/:projectId/compile
  app.post('/project/:projectId/compile', async (req, res) => {
    try {
      const { projectId } = req.params
      const compileBody = req.body.compile || req.body || {}
      const options = compileBody.options || {}
      const rootResourcePath = compileBody.rootResourcePath || 'main.tex'
      const compiler = options.compiler || 'tectonic'
      const timeout = options.timeout || 60

      // Ensure project exists; create if not exists
      const projectDir = projectStore.getProjectDir(projectId)
      if (!fs.existsSync(projectDir)) {
        await projectStore.createProject({ id: projectId, rootResourcePath, compiler })
      }

      // Write resources if provided in CLSI payload
      if (Array.isArray(compileBody.resources)) {
        for (const resource of compileBody.resources) {
          if (resource.path && resource.content !== undefined) {
            await projectStore.writeFile(projectId, resource.path, resource.content, `clsi: update ${resource.path}`)
          }
        }
      }

      const compileResult = await clsiEngine.compile(projectDir, {
        rootResourcePath,
        compiler,
        timeout
      })

      const outputFiles = []
      if (compileResult.pdfPath && fs.existsSync(compileResult.pdfPath)) {
        const stat = fs.statSync(compileResult.pdfPath)
        outputFiles.push({
          type: 'pdf',
          filename: path.basename(compileResult.pdfPath),
          url: `/project/${projectId}/output/${path.basename(compileResult.pdfPath)}`,
          size: stat.size
        })
      }

      if (compileResult.logPath && fs.existsSync(compileResult.logPath)) {
        const stat = fs.statSync(compileResult.logPath)
        outputFiles.push({
          type: 'log',
          filename: path.basename(compileResult.logPath),
          url: `/project/${projectId}/output/${path.basename(compileResult.logPath)}`,
          size: stat.size
        })
      }

      res.json({
        compile: {
          status: compileResult.status,
          outputFiles,
          diagnostics: compileResult.diagnostics,
          durationMs: compileResult.durationMs
        }
      })
    } catch (err) {
      res.status(500).json({
        compile: {
          status: 'error',
          error: err.message
        }
      })
    }
  })

  // GET /project/:projectId/output/:filename
  app.get('/project/:projectId/output/:filename', (req, res) => {
    try {
      const { projectId, filename } = req.params
      const safeFilename = PathSanitizer.sanitizeFilename(filename)
      const projectDir = projectStore.getProjectDir(projectId)
      const filePath = path.join(projectDir, 'output', safeFilename)

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `Output file '${filename}' not found` })
      }

      if (safeFilename.endsWith('.pdf')) {
        res.setHeader('Content-Type', 'application/pdf')
      } else if (safeFilename.endsWith('.log')) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      } else {
        res.setHeader('Content-Type', 'application/octet-stream')
      }

      fs.createReadStream(filePath).pipe(res)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // DELETE /project/:projectId
  app.delete('/project/:projectId', async (req, res) => {
    try {
      const { projectId } = req.params
      const deleted = await projectStore.deleteProject(projectId)
      res.json({ success: deleted, projectId })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // ==========================================
  // AgenticLeaf REST API Extended Endpoints
  // ==========================================

  // GET /api/projects
  app.get('/api/projects', async (req, res) => {
    try {
      const projects = await projectStore.listProjects()
      res.json({ projects })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // POST /api/projects
  app.post('/api/projects', async (req, res) => {
    try {
      const project = await projectStore.createProject(req.body)
      res.status(201).json({ project })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  })

  // GET /api/projects/:id
  app.get('/api/projects/:id', async (req, res) => {
    try {
      const project = await projectStore.getProject(req.params.id)
      res.json({ project })
    } catch (err) {
      res.status(404).json({ error: err.message })
    }
  })

  const extractRelPath = (req) => {
    return Array.isArray(req.params.filepath)
      ? req.params.filepath.join('/')
      : (req.params.filepath || '')
  }

  // GET /api/projects/:id/files/*filepath
  app.get('/api/projects/:id/files/*filepath', async (req, res) => {
    try {
      const relPath = extractRelPath(req)
      const content = await projectStore.readFile(req.params.id, relPath)
      res.json({ path: relPath, content })
    } catch (err) {
      res.status(404).json({ error: err.message })
    }
  })

  // POST /api/projects/:id/files/*filepath
  app.post('/api/projects/:id/files/*filepath', async (req, res) => {
    try {
      const relPath = extractRelPath(req)
      const { content, commitMessage } = req.body
      if (content === undefined) {
        return res.status(400).json({ error: 'content field is required' })
      }
      const result = await projectStore.writeFile(req.params.id, relPath, content, commitMessage)
      res.json(result)
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  })

  // PATCH /api/projects/:id/files/*filepath
  app.patch('/api/projects/:id/files/*filepath', async (req, res) => {
    try {
      const relPath = extractRelPath(req)
      const { old_string, new_string, replace_all, commitMessage } = req.body
      if (old_string === undefined || new_string === undefined) {
        return res.status(400).json({ error: 'old_string and new_string fields are required' })
      }
      const result = await projectStore.patchFile(
        req.params.id,
        relPath,
        old_string,
        new_string,
        !!replace_all,
        commitMessage
      )
      res.json(result)
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  })

  // DELETE /api/projects/:id/files/*filepath
  app.delete('/api/projects/:id/files/*filepath', async (req, res) => {
    try {
      const relPath = extractRelPath(req)
      const { commitMessage } = req.body || {}
      const deleted = await projectStore.deleteFile(req.params.id, relPath, commitMessage)
      res.json({ success: deleted, path: relPath })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  })

  // GET /api/projects/:id/diff
  app.get('/api/projects/:id/diff', async (req, res) => {
    try {
      const diff = await projectStore.getDiff(req.params.id, req.query)
      res.json({ diff })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // POST /api/projects/:id/compile
  app.post('/api/projects/:id/compile', async (req, res) => {
    try {
      const project = await projectStore.getProject(req.params.id)
      const compiler = req.body.compiler || project.compiler || 'tectonic'
      const rootResourcePath = req.body.rootResourcePath || project.rootResourcePath || 'main.tex'
      const timeout = req.body.timeout || 60

      const result = await clsiEngine.compile(projectStore.getProjectDir(req.params.id), {
        compiler,
        rootResourcePath,
        timeout
      })
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/projects/:id/diagnostics
  app.get('/api/projects/:id/diagnostics', async (req, res) => {
    try {
      const projectDir = projectStore.getProjectDir(req.params.id)
      const logPath = path.join(projectDir, 'output', 'output.log')
      if (!fs.existsSync(logPath)) {
        return res.json({ clean: true, errors: [], warnings: [], typesetting: [], all: [] })
      }
      const logText = fs.readFileSync(logPath, 'utf-8')
      const { parseLogs } = require('../core/parsers')
      const diagnostics = parseLogs(logText)
      res.json(diagnostics)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/projects/:id/export/pdf
  app.get('/api/projects/:id/export/pdf', (req, res) => {
    try {
      const projectDir = projectStore.getProjectDir(req.params.id)
      const standardPdf = path.join(projectDir, 'output', 'output.pdf')
      let pdfPath = standardPdf
      if (!fs.existsSync(pdfPath)) {
        // Check any pdf in output directory
        const outputDir = path.join(projectDir, 'output')
        if (fs.existsSync(outputDir)) {
          const pdfFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.pdf'))
          if (pdfFiles.length > 0) pdfPath = path.join(outputDir, pdfFiles[0])
        }
      }

      if (!fs.existsSync(pdfPath)) {
        return res.status(404).json({ error: 'Compiled PDF not found. Compile the project first.' })
      }

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.id}.pdf"`)
      fs.createReadStream(pdfPath).pipe(res)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/projects/:id/export/zip
  app.get('/api/projects/:id/export/zip', async (req, res) => {
    try {
      const tempZip = path.join('/tmp', `export_${req.params.id}_${Date.now()}.zip`)
      await projectStore.exportZip(req.params.id, tempZip)
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.id}.zip"`)
      const stream = fs.createReadStream(tempZip)
      stream.on('close', () => {
        try { fs.unlinkSync(tempZip) } catch (_) {}
      })
      stream.pipe(res)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // POST /api/projects/:id/tailor-resume
  app.post('/api/projects/:id/tailor-resume', async (req, res) => {
    try {
      const { job_description, target_file, target_page_count, preserve_original } = req.body
      if (!job_description) {
        return res.status(400).json({ error: 'job_description is required' })
      }

      const result = await ResumeTailor.tailorResume(projectStore, clsiEngine, {
        projectId: req.params.id,
        jobDescription: job_description,
        targetFile: target_file || 'resume.tex',
        targetPageCount: target_page_count !== undefined ? target_page_count : 1,
        preserveOriginal: preserve_original !== undefined ? preserve_original : true
      })

      res.json(result)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  return app
}

function startServer(port = process.env.PORT || 3013, options = {}) {
  const app = createServer(options)
  const server = app.listen(port, () => {
    console.log(`AgenticLeaf REST API listening on port ${port}`)
  })
  return server
}

module.exports = { createServer, startServer }
