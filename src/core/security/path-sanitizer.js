const path = require('path')

class PathSanitizer {
  /**
   * Validates and returns a safe relative path.
   * Throws Error if path contains null bytes, is absolute, or attempts directory traversal.
   * @param {string} untrustedPath
   * @returns {string}
   */
  static validateRelativePath(untrustedPath) {
    if (!untrustedPath || typeof untrustedPath !== 'string') {
      throw new Error('Invalid path: path must be a non-empty string')
    }

    if (untrustedPath.includes('\0')) {
      throw new Error('Path traversal / injection detected: path contains null bytes')
    }

    // Reject paths starting with / or ~
    if (path.isAbsolute(untrustedPath) || untrustedPath.startsWith('~')) {
      throw new Error(`Access denied: absolute path '${untrustedPath}' is forbidden`)
    }

    // Normalize and check for traversal escape
    const normalized = path.normalize(untrustedPath)
    if (normalized === '..' || normalized.startsWith('..' + path.sep) || normalized.includes(path.sep + '..' + path.sep)) {
      throw new Error(`Path traversal detected: '${untrustedPath}' escapes base directory`)
    }

    return normalized
  }

  /**
   * Safely joins baseDir with untrustedPath, ensuring the result is contained within baseDir.
   * @param {string} baseDir
   * @param {string} untrustedPath
   * @returns {string}
   */
  static safeJoin(baseDir, untrustedPath) {
    const safeRelative = PathSanitizer.validateRelativePath(untrustedPath)
    const resolvedBase = path.resolve(baseDir)
    const resolvedTarget = path.resolve(resolvedBase, safeRelative)

    // Verify boundary confinement
    if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
      throw new Error(`Security boundary violation: '${untrustedPath}' resolves outside base directory`)
    }

    return resolvedTarget
  }

  /**
   * Sanitizes a single filename (no directory components permitted).
   * @param {string} name
   * @returns {string}
   */
  static sanitizeFilename(name) {
    if (!name || typeof name !== 'string') return 'document'
    return name.replace(/[^a-zA-Z0-9._-]/g, '_')
  }
}

module.exports = PathSanitizer
