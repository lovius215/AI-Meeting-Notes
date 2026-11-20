'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readConfig } = require('./utils');
const { t } = require('./i18n');

function resolveTargets(cwd, targetArg) {
  const projDir = path.join(cwd, 'project');
  if (!targetArg) {
    if (!fs.existsSync(projDir)) return [];
    return fs.readdirSync(projDir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => path.join(projDir, f));
  }

  // Check if targetArg is stage id like "01" or "1"
  if (/^\d{1,2}$/.test(String(targetArg)) && fs.existsSync(projDir)) {
    const padded = String(targetArg).padStart(2, '0');
    const matches = fs.readdirSync(projDir)
      .filter((f) => f.startsWith(`${padded}-`) && f.endsWith('.md'))
      .map((f) => path.join(projDir, f));
    if (matches.length > 0) return matches;
  }

  const directPath = path.isAbsolute(targetArg) ? targetArg : path.join(cwd, targetArg);
  if (fs.existsSync(directPath)) {
    const stat = fs.statSync(directPath);
    if (stat.isDirectory()) {
      return fs.readdirSync(directPath)
        .filter((f) => f.endsWith('.md'))
        .sort()
        .map((f) => path.join(directPath, f));
    }
    return [directPath];
  }

  // Also check inside project/
  const inProj = path.join(projDir, targetArg);
  if (fs.existsSync(inProj)) {
    return [inProj];
  }

  return [];
}

function verifyFile(filePath, cwd) {
  const issues = [];
  const relFile = path.relative(cwd, filePath) || path.basename(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const rawLine = lines[i];

    if (/^\s*```/.test(rawLine)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) continue;

    // Strip inline code spans (single or multi-backtick) so literal `{{...}}` or `file#L1` examples don't false-trigger
    const lineWithoutInlineCode = rawLine.replace(/`+[^`]*`+/g, '');

    // 1. Check unfilled placeholders {{...}}
    const placeholderRegex = /\{\{[^{}\r\n]+\}\}/g;
    let pMatch;
    while ((pMatch = placeholderRegex.exec(lineWithoutInlineCode)) !== null) {
      issues.push({
        type: 'placeholder',
        file: relFile,
        line: lineNum,
        token: pMatch[0]
      });
    }

    // 2. Check source file & line references (#L10 or #L10-L20)
    // Match either markdown link (path#L10-L20) or bare path/file.ext#L10-L20
    const refRegex = /(?:file:\/\/)?([A-Za-z0-9_./\\:-]+?\.[A-Za-z0-9]+)#L(\d+)(?:-L?(\d+))?/g;
    let rMatch;
    while ((rMatch = refRegex.exec(lineWithoutInlineCode)) !== null) {
      const fullRef = rMatch[0];
      const refPathStr = rMatch[1];
      const startLine = parseInt(rMatch[2], 10);
      const endLine = rMatch[3] ? parseInt(rMatch[3], 10) : startLine;

      // Skip HTTP/HTTPS URLs
      const prefixIdx = rMatch.index;
      const before = lineWithoutInlineCode.slice(Math.max(0, prefixIdx - 8), prefixIdx);
      if (/https?:\/\//i.test(before)) continue;

      let resolvedRef = null;
      if (fullRef.startsWith('file://')) {
        resolvedRef = process.platform === 'win32'
          ? refPathStr.replace(/^\/([A-Za-z]:)/, '$1')
          : refPathStr;
      } else {
        const candidateFromCwd = path.resolve(cwd, refPathStr);
        const candidateFromDoc = path.resolve(path.dirname(filePath), refPathStr);
        if (fs.existsSync(candidateFromCwd)) {
          resolvedRef = candidateFromCwd;
        } else if (fs.existsSync(candidateFromDoc)) {
          resolvedRef = candidateFromDoc;
        } else {
          resolvedRef = candidateFromCwd;
        }
      }

      if (!fs.existsSync(resolvedRef) || !fs.statSync(resolvedRef).isFile()) {
        issues.push({
          type: 'broken_file',
          file: relFile,
          line: lineNum,
          ref: fullRef
        });
        continue;
      }

      const targetContent = fs.readFileSync(resolvedRef, 'utf8');
      const targetLines = targetContent.split(/\r?\n/).length;
      if (startLine < 1 || endLine < startLine || endLine > targetLines) {
        issues.push({
          type: 'broken_lines',
          file: relFile,
          line: lineNum,
          ref: fullRef,
          maxLine: targetLines
        });
      }
    }
  }

  return issues;
}

function runVerify({ cwd = process.cwd(), target = null, silent = false } = {}) {
  const cfg = readConfig(cwd);
  const lang = cfg.lang;

  if (!silent) {
    console.log(t(lang, 'verifyStart'));
  }

  const files = resolveTargets(cwd, target);
  if (files.length === 0) {
    const msg = `No markdown files found to verify in ${cwd}`;
    if (!silent) console.error(msg);
    return { ok: false, issues: [{ type: 'no_files', message: msg }], files: [] };
  }

  const allIssues = [];
  for (const file of files) {
    const fileIssues = verifyFile(file, cwd);
    allIssues.push(...fileIssues);
  }

  if (allIssues.length === 0) {
    if (!silent) {
      console.log(t(lang, 'verifyPass'));
    }
    return { ok: true, issues: [], files };
  }

  if (!silent) {
    console.error(t(lang, 'verifyFail', allIssues.length));
    for (const iss of allIssues) {
      if (iss.type === 'placeholder') {
        console.error('  - ' + t(lang, 'unfilledPlaceholder', iss.file, iss.line, iss.token));
      } else if (iss.type === 'broken_file') {
        console.error('  - ' + t(lang, 'brokenRefFile', iss.file, iss.line, iss.ref));
      } else if (iss.type === 'broken_lines') {
        console.error('  - ' + t(lang, 'brokenRefLines', iss.file, iss.line, iss.ref, iss.maxLine));
      }
    }
  }

  return { ok: false, issues: allIssues, files };
}

module.exports = {
  runVerify,
  verifyFile,
  resolveTargets
};
