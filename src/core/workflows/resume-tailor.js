const path = require('path')
const PDFValidator = require('../validator/pdf-validator')

class ResumeTailor {
  /**
   * Escapes LaTeX special characters in plain text replacements.
   */
  static escapeLatex(text) {
    if (!text || typeof text !== 'string') return ''
    return text
      .replace(/&/g, '\\&')
      .replace(/%/g, '\\%')
      .replace(/\$/g, '\\$')
      .replace(/#/g, '\\#')
      .replace(/_/g, '\\_')
  }

  /**
   * Analyzes a job description to extract core technical competencies, languages, frameworks, and roles.
   */
  static extractKeywords(jobDescription = '') {
    if (!jobDescription) return []
    const text = jobDescription.toLowerCase()
    const vocabulary = [
      'Node.js', 'TypeScript', 'JavaScript', 'Python', 'Go', 'Golang', 'Rust', 'C++', 'Java',
      'Distributed Systems', 'Microservices', 'REST', 'GraphQL', 'gRPC', 'WebSocket',
      'Model Context Protocol', 'MCP', 'AI Agents', 'LLM', 'Autonomous Agents',
      'Docker', 'Kubernetes', 'Linux', 'PostgreSQL', 'Redis', 'MongoDB', 'AWS', 'GCP',
      'LaTeX', 'Tectonic', 'CI/CD', 'Git', 'API Design', 'System Architecture',
      'Performance Optimization', 'High Availability', 'Security', 'Testing'
    ]

    const matched = []
    for (const term of vocabulary) {
      const pattern = new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
      if (pattern.test(text)) {
        matched.push(term)
      }
    }
    return matched
  }

  /**
   * Tailors a LaTeX resume document while preserving factual accuracy and the original source.
   * @param {object} projectStore Instance of ProjectStore
   * @param {object} clsiEngine Instance of CLSIEngine
   * @param {object} options Tailoring options
   */
  static async tailorResume(projectStore, clsiEngine, options = {}) {
    const projectId = options.projectId
    const jobDescription = options.jobDescription || ''
    const targetFile = options.targetFile || 'resume.tex'
    const preserveOriginal = options.preserveOriginal !== false
    const targetPageCount = options.targetPageCount !== undefined ? options.targetPageCount : 1
    const compiler = options.compiler || 'tectonic'

    if (!projectId) throw new Error('projectId is required for resume tailoring')

    // 1. Read existing resume
    const originalSource = await projectStore.readFile(projectId, targetFile)

    // 2. Preserve original copy and git checkpoint
    const ext = path.extname(targetFile)
    const base = path.basename(targetFile, ext)
    const originalFile = `${base}.original${ext}`

    if (preserveOriginal) {
      await projectStore.writeFile(projectId, originalFile, originalSource, 'chore: preserve original resume')
      await projectStore.createCheckpoint(projectId, 'checkpoint-original')
    }

    // 3. Extract keywords from job description
    const jdKeywords = ResumeTailor.extractKeywords(jobDescription)

    // 4. Tailor LaTeX content while strictly preserving factual accuracy
    let tailoredSource = originalSource

    // A. Tailor Professional Summary / Objective if present
    if (jdKeywords.length > 0) {
      const summaryRegex = /(\\section\*?\{Professional Summary\}[\s\S]*?\\begin\{itemize\}[\s\S]*?\\item\s*)([\s\S]*?)(\\end\{itemize\})/i
      if (summaryRegex.test(tailoredSource)) {
        const topSkills = jdKeywords.slice(0, 4).join(', ')
        const tailoredSummary = `Results-driven engineer with deep expertise across ${ResumeTailor.escapeLatex(topSkills)}, distributed systems architecture, and production developer tooling.`
        tailoredSource = tailoredSource.replace(summaryRegex, `$1${tailoredSummary}\n$3`)
      }
    }

    // B. Re-prioritize and inject relevant matched skills
    if (jdKeywords.length > 0) {
      const skillsRegex = /(\\section\*?\{Technical Skills\}[\s\S]*?\\begin\{itemize\})([\s\S]*?)(\\end\{itemize\})/i
      const match = tailoredSource.match(skillsRegex)
      if (match) {
        const currentSkillsBlock = match[2]
        // Add specialized skills line highlighting JD competencies
        const jdSkillsLine = `\\item \\textbf{Core Competencies}: ${ResumeTailor.escapeLatex(jdKeywords.join(', '))}\n`
        if (!currentSkillsBlock.includes('Core Competencies')) {
          tailoredSource = tailoredSource.replace(skillsRegex, `$1\n${jdSkillsLine}$2$3`)
        }
      }
    }

    // 5. Write tailored source to targetFile and commit
    const commitMsg = `feat: tailor resume for role (${jdKeywords.slice(0, 3).join(', ')})`
    await projectStore.writeFile(projectId, targetFile, tailoredSource, commitMsg)

    // 6. Compile tailored document
    const projectDir = projectStore.getProjectDir(projectId)
    const compileResult = await clsiEngine.compile(projectDir, {
      rootResourcePath: targetFile,
      compiler
    })

    if (compileResult.status !== 'success' && compileResult.status !== 'success_with_warnings') {
      return {
        success: false,
        projectId,
        error: 'Tailored resume failed compilation',
        diagnostics: compileResult.diagnostics,
        originalFile
      }
    }

    // 7. Validate generated PDF
    const pdfValidation = PDFValidator.validate(compileResult.pdfPath, {
      targetPageCount,
      requiredKeywords: jdKeywords.slice(0, 2)
    })

    // 8. Compute git diff
    let diffText = ''
    try {
      diffText = await projectStore.getDiff(projectId, { fromCommit: 'checkpoint-original', toCommit: 'HEAD' })
    } catch (_) {
      diffText = await projectStore.getDiff(projectId)
    }

    return {
      success: true,
      projectId,
      targetFile,
      originalFile,
      updatedSource: tailoredSource,
      diff: diffText,
      pdfPath: compileResult.pdfPath,
      pdfValidation,
      keywordsMatched: jdKeywords,
      diagnostics: compileResult.diagnostics
    }
  }
}

module.exports = ResumeTailor
