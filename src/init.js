'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  CLI_NAME,
  PACKAGE_NAME,
  CONFIG_FILENAME,
  HIDDEN_DIR,
  DEFAULT_LANG,
  SUPPORTED_LANGS,
  DEFAULT_MODE,
  TOOL_MODES
} = require('./config');
const { t } = require('./i18n');
const { ensureDir, readConfig, writeConfig, runGit, extractClaudeMemContext, extractCustomTail, saveSafeBackup } = require('./utils');
const {
  renderAgentsMd,
  renderSkillMd,
  renderRules,
  renderProjectIndex,
  renderMeetingsIndex,
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

# 1. Run 0-Token verify if project/ or meetings/ exists and has no intentional template placeholders
if ( [ -d "project" ] || [ -d "meetings" ] ) && command -v ${cliName} >/dev/null 2>&1; then
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
  if (flags.lang === true || flags.mode === true) {
    const msg = '⛔ Missing argument value for --lang or --mode.';
    console.error(msg);
    return { ok: false, reason: 'invalid_flag', error: msg };
  }

  const hasExistingWorkspace =
    fs.existsSync(path.join(cwd, CONFIG_FILENAME)) ||
    fs.existsSync(path.join(cwd, HIDDEN_DIR, 'AGENTS.md'));
  const existingCfg = hasExistingWorkspace ? readConfig(cwd) : null;

  const lang = flags.lang || (existingCfg && existingCfg.lang) || DEFAULT_LANG;
  if (!SUPPORTED_LANGS.includes(lang)) {
    const msg = t(DEFAULT_LANG, 'invalidLang', lang);
    console.error(msg);
    return { ok: false, error: msg };
  }

  if (flags.mode && !TOOL_MODES.includes(flags.mode)) {
    const msg = `Unsupported mode "${flags.mode}". Supported modes: ${TOOL_MODES.join(', ')}`;
    console.error(msg);
    return { ok: false, reason: 'invalid_mode', error: msg };
  }

  const mode = TOOL_MODES.includes(flags.mode)
    ? flags.mode
    : ((existingCfg && existingCfg.mode) || DEFAULT_MODE);
  const langOrModeChanged = Boolean(
    existingCfg && (
      (flags.lang && flags.lang !== existingCfg.lang) ||
      (flags.mode && TOOL_MODES.includes(flags.mode) && flags.mode !== existingCfg.mode)
    )
  );
  const shouldRefreshTemplates = Boolean(flags.force || langOrModeChanged);
  const isFull = Boolean(flags.full || (existingCfg && existingCfg.full));
  const useGit = flags['no-git'] ? false : (existingCfg && existingCfg.features && existingCfg.features.git === false && !flags.git ? false : true);
  const usePdf = flags['no-pdf'] ? false : (existingCfg && existingCfg.features && existingCfg.features.pdf === false && !flags.pdf ? false : true);
  const useHtml = flags['no-html'] ? false : (existingCfg && existingCfg.features && existingCfg.features.html === false && !flags.html ? false : true);
  const useNpm = flags['no-npm'] ? false : (existingCfg && existingCfg.features && existingCfg.features.npm === false && !flags.npm ? false : true);
  const hideSkillsRules = true;
  const features = { git: useGit, pdf: usePdf, html: useHtml, npm: useNpm, hideSkillsRules };

  // 1. Copy gitignore.template -> .gitignore
  const gitignoreTemplatePath = path.join(__dirname, '..', 'templates', 'gitignore.template');
  const targetGitignore = path.join(cwd, '.gitignore');
  if (!fs.existsSync(targetGitignore) && fs.existsSync(gitignoreTemplatePath)) {
    fs.copyFileSync(gitignoreTemplatePath, targetGitignore);
  }

  // 2. Write .<cli>/AGENTS.md (protected against accidental overwrite on re-run unless --force or --lang/--mode changed; preserves user-appended custom sections)
  const hiddenRoot = path.join(cwd, HIDDEN_DIR);
  ensureDir(hiddenRoot);
  const agentsPath = path.join(hiddenRoot, 'AGENTS.md');
  const legacyAgentsPath = path.join(cwd, 'AGENTS.md');
  if (!fs.existsSync(agentsPath) || shouldRefreshTemplates) {
    const existingAgentsRaw = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : null;
    const existingMem = existingAgentsRaw
      ? extractClaudeMemContext(existingAgentsRaw)
      : (fs.existsSync(legacyAgentsPath) ? extractClaudeMemContext(fs.readFileSync(legacyAgentsPath, 'utf8')) : null);

    let customAppendedSuffix = '';
    if (existingAgentsRaw && existingCfg) {
      const oldDefault = renderAgentsMd({
        lang: existingCfg.lang,
        mode: existingCfg.mode,
        cliName: CLI_NAME,
        pkgName: PACKAGE_NAME,
        memContext: existingMem
      });
      if (!flags.force) {
        customAppendedSuffix = extractCustomTail(existingAgentsRaw, oldDefault);
      }
    }

    const agentsContent = renderAgentsMd({
      lang,
      mode,
      cliName: CLI_NAME,
      pkgName: PACKAGE_NAME,
      memContext: existingMem
    }) + customAppendedSuffix;
    if (existingAgentsRaw && existingCfg) {
      const oldDefault = renderAgentsMd({
        lang: existingCfg.lang,
        mode: existingCfg.mode,
        cliName: CLI_NAME,
        pkgName: PACKAGE_NAME,
        memContext: existingMem
      });
      if (existingAgentsRaw !== oldDefault) {
        saveSafeBackup(agentsPath, agentsContent);
      }
    }
    fs.writeFileSync(agentsPath, agentsContent, 'utf8');
  }

  // Generate 5-language i18n READMEs (readme.md + README.{zh-TW,zh-CN,en,ja,ko}.md)
  const readmes = renderAllReadmes({ lang, mode, cliName: CLI_NAME, pkgName: PACKAGE_NAME });
  for (const [rFile, rContent] of Object.entries(readmes)) {
    const rPath = path.join(cwd, rFile);
    if (!fs.existsSync(rPath) || shouldRefreshTemplates) {
      fs.writeFileSync(rPath, rContent, 'utf8');
    }
  }

  // 3. Create .<cli>/skills/<cli>/SKILL.md (protected unless --force or --lang/--mode changed; preserves user-appended custom sections & saves .bak)
  const skillDir = path.join(cwd, HIDDEN_DIR, 'skills', CLI_NAME);
  ensureDir(skillDir);
  const skillPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillPath) || shouldRefreshTemplates) {
    const existingSkillRaw = fs.existsSync(skillPath) ? fs.readFileSync(skillPath, 'utf8') : null;
    let customSkillSuffix = '';
    if (existingSkillRaw && existingCfg) {
      const oldDefaultSkill = renderSkillMd({
        lang: existingCfg.lang,
        mode: existingCfg.mode,
        cliName: CLI_NAME,
        pkgName: PACKAGE_NAME
      });
      if (!flags.force) {
        customSkillSuffix = extractCustomTail(existingSkillRaw, oldDefaultSkill);
      }
    }
    const newSkillContent = renderSkillMd({ lang, mode, cliName: CLI_NAME, pkgName: PACKAGE_NAME }) + customSkillSuffix;
    if (existingSkillRaw && existingCfg) {
      const oldDefaultSkill = renderSkillMd({
        lang: existingCfg.lang,
        mode: existingCfg.mode,
        cliName: CLI_NAME,
        pkgName: PACKAGE_NAME
      });
      if (existingSkillRaw !== oldDefaultSkill) {
        saveSafeBackup(skillPath, newSkillContent);
      }
    }
    fs.writeFileSync(
      skillPath,
      newSkillContent,
      'utf8'
    );
  }

  // 4. Create meetings/ directory and placeholder-free meetings/index.md so `verify`, `pdf`, and `status` pass immediately after `init`
  const meetingsDir = path.join(cwd, 'meetings');
  ensureDir(meetingsDir);
  const meetingsIndexPath = path.join(meetingsDir, 'index.md');
  if (!fs.existsSync(meetingsIndexPath) || shouldRefreshTemplates) {
    fs.writeFileSync(
      meetingsIndexPath,
      renderMeetingsIndex({ lang, cliName: CLI_NAME, pkgName: PACKAGE_NAME }),
      'utf8'
    );
  }

  // Only create tool-scaffolding `project/01-spec.md` ~ `04-release-plan.md` when in `workbench` or `cli` mode (or when `--project` is requested)
  // so conversational meeting users never get 11 unfilled `{{PACKAGE_NAME}}` errors or `0/4` status!
  if (mode !== 'conversational' || flags.project) {
    const projDir = path.join(cwd, 'project');
    ensureDir(projDir);
    const indexPath = path.join(projDir, 'index.md');
    if (!fs.existsSync(indexPath) || flags.force) {
      fs.writeFileSync(indexPath, renderProjectIndex({ lang, mode, cliName: CLI_NAME }), 'utf8');
    }

    const stages = renderStageFiles({ lang, mode });
    for (const [fname, content] of Object.entries(stages)) {
      if (!useNpm && fname === '04-release-plan.md') continue;
      const fpath = path.join(projDir, fname);
      if (!fs.existsSync(fpath) || flags.force) {
        fs.writeFileSync(fpath, content, 'utf8');
      }
    }
  }

  // 5. Create .<cli>/rules/*.md (always installed in conversational mode so post-meeting-inspection.md is present, or when --full is specified)
  if (isFull || mode === 'conversational') {
    const rulesDir = path.join(cwd, HIDDEN_DIR, 'rules');
    ensureDir(rulesDir);
    const rules = renderRules({ lang, cliName: CLI_NAME });
    for (const [rname, rcontent] of Object.entries(rules)) {
      const rPath = path.join(rulesDir, rname);
      if (!fs.existsSync(rPath) || shouldRefreshTemplates) {
        fs.writeFileSync(rPath, rcontent, 'utf8');
      }
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
