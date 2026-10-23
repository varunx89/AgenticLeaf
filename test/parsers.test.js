process.on('beforeExit', (code) => process.exit(code || 0));

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const PathSanitizer = require('../src/core/security/path-sanitizer');
const { parseLogs, LatexParser, BiblogParser, ChktexParser } = require('../src/core/parsers');

test('PathSanitizer - allows valid relative paths', () => {
  assert.strictEqual(PathSanitizer.validateRelativePath('main.tex'), 'main.tex');
  assert.strictEqual(PathSanitizer.validateRelativePath('chapters/ch1.tex'), path.normalize('chapters/ch1.tex'));
  assert.strictEqual(PathSanitizer.validateRelativePath('images/fig1.png'), path.normalize('images/fig1.png'));
});

test('PathSanitizer - rejects traversal, absolute paths, and null bytes', () => {
  assert.throws(() => PathSanitizer.validateRelativePath('../../etc/passwd'), /traversal/i);
  assert.throws(() => PathSanitizer.validateRelativePath('/etc/passwd'), /forbidden/i);
  assert.throws(() => PathSanitizer.validateRelativePath('test\0.tex'), /null bytes/i);
  assert.throws(() => PathSanitizer.validateRelativePath('../main.tex'), /traversal/i);
});

test('PathSanitizer.safeJoin - safely confines paths within base directory', () => {
  const base = '/tmp/project_base';
  const joined = PathSanitizer.safeJoin(base, 'sub/doc.tex');
  assert.strictEqual(joined, path.resolve(base, 'sub/doc.tex'));

  assert.throws(() => PathSanitizer.safeJoin(base, '../../outside.tex'), /traversal|violation/i);
});

test('LatexParser - parses clean log as clean', () => {
  const cleanLog = 'This is XeTeX, Version 3.141592653-2.6-0.999996 (TeX Live 2024)\n(./main.tex\n[1]\nOutput written on main.pdf (1 page).\nTranscript written on main.log.';
  const result = parseLogs(cleanLog);
  assert.strictEqual(result.clean, true);
  assert.strictEqual(result.errors.length, 0);
});

test('LatexParser - extracts errors, lines, and context', () => {
  const errorLog = 'This is XeTeX\n(./main.tex\n! Undefined control sequence.\nl.15 \\brokenCommand\n                    \nThe control sequence at the end of the top line\n[1]';
  const result = parseLogs(errorLog);
  assert.strictEqual(result.clean, false);
  assert.strictEqual(result.errors.length, 1);
  assert.strictEqual(result.errors[0].line, 15);
  assert.match(result.errors[0].message, /Undefined control sequence/);
});

test('LatexParser - extracts typesetting warnings and package warnings', () => {
  const warningLog = 'Overfull \\hbox (15.2pt too wide) in paragraph at lines 42--48\nLaTeX Warning: Reference `sec:intro` on page 2 undefined on input line 55.\nPackage hyperref Warning: Token not allowed in a PDF string on input line 60.';
  const result = parseLogs(warningLog);
  assert.strictEqual(result.clean, true);
  assert.strictEqual(result.typesetting.length, 1);
  assert.strictEqual(result.typesetting[0].line, 42);
  assert.strictEqual(result.warnings.length, 2);
  assert.strictEqual(result.warnings[0].line, 55);
  assert.strictEqual(result.warnings[1].line, 60);
});

test('BiblogParser - extracts warnings and errors', () => {
  const bibLog = 'Warning--empty journal in knuth1984\nError--I found no \\bibdata command';
  const result = parseLogs('', bibLog);
  assert.strictEqual(result.clean, false);
  assert.strictEqual(result.warnings.length, 1);
  assert.strictEqual(result.errors.length, 1);
});
