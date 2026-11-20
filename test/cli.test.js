'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { CLI_NAME, HIDDEN_DIR } = require('../src/config');
const { parseCliArgs } = require('../src/utils');
const { getInitPrompts } = require('../src/i18n');
const { promptInitFeatures } = require('../bin/cli');
const { runInit } = require('../src/init');
const { runVerify } = require('../src/verify');
const { runCommit } = require('../src/commit');
const { runUpgrade } = require('../src/upgrade');
const { runPdf, buildA4HtmlDocument } = require('../src/pdf');
const { runStatus, runSelfCheck } = require('../src/status');
const { runScaffold } = require('../src/scaffold');
const { runBuild } = require('../src/build');

function makeTempDir(prefix = 'genaitool-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('1. Self-check verifies all repository files and scripts exist', () => {
  const repoRoot = path.join(__dirname, '..');
  const res = runSelfCheck(repoRoot);
  assert.equal(res.ok, true);
  assert.deepEqual(res.missing, []);
});

test('2. init creates workspace skeleton, locks 5 languages, and supports --full rules', () => {
  const tmpDir = makeTempDir();
  try {
    const res = runInit({ cwd: tmpDir, flags: { full: true, lang: 'ja', mode: 'workbench' } });
    assert.equal(res.ok, true);
    assert.equal(res.lang, 'ja');

    assert.equal(fs.existsSync(path.join(tmpDir, '.gitignore')), true);
    assert.equal(fs.existsSync(path.join(tmpDir, 'AGENTS.md')), false);
    assert.equal(fs.existsSync(path.join(tmpDir, 'skills')), false);
    assert.equal(fs.existsSync(path.join(tmpDir, 'rules')), false);
    assert.equal(fs.existsSync(path.join(tmpDir, HIDDEN_DIR, 'AGENTS.md')), true);
    assert.equal(fs.existsSync(path.join(tmpDir, 'readme.md')), true);
    assert.equal(fs.existsSync(path.join(tmpDir, 'README.zh-TW.md')), true);
    assert.equal(fs.existsSync(path.join(tmpDir, 'README.zh-CN.md')), true);
    assert.equal(fs.existsSync(path.join(tmpDir, 'README.en.md')), true);
    assert.equal(fs.existsSync(path.join(tmpDir, 'README.ja.md')), true);
    assert.equal(fs.existsSync(path.join(tmpDir, 'README.ko.md')), true);
    assert.equal(fs.existsSync(path.join(tmpDir, HIDDEN_DIR, 'skills', CLI_NAME, 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(tmpDir, 'project', 'index.md')), true);
    assert.equal(fs.existsSync(path.join(tmpDir, HIDDEN_DIR, 'rules', 'language-purity.md')), true);
    assert.equal(fs.existsSync(path.join(tmpDir, HIDDEN_DIR, 'rules', 'invariants.md')), true);
    assert.equal(fs.existsSync(path.join(tmpDir, '.git')), true);
    assert.equal(fs.existsSync(path.join(tmpDir, '.git', 'hooks', 'pre-commit')), true);

    const agentsText = fs.readFileSync(path.join(tmpDir, HIDDEN_DIR, 'AGENTS.md'), 'utf8');
    assert.match(agentsText, /Locked Language\)\*\*: `ja`/);
    assert.match(agentsText, /tool:init/);
    assert.match(agentsText, /tool:propose/);
    assert.match(agentsText, /tool:analyze/);
    assert.match(agentsText, /tool:scaffold/);
    assert.match(agentsText, /REST API/);
    assert.match(agentsText, /Work Checklist/);
    assert.match(agentsText, /Verification Checklist/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('3. verify catches unfilled {{...}} placeholders and invalid #Lx-Ly line references', () => {
  const tmpDir = makeTempDir();
  try {
    runInit({ cwd: tmpDir, flags: { lang: 'zh-TW' } });

    // Initial templates have {{...}} placeholders -> verify must fail
    const initialVerify = runVerify({ cwd: tmpDir, silent: true });
    assert.equal(initialVerify.ok, false);
    assert.equal(initialVerify.issues.some((i) => i.type === 'placeholder'), true);

    // Create a sample source file with 5 lines
    const srcFile = path.join(tmpDir, 'sample.js');
    fs.writeFileSync(srcFile, 'line1\nline2\nline3\nline4\nline5', 'utf8');

    // Write a markdown file referencing valid lines and out-of-range lines
    const docPath = path.join(tmpDir, 'project', '01-spec.md');
    fs.writeFileSync(
      docPath,
      '# Spec\nValid ref: [sample.js](sample.js#L1-L5)\nOut of bounds: [sample.js](sample.js#L1-L20)\nBroken file: [missing.js](missing.js#L1-L3)\n',
      'utf8'
    );

    const refVerify = runVerify({ cwd: tmpDir, target: '01', silent: true });
    assert.equal(refVerify.ok, false);
    assert.equal(refVerify.issues.some((i) => i.type === 'broken_lines'), true);
    assert.equal(refVerify.issues.some((i) => i.type === 'broken_file'), true);

    // Fix the document so all placeholders are filled and line refs are valid
    fs.writeFileSync(
      docPath,
      '# Spec\nValid ref: [sample.js](sample.js#L1-L5)\nAll placeholders filled.\n',
      'utf8'
    );
    const cleanVerify = runVerify({ cwd: tmpDir, target: '01', silent: true });
    assert.equal(cleanVerify.ok, true);
    assert.equal(cleanVerify.issues.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('4. commit runs verify, updates project/index.md, excludes sensitive files, and stops safely on merge conflicts', () => {
  const tmpDir = makeTempDir();
  try {
    runInit({ cwd: tmpDir, flags: { lang: 'zh-TW' } });

    // Fill all stage files so verify passes
    const projDir = path.join(tmpDir, 'project');
    for (const f of fs.readdirSync(projDir)) {
      if (f !== 'index.md' && f.endsWith('.md')) {
        fs.writeFileSync(path.join(projDir, f), `# ${f}\nCompleted content without placeholders.\n`, 'utf8');
      }
    }

    // Create a sensitive .env file that MUST be excluded from commit
    fs.writeFileSync(path.join(tmpDir, '.env'), 'SECRET_KEY=12345\n', 'utf8');

    const commitRes = runCommit({ cwd: tmpDir, flags: { m: 'test archive commit' } });
    assert.equal(commitRes.ok, true);
    assert.equal(commitRes.committed, true);
    assert.equal(commitRes.excludedSensitive.includes('.env'), true);

    const indexText = fs.readFileSync(path.join(projDir, 'index.md'), 'utf8');
    assert.match(indexText, /✅ Verified/);

    // Simulate a Git merge conflict marker in project/01-spec.md
    const conflictDoc = path.join(projDir, '01-spec.md');
    const conflictText = `# 01-spec.md\n<<<<<<< HEAD\nLocal version\n=======\nRemote version\n>>>>>>> origin/main\n`;
    fs.writeFileSync(conflictDoc, conflictText, 'utf8');

    const conflictCommit = runCommit({ cwd: tmpDir });
    assert.equal(conflictCommit.ok, false);
    assert.equal(conflictCommit.reason, 'conflict');
    // Ensure CLI NEVER stripped conflict markers
    const preservedText = fs.readFileSync(conflictDoc, 'utf8');
    assert.match(preservedText, /<<<<<<< HEAD/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('5. upgrade preserves locked language, <claude-mem-context>, and existing project files', () => {
  const tmpDir = makeTempDir();
  try {
    runInit({ cwd: tmpDir, flags: { full: true, lang: 'ko' } });

    // Customize <claude-mem-context> in .<cli>/AGENTS.md and customize project/01-spec.md
    const agentsPath = path.join(tmpDir, HIDDEN_DIR, 'AGENTS.md');
    const customAgents = fs.readFileSync(agentsPath, 'utf8').replace(
      /<claude-mem-context>[\s\S]*?<\/claude-mem-context>/,
      '<claude-mem-context>\nCustom Session Memory #42\n</claude-mem-context>'
    );
    fs.writeFileSync(agentsPath, customAgents, 'utf8');

    const specPath = path.join(tmpDir, 'project', '01-spec.md');
    fs.writeFileSync(specPath, '# Custom User Spec\nUser content preserved.\n', 'utf8');

    // Delete 04-release-plan.md to test non-destructive backfill
    const releasePlanPath = path.join(tmpDir, 'project', '04-release-plan.md');
    fs.unlinkSync(releasePlanPath);

    const upgRes = runUpgrade({ cwd: tmpDir });
    assert.equal(upgRes.ok, true);
    assert.equal(upgRes.lang, 'ko');

    const updatedAgents = fs.readFileSync(agentsPath, 'utf8');
    assert.match(updatedAgents, /Custom Session Memory #42/);
    assert.match(updatedAgents, /Locked Language\)\*\*: `ko`/);

    // Ensure 01-spec.md was NOT overwritten, 04-release-plan.md WAS backfilled, and root remains clean
    assert.match(fs.readFileSync(specPath, 'utf8'), /Custom User Spec/);
    assert.equal(fs.existsSync(releasePlanPath), true);
    assert.equal(fs.existsSync(path.join(tmpDir, 'AGENTS.md')), false);
    assert.equal(fs.existsSync(path.join(tmpDir, 'skills')), false);
    assert.equal(fs.existsSync(path.join(tmpDir, 'rules')), false);

    // Also test migrating a legacy workspace that had visible root AGENTS.md, skills/, rules/
    fs.writeFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      '<claude-mem-context>\nLegacy Root Memory #99\n</claude-mem-context>\n# Legacy\n',
      'utf8'
    );
    fs.mkdirSync(path.join(tmpDir, 'skills', CLI_NAME), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'skills', CLI_NAME, 'SKILL.md'), '# Legacy Skill', 'utf8');
    fs.mkdirSync(path.join(tmpDir, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'rules', 'language-purity.md'), '# Legacy Rule', 'utf8');
    // Remove hidden AGENTS.md to force migration from legacy root AGENTS.md
    fs.unlinkSync(agentsPath);

    const migRes = runUpgrade({ cwd: tmpDir });
    assert.equal(migRes.ok, true);
    assert.equal(fs.existsSync(path.join(tmpDir, 'AGENTS.md')), false);
    assert.equal(fs.existsSync(path.join(tmpDir, 'skills')), false);
    assert.equal(fs.existsSync(path.join(tmpDir, 'rules')), false);
    assert.match(fs.readFileSync(agentsPath, 'utf8'), /Legacy Root Memory #99/);

    // Also test safety guard: upgrading an already-assembled derived project (package.json name !== @loviusc/genaitool) must safely abort
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: '@loviusc/travelplan', bin: { travelplan: './bin/cli.js' } }),
      'utf8'
    );
    fs.rmSync(path.join(tmpDir, HIDDEN_DIR), { recursive: true, force: true });
    fs.mkdirSync(path.join(tmpDir, 'skills', 'travelplan'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'skills', 'travelplan', 'SKILL.md'), '# Custom Travel Skill', 'utf8');

    const derivedUpg = runUpgrade({ cwd: tmpDir });
    assert.equal(derivedUpg.ok, false);
    assert.equal(derivedUpg.reason, 'derived_project_protected');
    assert.equal(fs.existsSync(path.join(tmpDir, HIDDEN_DIR)), false);
    assert.equal(fs.existsSync(path.join(tmpDir, '.travelplan')), false);
    assert.equal(fs.existsSync(path.join(tmpDir, 'skills', 'travelplan', 'SKILL.md')), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('6. scaffold generates both Zero-Command Conversational npm packages and CLI npm packages', () => {
  const tmpDir = makeTempDir();
  try {
    // 6a. Scaffold a Zero-Command Conversational npm Tool
    const convOut = path.join(tmpDir, 'conv-tool');
    const convRes = runScaffold({
      cwd: tmpDir,
      flags: {
        name: '@loviusc/conv-assistant',
        cli: 'convassist',
        mode: 'conversational',
        out: convOut,
        lang: 'zh-TW'
      }
    });
    assert.equal(convRes.ok, true);
    assert.equal(convRes.mode, 'conversational');
    assert.equal(fs.existsSync(path.join(convOut, 'package.json')), true);
    assert.equal(fs.existsSync(path.join(convOut, '.github', 'workflows', 'publish.yml')), true);
    assert.equal(fs.existsSync(path.join(convOut, 'AGENTS.md')), false);
    assert.equal(fs.existsSync(path.join(convOut, 'skills')), false);

    const convPkg = JSON.parse(fs.readFileSync(path.join(convOut, 'package.json'), 'utf8'));
    assert.equal(convPkg.name, '@loviusc/conv-assistant');
    assert.equal(convPkg.bin.convassist, './bin/cli.js');
    assert.equal(convPkg.files.includes('AGENTS.md'), false);
    assert.equal(convPkg.files.includes('skills/'), false);

    // 6b. Scaffold a new standalone npm AI CLI tool
    const cliOut = path.join(tmpDir, 'custom-cli-tool');
    const cliRes = runScaffold({
      cwd: tmpDir,
      flags: {
        mode: 'cli',
        name: '@loviusc/qa-helper',
        cli: 'qahelper',
        out: cliOut
      }
    });
    assert.equal(cliRes.ok, true);
    const newPkg = JSON.parse(fs.readFileSync(path.join(cliOut, 'package.json'), 'utf8'));
    assert.equal(newPkg.name, '@loviusc/qa-helper');
    assert.equal(newPkg.bin.qahelper, './bin/cli.js');

    const newInstallSh = fs.readFileSync(path.join(cliOut, 'scripts', 'install.sh'), 'utf8');
    assert.match(newInstallSh, /PACKAGE_NAME="@loviusc\/qa-helper"/);
    assert.match(newInstallSh, /CLI_NAME="qahelper"/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('7. build & pack assemble an initialized workspace into a full publishable npm package', () => {
  const tmpDir = makeTempDir();
  try {
    runInit({ cwd: tmpDir, flags: { full: true, lang: 'zh-TW' } });

    // Fill out project/01-spec.md .. 04-release-plan.md as AI would in conversation
    const projDir = path.join(tmpDir, 'project');
    fs.writeFileSync(
      path.join(projDir, '01-spec.md'),
      '# 01. 工具定位與互動模式規格書\n\n- **npm 套件名稱 (Package Name)**：@loviusc/trip-mate\n- **CLI 指令名稱 (CLI Name)**：tripmate\n- **終端使用者互動型態 (Interaction Mode)**：`conversational`\n- **目標受眾**：自由行旅客\n\n## 核心痛點與價值主張\n免指令純自然語言對話排行程，並可發布為 npm 套件供所有人安裝。\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(projDir, '02-workflow.md'),
      '# 02. 業務流程\n- 階段一：偏好收集\n- 階段二：行程排定\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(projDir, '03-agent-rules.md'),
      '# 03. AI 規則\n- 單一語言純粹性與動線合理性檢核\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(projDir, '04-release-plan.md'),
      '# 04. 發布計畫\n- 執行 genaitool build / pack 並透過 GitHub Actions 發布至 npm\n',
      'utf8'
    );

    const buildRes = runBuild({ cwd: tmpDir, subcommand: 'pack' });
    assert.equal(buildRes.ok, true);
    assert.equal(buildRes.pkgName, '@loviusc/trip-mate');
    assert.equal(buildRes.cliName, 'tripmate');
    assert.equal(buildRes.mode, 'conversational');
    assert.equal(buildRes.packed, true);

    // Check assembled npm package files in tmpDir
    const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8'));
    assert.equal(pkg.name, '@loviusc/trip-mate');
    assert.equal(pkg.bin.tripmate, './bin/cli.js');
    assert.equal(pkg.files.includes('AGENTS.md'), false);
    assert.equal(pkg.files.includes('skills/'), false);
    assert.equal(fs.existsSync(path.join(tmpDir, '.github', 'workflows', 'publish.yml')), true);
    assert.equal(fs.existsSync(path.join(tmpDir, 'AGENTS.md')), false);
    assert.equal(fs.existsSync(path.join(tmpDir, 'skills')), false);
    assert.equal(fs.existsSync(path.join(tmpDir, '.genaitool')), false);

    // Check 5-language i18n READMEs in the built project (including Install, Usage, Examples & custom summary)
    const zhTwReadme = fs.readFileSync(path.join(tmpDir, 'README.zh-TW.md'), 'utf8');
    assert.match(zhTwReadme, /@loviusc\/trip-mate \(`tripmate`\) — 繁體中文說明書/);
    assert.match(zhTwReadme, /免指令純自然語言對話排行程/);
    assert.match(zhTwReadme, /## 2\. 安裝說明 \(Installation Guide\)/);
    assert.match(zhTwReadme, /## 3\. 使用說明 \(Usage Guide\)/);
    assert.match(zhTwReadme, /## 4\. 實戰使用範例 \(Examples\)/);

    const enReadme = fs.readFileSync(path.join(tmpDir, 'README.en.md'), 'utf8');
    assert.match(enReadme, /@loviusc\/trip-mate \(`tripmate`\) — English Documentation/);
    assert.match(enReadme, /## 2\. Installation Guide/);
    assert.match(enReadme, /## 3\. Usage Guide/);
    assert.match(enReadme, /## 4\. Step-by-Step Examples/);

    assert.match(fs.readFileSync(path.join(tmpDir, 'README.zh-CN.md'), 'utf8'), /@loviusc\/trip-mate \(`tripmate`\) — 简体中文说明书/);
    assert.match(fs.readFileSync(path.join(tmpDir, 'README.ja.md'), 'utf8'), /@loviusc\/trip-mate \(`tripmate`\) — 日本語ドキュメント/);
    assert.match(fs.readFileSync(path.join(tmpDir, 'README.ko.md'), 'utf8'), /@loviusc\/trip-mate \(`tripmate`\) — 한국어 문서/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('8. pdf A4 HTML renderer and status/doctor commands work properly', () => {
  const html = buildA4HtmlDocument(
    [{ file: '01.md', content: '# Title\n\n| Col1 | Col2 |\n| :--- | :--- |\n| A | B |\n' }],
    'Test PDF'
  );
  assert.match(html, /size: A4/);
  assert.match(html, /<table>/);

  const tmpDir = makeTempDir();
  try {
    runInit({ cwd: tmpDir, flags: { lang: 'zh-TW', mode: 'conversational' } });
    const stRes = runStatus({ cwd: tmpDir, subcommand: 'doctor' });
    assert.equal(stRes.ok, true);

    // Also test 0-Token PDF generation if a local PDF engine is available
    const outPdf = path.join(tmpDir, 'spec.pdf');
    const pdfRes = runPdf({ cwd: tmpDir, flags: { merge: true, output: outPdf } });
    if (pdfRes.ok) {
      assert.equal(fs.existsSync(outPdf), true);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('9. regression checks: boolean CLI flags, backticked #Lx-Ly refs, and non-ASCII git filenames', () => {
    // 9a. Boolean flags must not swallow following positional target
  const parsed = parseCliArgs(['pdf', '--merge', 'project/01-spec.md']);
  assert.equal(parsed.flags.merge, true);
  assert.deepEqual(parsed.positional, ['pdf', 'project/01-spec.md']);

  // 9b. init --no-git --no-pdf --no-html --no-npm --no-hide-skills skips git init and records features
  const noGitDir = makeTempDir();
  try {
    const noGitRes = runInit({
      cwd: noGitDir,
      flags: { full: true, lang: 'zh-TW', 'no-git': true, 'no-pdf': true, 'no-html': true, 'no-npm': true, 'no-hide-skills': true }
    });
    assert.equal(noGitRes.ok, true);
    assert.equal(noGitRes.features.git, false);
    assert.equal(noGitRes.features.pdf, false);
    assert.equal(noGitRes.features.html, false);
    assert.equal(noGitRes.features.npm, false);
    assert.equal(noGitRes.features.hideSkillsRules, true);
    assert.equal(fs.existsSync(path.join(noGitDir, '.git')), false);
    assert.equal(fs.existsSync(path.join(noGitDir, HIDDEN_DIR, 'AGENTS.md')), true);
    assert.equal(fs.existsSync(path.join(noGitDir, HIDDEN_DIR, 'skills', CLI_NAME, 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(noGitDir, HIDDEN_DIR, 'rules', 'language-purity.md')), true);
    assert.equal(fs.existsSync(path.join(noGitDir, 'AGENTS.md')), false);
    assert.equal(fs.existsSync(path.join(noGitDir, 'skills')), false);
    assert.equal(fs.existsSync(path.join(noGitDir, 'rules')), false);

    // upgrade keeps AGENTS.md/skills/rules hidden inside .<cli>/
    const upgHidden = runUpgrade({ cwd: noGitDir });
    assert.equal(upgHidden.ok, true);
    assert.equal(fs.existsSync(path.join(noGitDir, 'AGENTS.md')), false);
    assert.equal(fs.existsSync(path.join(noGitDir, 'skills')), false);
    assert.equal(fs.existsSync(path.join(noGitDir, 'rules')), false);

    // 9c. pdf --html exports standalone HTML without requiring Chrome
    const htmlOut = path.join(noGitDir, 'out', 'spec.html');
    const htmlRes = runPdf({ cwd: noGitDir, flags: { merge: true, html: true, output: htmlOut } });
    assert.equal(htmlRes.ok, true);
    assert.equal(htmlRes.engine, 'html');
    assert.equal(fs.existsSync(htmlOut), true);
    // 9d. conversational mode AGENTS.md is hidden inside .<cli>/ and does not expose genaitool meta-commands
    const convDir = makeTempDir();
    try {
      runInit({ cwd: convDir, flags: { lang: 'zh-TW', mode: 'conversational', 'no-git': true } });
      assert.equal(fs.existsSync(path.join(convDir, 'AGENTS.md')), false);
      const convAgents = fs.readFileSync(path.join(convDir, HIDDEN_DIR, 'AGENTS.md'), 'utf8');
      assert.doesNotMatch(convAgents, /tool:scaffold/);
      assert.match(convAgents, /Work Checklist/);
      assert.match(convAgents, /Verification Checklist/);
    } finally {
      fs.rmSync(convDir, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(noGitDir, { recursive: true, force: true });
  }

  const tmpDir = makeTempDir();
  try {
    runInit({ cwd: tmpDir, flags: { lang: 'zh-TW' } });
    const projDir = path.join(tmpDir, 'project');
    for (const f of fs.readdirSync(projDir)) {
      if (f !== 'index.md' && f.endsWith('.md')) {
        fs.writeFileSync(path.join(projDir, f), `# ${f}\nExample \`missing.js#L1-L5\` in backticks and \`\`{{LITERAL}}\`\`.\n`, 'utf8');
      }
    }
    // Non-ASCII filename in project/
    fs.writeFileSync(path.join(projDir, '規格測試.md'), '# 規格測試\n內容已完成。\n', 'utf8');

    const vRes = runVerify({ cwd: tmpDir, silent: true });
    assert.equal(vRes.ok, true);

    const cRes = runCommit({ cwd: tmpDir, flags: { m: 'test non-ascii filename' } });
    assert.equal(cRes.ok, true);
    assert.equal(cRes.committed, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('10. interactive init prompts support all 5 languages for Git/PDF/HTML/npm', async () => {
  for (const lang of ['zh-TW', 'zh-CN', 'en', 'ja', 'ko']) {
    const p = getInitPrompts(lang, CLI_NAME);
    assert.ok(p.git && p.pdf && p.html && p.npm);
  }

  const asked = [];
  const res = await promptInitFeatures({}, 'ja', async (q) => {
    asked.push(q);
    return asked.length !== 4;
  });
  assert.equal(asked.length, 4);
  assert.equal(res['no-npm'], true);
});
