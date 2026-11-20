'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  CLI_NAME,
  PACKAGE_NAME,
  HIDDEN_DIR,
  DEFAULT_HIDE_SKILLS,
  DEFAULT_LANG,
  SUPPORTED_LANGS,
  DEFAULT_MODE,
  TOOL_MODES
} = require('./config');
const { t } = require('./i18n');
const { ensureDir, writeConfig, runGit, extractClaudeMemContext } = require('./utils');
const {
  renderAgentsMd,
  renderSkillMd,
  renderRules,
  renderProjectIndex,
  renderStageFiles,
  renderAllReadmes
} = require('./templates');

function installGitPreCommitHook(cwd, cliName = CLI_NAME) {
  const hooksDir = path.join(cwd, '.git', 'hooks');
  if (!fs.existsSync(path.join(cwd, '.git'))) return false;
  ensureDir(hooksDir);
  const hookPath = path.join(hooksDir, 'pre-commit');
  if (fs.existsSync(hookPath)) return false;

  const hookScript = `#!/usr/bin/env bash
set -euo pipefail

# 1. Run 0-Token verify if project/ exists and has no intentional template placeholders
if [ -d "project" ] && command -v ${cliName} >/dev/null 2>&1; then
  if ! grep -rq "{{[A-Z0-9_]*}}" project/*.md 2>/dev/null; then
    ${cliName} verify
  fi
fi

# 2. Run npm check & test if package.json defines them
if [ -f "package.json" ] && command -v npm >/dev/null 2>&1; then
  if node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts.check ? 0 : 1)" 2>/dev/null; then
    npm run check
  fi
  if node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts.test ? 0 : 1)" 2>/dev/null; then
    npm test
  fi
fi
`;
  fs.writeFileSync(hookPath, hookScript, 'utf8');
  try {
    fs.chmodSync(hookPath, 0o755);
  } catch (_) {}
  return true;
}

function runInit({ cwd = process.cwd(), flags = {} } = {}) {
  const lang = flags.lang || DEFAULT_LANG;
  if (!SUPPORTED_LANGS.includes(lang)) {
    const msg = t(DEFAULT_LANG, 'invalidLang', lang);
    console.error(msg);
    return { ok: false, error: msg };
  }

  const mode = TOOL_MODES.includes(flags.mode) ? flags.mode : DEFAULT_MODE;
  const isFull = Boolean(flags.full);
  const useGit = !Boolean(flags['no-git']);
  const usePdf = !Boolean(flags['no-pdf']);
  const useHtml = !Boolean(flags['no-html']);
  const useNpm = !Boolean(flags['no-npm']);
  const hideSkillsRules = true;
  const features = { git: useGit, pdf: usePdf, html: useHtml, npm: useNpm, hideSkillsRules };

  // 1. Copy gitignore.template -> .gitignore
  const gitignoreTemplatePath = path.join(__dirname, '..', 'templates', 'gitignore.template');
  const targetGitignore = path.join(cwd, '.gitignore');
  if (!fs.existsSync(targetGitignore) && fs.existsSync(gitignoreTemplatePath)) {
    fs.copyFileSync(gitignoreTemplatePath, targetGitignore);
  }

  // 2. Write .<cli>/AGENTS.md (hidden like OpenSpec, preserving existing <claude-mem-context>)
  const hiddenRoot = path.join(cwd, HIDDEN_DIR);
  ensureDir(hiddenRoot);
  const agentsPath = path.join(hiddenRoot, 'AGENTS.md');
  const legacyAgentsPath = path.join(cwd, 'AGENTS.md');
  const existingMem = fs.existsSync(agentsPath)
    ? extractClaudeMemContext(fs.readFileSync(agentsPath, 'utf8'))
    : (fs.existsSync(legacyAgentsPath) ? extractClaudeMemContext(fs.readFileSync(legacyAgentsPath, 'utf8')) : null);

  const agentsContent = renderAgentsMd({
    lang,
    mode,
    cliName: CLI_NAME,
    pkgName: PACKAGE_NAME,
    memContext: existingMem
  });
  fs.writeFileSync(agentsPath, agentsContent, 'utf8');

  // Generate 5-language i18n READMEs (readme.md + README.{zh-TW,zh-CN,en,ja,ko}.md)
  const readmes = renderAllReadmes({ lang, mode, cliName: CLI_NAME, pkgName: PACKAGE_NAME });
  for (const [rFile, rContent] of Object.entries(readmes)) {
    const rPath = path.join(cwd, rFile);
    if (!fs.existsSync(rPath) || flags.force) {
      fs.writeFileSync(rPath, rContent, 'utf8');
    }
  }

  // 3. Create .<cli>/skills/<cli>/SKILL.md (always hidden inside .<cli>/ like OpenSpec)
  const skillDir = path.join(cwd, HIDDEN_DIR, 'skills', CLI_NAME);
  ensureDir(skillDir);
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    renderSkillMd({ lang, mode, cliName: CLI_NAME, pkgName: PACKAGE_NAME }),
    'utf8'
  );

  // 4. Create project/ directory & templates
  const projDir = path.join(cwd, 'project');
  ensureDir(projDir);
  const indexPath = path.join(projDir, 'index.md');
  if (!fs.existsSync(indexPath) || flags.force) {
    fs.writeFileSync(indexPath, renderProjectIndex({ lang, mode, cliName: CLI_NAME }), 'utf8');
  }

  const stages = renderStageFiles({ lang, mode });
  for (const [fname, content] of Object.entries(stages)) {
    const fpath = path.join(projDir, fname);
    if (!fs.existsSync(fpath) || flags.force) {
      fs.writeFileSync(fpath, content, 'utf8');
    }
  }

  // 5. If --full is specified, create .<cli>/rules/*.md (always hidden inside .<cli>/ like OpenSpec)
  if (isFull) {
    const rulesDir = path.join(cwd, HIDDEN_DIR, 'rules');
    ensureDir(rulesDir);
    const rules = renderRules({ lang, cliName: CLI_NAME });
    for (const [rname, rcontent] of Object.entries(rules)) {
      fs.writeFileSync(path.join(rulesDir, rname), rcontent, 'utf8');
    }
  }

  // 6. Write locked language & mode config
  writeConfig(cwd, {
    packageName: PACKAGE_NAME,
    cliName: CLI_NAME,
    lang,
    mode,
    full: isFull,
    features
  });

  // 7. Check / initialize local Git (unless --no-git) and install pre-commit safety hook
  if (useGit) {
    const gitDir = path.join(cwd, '.git');
    if (!fs.existsSync(gitDir)) {
      const gitRes = runGit(['init'], cwd);
      if (gitRes.ok) {
        console.log(t(lang, 'gitInitDone'));
      }
    } else {
      console.log(t(lang, 'gitAlreadyExists'));
    }
    installGitPreCommitHook(cwd, CLI_NAME);
  }

  const msg = t(lang, 'initSuccess', cwd, lang, mode, features);
  console.log(msg);
  return { ok: true, lang, mode, full: isFull, features };
}

module.exports = { runInit, installGitPreCommitHook };
