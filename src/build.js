'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DEFAULT_LANG, SUPPORTED_LANGS, TOOL_MODES, CLI_NAME, HIDDEN_DIR, CONFIG_FILENAME } = require('./config');
const { readConfig } = require('./utils');
const { t } = require('./i18n');
const { runVerify } = require('./verify');
const { runSelfCheck } = require('./status');
const { assembleNpmPackage } = require('./scaffold');

function parseSpecMetadata(cwd) {
  const specPath = path.join(cwd, 'project', '01-spec.md');
  const result = {
    pkgName: null,
    cliName: null,
    mode: null,
    summary: null
  };

  if (!fs.existsSync(specPath)) return result;

  const content = fs.readFileSync(specPath, 'utf8');

  // Match Package Name / npm 套件名稱 / 工具名稱
  const pkgMatch = content.match(/(?:Package Name|npm 套件名稱|npm 套件名称|npm パッケージ名|npm 패키지 이름|工具名稱|工具名称|Tool Name)[^:\n：]*[:：]\s*`?([@\w./-]+)`?/i);
  if (pkgMatch && !pkgMatch[1].includes('{{')) {
    result.pkgName = pkgMatch[1].trim();
  }

  // Match CLI Name / CLI 指令名稱
  const cliMatch = content.match(/(?:CLI Name|CLI 指令名稱|CLI 指令名称|CLI コマンド名|CLI 명령어 이름)[^:\n：]*[:：]\s*`?([a-z0-9_-]+)`?/i);
  if (cliMatch && !cliMatch[1].includes('{{')) {
    result.cliName = cliMatch[1].trim();
  }

  // Match Interaction Mode / 互動型態
  const modeMatch = content.match(/(?:Interaction Mode|互動型態|交互形态|対話モード|인터랙션 모드)[^:\n：]*[:：]\s*`?(conversational|workbench|cli)`?/i);
  if (modeMatch) {
    result.mode = modeMatch[1].toLowerCase();
  }

  // Match Core Problem & Value Proposition / 核心痛點與價值主張
  const valMatch = content.match(/##\s+(?:Core Problem & Value Proposition|核心痛點與價值主張|核心痛点与价值主张|解決する課題とコアバリュー|핵심 문제 및 가치 제안)\s*\r?\n+([^\r\n#]+)/i);
  if (valMatch && !valMatch[1].includes('{{')) {
    result.summary = valMatch[1].replace(/^[-*>]\s*/, '').trim();
  }

  return result;
}

function runBuild({ cwd = process.cwd(), subcommand = 'build', flags = {} } = {}) {
  const wsCfg = readConfig(cwd);
  const lang = SUPPORTED_LANGS.includes(flags.lang) ? flags.lang : wsCfg.lang || DEFAULT_LANG;

  // 1. If project/ exists and --skip-verify is not set, run 0-Token verify first
  const projDir = path.join(cwd, 'project');
  if (fs.existsSync(projDir) && !flags['skip-verify']) {
    const vRes = runVerify({ cwd });
    if (!vRes.ok) {
      console.error(t(lang, 'buildVerifyFailed'));
      return { ok: false, reason: 'verify_failed', issues: vRes.issues };
    }
  }

  // 2. Determine package name, CLI name, and mode from flags -> project/01-spec.md -> directory name
  const specMeta = parseSpecMetadata(cwd);
  const dirBase = path.basename(cwd).replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'my-ai-tool';

  const rawPkg = flags.name
    || specMeta.pkgName
    || (wsCfg.packageName && wsCfg.packageName !== '@loviusc/genaitool' ? wsCfg.packageName : null)
    || `@loviusc/${dirBase}`;
  const cleanShortName = rawPkg.includes('/') ? rawPkg.split('/').pop() : rawPkg;
  const pkgName = rawPkg.startsWith('@') ? rawPkg : `@loviusc/${cleanShortName}`;
  const cliName = flags.cli || specMeta.cliName || (wsCfg.cliName !== 'genaitool' ? wsCfg.cliName : null) || cleanShortName;
  const mode = TOOL_MODES.includes(flags.mode)
    ? flags.mode
    : (specMeta.mode || wsCfg.mode || 'cli');

  const outDir = flags.out
    ? (path.isAbsolute(flags.out) ? flags.out : path.join(cwd, flags.out))
    : cwd;

  console.log(t(lang, 'buildStart', pkgName, cliName, mode, outDir));

  const hideSkillsRules = wsCfg.features && typeof wsCfg.features.hideSkillsRules === 'boolean'
    ? wsCfg.features.hideSkillsRules
    : true;

  assembleNpmPackage({
    outDir,
    pkgName,
    cliName,
    mode,
    lang,
    summary: specMeta.summary,
    hideSkillsRules
  });

  // Clean up genaitool's own meta-agent & hidden skill/rules from the generated npm project when assembling in-place
  if (path.resolve(outDir) === path.resolve(cwd) && cliName !== 'genaitool') {
    for (const hDir of new Set(['.genaitool', ...(cliName !== CLI_NAME ? [HIDDEN_DIR] : [])])) {
      const metaHiddenDir = path.join(outDir, hDir);
      if (fs.existsSync(metaHiddenDir)) {
        fs.rmSync(metaHiddenDir, { recursive: true, force: true });
      }
    }
    const metaSkillDir = path.join(outDir, 'skills', 'genaitool');
    if (fs.existsSync(metaSkillDir)) {
      fs.rmSync(metaSkillDir, { recursive: true, force: true });
    }
    const skillsRoot = path.join(outDir, 'skills');
    if (fs.existsSync(skillsRoot) && fs.readdirSync(skillsRoot).length === 0) {
      fs.rmSync(skillsRoot, { recursive: true, force: true });
    }
    const metaAgentsPath = path.join(outDir, 'AGENTS.md');
    if (fs.existsSync(metaAgentsPath)) {
      const agentsContent = fs.readFileSync(metaAgentsPath, 'utf8');
      if (agentsContent.includes('genaitool') || agentsContent.includes('@loviusc/genaitool') || agentsContent.includes(CLI_NAME)) {
        fs.rmSync(metaAgentsPath, { force: true });
      }
    }
    for (const cFile of new Set(['.genaitool.json', ...(cliName !== CLI_NAME ? [CONFIG_FILENAME] : [])])) {
      const metaCfgPath = path.join(outDir, cFile);
      if (fs.existsSync(metaCfgPath)) {
        fs.rmSync(metaCfgPath, { force: true });
      }
    }
  }

  console.log(t(lang, 'buildDone', outDir, pkgName, cliName));

  // 3. If subcommand === 'pack' or --pack is specified, run self-check & npm pack verification
  const shouldPack = subcommand === 'pack' || Boolean(flags.pack);
  if (shouldPack) {
    const checkRes = runSelfCheck(outDir);
    if (!checkRes.ok) {
      return { ok: false, reason: 'self_check_failed', missing: checkRes.missing };
    }

    const npmBin = os.platform() === 'win32' ? 'npm.cmd' : 'npm';
    const packArgs = flags.tarball ? ['pack'] : ['pack', '--dry-run'];
    const packRes = spawnSync(npmBin, packArgs, {
      cwd: outDir,
      encoding: 'utf8',
      env: { ...process.env, npm_config_cache: path.join(os.tmpdir(), 'genaitool-npm-cache') }
    });
    if (packRes.status !== 0) {
      console.error(packRes.stderr || packRes.stdout);
      return { ok: false, reason: 'npm_pack_failed' };
    }
    console.log(t(lang, 'packSuccess', pkgName));
  }

  return {
    ok: true,
    outDir,
    pkgName,
    cliName,
    mode,
    packed: shouldPack
  };
}

module.exports = {
  runBuild,
  parseSpecMetadata
};
