/**
 * ChkTeX log parser for style, typography, and syntax checks.
 */

class ChktexParser {
  static parse(logText = '') {
    if (!logText || typeof logText !== 'string') {
      return []
    }

    const lines = logText.split(/\r?\n/)
    const diagnostics = []

    // Format: "filename.tex":12:3: Warning 24: Delete this space to prevent bad hyphenation.
    const regex = /^"?([^":]+)"?:([0-9]+):([0-9]+):\s*(Warning|Error)\s+([0-9]+):\s*(.*)/i

    for (const line of lines) {
      const match = line.match(regex)
      if (match) {
        diagnostics.push({
          file: match[1],
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          type: match[4].toLowerCase(),
          code: parseInt(match[5], 10),
          message: match[6].trim(),
          text: line.trim()
        })
      }
    }

    return diagnostics
  }
}

module.exports = ChktexParser
