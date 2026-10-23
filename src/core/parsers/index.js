const LatexParser = require('./latex-parser')
const BiblogParser = require('./biblog-parser')
const ChktexParser = require('./chktex-parser')

/**
 * Unified diagnostics log parser.
 * Aggregates LaTeX, BibTeX, and ChkTeX outputs into a standardized Overleaf-compatible structure.
 */
function parseLogs(latexLog = '', bibLog = '', chktexLog = '') {
  const latex = LatexParser.parse(latexLog)
  const bib = BiblogParser.parse(bibLog)
  const chktex = ChktexParser.parse(chktexLog)

  const errors = [...latex.errors, ...bib.errors]
  const warnings = [...latex.warnings, ...bib.warnings]
  const typesetting = latex.typesetting

  // Add chktex warnings
  for (const item of chktex) {
    if (item.type === 'error') {
      errors.push(item)
    } else {
      warnings.push(item)
    }
  }

  const all = [...errors, ...warnings, ...typesetting]

  return {
    clean: errors.length === 0,
    errors,
    warnings,
    typesetting,
    all,
    counts: {
      errors: errors.length,
      warnings: warnings.length,
      typesetting: typesetting.length
    }
  }
}

module.exports = {
  parseLogs,
  LatexParser,
  BiblogParser,
  ChktexParser
}
