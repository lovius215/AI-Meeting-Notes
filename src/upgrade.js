'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { CLI_NAME, PACKAGE_NAME, HIDDEN_DIR } = require('./config');
const { t } = require('./i18n');
const { ensureDir, readConfig, writeConfig, extractClaudeMemContext } = require('./utils');
const {
  renderAgentsMd,
  renderSkillMd,
  renderRules,
  renderProjectIndex,
  renderStageFiles,
  renderAllReadmes
} = require('./templates');

function detectTargetIdentity(cwd, cfg) {
  const pkgJsonPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      const binKeys = pkg.bin && typeof pkg.bin === 'object' ? Object.keys(pkg.bin) : [];
      if (binKeys.length > 0) {
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

  // Safety guard: refuse to overwrite an already-assembled independent tool project unless --force is passed
  const pkgJsonPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgJsonPath) && !flags.force) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      if (pkg.name && pkg.name !== PACKAGE_NAME) {
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

  // 1. Update .<targetCli>/AGENTS.md (always hidden like OpenSpec) while preserving <claude-mem-context>
  const hiddenRoot = path.join(cwd, targetHiddenDir);
  const agentsPath = path.join(hiddenRoot, 'AGENTS.md');
  const legacyAgentsPath = path.join(cwd, 'AGENTS.md');
  const existingMem = fs.existsSync(agentsPath)
    ? extractClaudeMemContext(fs.readFileSync(agentsPath, 'utf8'))
    : (fs.existsSync(legacyAgentsPath) ? extractClaudeMemContext(fs.readFileSync(legacyAgentsPath, 'utf8')) : null);
  const newAgentsContent = renderAgentsMd({
    lang,
    mode,
    cliName: targetCli,
    pkgName: targetPkg,
    memContext: existingMem
  });
  actions.push({ type: 'update', file: `${targetHiddenDir}/AGENTS.md`, preservedMem: Boolean(existingMem) });
  if (!isDryRun) {
    ensureDir(hiddenRoot);
    fs.writeFileSync(agentsPath, newAgentsContent, 'utf8');
  }

  // 2. Update .<targetCli>/skills/<targetCli>/SKILL.md (always hidden like OpenSpec)
  const skillDir = path.join(cwd, targetHiddenDir, 'skills', targetCli);
  const skillRel = `${targetHiddenDir}/skills/${targetCli}/SKILL.md`;
  const skillPath = path.join(skillDir, 'SKILL.md');
  actions.push({ type: 'update', file: skillRel });
  if (!isDryRun) {
    ensureDir(skillDir);
    fs.writeFileSync(
      skillPath,
      renderSkillMd({ lang, mode, cliName: targetCli, pkgName: targetPkg }),
      'utf8'
    );
  }

  // 3. Update .<targetCli>/rules/ if rules directory exists or cfg.full is true
  const rulesDir = path.join(cwd, targetHiddenDir, 'rules');
  const legacyRulesDir = path.join(cwd, 'rules');
  if (fs.existsSync(rulesDir) || fs.existsSync(legacyRulesDir) || cfg.full) {
    const rules = renderRules({ lang, cliName: targetCli });
    if (!isDryRun) ensureDir(rulesDir);
    for (const [rname, rcontent] of Object.entries(rules)) {
      actions.push({ type: 'update', file: `${targetHiddenDir}/rules/${rname}` });
      if (!isDryRun) {
        fs.writeFileSync(path.join(rulesDir, rname), rcontent, 'utf8');
      }
    }
  }

  // 3b. Clean up legacy visible root AGENTS.md, skills/, and rules/ after migrating into .<targetCli>/
  if (fs.existsSync(legacyAgentsPath)) {
    actions.push({ type: 'migrate', file: `AGENTS.md -> ${targetHiddenDir}/AGENTS.md` });
    if (!isDryRun) {
      fs.rmSync(legacyAgentsPath, { force: true });
    }
  }
  const legacySkillsRoot = path.join(cwd, 'skills');
  for (const legacyName of new Set([CLI_NAME, targetCli])) {
    const legacySkillDir = path.join(legacySkillsRoot, legacyName);
    if (fs.existsSync(legacySkillDir)) {
      actions.push({ type: 'migrate', file: `skills/${legacyName} -> ${targetHiddenDir}/skills/${targetCli}` });
      if (!isDryRun) {
        fs.rmSync(legacySkillDir, { recursive: true, force: true });
      }
    }
  }
  if (!isDryRun && fs.existsSync(legacySkillsRoot) && fs.readdirSync(legacySkillsRoot).length === 0) {
    fs.rmSync(legacySkillsRoot, { recursive: true, force: true });
  }
  if (fs.existsSync(legacyRulesDir)) {
    actions.push({ type: 'migrate', file: `rules/ -> ${targetHiddenDir}/rules/` });
    if (!isDryRun) {
      fs.rmSync(legacyRulesDir, { recursive: true, force: true });
    }
  }

  // 4. Backfill missing files in project/ (Non-destructive: NEVER overwrite existing project files!)
  const projDir = path.join(cwd, 'project');
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
    if (targetCli !== 'genaitool') {
      const legacyMetaCfg = path.join(cwd, '.genaitool.json');
      if (fs.existsSync(legacyMetaCfg)) {
        fs.rmSync(legacyMetaCfg, { force: true });
      }
    }
  }

  for (const act of actions) {
    console.log(`  - [${act.type.toUpperCase()}] ${act.file}`);
  }
  console.log(t(lang, 'upgradeDone'));

  return { ok: true, lang, mode, dryRun: isDryRun, actions };
}

module.exports = { runUpgrade };
