const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')
const archiver = require('archiver')
const unzipper = require('unzipper')
const diff = require('diff')
const PathSanitizer = require('../security/path-sanitizer')

const execFileAsync = promisify(execFile)

class ProjectStore {
  constructor(baseDir = path.join(__dirname, '../../../data/projects')) {
    this.baseDir = path.resolve(baseDir)
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true })
    }
  }

  getProjectDir(projectId) {
    const safeId = PathSanitizer.sanitizeFilename(projectId)
    return path.join(this.baseDir, safeId)
  }

  async _git(projectDir, args) {
    try {
      const { stdout } = await execFileAsync('git', args, { cwd: projectDir })
      return stdout
    } catch (err) {
      // git diff returns exitCode 1 if differences found
      if (args[0] === 'diff' && err.stdout !== undefined) {
        return err.stdout
      }
      throw err
    }
  }

  async createProject(options = {}) {
    const id = options.id || ('proj_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7))
    const name = options.name || 'Untitled Document'
    const compiler = options.compiler || 'tectonic'
    const rootResourcePath = options.rootResourcePath || 'main.tex'
    const projectDir = this.getProjectDir(id)

    if (fs.existsSync(projectDir)) {
      throw new Error(`Project with ID '${id}' already exists`)
    }

    fs.mkdirSync(projectDir, { recursive: true })

    // Initialize git repository
    await this._git(projectDir, ['init', '-b', 'main'])
    await this._git(projectDir, ['config', 'user.name', 'AgenticLeaf'])
    await this._git(projectDir, ['config', 'user.email', 'agenticleaf@local'])

    // Write metadata.json
    const metadata = {
      id,
      name,
      description: options.description || '',
      compiler,
      rootResourcePath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    fs.writeFileSync(path.join(projectDir, '.metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8')

    // Create initial files if provided
    const initialFiles = options.initialFiles || {
      'main.tex': '\\documentclass{article}\n\\begin{document}\nHello from AgenticLeaf!\n\\end{document}\n'
    }

    for (const [filePath, content] of Object.entries(initialFiles)) {
      const safePath = PathSanitizer.safeJoin(projectDir, filePath)
      fs.mkdirSync(path.dirname(safePath), { recursive: true })
      fs.writeFileSync(safePath, content, 'utf-8')
    }

    // Initial commit
    await this._git(projectDir, ['add', '-A'])
    await this._git(projectDir, ['commit', '-m', 'chore: initial project commit'])

    return metadata
  }

  async getProject(projectId) {
    const projectDir = this.getProjectDir(projectId)
    const metaPath = path.join(projectDir, '.metadata.json')
    if (!fs.existsSync(metaPath)) {
      throw new Error(`Project '${projectId}' not found`)
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    meta.files = await this.listFiles(projectId)
    return meta
  }

  async listProjects() {
    if (!fs.existsSync(this.baseDir)) return []
    const entries = fs.readdirSync(this.baseDir, { withFileTypes: true })
    const projects = []
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metaPath = path.join(this.baseDir, entry.name, '.metadata.json')
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
            projects.push(meta)
          } catch (_) {}
        }
      }
    }
    return projects
  }

  async deleteProject(projectId) {
    const projectDir = this.getProjectDir(projectId)
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true })
      return true
    }
    return false
  }

  async listFiles(projectId) {
    const projectDir = this.getProjectDir(projectId)
    if (!fs.existsSync(projectDir)) throw new Error(`Project '${projectId}' not found`)

    const files = []
    const traverse = (dir, prefix = '') => {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name === '.git' || entry.name === '.metadata.json' || entry.name === 'output') {
          continue
        }
        const rel = prefix ? path.join(prefix, entry.name) : entry.name
        if (entry.isDirectory()) {
          traverse(path.join(dir, entry.name), rel)
        } else {
          const stats = fs.statSync(path.join(dir, entry.name))
          files.push({
            path: rel,
            size: stats.size,
            modifiedAt: stats.mtime.toISOString()
          })
        }
      }
    }
    traverse(projectDir)
    return files
  }

  async readFile(projectId, relPath) {
    const projectDir = this.getProjectDir(projectId)
    const safePath = PathSanitizer.safeJoin(projectDir, relPath)
    if (!fs.existsSync(safePath)) {
      throw new Error(`File '${relPath}' not found in project '${projectId}'`)
    }
    return fs.readFileSync(safePath, 'utf-8')
  }

  async writeFile(projectId, relPath, content, commitMessage) {
    const projectDir = this.getProjectDir(projectId)
    const safePath = PathSanitizer.safeJoin(projectDir, relPath)
    fs.mkdirSync(path.dirname(safePath), { recursive: true })
    fs.writeFileSync(safePath, content, 'utf-8')

    // Update metadata timestamp
    const metaPath = path.join(projectDir, '.metadata.json')
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
        meta.updatedAt = new Date().toISOString()
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
      } catch (_) {}
    }

    // Commit in git
    await this._git(projectDir, ['add', safePath])
    const msg = commitMessage || `edit: update ${relPath}`
    await this._git(projectDir, ['commit', '-m', msg])
    return { success: true, path: relPath }
  }

  async patchFile(projectId, relPath, oldString, newString, replaceAll = false, commitMessage) {
    const current = await this.readFile(projectId, relPath)
    if (!current.includes(oldString)) {
      throw new Error(`Target text to replace not found in '${relPath}'`)
    }

    let updated
    if (replaceAll) {
      updated = current.split(oldString).join(newString)
    } else {
      const idx = current.indexOf(oldString)
      updated = current.slice(0, idx) + newString + current.slice(idx + oldString.length)
    }

    const msg = commitMessage || `patch: edit ${relPath}`
    await this.writeFile(projectId, relPath, updated, msg)
    return { success: true, path: relPath }
  }

  async deleteFile(projectId, relPath, commitMessage) {
    const projectDir = this.getProjectDir(projectId)
    const safePath = PathSanitizer.safeJoin(projectDir, relPath)
    if (fs.existsSync(safePath)) {
      fs.unlinkSync(safePath)
      await this._git(projectDir, ['rm', safePath])
      const msg = commitMessage || `delete: remove ${relPath}`
      await this._git(projectDir, ['commit', '-m', msg])
      return true
    }
    return false
  }

  async getDiff(projectId, options = {}) {
    const projectDir = this.getProjectDir(projectId)
    const from = options.fromCommit || 'HEAD~1'
    const to = options.toCommit || 'HEAD'
    try {
      return await this._git(projectDir, ['diff', `${from}..${to}`])
    } catch (err) {
      // If only one commit exists, return diff against empty tree
      try {
        return await this._git(projectDir, ['show', '--stat', 'HEAD'])
      } catch (_) {
        return ''
      }
    }
  }

  async createCheckpoint(projectId, checkpointName) {
    const projectDir = this.getProjectDir(projectId)
    const safeTag = PathSanitizer.sanitizeFilename(checkpointName)
    await this._git(projectDir, ['tag', '-f', safeTag])
    return { success: true, checkpoint: safeTag }
  }

  async exportZip(projectId, outputZipPath) {
    const projectDir = this.getProjectDir(projectId)
    const output = fs.createWriteStream(outputZipPath)
    const archive = typeof archiver === 'function' ? archiver('zip', { zlib: { level: 9 } }) : new archiver.ZipArchive({ zlib: { level: 9 } })

    return new Promise((resolve, reject) => {
      output.on('close', () => resolve({ path: outputZipPath, bytes: archive.pointer() }))
      archive.on('error', (err) => reject(err))
      archive.pipe(output)

      // Add all project files excluding .git and output/
      archive.glob('**/*', {
        cwd: projectDir,
        ignore: ['.git/**', '.metadata.json', 'output/**']
      })
      archive.finalize()
    })
  }

  async importZip(projectId, zipFilePath) {
    const projectDir = this.getProjectDir(projectId)
    if (!fs.existsSync(projectDir)) {
      await this.createProject({ id: projectId })
    }

    await fs.createReadStream(zipFilePath)
      .pipe(unzipper.Extract({ path: projectDir }))
      .promise()

    await this._git(projectDir, ['add', '-A'])
    await this._git(projectDir, ['commit', '-m', 'chore: import files from zip archive'])
    return { success: true, projectId }
  }
}

module.exports = ProjectStore
