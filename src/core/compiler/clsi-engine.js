const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const PathSanitizer = require('../security/path-sanitizer')
const { parseLogs } = require('../parsers')

class CLSIEngine {
  constructor(options = {}) {
    const localTectonic = path.join(process.env.HOME || '', '.local/bin/tectonic')
    const fallbackPath = fs.existsSync(localTectonic) ? localTectonic : 'tectonic'
    this.tectonicPath = options.tectonicPath || process.env.TECTONIC_PATH || fallbackPath
    this.defaultTimeoutMs = options.defaultTimeoutMs || 60000
  }

  /**
   * Compiles a LaTeX project within projectDir.
   * @param {string} projectDir Absolute path to the project directory
   * @param {object} options Compilation options
   * @returns {Promise<object>}
   */
  async compile(projectDir, options = {}) {
    const startTime = Date.now()
    const rootResourcePath = options.rootResourcePath || 'main.tex'
    const compiler = options.compiler || 'tectonic'
    const timeoutMs = (options.timeout ? options.timeout * 1000 : this.defaultTimeoutMs)

    // Validate root resource path against projectDir
    let safeRootPath
    try {
      safeRootPath = PathSanitizer.safeJoin(projectDir, rootResourcePath)
    } catch (err) {
      return {
        status: 'error',
        error: `Invalid root resource path: ${err.message}`,
        durationMs: Date.now() - startTime,
        diagnostics: { clean: false, errors: [{ type: 'error', message: err.message }], warnings: [] }
      }
    }

    if (!fs.existsSync(safeRootPath)) {
      return {
        status: 'error',
        error: `Root resource file '${rootResourcePath}' not found`,
        durationMs: Date.now() - startTime,
        diagnostics: { clean: false, errors: [{ type: 'error', message: `Root file '${rootResourcePath}' does not exist` }], warnings: [] }
      }
    }

    const outputDir = path.join(projectDir, 'output')
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    // Choose compiler command and arguments
    let cmd = this.tectonicPath
    let args = []

    if (compiler === 'tectonic') {
      cmd = this.tectonicPath
      // -o outputDir --keep-logs
      args = [safeRootPath, '-o', outputDir, '--keep-logs', '--keep-intermediates']
    } else if (compiler === 'pdflatex' || compiler === 'xelatex' || compiler === 'lualatex') {
      cmd = compiler
      args = ['-interaction=nonstopmode', `-output-directory=${outputDir}`, safeRootPath]
    } else {
      cmd = this.tectonicPath
      args = [safeRootPath, '-o', outputDir, '--keep-logs', '--keep-intermediates']
    }

    const runResult = await this._executeCommand(cmd, args, projectDir, timeoutMs)

    const durationMs = Date.now() - startTime
    const baseName = path.basename(rootResourcePath, path.extname(rootResourcePath))
    
    // Find generated PDF in output directory
    let pdfPath = null
    const standardPdf = path.join(outputDir, `${baseName}.pdf`)
    const genericPdf = path.join(outputDir, 'output.pdf')

    if (fs.existsSync(standardPdf)) {
      pdfPath = standardPdf
      // Also create an alias/copy to output.pdf for Overleaf standard conventions
      if (standardPdf !== genericPdf) {
        try { fs.copyFileSync(standardPdf, genericPdf) } catch (_) {}
      }
    } else if (fs.existsSync(genericPdf)) {
      pdfPath = genericPdf
    }

    // Find generated or captured log file
    let logPath = null
    let logText = runResult.stdout + '\n' + runResult.stderr
    const candidateLog = path.join(outputDir, `${baseName}.log`)
    if (fs.existsSync(candidateLog)) {
      logPath = candidateLog
      try {
        logText = fs.readFileSync(candidateLog, 'utf-8')
      } catch (_) {}
    } else {
      // Write captured log
      logPath = path.join(outputDir, 'output.log')
      try {
        fs.writeFileSync(logPath, logText, 'utf-8')
      } catch (_) {}
    }

    // Parse diagnostics with Overleaf parsers
    const diagnostics = parseLogs(logText)

    let status = 'success'
    if (runResult.timedOut) {
      status = 'error'
      return {
        status,
        error: `Compilation timed out after ${timeoutMs}ms`,
        pdfPath: null,
        logPath,
        durationMs,
        diagnostics
      }
    }

    if (!pdfPath || runResult.exitCode !== 0 || !diagnostics.clean) {
      status = pdfPath ? 'success_with_warnings' : 'failure'
      if (!pdfPath && diagnostics.errors.length === 0) {
        diagnostics.errors.push({
          type: 'error',
          message: runResult.stderr || 'Compilation process failed without producing PDF'
        })
      }
    }

    return {
      status,
      pdfPath,
      logPath,
      exitCode: runResult.exitCode,
      durationMs,
      diagnostics
    }
  }

  _executeCommand(cmd, args, cwd, timeoutMs) {
    return new Promise((resolve) => {
      let stdout = ''
      let stderr = ''
      let timedOut = false

      const proc = spawn(cmd, args, {
        cwd,
        env: {
          ...process.env,
          PATH: `${path.dirname(this.tectonicPath)}:${process.env.PATH}`
        }
      })

      const timer = setTimeout(() => {
        timedOut = true
        proc.kill('SIGKILL')
      }, timeoutMs)

      proc.stdout.on('data', (d) => { stdout += d.toString() })
      proc.stderr.on('data', (d) => { stderr += d.toString() })

      proc.on('close', (exitCode) => {
        clearTimeout(timer)
        resolve({ exitCode, stdout, stderr, timedOut })
      })

      proc.on('error', (err) => {
        clearTimeout(timer)
        resolve({ exitCode: -1, stdout, stderr: err.message, timedOut })
      })
    })
  }
}

module.exports = CLSIEngine
