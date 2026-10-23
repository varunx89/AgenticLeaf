/**
 * BibTeX and Biber log parser.
 */

class BiblogParser {
  static parse(logText = '') {
    if (!logText || typeof logText !== 'string') {
      return { errors: [], warnings: [] }
    }

    const lines = logText.split(/\r?\n/)
    const errors = []
    const warnings = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (line.match(/^Warning--/i) || line.includes('WARN -')) {
        const lineNumMatch = line.match(/line\s+([0-9]+)/i)
        warnings.push({
          type: 'warning',
          source: 'bibtex',
          line: lineNumMatch ? parseInt(lineNumMatch[1], 10) : null,
          message: line.replace(/^Warning--/i, '').trim(),
          text: line.trim()
        })
      } else if (line.match(/^Error/i) || line.includes('ERROR -') || line.includes('I couldn\'t open database file') || line.includes('I found no \\bibdata')) {
        const lineNumMatch = line.match(/line\s+([0-9]+)/i)
        errors.push({
          type: 'error',
          source: 'bibtex',
          line: lineNumMatch ? parseInt(lineNumMatch[1], 10) : null,
          message: line.trim(),
          text: line.trim()
        })
      }
    }

    return { errors, warnings }
  }
}

module.exports = BiblogParser
