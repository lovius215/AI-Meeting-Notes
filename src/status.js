'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { CLI_NAME, PACKAGE_NAME, VERSION, HIDDEN_DIR } = require('./config');
const { readConfig, runGit } = require('./utils');
const { t } = require('./i18n');
const { verifyFile } = require('./verify');
const { findBrowserExecutable } = require('./pdf');

function runSelfCheck(repoRoot) {
  const requiredRepoFiles = [
    'package.json',
    'bin/cli.js',
    'src/config.js',
    'src/i18n.js',
    'src/init.js',
    'src/verify.js',
    'src/commit.js',
    'src/pdf.js',
    'src/upgrade.js',
    'src/status.js',
    'src/scaffold.js',
    'src/build.js',
    'src/meeting.js',
    'templates/gitignore.template',
    'scripts/install.sh',
    'scripts/update.sh',
    'scripts/uninstall.sh',
    'scripts/install.bat',
    'scripts/update.bat',
    'scripts/uninstall.bat',
    'readme.md',
    'README.zh-TW.md',
    'README.zh-CN.md',
    'README.en.md',
    'README.ja.md',
    'README.ko.md',
    '.github/workflows/publish.yml'
  ];

  const missing = requiredRepoFiles.filter((f) => !fs.existsSync(path.join(repoRoot, f)));
  if (missing.length > 0) {
    console.error(`❌ Self-check failed. Missing package files: ${missing.join(', ')}`);
    return { ok: false, missing };
  }

  console.log(`✅ ${PACKAGE_NAME}@${VERSION} self-check passed (${requiredRepoFiles.length} core files verified).`);
  return { ok: true, missing: [] };
}

function runStatus({ cwd = process.cwd(), subcommand = 'status', flags = {} } = {}) {
  if (flags.self) {
    const repoRoot = path.join(__dirname, '..');
    return runSelfCheck(repoRoot);
  }

  const cfg = readConfig(cwd);
  const lang = cfg.lang;

  console.log(t(lang, 'statusTitle'));
  console.log(`  - Package: ${PACKAGE_NAME} v${VERSION} (${CLI_NAME})`);
  console.log(`  - Locked Language: ${cfg.lang}`);
  console.log(`  - Interaction Mode: ${cfg.mode}`);

  const hasAgents = fs.existsSync(path.join(cwd, HIDDEN_DIR, 'AGENTS.md')) || fs.existsSync(path.join(cwd, 'AGENTS.md'));
  const hasSkills = fs.existsSync(path.join(cwd, HIDDEN_DIR, 'skills')) || fs.existsSync(path.join(cwd, 'skills'));
  const hasMeetingsDir = fs.existsSync(path.join(cwd, 'meetings'));
  const hasProjectDir = fs.existsSync(path.join(cwd, 'project')) && fs.existsSync(path.join(cwd, 'project', 'index.md'));

  const missing = [];
  if (!fs.existsSync(path.join(cwd, '.gitignore'))) {
    missing.push('.gitignore');
  }
  if (!hasMeetingsDir && !hasProjectDir) {
    missing.push('meetings/ or project/index.md');
  }
  if (!hasAgents) {
    missing.push(`${HIDDEN_DIR}/AGENTS.md`);
  }
  if (!hasSkills) {
    missing.push(`${HIDDEN_DIR}/skills`);
  }

  // Calculate stage progress in project/
  const projDir = path.join(cwd, 'project');
  let totalStages = 0;
  let completedStages = 0;
  const stageDetails = [];

  if (fs.existsSync(projDir)) {
    const stageFiles = fs.readdirSync(projDir)
      .filter((f) => f !== 'index.md' && f.endsWith('.md'))
      .sort();
    totalStages = stageFiles.length;
    for (const sf of stageFiles) {
      const issues = verifyFile(path.join(projDir, sf), cwd);
      const isComplete = issues.length === 0;
      if (isComplete) completedStages++;
      stageDetails.push({
        file: sf,
        ok: isComplete,
        issueCount: issues.length
      });
    }
  }

  const pct = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;
  console.log(`  - Progress: ${completedStages}/${totalStages} (${pct}%)`);
  for (const sd of stageDetails) {
    const badge = sd.ok ? '✅ Ready' : `⏳ Pending (${sd.issueCount} placeholder/ref issues)`;
    console.log(`    * ${sd.file}: ${badge}`);
  }

  // Also report meetings/ knowledge base status if meetings/ exists
  const meetingsDir = path.join(cwd, 'meetings');
  if (fs.existsSync(meetingsDir)) {
    const projects = fs.readdirSync(meetingsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
    console.log(`  - Meetings Knowledge Base (meetings/): ${projects.length} project(s)`);
  }

  if (subcommand === 'doctor') {
    const nodeVer = process.version;
    const npmRes = spawnSync(os.platform() === 'win32' ? 'npm.cmd' : 'npm', ['--version'], { encoding: 'utf8' });
    const gitRes = runGit(['--version'], cwd);
    const browserBin = findBrowserExecutable();
    const hasCups = os.platform() === 'darwin' && fs.existsSync('/usr/sbin/cupsfilter');
    const pdfEngine = browserBin || (hasCups ? '/usr/sbin/cupsfilter' : 'none');

    console.log('  - Environment Doctor:');
    console.log(`    * OS / Arch: ${os.platform()} (${os.arch()})`);
    console.log(`    * Node.js: ${nodeVer}`);
    console.log(`    * npm: ${npmRes.status === 0 ? npmRes.stdout.trim() : 'missing'}`);
    console.log(`    * Git: ${gitRes.ok ? gitRes.stdout : 'missing'}`);
    console.log(`    * 0-Token PDF Engine: ${pdfEngine}`);
  }

  if (missing.length > 0) {
    console.error(t(lang, 'checkFail', missing));
    return { ok: false, missing, totalStages, completedStages };
  }

  console.log(t(lang, 'checkPass'));
  return { ok: true, missing: [], totalStages, completedStages };
}

module.exports = {
  runStatus,
  runSelfCheck
};
