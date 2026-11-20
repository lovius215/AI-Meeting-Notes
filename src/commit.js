'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { CLI_NAME } = require('./config');
const { readConfig, runGit, isSensitiveFile } = require('./utils');
const { t } = require('./i18n');
const { runVerify, verifyFile } = require('./verify');

function findConflictFiles(cwd) {
  const conflictFiles = new Set();

  // 1. Check git unmerged files
  const unmerged = runGit(['diff', '--name-only', '--diff-filter=U'], cwd);
  if (unmerged.ok && unmerged.stdout) {
    for (const line of unmerged.stdout.split(/\r?\n/)) {
      if (line.trim()) conflictFiles.add(line.trim());
    }
  }

  // 2. Scan tracked & untracked (-uall) markdown & source files for literal conflict markers (LF and CRLF)
  const statusRes = runGit(['-c', 'core.quotePath=false', 'status', '--porcelain', '-uall'], cwd);
  if (statusRes.ok && statusRes.stdout) {
    for (const line of statusRes.stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const xy = line.slice(0, 2);
      const rawEntry = line.slice(3).trim().replace(/^"(.*)"$/, '$1');
      const relPath = rawEntry.includes(' -> ') ? rawEntry.split(' -> ').pop().trim() : rawEntry;
      if (xy.includes('U') || xy === 'AA' || xy === 'DD') {
        conflictFiles.add(relPath);
      }
      const fullPath = path.join(cwd, relPath);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (/^<{7}\s/m.test(content) && /^={7}\r?$/m.test(content) && /^>{7}(?:\s|\r?$)/m.test(content)) {
            conflictFiles.add(relPath);
          }
        } catch (_) {
          // ignore binary files
        }
      }
    }
  }

  return Array.from(conflictFiles);
}

function updateProjectIndexStatus(cwd, verifiedFiles) {
  const indexPath = path.join(cwd, 'project', 'index.md');
  if (!fs.existsSync(indexPath)) return false;

  let indexContent = fs.readFileSync(indexPath, 'utf8');
  const verifiedBasenames = new Set(verifiedFiles.map((f) => path.basename(f)));

  // Also check all stage files in project/ that pass verify
  const projDir = path.join(cwd, 'project');
  if (fs.existsSync(projDir)) {
    for (const fname of fs.readdirSync(projDir)) {
      if (fname !== 'index.md' && fname.endsWith('.md')) {
        const issues = verifyFile(path.join(projDir, fname), cwd);
        if (issues.length === 0) {
          verifiedBasenames.add(fname);
        }
      }
    }
  }

  let updated = false;
  for (const base of verifiedBasenames) {
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rowRegex = new RegExp(`(\\|[^|\\r\\n]*\\[${escaped}\\][^|\\r\\n]*\\|[^|\\r\\n]*\\|)\\s*([^|\\r\\n]+?)\\s*\\|`, 'g');
    indexContent = indexContent.replace(rowRegex, (full, prefix) => {
      updated = true;
      return `${prefix} ✅ Verified |`;
    });
  }

  if (updated) {
    fs.writeFileSync(indexPath, indexContent, 'utf8');
  }
  return updated;
}

function runCommit({ cwd = process.cwd(), target = null, flags = {} } = {}) {
  if (flags.m === true || flags.message === true) {
    const msg = '⛔ Missing commit message value for -m / --message.';
    console.error(msg);
    return { ok: false, reason: 'invalid_flag', error: msg };
  }
  const cfg = readConfig(cwd);
  const lang = cfg.lang;

  if (cfg.features && cfg.features.git === false && !flags.force) {
    const msg = 'Git archiving is disabled in workspace config (--no-git). Pass --force to override.';
    console.error(msg);
    return { ok: false, reason: 'feature_disabled', error: msg };
  }

  console.log(t(lang, 'commitStart'));

  // 1. Pre-check for existing Git merge conflicts (NEVER strip conflict markers!)
  const preConflicts = findConflictFiles(cwd);
  if (preConflicts.length > 0) {
    console.error(t(lang, 'commitConflictDetected'));
    for (const cf of preConflicts) {
      console.error(`  - ${cf}`);
    }
    return { ok: false, reason: 'conflict', conflictFiles: preConflicts };
  }

  // 2. Run 0-Token verify check before archiving
  const verifyRes = runVerify({ cwd, target });
  if (!verifyRes.ok) {
    console.error(t(lang, 'commitVerifyFailed'));
    return { ok: false, reason: 'verify_failed', issues: verifyRes.issues };
  }

  // 3. Update project/index.md status
  const indexUpdated = updateProjectIndexStatus(cwd, verifyRes.files);
  if (indexUpdated) {
    console.log(t(lang, 'commitIndexUpdated'));
  }

  // 4. Ensure Git repo is initialized
  if (!fs.existsSync(path.join(cwd, '.git'))) {
    runGit(['init'], cwd);
  }

  // Ensure git user.name and user.email exist (fallback for clean local/CI environments)
  const userName = runGit(['config', 'user.name'], cwd);
  if (!userName.stdout) {
    runGit(['config', 'user.name', `${CLI_NAME}-bot`], cwd);
    runGit(['config', 'user.email', `bot@${CLI_NAME}.local`], cwd);
  }

  // 5. Stage files while excluding sensitive config files
  const statusOut = runGit(['-c', 'core.quotePath=false', 'status', '--porcelain', '-uall', '--ignored'], cwd);
  const excludedSensitive = [];
  const filesToStage = [];

  if (statusOut.ok && statusOut.stdout) {
    const allowedTargetPrefixes = [];
    const allowedExactFiles = new Set(
      (verifyRes.files || []).map((f) => path.relative(cwd, f).replace(/\\/g, '/'))
    );
    if (indexUpdated) {
      allowedExactFiles.add('project/index.md');
    }
    if (target) {
      const candidatePaths = [
        path.isAbsolute(target) ? target : path.join(cwd, target),
        path.join(cwd, 'meetings', String(target)),
        path.join(cwd, 'project', String(target))
      ];
      for (const cp of candidatePaths) {
        if (fs.existsSync(cp)) {
          const rel = path.relative(cwd, cp).replace(/\\/g, '/');
          if (rel && !rel.startsWith('..')) {
            allowedTargetPrefixes.push(rel);
          }
        }
      }
      if (allowedTargetPrefixes.length === 0) {
        const rawRel = path.relative(cwd, path.isAbsolute(target) ? target : path.join(cwd, target)).replace(/\\/g, '/');
        if (rawRel && !rawRel.startsWith('..')) {
          allowedTargetPrefixes.push(rawRel);
        }
      }
    }

    for (const line of statusOut.stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const xy = line.slice(0, 2);
      const rawEntry = line.slice(3).trim().replace(/^"(.*)"$/, '$1');
      const rawPath = rawEntry.includes(' -> ') ? rawEntry.split(' -> ').pop().trim() : rawEntry;
      const normalizedRel = rawPath.replace(/\\/g, '/');

      if (isSensitiveFile(rawPath)) {
        excludedSensitive.push(rawPath);
        if (xy !== '!!') {
          runGit(['reset', 'HEAD', '--', rawPath], cwd);
        }
      } else if (/\.bak(?:\.\d+)?$/i.test(rawPath)) {
        // Never stage or commit .bak / .bak.N backup files
        if (xy !== '!!') {
          runGit(['reset', 'HEAD', '--', rawPath], cwd);
        }
      } else if (xy !== '!!') {
        if (target && allowedTargetPrefixes.length > 0) {
          const matchesTarget =
            allowedExactFiles.has(normalizedRel) ||
            allowedTargetPrefixes.some(
              (prefix) => normalizedRel === prefix || normalizedRel.startsWith(`${prefix}/`)
            );
          if (!matchesTarget) continue;
        }
        filesToStage.push(rawPath);
      }
    }
  }

  if (excludedSensitive.length > 0) {
    console.log(t(lang, 'commitExcludedSensitive', excludedSensitive));
  }

  if (filesToStage.length === 0) {
    console.log(t(lang, 'commitNothing'));
    return { ok: true, committed: false, excludedSensitive };
  }

  for (const f of filesToStage) {
    runGit(['add', '--', f], cwd);
  }

  const commitMsg = flags.m || flags.message || `chore(archive): verify and archive ${target || 'project'} [${cfg.lang}]`;
  const commitRes = runGit(['commit', '-m', commitMsg], cwd);
  if (!commitRes.ok) {
    const combinedOut = `${commitRes.stdout || ''}\n${commitRes.stderr || ''}`;
    if (/nothing to commit|nothing added to commit|working tree clean/i.test(combinedOut)) {
      console.log(t(lang, 'commitNothing'));
      return { ok: true, committed: false, excludedSensitive };
    }
    console.error(commitRes.stderr || commitRes.stdout || 'git commit failed');
    return {
      ok: false,
      reason: 'commit_failed',
      error: commitRes.stderr || commitRes.stdout || 'git commit failed',
      excludedSensitive
    };
  }

  const hashRes = runGit(['rev-parse', '--short', 'HEAD'], cwd);
  const shortHash = hashRes.stdout || 'HEAD';
  console.log(t(lang, 'commitSuccess', shortHash));

  // 6. Check if remote is configured -> pull --no-rebase + push (unless --no-push / --local is passed)
  const skipRemoteSync = Boolean(flags['no-push'] || flags.local);
  const remotesRes = runGit(['remote'], cwd);
  const remotes = remotesRes.stdout ? remotesRes.stdout.split(/\r?\n/).filter(Boolean) : [];
  if (remotes.length > 0 && skipRemoteSync) {
    console.log('ℹ️ 已完成本機提交（已略過遠端 pull / push 同步：--no-push）。');
    return {
      ok: true,
      committed: true,
      pushed: false,
      commitHash: shortHash,
      excludedSensitive
    };
  }
  if (remotes.length > 0) {
    const remoteName = remotes.includes('origin') ? 'origin' : remotes[0];
    const branchRes = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
    const branchName = branchRes.stdout || 'main';
    console.log(`🌐 正在同步遠端儲存庫 (${remoteName}/${branchName})（若僅需本機提交可加 --no-push）...`);

    const pullRes = runGit(['pull', '--no-rebase', remoteName, branchName], cwd);
    const postPullConflicts = findConflictFiles(cwd);
    const missingRemoteBranch = !pullRes.ok && /couldn't find remote ref|no such ref/i.test(pullRes.stderr || '');
    if ((!pullRes.ok && !missingRemoteBranch) || postPullConflicts.length > 0) {
      if (postPullConflicts.length > 0) {
        console.error(t(lang, 'commitConflictDetected'));
        for (const cf of postPullConflicts) {
          console.error(`  - ${cf}`);
        }
        return {
          ok: false,
          reason: 'conflict',
          conflictFiles: postPullConflicts,
          commitHash: shortHash
        };
      }
      if (pullRes.stderr) {
        console.error(pullRes.stderr);
      }
      return {
        ok: false,
        reason: 'remote_sync_failed',
        error: pullRes.stderr || 'git pull failed',
        commitHash: shortHash
      };
    }

    const pushArgs = missingRemoteBranch
      ? ['push', '-u', remoteName, branchName]
      : ['push', remoteName, branchName];
    const pushRes = runGit(pushArgs, cwd);
    if (pushRes.ok) {
      console.log(t(lang, 'commitPushSuccess'));
    } else {
      if (pushRes.stderr) {
        console.error(pushRes.stderr);
      }
      return {
        ok: false,
        reason: 'remote_sync_failed',
        error: pushRes.stderr || 'git push failed',
        commitHash: shortHash
      };
    }
  }

  return {
    ok: true,
    committed: true,
    commitHash: shortHash,
    excludedSensitive
  };
}

module.exports = {
  runCommit,
  findConflictFiles,
  updateProjectIndexStatus
};
