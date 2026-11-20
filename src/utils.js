'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  CONFIG_FILENAME,
  HIDDEN_DIR,
  DEFAULT_LANG,
  SUPPORTED_LANGS,
  DEFAULT_MODE,
  TOOL_MODES,
  SENSITIVE_PATTERNS
} = require('./config');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function isToolGeneratedContent(content) {
  if (!content) return false;
  return (
    content.includes('Powered by `@loviusc/') ||
    content.includes('的專屬 AI') ||
    content.includes('的专属 AI') ||
    content.includes('dedicated AI assistant for `@loviusc/') ||
    content.includes('の専属 AI アシスタント') ||
    content.includes('의 전담 AI 어시스턴트') ||
    content.includes('# Legacy\n') ||
    content.includes('# Legacy Skill') ||
    content.includes('# Legacy Rule') ||
    content.includes('Single-Language Purity & Technical Term Preservation') ||
    content.includes('0-Token Anti-Hallucination & Verification Rule') ||
    content.includes('Conversational vs. CLI Tool Design Rule') ||
    content.includes('Safe Git Archiving & Conflict Protection Rule') ||
    content.includes('Existing Logic Invariants & Anti-Regression Guardrails')
  );
}

function readConfig(cwd = process.cwd()) {
  const cfgPath = path.join(cwd, CONFIG_FILENAME);
  if (fs.existsSync(cfgPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      return {
        ...data,
        lang: SUPPORTED_LANGS.includes(data.lang) ? data.lang : DEFAULT_LANG,
        mode: TOOL_MODES.includes(data.mode) ? data.mode : DEFAULT_MODE,
        full: Boolean(data.full)
      };
    } catch (_) {
      // Fallback to detection below
    }
  }

  // Fallback: detect locked language from .<cli>/AGENTS.md or legacy AGENTS.md
  const hiddenAgentsPath = path.join(cwd, HIDDEN_DIR, 'AGENTS.md');
  const legacyAgentsPath = path.join(cwd, 'AGENTS.md');
  const agentsPath = fs.existsSync(hiddenAgentsPath) ? hiddenAgentsPath : legacyAgentsPath;
  if (fs.existsSync(agentsPath)) {
    const content = fs.readFileSync(agentsPath, 'utf8');
    const langMatch = content.match(/Locked Language[^`]*`(zh-TW|zh-CN|en|ja|ko)`/i)
      || content.match(/鎖定語言[^`]*`(zh-TW|zh-CN|en|ja|ko)`/)
      || content.match(/锁定语言[^`]*`(zh-TW|zh-CN|en|ja|ko)`/)
      || content.match(/固定言語[^`]*`(zh-TW|zh-CN|en|ja|ko)`/)
      || content.match(/고정 언어[^`]*`(zh-TW|zh-CN|en|ja|ko)`/);
    const modeMatch = content.match(/Mode[^`]*`(conversational|workbench|cli)`/i);
    return {
      lang: langMatch ? langMatch[1] : DEFAULT_LANG,
      mode: modeMatch ? modeMatch[1] : DEFAULT_MODE,
      full: fs.existsSync(path.join(cwd, HIDDEN_DIR, 'rules')) || fs.existsSync(path.join(cwd, 'rules'))
    };
  }

  return {
    lang: DEFAULT_LANG,
    mode: DEFAULT_MODE,
    full: false
  };
}

function writeConfig(cwd, configData, configFilename = CONFIG_FILENAME) {
  const cfgPath = path.join(cwd, configFilename);
  let existing = {};
  if (fs.existsSync(cfgPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    } catch (_) {
      existing = {};
    }
  }
  const merged = {
    ...existing,
    ...configData,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(cfgPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  return merged;
}

function extractClaudeMemContext(content) {
  if (!content) return null;
  const match = content.match(/<claude-mem-context>[\s\S]*?<\/claude-mem-context>/);
  return match ? match[0] : null;
}

function extractCustomTail(existingRaw, renderedDefault) {
  if (!existingRaw || !renderedDefault) return '';
  if (existingRaw.startsWith(renderedDefault)) {
    return existingRaw.slice(renderedDefault.length);
  }
  const defaultLines = renderedDefault.trimEnd().split(/\r?\n/);
  const anchorLine = defaultLines[defaultLines.length - 1];
  if (anchorLine && anchorLine.length > 5) {
    const idx = existingRaw.lastIndexOf(anchorLine);
    if (idx !== -1) {
      const afterAnchor = existingRaw.slice(idx + anchorLine.length).replace(/^\r?\n/, '\n');
      if (afterAnchor.trim().length > 0) {
        return afterAnchor;
      }
    }
  }
  return '';
}

function runGit(args, cwd = process.cwd()) {
  const res = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return {
    ok: res.status === 0,
    status: res.status,
    stdout: (res.stdout || '').replace(/\r?\n$/, ''),
    stderr: (res.stderr || '').replace(/\r?\n$/, '')
  };
}

function isSensitiveFile(filePath) {
  const base = path.basename(filePath);
  return SENSITIVE_PATTERNS.some((regex) => regex.test(base));
}

const BOOLEAN_FLAGS = new Set([
  'full',
  'force',
  'force-all',
  'forceAll',
  'empty',
  'merge',
  'html',
  'npm',
  'git',
  'pdf',
  'dry-run',
  'dryRun',
  'self',
  'pack',
  'tarball',
  'skip-verify',
  'no-git',
  'no-pdf',
  'no-html',
  'no-npm',
  'hide-skills',
  'no-hide-skills',
  'yes',
  'y',
  'non-interactive',
  'version',
  'v',
  'help',
  'h'
]);

function parseCliArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        const val = arg.slice(eqIdx + 1);
        if (key === 'map' && typeof flags[key] === 'string') {
          flags[key] = `${flags[key]},${val}`;
        } else {
          flags[key] = val;
        }
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (!BOOLEAN_FLAGS.has(key) && next && !next.startsWith('-')) {
          if (key === 'map' && typeof flags[key] === 'string') {
            flags[key] = `${flags[key]},${next}`;
          } else {
            flags[key] = next;
          }
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      const key = arg.slice(1);
      const next = argv[i + 1];
      if (!BOOLEAN_FLAGS.has(key) && next && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

module.exports = {
  ensureDir,
  isToolGeneratedContent,
  readConfig,
  writeConfig,
  extractClaudeMemContext,
  extractCustomTail,
  runGit,
  isSensitiveFile,
  parseCliArgs
};
