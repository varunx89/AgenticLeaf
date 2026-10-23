const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

class PDFValidator {
  /**
   * Validates a generated PDF file.
   * @param {string} pdfPath Path to the PDF file
   * @param {object} options Validation options
   * @returns {object} Validation report
   */
  static validate(pdfPath, options = {}) {
    const targetPageCount = options.targetPageCount !== undefined ? options.targetPageCount : null
    const requiredKeywords = options.requiredKeywords || []
    const minSizeBytes = options.minSizeBytes || 100
    const errors = []

    if (!pdfPath || !fs.existsSync(pdfPath)) {
      return {
        valid: false,
        pageCount: 0,
        sizeBytes: 0,
        textSummary: '',
        foundKeywords: [],
        missingKeywords: requiredKeywords,
        errors: [`PDF file does not exist: ${pdfPath}`]
      }
    }

    const stats = fs.statSync(pdfPath)
    const sizeBytes = stats.size

    if (sizeBytes < minSizeBytes) {
      errors.push(`PDF file size too small (${sizeBytes} bytes, minimum is ${minSizeBytes} bytes)`)
    }

    const buffer = fs.readFileSync(pdfPath)
    const content = buffer.toString('latin1')

    // Verify PDF header (%PDF-1.x)
    if (!content.startsWith('%PDF-')) {
      errors.push('Invalid PDF header: missing %PDF- magic prefix')
    }

    // Verify EOF marker
    if (!content.includes('%%EOF')) {
      errors.push('Corrupted PDF: missing %%EOF termination marker')
    }

    // Extract Page Count
    let pageCount = 0
    const countMatch = content.match(/\/Count\s+([0-9]+)/)
    if (countMatch) {
      pageCount = parseInt(countMatch[1], 10)
    } else {
      const pageMatches = content.match(/\/Type\s*\/Page\b/g)
      pageCount = pageMatches ? pageMatches.length : 1
    }

    if (targetPageCount !== null && pageCount !== targetPageCount) {
      errors.push(`Page count mismatch: expected ${targetPageCount} page(s), but generated document has ${pageCount} page(s)`)
    }

    // Extract text from uncompressed content and inflated streams
    const extractedTextParts = []
    const cMap = new Map()
    const textStreams = []

    let pos = 0
    while ((pos = buffer.indexOf(Buffer.from('stream'), pos)) !== -1) {
      let start = pos + 6
      if (buffer[start] === 0x0d) start++
      if (buffer[start] === 0x0a) start++
      const end = buffer.indexOf(Buffer.from('endstream'), start)
      if (end !== -1) {
        const slice = buffer.subarray(start, end)
        let decompressed = ''
        try {
          decompressed = zlib.inflateSync(slice).toString('latin1')
        } catch (_) {
          try {
            decompressed = zlib.inflateRawSync(slice).toString('latin1')
          } catch (__) {}
        }

        if (decompressed.includes('begincmap')) {
          const bfCharMatches = decompressed.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)
          for (const m of bfCharMatches) {
            const code = parseInt(m[1], 16)
            const uni = String.fromCodePoint(parseInt(m[2], 16))
            cMap.set(code, uni)
          }
        } else if (decompressed.includes('ET') || decompressed.includes('BT') || decompressed.includes('Tj') || decompressed.includes('TJ')) {
          textStreams.push(decompressed)
        }
        pos = end + 9
      } else {
        break
      }
    }

    // Decode text streams
    for (const ts of textStreams) {
      // Hex tokens <00XX...>
      const hexTokens = ts.matchAll(/<([0-9a-fA-F]+)>/g)
      for (const ht of hexTokens) {
        const hex = ht[1]
        let tokenText = ''
        for (let i = 0; i < hex.length; i += 4) {
          const code = parseInt(hex.slice(i, i + 4), 16)
          tokenText += cMap.get(code) || ''
        }
        if (tokenText) extractedTextParts.push(tokenText)
      }

      // Literal tokens (...)
      const litTokens = ts.matchAll(/\(([^()]{1,200})\)/g)
      for (const lt of litTokens) {
        const cleaned = lt[1].trim()
        if (cleaned) extractedTextParts.push(cleaned)
      }
    }

    // Also check raw content literal strings
    const rawStrMatches = content.match(/\(([^()]{2,100})\)/g) || []
    for (const m of rawStrMatches) {
      const cleaned = m.slice(1, -1).trim()
      if (cleaned.length > 1 && !cleaned.includes('\0')) {
        extractedTextParts.push(cleaned)
      }
    }

    const fullExtractedText = extractedTextParts.join(' ')
    const collapsedText = fullExtractedText.replace(/\s+/g, '').toLowerCase()
    const lowerContent = content.toLowerCase()
    const lowerExtracted = fullExtractedText.toLowerCase()

    // Check for required keywords
    const foundKeywords = []
    const missingKeywords = []

    for (const kw of requiredKeywords) {
      const kwClean = kw.trim()
      const kwLower = kwClean.toLowerCase()
      const kwCollapsed = kwLower.replace(/\s+/g, '')

      if (
        lowerExtracted.includes(kwLower) ||
        collapsedText.includes(kwCollapsed) ||
        lowerContent.includes(kwLower)
      ) {
        foundKeywords.push(kwClean)
      } else {
        missingKeywords.push(kwClean)
      }
    }

    if (missingKeywords.length > 0) {
      errors.push(`Missing required keywords: ${missingKeywords.join(', ')}`)
    }

    const valid = errors.length === 0

    return {
      valid,
      pageCount,
      sizeBytes,
      textSummary: fullExtractedText.slice(0, 500),
      foundKeywords,
      missingKeywords,
      errors
    }
  }
}

module.exports = PDFValidator
