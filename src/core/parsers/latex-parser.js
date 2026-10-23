/**
 * Overleaf-compatible LaTeX log parser.
 * Extracts errors, warnings, typesetting diagnostics, line numbers, and file context.
 */

class LatexParser {
  static parse(logText = '') {
    if (!logText || typeof logText !== 'string') {
      return { errors: [], warnings: [], typesetting: [] }
    }

    const lines = logText.split(/\r?\n/)
    const errors = []
    const warnings = []
    const typesetting = []

    let currentFile = null
    const fileStack = []
    let currentError = null

    const fileOpenRegex = new RegExp('\\(([a-zA-Z0-9_/\.-]+\\.[a-zA-Z0-9]+)')
    const lineNumRegex = new RegExp('^l\\.([0-9]+)\\s*(.*)')
    const typesettingRegex = new RegExp('^(Overfull|Underfull)\\s+\\\\(hbox|vbox\\)\\s+(.*)')
    const warningRegex = new RegExp('^(?:LaTeX|Package\\s+([a-zA-Z0-9_-]+)|Class\\s+([a-zA-Z0-9_-]+))\\s+Warning:\\s*(.*)')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Track file opens
      const fileOpenMatch = line.match(fileOpenRegex)
      if (fileOpenMatch) {
        const opened = fileOpenMatch[1]
        fileStack.push(opened)
        currentFile = opened
      }

      // Track file closes
      const closeMatches = line.match(/\)/g)
      const openMatches = line.match(/\(/g)
      const closeCount = closeMatches ? closeMatches.length : 0
      const openCount = openMatches ? openMatches.length : 0
      if (closeCount > openCount && fileStack.length > 0) {
        const diff = closeCount - openCount
        for (let c = 0; c < diff && fileStack.length > 0; c++) {
          fileStack.pop()
        }
        currentFile = fileStack.length > 0 ? fileStack[fileStack.length - 1] : null
      }

      // 1. Errors: '! ...'
      if (line.startsWith('! ')) {
        const message = line.slice(2).trim()
        currentError = {
          type: 'error',
          file: currentFile,
          line: null,
          message: message,
          text: message,
          raw: [line]
        }
        errors.push(currentError)
        continue
      }

      // Line number for error: 'l.<number>'
      if (currentError && !currentError.line) {
        const lineNumMatch = line.match(lineNumRegex)
        if (lineNumMatch) {
          currentError.line = parseInt(lineNumMatch[1], 10)
          if (lineNumMatch[2]) {
            currentError.context = lineNumMatch[2]
          }
          currentError.raw.push(line)
          currentError = null
          continue
        } else if (line.trim() !== '') {
          currentError.raw.push(line)
        } else {
          currentError = null
        }
      }

      // 2. Typesetting diagnostics (Overfull / Underfull)
      const typesettingMatch = line.match(typesettingRegex)
      if (typesettingMatch) {
        const lineNumMatch = line.match(/at lines?\s+([0-9]+)/i)
        typesetting.push({
          type: 'typesetting',
          severity: typesettingMatch[1].toLowerCase(),
          boxType: typesettingMatch[2],
          file: currentFile,
          line: lineNumMatch ? parseInt(lineNumMatch[1], 10) : null,
          message: line.trim(),
          text: line.trim()
        })
        continue
      }

      // 3. LaTeX / Package Warnings
      const warningMatch = line.match(warningRegex)
      if (warningMatch) {
        const pkg = warningMatch[1] || warningMatch[2] || 'latex'
        const message = warningMatch[3] ? warningMatch[3].trim() : ''
        const lineNumMatch = line.match(/on input line\s+([0-9]+)/i) || (lines[i + 1] && lines[i + 1].match(/on input line\s+([0-9]+)/i))
        warnings.push({
          type: 'warning',
          package: pkg,
          file: currentFile,
          line: lineNumMatch ? parseInt(lineNumMatch[1], 10) : null,
          message: message || line.trim(),
          text: line.trim()
        })
        continue
      }
    }

    return { errors, warnings, typesetting }
  }
}

module.exports = LatexParser
