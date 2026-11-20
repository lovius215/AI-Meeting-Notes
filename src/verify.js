'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readConfig } = require('./utils');
const { t } = require('./i18n');

function collectMarkdownFilesRecursive(dirPath, { skipTemplates = true } = {}) {
  if (!fs.existsSync(dirPath)) return [];
  const results = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    if (skipTemplates && entry.isDirectory() && entry.name === 'templates') continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMarkdownFilesRecursive(fullPath, { skipTemplates }));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

function resolveTargets(cwd, targetArg) {
  const projDir = path.join(cwd, 'project');
  const meetingsDir = path.join(cwd, 'meetings');

  if (!targetArg) {
    const targets = [];
    if (fs.existsSync(meetingsDir)) {
      targets.push(...collectMarkdownFilesRecursive(meetingsDir, { skipTemplates: true }));
    }
    if (fs.existsSync(projDir)) {
      targets.push(...collectMarkdownFilesRecursive(projDir, { skipTemplates: true }));
    }
    return targets;
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
      return collectMarkdownFilesRecursive(directPath, { skipTemplates: true });
    }
    return [directPath];
  }

  // Also check inside meetings/
  const inMeetings = path.join(meetingsDir, targetArg);
  if (fs.existsSync(inMeetings)) {
    const stat = fs.statSync(inMeetings);
    return stat.isDirectory()
      ? collectMarkdownFilesRecursive(inMeetings, { skipTemplates: true })
      : [inMeetings];
  }

  // Also check inside project/
  const inProj = path.join(projDir, targetArg);
  if (fs.existsSync(inProj)) {
    const stat = fs.statSync(inProj);
    return stat.isDirectory()
      ? collectMarkdownFilesRecursive(inProj, { skipTemplates: true })
      : [inProj];
  }

  return [];
}

function verifyFile(filePath, cwd) {
  const issues = [];
  const relFile = path.relative(cwd, filePath) || path.basename(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  let inCodeBlock = false;
  let fenceChar = '';
  let fenceLen = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const rawLine = lines[i];

    const fenceMatch = rawLine.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const matchedFence = fenceMatch[1];
      if (!inCodeBlock) {
        inCodeBlock = true;
        fenceChar = matchedFence[0];
        fenceLen = matchedFence.length;
        continue;
      } else if (matchedFence[0] === fenceChar && matchedFence.length >= fenceLen && /^\s*(`{3,}|~{3,})\s*$/.test(rawLine)) {
        inCodeBlock = false;
        fenceChar = '';
        fenceLen = 0;
        continue;
      }
    }

    if (inCodeBlock) continue;

    // Strip inline code spans (supporting paired N-backtick spans like ``code with ` inside``) so literal examples don't false-trigger
    const lineWithoutInlineCode = rawLine.replace(/(`+)([\s\S]*?)\1/g, '');

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
    // Strip remote HTTP/HTTPS URLs first so GitHub permalinks (https://github.com/.../a.js#L1-L2) never trigger local file errors
    const lineWithoutRemoteUrls = lineWithoutInlineCode.replace(/https?:\/\/[^\s)\]>]+/gi, '');

    // Support Unicode/CJK folder and file names (e.g. ../2026-11-13_週會/02-summary.md#L1-L5) while stopping at ASCII & CJK delimiters
    const refRegex = /(?:file:\/\/)?([^\s()[\]<>'"`#（）：，。；、！？「」『』【】]+?\.[A-Za-z0-9]+)#L(\d+)(?:-L?(\d+))?/g;
    let rMatch;
    while ((rMatch = refRegex.exec(lineWithoutRemoteUrls)) !== null) {
      const fullRef = rMatch[0];
      const refPathStr = rMatch[1];
      const startLine = parseInt(rMatch[2], 10);
      const endLine = rMatch[3] ? parseInt(rMatch[3], 10) : startLine;

      if (/^(?:https?|ftp|mailto):/i.test(fullRef) || /^(?:https?|ftp|mailto):/i.test(refPathStr)) {
        continue;
      }

      let resolvedRef = null;
      if (fullRef.startsWith('file://')) {
        resolvedRef = process.platform === 'win32'
          ? refPathStr.replace(/^\/([A-Za-z]:)/, '$1')
          : refPathStr;
      } else {
        const candidateFromDoc = path.resolve(path.dirname(filePath), refPathStr);
        const candidateFromCwd = path.resolve(cwd, refPathStr);
        if (fs.existsSync(candidateFromDoc)) {
          resolvedRef = candidateFromDoc;
        } else if (fs.existsSync(candidateFromCwd)) {
          resolvedRef = candidateFromCwd;
        } else {
          resolvedRef = candidateFromDoc;
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

      let targetContent = '';
      try {
        targetContent = fs.readFileSync(resolvedRef, 'utf8');
      } catch (_) {
        issues.push({
          type: 'broken_file',
          file: relFile,
          line: lineNum,
          ref: fullRef
        });
        continue;
      }
      const normalizedTarget = targetContent.replace(/\r?\n$/, '');
      const targetLines = normalizedTarget.length === 0 ? 0 : normalizedTarget.split(/\r?\n/).length;
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
  resolveTargets,
  collectMarkdownFilesRecursive
};
