'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_LANG, SUPPORTED_LANGS, TOOL_MODES, PACKAGE_NAME, CLI_NAME } = require('./config');
const { ensureDir, readConfig, runGit } = require('./utils');
const { t } = require('./i18n');
const { renderAllReadmes } = require('./templates');

function copyDirRecursive(srcDir, destDir) {
  ensureDir(destDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Generates a complete, publishable Zero-Dependency npm AI Package.
 */
function assembleNpmPackage({
  outDir,
  pkgName,
  cliName,
  mode = 'cli',
  lang = DEFAULT_LANG,
  summary = null,
  hideSkillsRules = true
}) {
  const repoRoot = path.join(__dirname, '..');
  ensureDir(outDir);

  // 1. Copy core npm package directories from mother template
  for (const dirName of ['bin', 'src', 'templates', 'scripts', '.github', 'test']) {
    const srcDir = path.join(repoRoot, dirName);
    if (fs.existsSync(srcDir) && path.resolve(srcDir) !== path.resolve(path.join(outDir, dirName))) {
      copyDirRecursive(srcDir, path.join(outDir, dirName));
    }
  }

  // 2. Copy .gitignore
  const gitignoreTemplate = path.join(repoRoot, 'templates', 'gitignore.template');
  if (fs.existsSync(gitignoreTemplate) && !fs.existsSync(path.join(outDir, '.gitignore'))) {
    fs.copyFileSync(gitignoreTemplate, path.join(outDir, '.gitignore'));
  }

  // 3. Generate customized 5-language i18n READMEs (readme.md + README.{zh-TW,zh-CN,en,ja,ko}.md)
  const readmes = renderAllReadmes({ lang, mode, cliName, pkgName, summary });
  for (const [rf, rcontent] of Object.entries(readmes)) {
    fs.writeFileSync(path.join(outDir, rf), rcontent, 'utf8');
  }

  // 4. Customize package.json & package-lock.json (explicitly exclude AGENTS.md and skills/ from npm files)
  const shortName = pkgName.includes('/') ? pkgName.split('/').pop() : pkgName;
  const derivedRepoHttps = `https://github.com/loviusc/${shortName}`;
  const pkgJsonPath = path.join(repoRoot, 'package.json');
  const pkgObj = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  delete pkgObj.private;
  pkgObj.name = pkgName;
  pkgObj.bin = { [cliName]: './bin/cli.js' };
  pkgObj.homepage = `${derivedRepoHttps}#readme`;
  pkgObj.bugs = { url: `${derivedRepoHttps}/issues` };
  pkgObj.repository = { type: 'git', url: `git+${derivedRepoHttps}.git` };
  pkgObj.files = [
    'bin/',
    'src/',
    'templates/',
    'scripts/',
    'readme.md',
    'README.zh-TW.md',
    'README.zh-CN.md',
    'README.en.md',
    'README.ja.md',
    'README.ko.md'
  ];
  if (mode === 'conversational') {
    pkgObj.description = `Zero-Dependency Conversational AI Agent Workbench (${pkgName}) — Install via npm, initialize via '${cliName} init', and chat in natural language with zero commands!`;
  }
  fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(pkgObj, null, 2) + '\n', 'utf8');

  const lockObj = {
    name: pkgName,
    version: pkgObj.version || '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: pkgName,
        version: pkgObj.version || '1.0.0',
        license: 'MIT',
        bin: { [cliName]: 'bin/cli.js' },
        engines: { node: '>=18.0.0' }
      }
    }
  };
  fs.writeFileSync(path.join(outDir, 'package-lock.json'), JSON.stringify(lockObj, null, 2) + '\n', 'utf8');

  // 5. Customize src/config.js with the new PACKAGE_NAME, CLI_NAME, GITHUB_REPO, DEFAULT_HIDE_SKILLS, and DEFAULT_MODE
  const configJsPath = path.join(outDir, 'src', 'config.js');
  if (fs.existsSync(configJsPath)) {
    const cfgContent = fs.readFileSync(configJsPath, 'utf8')
      .replace(/const PACKAGE_NAME = .*?;/, `const PACKAGE_NAME = process.env.GENAITOOL_PACKAGE_NAME || '${pkgName}';`)
      .replace(/const CLI_NAME = .*?;/, `const CLI_NAME = process.env.GENAITOOL_CLI_NAME || '${cliName}';`)
      .replace(/const GITHUB_REPO = .*?;/, `const GITHUB_REPO = '${derivedRepoHttps}';`)
      .replace(/const DEFAULT_HIDE_SKILLS = .*?;/, `const DEFAULT_HIDE_SKILLS = ${Boolean(hideSkillsRules)};`)
      .replace(/const DEFAULT_MODE = .*?;/, `const DEFAULT_MODE = '${mode}';`);
    fs.writeFileSync(configJsPath, cfgContent, 'utf8');
  }

  // 6. Customize scripts/*.sh and scripts/*.bat with the new PACKAGE_NAME and CLI_NAME
  const scriptsDir = path.join(outDir, 'scripts');
  if (fs.existsSync(scriptsDir)) {
    const escapedPkg = PACKAGE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedCli = CLI_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pkgRegex = new RegExp(escapedPkg, 'g');
    const cliRegex = new RegExp(`\\b${escapedCli}\\b`, 'g');
    for (const sfile of fs.readdirSync(scriptsDir)) {
      const spath = path.join(scriptsDir, sfile);
      if (!fs.statSync(spath).isFile()) continue;
      const scontent = fs.readFileSync(spath, 'utf8')
        .replace(pkgRegex, pkgName)
        .replace(cliRegex, cliName);
      fs.writeFileSync(spath, scontent, 'utf8');
      if (sfile.endsWith('.sh')) {
        try {
          fs.chmodSync(spath, 0o755);
        } catch (_) {}
      }
    }
  }

  // 7. Ensure bin/cli.js is executable
  const binPath = path.join(outDir, 'bin', 'cli.js');
  if (fs.existsSync(binPath)) {
    try {
      fs.chmodSync(binPath, 0o755);
    } catch (_) {}
  }

  if (!fs.existsSync(path.join(outDir, '.git'))) {
    runGit(['init'], outDir);
  }
}

function runScaffold({ cwd = process.cwd(), target = null, flags = {} } = {}) {
  const wsCfg = readConfig(cwd);
  const lang = SUPPORTED_LANGS.includes(flags.lang) ? flags.lang : wsCfg.lang || DEFAULT_LANG;

  const rawName = flags.name || target || '@loviusc/my-ai-tool';
  const cleanShortName = rawName.includes('/') ? rawName.split('/').pop() : rawName;
  const cliName = flags.cli || cleanShortName.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'myaitool';
  const pkgName = rawName.startsWith('@') ? rawName : `@loviusc/${cleanShortName}`;

  const mode = TOOL_MODES.includes(flags.mode) ? flags.mode : 'cli';

  const outDir = flags.out
    ? (path.isAbsolute(flags.out) ? flags.out : path.join(cwd, flags.out))
    : path.join(cwd, cleanShortName);

  console.log(t(lang, 'scaffoldStart', pkgName, mode, outDir));

  assembleNpmPackage({
    outDir,
    pkgName,
    cliName,
    mode,
    lang
  });

  console.log(t(lang, 'scaffoldDone', outDir, mode));
  return { ok: true, outDir, mode, name: pkgName, cliName };
}

module.exports = { runScaffold, assembleNpmPackage };
