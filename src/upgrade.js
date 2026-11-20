'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { CLI_NAME, PACKAGE_NAME } = require('./config');
const { t } = require('./i18n');
const {
  ensureDir,
  isToolGeneratedContent,
  readConfig,
  writeConfig,
  extractClaudeMemContext,
  extractCustomTail,
  saveSafeBackup
} = require('./utils');
const {
  renderAgentsMd,
  renderSkillMd,
  renderRules,
  renderProjectIndex,
  renderMeetingsIndex,
  renderStageFiles,
  renderAllReadmes
} = require('./templates');

function detectTargetIdentity(cwd, cfg) {
  const pkgJsonPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      const binKeys = pkg.bin && typeof pkg.bin === 'object' ? Object.keys(pkg.bin) : [];
      const pointsToCli = binKeys.some((k) => String(pkg.bin[k]).includes('bin/cli.js'));
      if (binKeys.length > 0 && pointsToCli) {
        return {
          targetCli: binKeys[0],
          targetPkg: pkg.name || PACKAGE_NAME
        };
      }
    } catch (_) {}
  }
  return {
    targetCli: cfg.cliName || CLI_NAME,
    targetPkg: cfg.packageName || PACKAGE_NAME
  };
}

function runUpgrade({ cwd = process.cwd(), flags = {} } = {}) {
  const cfg = readConfig(cwd);
  const lang = cfg.lang;
  const mode = cfg.mode;
  const isDryRun = Boolean(flags['dry-run'] || flags.dryRun);
  const { targetCli, targetPkg } = detectTargetIdentity(cwd, cfg);

  // Safety guard: only block if package.json is an assembled derived CLI tool project (with bin pointing to bin/cli.js)
  const pkgJsonPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgJsonPath) && !flags.force) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      const isDerivedCliTool =
        pkg.bin &&
        typeof pkg.bin === 'object' &&
        Object.values(pkg.bin).some((v) => String(v).includes('bin/cli.js'));
      if (isDerivedCliTool && pkg.name && pkg.name !== PACKAGE_NAME) {
        console.error(`⛔ Safety stop: "${pkg.name}" is already an independent assembled tool project. Running upgrade here would overwrite its custom AGENTS.md / skills / rules. Pass --force if you really intend to overwrite.`);
        return { ok: false, reason: 'derived_project_protected', packageName: pkg.name };
      }
    } catch (_) {}
  }

  const targetHiddenDir = `.${targetCli}`;

  console.log(t(lang, 'upgradeStart', lang));
  if (isDryRun) {
    console.log(t(lang, 'upgradeDryRun'));
  }

  const actions = [];

  // 1. Update .<targetCli>/AGENTS.md while preserving <claude-mem-context> AND any user-appended custom sections
  const hiddenRoot = path.join(cwd, targetHiddenDir);
  const agentsPath = path.join(hiddenRoot, 'AGENTS.md');
  const legacyAgentsPath = path.join(cwd, 'AGENTS.md');
  const existingAgentsRaw = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : null;
  const existingMem = existingAgentsRaw
    ? extractClaudeMemContext(existingAgentsRaw)
    : (fs.existsSync(legacyAgentsPath) ? extractClaudeMemContext(fs.readFileSync(legacyAgentsPath, 'utf8')) : null);

  const baseAgentsContent = renderAgentsMd({
    lang,
    mode,
    cliName: targetCli,
    pkgName: targetPkg,
    memContext: existingMem
  });
  let customAppendedSuffix = '';
  if (existingAgentsRaw && !flags.force) {
    customAppendedSuffix = extractCustomTail(existingAgentsRaw, baseAgentsContent);
  }
  const newAgentsContent = baseAgentsContent + customAppendedSuffix;
  actions.push({ type: 'update', file: `${targetHiddenDir}/AGENTS.md`, preservedMem: Boolean(existingMem) });
  if (!isDryRun) {
    ensureDir(hiddenRoot);
    if (existingAgentsRaw && existingAgentsRaw !== newAgentsContent) {
      saveSafeBackup(agentsPath, newAgentsContent);
    }
    fs.writeFileSync(agentsPath, newAgentsContent, 'utf8');
  }

  // 2. Update .<targetCli>/skills/<targetCli>/SKILL.md while preserving user-appended custom sections
  const skillDir = path.join(cwd, targetHiddenDir, 'skills', targetCli);
  const skillRel = `${targetHiddenDir}/skills/${targetCli}/SKILL.md`;
  const skillPath = path.join(skillDir, 'SKILL.md');
  const existingSkillRaw = fs.existsSync(skillPath) ? fs.readFileSync(skillPath, 'utf8') : null;
  const baseSkillContent = renderSkillMd({ lang, mode, cliName: targetCli, pkgName: targetPkg });
  let customSkillSuffix = '';
  if (existingSkillRaw && !flags.force) {
    customSkillSuffix = extractCustomTail(existingSkillRaw, baseSkillContent);
  }
  const newSkillContent = baseSkillContent + customSkillSuffix;
  actions.push({ type: 'update', file: skillRel });
  if (!isDryRun) {
    ensureDir(skillDir);
    if (existingSkillRaw && existingSkillRaw !== newSkillContent) {
      saveSafeBackup(skillPath, newSkillContent);
    }
    fs.writeFileSync(
      skillPath,
      newSkillContent,
      'utf8'
    );
  }

  // 3. Update .<targetCli>/rules/ if rules directory exists or cfg.full is true
  const rulesDir = path.join(cwd, targetHiddenDir, 'rules');
  const legacyRulesDir = path.join(cwd, 'rules');
  const builtInRules = renderRules({ lang, cliName: targetCli });
  if (fs.existsSync(rulesDir) || fs.existsSync(legacyRulesDir) || cfg.full) {
    if (!isDryRun) ensureDir(rulesDir);
    for (const [rname, rcontent] of Object.entries(builtInRules)) {
      actions.push({ type: 'update', file: `${targetHiddenDir}/rules/${rname}` });
      if (!isDryRun) {
        fs.writeFileSync(path.join(rulesDir, rname), rcontent, 'utf8');
      }
    }
  }

  // 3b. Safe migration of root AGENTS.md, skills/, and rules/ into .<targetCli>/
  // NEVER delete user-authored custom AGENTS.md or custom files in rules/ without preserving them!
  if (fs.existsSync(legacyAgentsPath)) {
    const legacyContent = fs.readFileSync(legacyAgentsPath, 'utf8');
    if (isToolGeneratedContent(legacyContent)) {
      actions.push({ type: 'migrate', file: `AGENTS.md -> ${targetHiddenDir}/AGENTS.md` });
      if (!isDryRun) {
        fs.rmSync(legacyAgentsPath, { force: true });
      }
    } else {
      // User-authored custom root AGENTS.md: keep it intact at root so user data is never lost!
      actions.push({ type: 'preserve', file: 'AGENTS.md (custom user file preserved)' });
    }
  }

  const legacySkillsRoot = path.join(cwd, 'skills');
  for (const legacyName of new Set([CLI_NAME, targetCli])) {
    const legacySkillDir = path.join(legacySkillsRoot, legacyName);
    if (fs.existsSync(legacySkillDir)) {
      const legacySkillMdPath = path.join(legacySkillDir, 'SKILL.md');
      const entries = fs.readdirSync(legacySkillDir);
      const onlyHasSkillMd = entries.length === 1 && entries[0] === 'SKILL.md';
      const isToolSkill = onlyHasSkillMd && fs.existsSync(legacySkillMdPath) && isToolGeneratedContent(fs.readFileSync(legacySkillMdPath, 'utf8'));
      if (isToolSkill) {
        actions.push({ type: 'migrate', file: `skills/${legacyName} -> ${targetHiddenDir}/skills/${targetCli}` });
        if (!isDryRun) {
          fs.rmSync(legacySkillDir, { recursive: true, force: true });
        }
      } else {
        actions.push({ type: 'preserve', file: `skills/${legacyName} (custom user skill preserved)` });
      }
    }
  }
  if (!isDryRun && fs.existsSync(legacySkillsRoot) && fs.readdirSync(legacySkillsRoot).length === 0) {
    fs.rmSync(legacySkillsRoot, { recursive: true, force: true });
  }

  if (fs.existsSync(legacyRulesDir)) {
    if (!isDryRun) ensureDir(rulesDir);
    for (const entry of fs.readdirSync(legacyRulesDir, { withFileTypes: true })) {
      const legacyFile = path.join(legacyRulesDir, entry.name);
      if (entry.isFile()) {
        const content = fs.readFileSync(legacyFile, 'utf8');
        const isBuiltInName = Object.prototype.hasOwnProperty.call(builtInRules, entry.name);
        if (isBuiltInName && isToolGeneratedContent(content)) {
          actions.push({ type: 'migrate', file: `rules/${entry.name} -> ${targetHiddenDir}/rules/${entry.name}` });
          if (!isDryRun) {
            fs.rmSync(legacyFile, { force: true });
          }
        } else {
          // User-authored custom rule file: copy to .<targetCli>/rules/ AND preserve in root rules/!
          actions.push({ type: 'preserve', file: `rules/${entry.name} (custom user rule preserved)` });
          if (!isDryRun && !fs.existsSync(path.join(rulesDir, entry.name))) {
            fs.copyFileSync(legacyFile, path.join(rulesDir, entry.name));
          }
        }
      }
    }
    if (!isDryRun && fs.existsSync(legacyRulesDir) && fs.readdirSync(legacyRulesDir).length === 0) {
      fs.rmSync(legacyRulesDir, { recursive: true, force: true });
    }
  }

  // 4. Backfill meetings/index.md (in conversational mode) or missing files in project/ (only when project/ is used)
  const meetingsDir = path.join(cwd, 'meetings');
  if (!isDryRun) ensureDir(meetingsDir);
  const meetingsIndexPath = path.join(meetingsDir, 'index.md');
  if (!fs.existsSync(meetingsIndexPath)) {
    actions.push({ type: 'backfill', file: 'meetings/index.md' });
    if (!isDryRun) {
      fs.writeFileSync(
        meetingsIndexPath,
        renderMeetingsIndex({ lang, cliName: targetCli, pkgName: targetPkg }),
        'utf8'
      );
    }
  }

  const projDir = path.join(cwd, 'project');
  if (mode !== 'conversational' || fs.existsSync(projDir)) {
    if (!isDryRun) ensureDir(projDir);

    const indexPath = path.join(projDir, 'index.md');
    if (!fs.existsSync(indexPath)) {
      actions.push({ type: 'backfill', file: 'project/index.md' });
      if (!isDryRun) {
        fs.writeFileSync(indexPath, renderProjectIndex({ lang, mode, cliName: CLI_NAME }), 'utf8');
      }
    }

    const stageTemplates = renderStageFiles({ lang, mode });
    for (const [fname, content] of Object.entries(stageTemplates)) {
      const fpath = path.join(projDir, fname);
      if (!fs.existsSync(fpath)) {
        actions.push({ type: 'backfill', file: `project/${fname}` });
        if (!isDryRun) {
          fs.writeFileSync(fpath, content, 'utf8');
        }
      }
    }
  }

  // 5. Backfill missing 5-language READMEs (readme.md + README.{zh-TW,zh-CN,en,ja,ko}.md)
  const readmes = renderAllReadmes({ lang, mode, cliName: CLI_NAME, pkgName: PACKAGE_NAME });
  for (const [rf, rcontent] of Object.entries(readmes)) {
    const rpath = path.join(cwd, rf);
    if (!fs.existsSync(rpath)) {
      actions.push({ type: 'backfill', file: rf });
      if (!isDryRun) {
        fs.writeFileSync(rpath, rcontent, 'utf8');
      }
    }
  }

  // 6. Backfill .gitignore if missing
  const gitignorePath = path.join(cwd, '.gitignore');
  const templateGitignore = path.join(__dirname, '..', 'templates', 'gitignore.template');
  if (!fs.existsSync(gitignorePath) && fs.existsSync(templateGitignore)) {
    actions.push({ type: 'backfill', file: '.gitignore' });
    if (!isDryRun) {
      fs.copyFileSync(templateGitignore, gitignorePath);
    }
  }

  if (!isDryRun) {
    const targetCfgFile = `.${targetCli}.json`;
    writeConfig(cwd, {
      packageName: targetPkg,
      cliName: targetCli,
      lang,
      mode,
      full: fs.existsSync(rulesDir) || cfg.full
    }, targetCfgFile);
  }

  for (const act of actions) {
    console.log(`  - [${act.type.toUpperCase()}] ${act.file}`);
  }
  console.log(t(lang, 'upgradeDone'));

  return { ok: true, lang, mode, dryRun: isDryRun, actions };
}

module.exports = { runUpgrade };
