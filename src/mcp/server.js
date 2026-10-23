const { Server } = require('@modelcontextprotocol/sdk/server/index.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js')
const path = require('path')
const fs = require('fs')
const ProjectStore = require('../core/storage/project-store')
const CLSIEngine = require('../core/compiler/clsi-engine')
const ResumeTailor = require('../core/workflows/resume-tailor')
const PDFValidator = require('../core/validator/pdf-validator')
const { parseLogs } = require('../core/parsers')

function createMcpServer(options = {}) {
  const projectStore = options.projectStore || new ProjectStore()
  const clsiEngine = options.clsiEngine || new CLSIEngine()

  const server = new Server(
    {
      name: 'agenticleaf',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  )

  const tools = [
    {
      name: 'create_project',
      description: 'Create a new LaTeX project in AgenticLeaf with automatic Git versioning.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the project' },
          description: { type: 'string', description: 'Project description' },
          compiler: { type: 'string', enum: ['tectonic', 'pdflatex', 'xelatex', 'lualatex'], default: 'tectonic' },
          rootResourcePath: { type: 'string', default: 'main.tex' },
          initialFiles: { type: 'object', description: 'Map of filename -> content for initial files' }
        },
        required: ['name']
      }
    },
    {
      name: 'list_projects',
      description: 'List all existing LaTeX projects with their metadata.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'get_project',
      description: 'Get project details, configuration, and list of files.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Project ID' }
        },
        required: ['projectId']
      }
    },
    {
      name: 'read_project_file',
      description: 'Read the contents of a file within a project.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Project ID' },
          filePath: { type: 'string', description: 'Relative path of the file' }
        },
        required: ['projectId', 'filePath']
      }
    },
    {
      name: 'write_project_file',
      description: 'Write or overwrite a file in a project and commit to Git.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Project ID' },
          filePath: { type: 'string', description: 'Relative path of the file' },
          content: { type: 'string', description: 'File content' },
          commitMessage: { type: 'string', description: 'Optional Git commit message' }
        },
        required: ['projectId', 'filePath', 'content']
      }
    },
    {
      name: 'patch_project_file',
      description: 'Apply targeted find-and-replace edit to a project file and commit to Git.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Project ID' },
          filePath: { type: 'string', description: 'Relative path of the file' },
          old_string: { type: 'string', description: 'Exact text to replace' },
          new_string: { type: 'string', description: 'Replacement text' },
          replace_all: { type: 'boolean', default: false },
          commitMessage: { type: 'string', description: 'Optional Git commit message' }
        },
        required: ['projectId', 'filePath', 'old_string', 'new_string']
      }
    },
    {
      name: 'delete_project_file',
      description: 'Delete a file from the project and commit deletion to Git.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Project ID' },
          filePath: { type: 'string', description: 'Relative path of the file' },
          commitMessage: { type: 'string', description: 'Optional Git commit message' }
        },
        required: ['projectId', 'filePath']
      }
    },
    {
      name: 'get_project_diff',
      description: 'Inspect Git diff of changes made to the project.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Project ID' },
          fromCommit: { type: 'string', description: 'Starting commit/tag (default HEAD~1)' },
          toCommit: { type: 'string', description: 'Target commit/tag (default HEAD)' }
        },
        required: ['projectId']
      }
    },
    {
      name: 'compile_project',
      description: 'Compile the LaTeX document using Overleaf CLSI engine and return status, PDF path, and parsed diagnostics.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Project ID' },
          compiler: { type: 'string', enum: ['tectonic', 'pdflatex', 'xelatex', 'lualatex'] },
          rootResourcePath: { type: 'string', description: 'Root .tex file' },
          timeout: { type: 'number', description: 'Timeout in seconds' }
        },
        required: ['projectId']
      }
    },
    {
      name: 'get_compile_diagnostics',
      description: 'Get parsed LaTeX, BibTeX, and typesetting diagnostics from the latest compilation.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Project ID' }
        },
        required: ['projectId']
      }
    },
    {
      name: 'export_pdf',
      description: 'Get the absolute path and metadata of the compiled PDF for a project.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Project ID' }
        },
        required: ['projectId']
      }
    },
    {
      name: 'export_project_zip',
      description: 'Export all project files as a downloadable zip archive.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Project ID' },
          outputZipPath: { type: 'string', description: 'Optional destination file path' }
        },
        required: ['projectId']
      }
    },
    {
      name: 'tailor_resume',
      description: 'Automatically tailor a LaTeX resume to a job description, preserving factual history and original file, validating PDF output.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Project ID' },
          job_description: { type: 'string', description: 'Full job description text' },
          target_file: { type: 'string', default: 'resume.tex' },
          target_page_count: { type: 'number', default: 1 }
        },
        required: ['projectId', 'job_description']
      }
    },
    {
      name: 'validate_pdf',
      description: 'Validate compiled PDF integrity, page count, and required keywords extraction.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Project ID' },
          target_page_count: { type: 'number' },
          required_keywords: { type: 'array', items: { type: 'string' } }
        },
        required: ['projectId']
      }
    }
  ]

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    try {
      switch (name) {
        case 'create_project': {
          const res = await projectStore.createProject(args)
          return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] }
        }
        case 'list_projects': {
          const res = await projectStore.listProjects()
          return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] }
        }
        case 'get_project': {
          const res = await projectStore.getProject(args.projectId)
          return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] }
        }
        case 'read_project_file': {
          const res = await projectStore.readFile(args.projectId, args.filePath)
          return { content: [{ type: 'text', text: res }] }
        }
        case 'write_project_file': {
          const res = await projectStore.writeFile(args.projectId, args.filePath, args.content, args.commitMessage)
          return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] }
        }
        case 'patch_project_file': {
          const res = await projectStore.patchFile(
            args.projectId,
            args.filePath,
            args.old_string,
            args.new_string,
            !!args.replace_all,
            args.commitMessage
          )
          return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] }
        }
        case 'delete_project_file': {
          const res = await projectStore.deleteFile(args.projectId, args.filePath, args.commitMessage)
          return { content: [{ type: 'text', text: JSON.stringify({ success: res }, null, 2) }] }
        }
        case 'get_project_diff': {
          const res = await projectStore.getDiff(args.projectId, args)
          return { content: [{ type: 'text', text: res || '(clean working tree, no diff)' }] }
        }
        case 'compile_project': {
          const project = await projectStore.getProject(args.projectId)
          const compiler = args.compiler || project.compiler || 'tectonic'
          const rootResourcePath = args.rootResourcePath || project.rootResourcePath || 'main.tex'
          const res = await clsiEngine.compile(projectStore.getProjectDir(args.projectId), {
            compiler,
            rootResourcePath,
            timeout: args.timeout || 60
          })
          return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] }
        }
        case 'get_compile_diagnostics': {
          const projectDir = projectStore.getProjectDir(args.projectId)
          const logPath = path.join(projectDir, 'output', 'output.log')
          if (!fs.existsSync(logPath)) {
            return { content: [{ type: 'text', text: JSON.stringify({ clean: true, errors: [], warnings: [] }, null, 2) }] }
          }
          const logText = fs.readFileSync(logPath, 'utf-8')
          const diagnostics = parseLogs(logText)
          return { content: [{ type: 'text', text: JSON.stringify(diagnostics, null, 2) }] }
        }
        case 'export_pdf': {
          const projectDir = projectStore.getProjectDir(args.projectId)
          let pdfPath = path.join(projectDir, 'output', 'output.pdf')
          if (!fs.existsSync(pdfPath)) {
            const outputDir = path.join(projectDir, 'output')
            if (fs.existsSync(outputDir)) {
              const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.pdf'))
              if (files.length > 0) pdfPath = path.join(outputDir, files[0])
            }
          }
          if (!fs.existsSync(pdfPath)) {
            return { isError: true, content: [{ type: 'text', text: 'PDF not found. Please compile the project first.' }] }
          }
          const stat = fs.statSync(pdfPath)
          return { content: [{ type: 'text', text: JSON.stringify({ path: pdfPath, sizeBytes: stat.size }, null, 2) }] }
        }
        case 'export_project_zip': {
          const zipPath = args.outputZipPath || path.join('/tmp', `export_${args.projectId}_${Date.now()}.zip`)
          const res = await projectStore.exportZip(args.projectId, zipPath)
          return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] }
        }
        case 'tailor_resume': {
          const res = await ResumeTailor.tailorResume(projectStore, clsiEngine, {
            projectId: args.projectId,
            jobDescription: args.job_description,
            targetFile: args.target_file || 'resume.tex',
            targetPageCount: args.target_page_count !== undefined ? args.target_page_count : 1,
            preserveOriginal: true
          })
          return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] }
        }
        case 'validate_pdf': {
          const projectDir = projectStore.getProjectDir(args.projectId)
          let pdfPath = path.join(projectDir, 'output', 'output.pdf')
          if (!fs.existsSync(pdfPath)) {
            const outputDir = path.join(projectDir, 'output')
            if (fs.existsSync(outputDir)) {
              const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.pdf'))
              if (files.length > 0) pdfPath = path.join(outputDir, files[0])
            }
          }
          const rep = PDFValidator.validate(pdfPath, {
            targetPageCount: args.target_page_count,
            requiredKeywords: args.required_keywords
          })
          return { content: [{ type: 'text', text: JSON.stringify(rep, null, 2) }] }
        }
        default:
          return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] }
      }
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: err.message }] }
    }
  })

  return server
}

async function startMcpServer(options = {}) {
  const server = createMcpServer(options)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  return server
}

module.exports = { createMcpServer, startMcpServer }
