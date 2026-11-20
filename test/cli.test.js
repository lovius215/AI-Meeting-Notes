'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { CLI_NAME, HIDDEN_DIR, CONFIG_FILENAME } = require('../src/config');
const { parseCliArgs, readConfig } = require('../src/utils');
const { getInitPrompts } = require('../src/i18n');
const { main, promptInitFeatures } = require('../bin/cli');
const { runInit } = require('../src/init');
const { runVerify } = require('../src/verify');
const { runCommit } = require('../src/commit');
const { runUpgrade } = require('../src/upgrade');
const { runPdf, buildA4HtmlDocument, markdownToHtmlBody } = require('../src/pdf');
const { runStatus, runSelfCheck } = require('../src/status');
const { runScaffold } = require('../src/scaffold');
const { runBuild } = require('../src/build');
const {
  applySpeakerMapping,
  createMeeting,
  generateDeliverableFromTemplate,
  inspectMeetingDirectory,
  syncTranscriptHash
} = require('../src/meeting');

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
    runInit({ cwd: tmpDir, flags: { lang: 'zh-TW', mode: 'workbench' } });

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
    runInit({ cwd: tmpDir, flags: { lang: 'zh-TW', mode: 'workbench' } });

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
    runInit({ cwd: tmpDir, flags: { full: true, lang: 'ko', mode: 'workbench' } });

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
    runInit({ cwd: tmpDir, flags: { full: true, lang: 'zh-TW', mode: 'workbench' } });

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

    // 9c. pdf --html respects --no-html unless --force is passed, and exports standalone HTML without requiring Chrome
    const htmlOut = path.join(noGitDir, 'out', 'spec.html');
    const htmlDisabledRes = runPdf({ cwd: noGitDir, flags: { merge: true, html: true, output: htmlOut } });
    assert.equal(htmlDisabledRes.ok, false);
    assert.equal(htmlDisabledRes.reason, 'feature_disabled');
    const htmlRes = runPdf({ cwd: noGitDir, flags: { merge: true, html: true, force: true, output: htmlOut } });
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
    runInit({ cwd: tmpDir, flags: { lang: 'zh-TW', mode: 'workbench' } });
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

test('11. comprehensive fixes: 5-lang meeting rules, safe upgrade/re-init, recursive meetings/ verify/pdf, permalink/newline line check, markdown renderer & deterministic meeting engine', () => {
  // 11a. All 5 languages get complete meeting-specific AGENTS.md & SKILL.md (meetings/, 01-transcript.md, SPEAKER_00, deliverables/, 🟢/🟡/🔴)
  for (const lang of ['zh-TW', 'zh-CN', 'en', 'ja', 'ko']) {
    const langDir = makeTempDir(`meetnotes-lang-${lang}-`);
    try {
      runInit({ cwd: langDir, flags: { full: true, lang, mode: 'conversational', 'no-git': true } });
      assert.equal(fs.existsSync(path.join(langDir, 'meetings')), true);
      const agentsMd = fs.readFileSync(path.join(langDir, HIDDEN_DIR, 'AGENTS.md'), 'utf8');
      const skillMd = fs.readFileSync(path.join(langDir, HIDDEN_DIR, 'skills', CLI_NAME, 'SKILL.md'), 'utf8');
      for (const keyword of ['meetings/', '01-transcript.md', '02-summary.md', '03-todos-and-discussion.md', 'SPEAKER_00', 'deliverables/', '🟢', '🟡', '🔴']) {
        assert.equal(agentsMd.includes(keyword), true, `AGENTS.md (${lang}) missing ${keyword}`);
        assert.equal(skillMd.includes(keyword), true, `SKILL.md (${lang}) missing ${keyword}`);
      }
    } finally {
      fs.rmSync(langDir, { recursive: true, force: true });
    }
  }

  // 11b. Re-running init preserves locked language and does NOT overwrite customized AGENTS.md / SKILL.md unless --force
  const reInitDir = makeTempDir('meetnotes-reinit-');
  try {
    runInit({ cwd: reInitDir, flags: { full: true, lang: 'ja', 'no-git': true } });
    const agentsPath = path.join(reInitDir, HIDDEN_DIR, 'AGENTS.md');
    const skillPath = path.join(reInitDir, HIDDEN_DIR, 'skills', CLI_NAME, 'SKILL.md');
    fs.appendFileSync(agentsPath, '\n# MY_CUSTOM_AGENT_RULE_123\n', 'utf8');
    fs.appendFileSync(skillPath, '\n# MY_CUSTOM_SKILL_RULE_456\n', 'utf8');

    const secondInit = runInit({ cwd: reInitDir, flags: { 'no-git': true } });
    assert.equal(secondInit.lang, 'ja');
    assert.equal(readConfig(reInitDir).lang, 'ja');
    assert.match(fs.readFileSync(agentsPath, 'utf8'), /MY_CUSTOM_AGENT_RULE_123/);
    assert.match(fs.readFileSync(skillPath, 'utf8'), /MY_CUSTOM_SKILL_RULE_456/);

    // Also verify readConfig rejects invalid lang like "fr" and falls back safely
    fs.writeFileSync(path.join(reInitDir, CONFIG_FILENAME), JSON.stringify({ lang: 'fr', mode: 'invalid-mode' }), 'utf8');
    const safeCfg = readConfig(reInitDir);
    assert.equal(safeCfg.lang, 'zh-TW');
    assert.equal(safeCfg.mode, 'conversational');
  } finally {
    fs.rmSync(reInitDir, { recursive: true, force: true });
  }

  // 11c. upgrade preserves user-authored root AGENTS.md & custom rules/*.md, and allows normal user package.json
  const upgDir = makeTempDir('meetnotes-safe-upg-');
  try {
    runInit({ cwd: upgDir, flags: { full: true, lang: 'en', 'no-git': true } });
    // User has their own web app package.json (no bin/cli.js)
    fs.writeFileSync(path.join(upgDir, 'package.json'), JSON.stringify({ name: 'my-company-webapp', version: '1.0.0' }), 'utf8');
    // User has their own custom root AGENTS.md and custom rules/team-style.md
    const customRootAgents = '# Team Custom AGENTS.md\nUser authored instructions that must never be deleted.\n';
    fs.writeFileSync(path.join(upgDir, 'AGENTS.md'), customRootAgents, 'utf8');
    fs.mkdirSync(path.join(upgDir, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(upgDir, 'rules', 'team-style.md'), '# Team Style Rule\nKeep this file safe!\n', 'utf8');

    const upgRes = runUpgrade({ cwd: upgDir });
    assert.equal(upgRes.ok, true);
    assert.equal(fs.existsSync(path.join(upgDir, 'AGENTS.md')), true);
    assert.equal(fs.readFileSync(path.join(upgDir, 'AGENTS.md'), 'utf8'), customRootAgents);
    assert.equal(fs.existsSync(path.join(upgDir, 'rules', 'team-style.md')), true);
    assert.equal(fs.existsSync(path.join(upgDir, HIDDEN_DIR, 'rules', 'team-style.md')), true);
  } finally {
    fs.rmSync(upgDir, { recursive: true, force: true });
  }

  // 11d. verify GitHub permalink exclusion & exact trailing-newline line count + recursive meetings/ verify & pdf
  const meetWorkspace = makeTempDir('meetnotes-engine-');
  try {
    runInit({ cwd: meetWorkspace, flags: { full: true, lang: 'zh-TW', 'no-git': true } });
    // Remove unfilled project/ templates to simulate a pure meetings/ workspace
    fs.rmSync(path.join(meetWorkspace, 'project'), { recursive: true, force: true });

    // Create a 3-line file with trailing newline
    fs.writeFileSync(path.join(meetWorkspace, 'three.txt'), 'line1\nline2\nline3\n', 'utf8');

    // Create Meeting 1 (2026-11-13) and Meeting 2 (2026-11-20) with SRT transcript, speaker mapping, and media file
    const dummyMedia = path.join(meetWorkspace, 'sample.mp3');
    fs.writeFileSync(dummyMedia, 'FAKE_MP3_BINARY_CONTENT', 'utf8');

    const m1 = createMeeting({
      cwd: meetWorkspace,
      project: 'Project-A',
      title: 'Kickoff',
      date: '2026-11-13',
      transcriptText: '1\n00:00:10,000 --> 00:00:15,000\nSPEAKER_00: 我們決定預計上線日鎖定在 12/01。\n',
      mapping: { SPEAKER_00: '王經理 (PM)' }
    });
    assert.equal(m1.ok, true);
    fs.appendFileSync(path.join(m1.meetingDir, '02-summary.md'), '\n- **預計上線日**：2026-12-01 (來源：[01-transcript.md](./01-transcript.md#L1-L10))\n', 'utf8');

    const m2 = createMeeting({
      cwd: meetWorkspace,
      project: 'Project-A',
      title: 'Weekly-Sync',
      date: '2026-11-20',
      mediaFile: dummyMedia,
      transcriptText: '1\n00:01:00,000 --> 00:01:05,000\nSPEAKER_00: 我們把拼字錯詞改掉，上線日延後到 12/15。\n\n2\n00:01:06,000 --> 00:01:10,000\nSPEAKER_02: 預算部分 [inaudible] 需要再確認。\n',
      mapping: { SPEAKER_00: '王經理 (PM)' },
      terms: { '拼字錯詞': '微服務架構' }
    });
    assert.equal(m2.ok, true);
    assert.ok(m2.mediaMeta && m2.mediaMeta.sha256);
    assert.equal(fs.existsSync(path.join(m2.meetingDir, 'media', 'sample.mp3')), true);
    assert.equal(m2.mapped.unmappedSpeakers.includes('SPEAKER_02'), true);
    assert.equal(m2.mapped.uncertaintyFlags.length >= 2, true);

    // Add a GitHub permalink and a valid 3-line reference to m2 summary, plus a conflicting launch date
    fs.appendFileSync(
      path.join(m2.meetingDir, '02-summary.md'),
      '\n- **預計上線日**：2026-12-15 (來源：[01-transcript.md](./01-transcript.md#L1-L12))\n- 參考 GitHub Permalink：https://github.com/loviusc/ai-meeting-notes/blob/main/src/index.js#L1-L5\n- 參考三行檔案：[three.txt](../../../three.txt#L1-L3)\n',
      'utf8'
    );

    // Generate post-meeting deliverable from template with one missing field (BUDGET_IMPACT)
    const tplPath = path.join(m2.projectDir, 'templates', 'change-request.md');
    const delivRes = generateDeliverableFromTemplate({
      meetingDir: m2.meetingDir,
      templatePath: tplPath,
      outputName: 'change-request.md',
      values: {
        PROJECT_NAME: 'Project-A',
        MEETING_DATE: '2026-11-20',
        REQUESTER: '王經理 (PM)',
        CHANGE_SUMMARY: '上線日調整至 2026-12-15',
        LAUNCH_DATE: '2026-12-15'
      }
    });
    assert.equal(delivRes.ok, true);
    assert.deepEqual(delivRes.missingFields, ['BUDGET_IMPACT']);
    const delivText = fs.readFileSync(delivRes.outputPath, 'utf8');
    assert.match(delivText, /⚠️ \[會議未提及 - 需人工補填: BUDGET_IMPACT\]/);

    // Deterministic inspection detects both human-intervention items and cross-meeting conflict (2026-12-15 vs 2026-12-01)
    // Because m2 has unresolved human-intervention items and a cross-meeting conflict, structureOk is true while ok is false (needsHumanReview: true)
    const inspectRes = inspectMeetingDirectory(m2.meetingDir);
    assert.equal(inspectRes.structureOk, true);
    assert.equal(inspectRes.needsHumanReview, true);
    assert.equal(inspectRes.ok, false);
    assert.equal(inspectRes.humanInterventionItems.length >= 2, true);
    assert.equal(inspectRes.conflicts.some((c) => c.key === '預計上線日' && c.previousValue.includes('2026-12-01') && c.currentValue.includes('2026-12-15')), true);

    // Exact line citation check when --media is provided: line 11 is blank, firstContentLine is 12!
    assert.equal(m2.firstContentLine, 12);
    const m2TranscriptLines = fs.readFileSync(path.join(m2.meetingDir, '01-transcript.md'), 'utf8').split('\n');
    assert.equal(m2TranscriptLines[10], '');
    assert.match(m2TranscriptLines[11], /^\[00:01:00\] \*\*王經理 \(PM\)\*\*/);

    // Recursive verify on 'meetings' must pass (GitHub permalink ignored, #L1-L3 valid, templates/ skipped)
    const verifyMeetings = runVerify({ cwd: meetWorkspace, target: 'meetings', silent: true });
    assert.equal(verifyMeetings.ok, true, JSON.stringify(verifyMeetings.issues));
    assert.equal(verifyMeetings.files.length >= 8, true);

    // Recursive HTML/PDF export on 'meetings' works
    const htmlMeetings = runPdf({
      cwd: meetWorkspace,
      target: 'meetings',
      flags: { merge: true, html: true, output: 'meetings-report.html' }
    });
    assert.equal(htmlMeetings.ok, true);
    assert.equal(fs.existsSync(path.join(meetWorkspace, 'meetings-report.html')), true);

    // Now test out-of-range #L4 on 3-line file with trailing newline -> MUST FAIL with maxLine === 3!
    fs.appendFileSync(path.join(m2.meetingDir, '02-summary.md'), '\n- 越界測試：[three.txt](../../../three.txt#L1-L4)\n', 'utf8');
    const verifyOutOfBounds = runVerify({ cwd: meetWorkspace, target: 'meetings', silent: true });
    assert.equal(verifyOutOfBounds.ok, false);
    const brokenLineIssue = verifyOutOfBounds.issues.find((i) => i.type === 'broken_lines');
    assert.ok(brokenLineIssue);
    assert.equal(brokenLineIssue.maxLine, 3);
  } finally {
    fs.rmSync(meetWorkspace, { recursive: true, force: true });
  }

  // 11e. Markdown to HTML converter fixes (ordered lists, nested lists, paragraph after list, inline code *b*, XSS link, escaped table pipe \|)
  const sampleMd = [
    '1. First ordered',
    '2. Second ordered',
    '  - Nested bullet',
    'Paragraph right after list',
    '',
    'Inline code with `*b*` and `[link](https://example.com)` inside.',
    'Bad link: [click](javascript:alert(1))',
    '',
    '| Col A | Col B |',
    '| :--- | :--- |',
    '| a \\| b | c |'
  ].join('\n');
  const renderedHtml = markdownToHtmlBody(sampleMd);
  assert.match(renderedHtml, /<ol>\s*<li>First ordered\s*<\/li>\s*<li>Second ordered\s*<ul>\s*<li>Nested bullet\s*<\/li>\s*<\/ul>\s*<\/li>\s*<\/ol>\s*<p>Paragraph right after list<\/p>/);
  assert.doesNotMatch(renderedHtml, /<\/li>\s*<ul>/);
  assert.match(renderedHtml, /<code>\*b\*<\/code>/);
  assert.doesNotMatch(renderedHtml, /<code><em>b<\/em><\/code>/);
  assert.match(renderedHtml, /<a href="#">click<\/a>/);
  assert.doesNotMatch(renderedHtml, /href="javascript:/i);
  assert.match(renderedHtml, /<td>a \| b<\/td>\s*<td>c<\/td>/);
});

test('12. negative paths & security guardrails: zero-hallucination missing input rejection, overwrite lock, path traversal, WebVTT hourless/multiline, boolean CLI flags & prose conflict detection', () => {
  const { main } = require('../bin/cli');
  const tmpDir = makeTempDir('meetnotes-guardrails-');
  try {
    runInit({ cwd: tmpDir, flags: { full: true, lang: 'ja', 'no-git': true } });

    // 12a. Running init --lang en on an existing ja workspace updates AGENTS.md & SKILL.md to en
    const switchLangRes = runInit({ cwd: tmpDir, flags: { lang: 'en', 'no-git': true } });
    assert.equal(switchLangRes.lang, 'en');
    assert.match(fs.readFileSync(path.join(tmpDir, HIDDEN_DIR, 'AGENTS.md'), 'utf8'), /Locked Language\*\*: `en`/);

    // 12b. upgrade preserves user-authored skills/meetnotes/ directory
    const customSkillDir = path.join(tmpDir, 'skills', CLI_NAME);
    fs.mkdirSync(customSkillDir, { recursive: true });
    fs.writeFileSync(path.join(customSkillDir, 'SKILL.md'), '# My Custom User Skill\nNever delete user skill!', 'utf8');
    const upgRes = runUpgrade({ cwd: tmpDir });
    assert.equal(upgRes.ok, true);
    assert.equal(fs.existsSync(path.join(customSkillDir, 'SKILL.md')), true);

    // 12c. createMeeting MUST reject missing transcript (never fabricate fake [00:00:05] dialogue or mark 🟢!)
    const noTranscriptRes = createMeeting({ cwd: tmpDir, project: 'Project-A', title: 'No-Input', date: '2026-11-20' });
    assert.equal(noTranscriptRes.ok, false);
    assert.equal(noTranscriptRes.reason, 'missing_transcript');

    // Bad --media and bad --transcript file paths MUST fail loudly
    const badMediaRes = createMeeting({
      cwd: tmpDir,
      project: 'Project-A',
      title: 'Bad-Media',
      date: '2026-11-20',
      mediaFile: 'does-not-exist.mp3',
      transcriptText: '[00:00:01] SPEAKER_00: Hello'
    });
    assert.equal(badMediaRes.ok, false);
    assert.equal(badMediaRes.reason, 'media_not_found');

    const badTranscriptRes = createMeeting({
      cwd: tmpDir,
      project: 'Project-A',
      title: 'Bad-Transcript',
      date: '2026-11-20',
      transcriptFile: 'does-not-exist.txt'
    });
    assert.equal(badTranscriptRes.ok, false);
    assert.equal(badTranscriptRes.reason, 'transcript_not_found');

    // allowEmpty: true creates an unverified skeleton marked with 🔴/⚠️ (zero 🟢 badges!) and inspect returns ok: false
    const emptyMeeting = createMeeting({
      cwd: tmpDir,
      project: 'Project-A',
      title: 'Empty-Skeleton',
      date: '2026-11-10',
      allowEmpty: true
    });
    assert.equal(emptyMeeting.ok, true);
    const emptySummary = fs.readFileSync(path.join(emptyMeeting.meetingDir, '02-summary.md'), 'utf8');
    assert.equal(emptySummary.includes('🟢'), false);
    assert.equal(emptySummary.includes('⚠️ [需人為確認'), true);
    const emptyInspect = inspectMeetingDirectory(emptyMeeting.meetingDir);
    assert.equal(emptyInspect.ok, false);
    assert.equal(emptyInspect.needsHumanReview, true);

    // 12d. Overwrite protection on 01-transcript.md: re-running createMeeting without force MUST fail
    const validM1 = createMeeting({
      cwd: tmpDir,
      project: 'Project-A',
      title: 'Budget-Meeting',
      date: '2026-11-13',
      transcriptText: '[00:00:10] **王經理**：這次我們決定預算定在 50 萬，預計上線日定在 12/01。'
    });
    assert.equal(validM1.ok, true);
    fs.appendFileSync(path.join(validM1.meetingDir, '01-transcript.md'), '\n# HUMAN_PROOFREAD_MARKER\n', 'utf8');

    const overwriteAttempt = createMeeting({
      cwd: tmpDir,
      project: 'Project-A',
      title: 'Budget-Meeting',
      date: '2026-11-13',
      transcriptText: '[00:00:10] Overwritten text'
    });
    assert.equal(overwriteAttempt.ok, false);
    assert.equal(overwriteAttempt.reason, 'meeting_already_exists');
    assert.match(fs.readFileSync(path.join(validM1.meetingDir, '01-transcript.md'), 'utf8'), /HUMAN_PROOFREAD_MARKER/);

    // 12e. Path traversal rejection on date, project, title, and deliverable outputName
    assert.equal(createMeeting({ cwd: tmpDir, project: 'Project-A', title: 'Sync', date: '../../../escaped', transcriptText: 'hi' }).reason, 'invalid_date');
    assert.equal(createMeeting({ cwd: tmpDir, project: '..', title: 'Sync', date: '2026-11-20', transcriptText: 'hi' }).reason, 'invalid_path');
    assert.equal(createMeeting({ cwd: tmpDir, project: '../outside', title: 'Sync', date: '2026-11-20', transcriptText: 'hi' }).reason, 'invalid_path');
    assert.equal(createMeeting({ cwd: tmpDir, project: 'Project-A', title: '../../outside', date: '2026-11-20', transcriptText: 'hi' }).reason, 'invalid_path');

    // 12f. WebVTT hourless format (00:01.000 --> 00:03.000) & multi-line cue support
    const vttRes = applySpeakerMapping({
      transcriptText: 'WEBVTT\n\n00:01.000 --> 00:03.000 align:start\nSPEAKER_00: 第一行字幕\nSPEAKER_01: 同時間軸第二行字幕\n',
      mapping: { SPEAKER_00: 'Alice', SPEAKER_01: 'Bob' }
    });
    assert.equal(vttRes.lines.length, 2);
    assert.equal(vttRes.lines[0], '[00:00:01] **Alice**: 第一行字幕');
    assert.equal(vttRes.lines[1], '[00:00:01] **Bob**: 同時間軸第二行字幕');

    // 12g. Natural-language prose cross-meeting conflict detection ("預算改為 60 萬" vs "預算定在 50 萬")
    fs.appendFileSync(path.join(validM1.meetingDir, '02-summary.md'), '\n本次會議全體同意將預算定在 50 萬，預計上線日鎖定在 12/01（[01-transcript.md](./01-transcript.md#L1-L11)）。\n', 'utf8');
    const validM2 = createMeeting({
      cwd: tmpDir,
      project: 'Project-A',
      title: 'Followup',
      date: '2026-11-20',
      transcriptText: '[00:02:00] **王經理**：經過評估，預算改為 60 萬，且上線日延後到 12/15。'
    });
    assert.equal(validM2.ok, true);
    fs.appendFileSync(path.join(validM2.meetingDir, '02-summary.md'), '\n經過討論，決定將預算改為 60 萬，且上線日延後到 12/15（[01-transcript.md](./01-transcript.md#L1-L11)）。\n', 'utf8');

    const proseInspect = inspectMeetingDirectory(validM2.meetingDir);
    assert.equal(proseInspect.ok, false);
    assert.equal(proseInspect.conflicts.some((c) => c.key === '預算' && c.previousValue.includes('50 萬') && c.currentValue.includes('60 萬')), true);
    assert.equal(proseInspect.conflicts.some((c) => c.key === '預計上線日' && c.previousValue.includes('12/01') && c.currentValue.includes('12/15')), true);

    // 12h. deliverable boolean flag protection (--REQUESTER without value must not write "true", --out without value returns exit code 1)
    const tplPath = path.join(validM2.projectDir, 'templates', 'change-request.md');
    const boolDeliv = generateDeliverableFromTemplate({
      meetingDir: validM2.meetingDir,
      templatePath: tplPath,
      outputName: 'safe-cr.md',
      values: { REQUESTER: true, PROJECT_NAME: 'Project-A' }
    });
    assert.equal(boolDeliv.ok, true);
    assert.equal(boolDeliv.missingFields.includes('REQUESTER'), true);
    assert.doesNotMatch(fs.readFileSync(boolDeliv.outputPath, 'utf8'), /申請人\*\*：true/);

    const traversalDeliv = generateDeliverableFromTemplate({
      meetingDir: validM2.meetingDir,
      templatePath: tplPath,
      outputName: '../../escaped.md',
      values: {}
    });
    assert.equal(traversalDeliv.ok, false);
    assert.equal(traversalDeliv.reason, 'invalid_output_name');

    // CLI value-less --out returns 1 without throwing
    const cliExitCode = main(['deliverable', '--out']);
    assert.equal(cliExitCode, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('13. 360-degree deep audit: CJK path #Lx-Ly citations, CJK speaker tags, inspect verifyIssues, rules lang refresh, pure meetings status & English prose conflicts', () => {
  const tmpDir = makeTempDir('meetnotes-audit360-');
  try {
    runInit({ cwd: tmpDir, flags: { full: true, lang: 'ja', 'no-git': true } });
    // Switching lang with --full refreshes .meetnotes/rules/language-purity.md as well
    runInit({ cwd: tmpDir, flags: { full: true, lang: 'en', 'no-git': true } });
    const ruleText = fs.readFileSync(path.join(tmpDir, HIDDEN_DIR, 'rules', 'language-purity.md'), 'utf8');
    assert.match(ruleText, /Locked Language\*\*: `en`/);

    // Pure meetings/ workspace (without project/) passes runStatus check
    fs.rmSync(path.join(tmpDir, 'project'), { recursive: true, force: true });
    const statusRes = runStatus({ cwd: tmpDir });
    assert.equal(statusRes.ok, true);

    // Non-ASCII / CJK speaker IDs in applySpeakerMapping (e.g. 語者A, 發言人1)
    const cjkMap = applySpeakerMapping({
      transcriptText: '[00:00:10] 語者A：這段是由中文代號標示。\n[00:00:20] 發言人1：收到！',
      mapping: { '語者A': '王經理', '發言人1': '李工程師' }
    });
    assert.equal(cjkMap.lines[0], '[00:00:10] **王經理**：這段是由中文代號標示。');
    assert.equal(cjkMap.lines[1], '[00:00:20] **李工程師**：收到！');

    // CJK folder names in cross-meeting #Lx-Ly references + English prose conflict detection
    const m1 = createMeeting({
      cwd: tmpDir,
      project: 'A專案',
      title: '第一次週會',
      date: '2026-11-13',
      transcriptText: '[00:01:00] **Alice**: The launch date was set to 2026-12-01 and the budget is set to $50k.'
    });
    assert.equal(m1.ok, true);
    fs.appendFileSync(
      path.join(m1.meetingDir, '02-summary.md'),
      '\n- The launch date was set to 2026-12-01 and the budget is set to $50k ([01-transcript.md](./01-transcript.md#L1-L11)).\n',
      'utf8'
    );

    const m2 = createMeeting({
      cwd: tmpDir,
      project: 'A專案',
      title: '第二次週會',
      date: '2026-11-20',
      transcriptText: '[00:02:00] **Alice**: The launch date was delayed to 2026-12-15 and the budget was increased to $60k.'
    });
    assert.equal(m2.ok, true);
    // Valid cross-meeting CJK folder path reference ../2026-11-13_第一次週會/02-summary.md#L1-L8
    fs.appendFileSync(
      path.join(m2.meetingDir, '02-summary.md'),
      '\n- The launch date was delayed to 2026-12-15 and the budget was increased to $60k (see [前次會議](../2026-11-13_第一次週會/02-summary.md#L1-L8)).\n',
      'utf8'
    );

    const verifyValidCjk = runVerify({ cwd: tmpDir, target: 'meetings', silent: true });
    assert.equal(verifyValidCjk.ok, true, JSON.stringify(verifyValidCjk.issues));

    // English prose conflict check in inspectMeetingDirectory
    const enConflictInspect = inspectMeetingDirectory(m2.meetingDir);
    assert.equal(enConflictInspect.structureOk, true);
    assert.equal(enConflictInspect.conflicts.some((c) => c.key === '預計上線日' && c.currentValue === '2026-12-15'), true);
    assert.equal(enConflictInspect.conflicts.some((c) => c.key === '預算' && c.currentValue === '$60k'), true);

    // Out-of-bounds CJK path reference ../2026-11-13_第一次週會/02-summary.md#L1-L999 must be caught by both verify and inspect!
    fs.appendFileSync(
      path.join(m2.meetingDir, '02-summary.md'),
      '\n- Broken CJK ref: [前次會議](../2026-11-13_第一次週會/02-summary.md#L1-L999)\n',
      'utf8'
    );
    const verifyBrokenCjk = runVerify({ cwd: tmpDir, target: 'meetings', silent: true });
    assert.equal(verifyBrokenCjk.ok, false);
    assert.equal(verifyBrokenCjk.issues.some((i) => i.type === 'broken_lines'), true);

    const brokenInspect = inspectMeetingDirectory(m2.meetingDir);
    assert.equal(brokenInspect.structureOk, false);
    assert.equal(brokenInspect.verifyIssues.some((i) => i.type === 'broken_lines'), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('14. round-3 adversarial audit: numeric SRT dialogue, multi-unknown speakers, non-cascading replacement, 4-backtick/tilde fences, index.md snapshot precedence & commit failure propagation', () => {
  const { main } = require('../bin/cli');

  // 14a. Numeric dialogue lines ("500000") preserved in SRT, multiple unknown speakers (ASCII & CJK) flagged, and non-cascading single-pass replacement
  const mapped = applySpeakerMapping({
    transcriptText: [
      '1',
      '00:00:05,000 --> 00:00:08,000',
      'Alex: 預算數字是',
      '500000',
      '',
      '2',
      '00:00:09,000 --> 00:00:12,000',
      'SPEAKER_01 與 語者B 同時討論 API 與 REST 架構。'
    ].join('\n'),
    mapping: { Alex: 'Alex Chen', Chen: 'Manager Chen' },
    terms: { API: 'REST API', REST: 'GraphQL' }
  });
  // "500000" must NOT be stripped as an SRT cue index!
  assert.equal(mapped.lines.some((l) => l.includes('500000')), true);
  // Single-pass replacement: "Alex" -> "**Alex Chen**", NOT "**Alex **Manager Chen****"
  assert.equal(mapped.lines[0], '[00:00:05] **Alex Chen**: 預算數字是');
  // Single-pass terms: "API" -> "REST API", "REST" -> "GraphQL"
  assert.match(mapped.lines[2], /REST API 與 GraphQL 架構/);
  // Both SPEAKER_01 and 語者B on the same line must be detected
  assert.deepEqual(mapped.unmappedSpeakers.sort(), ['SPEAKER_01', '語者B'].sort());
  assert.equal(mapped.uncertaintyFlags.filter((u) => u.type === 'unknown_speaker').length, 2);

  // 14b. Non-existent directory in inspectMeetingDirectory & value-less --project flag in CLI
  const nonExistentInspect = inspectMeetingDirectory('/tmp/does-not-exist-meeting-dir-99999');
  assert.equal(nonExistentInspect.ok, false);
  assert.equal(nonExistentInspect.exists, false);
  assert.equal(main(['new-meeting', '--project']), 1);

  // 14c. 4-backtick outer code blocks & ~~~ tilde code blocks in verifyFile and markdownToHtmlBody
  const tmpDir = makeTempDir('meetnotes-round3-');
  try {
    runInit({ cwd: tmpDir, flags: { full: true, lang: 'zh-TW', mode: 'workbench' } });
    const projDir = path.join(tmpDir, 'project');
    for (const f of fs.readdirSync(projDir)) {
      if (f !== 'index.md' && f.endsWith('.md')) {
        fs.writeFileSync(
          path.join(projDir, f),
          [
            `# ${f}`,
            '````markdown',
            'Here is a nested 3-backtick block with {{UNFILLED_INSIDE_4_BACKTICKS}} and broken.js#L999',
            '```js',
            'const x = "{{ALSO_INSIDE_4_BACKTICKS}}";',
            '```',
            'Still inside 4-backtick block {{STILL_SAFE}}',
            '````',
            '~~~text',
            'Inside tilde fence {{SAFE_IN_TILDE}} and missing.js#L1-L50',
            '~~~'
          ].join('\n'),
          'utf8'
        );
      }
    }
    const fenceVerify = runVerify({ cwd: tmpDir, silent: true });
    assert.equal(fenceVerify.ok, true, JSON.stringify(fenceVerify.issues));

    // 14d. Active rolling snapshot in index.md takes precedence over older superseded meetings
    const m1 = createMeeting({
      cwd: tmpDir,
      project: 'A專案',
      title: 'M1',
      date: '2026-11-01',
      transcriptText: '[00:00:01] **王經理**：上線日定在 12/01。'
    });
    fs.appendFileSync(path.join(m1.meetingDir, '02-summary.md'), '\n- **預計上線日**：12/01 ([01-transcript.md](./01-transcript.md#L1-L11))\n', 'utf8');
    // Official index.md rolling snapshot was already updated to 12/15
    fs.appendFileSync(path.join(m1.projectDir, 'index.md'), '\n- **預計上線日**：12/15\n', 'utf8');

    const m2 = createMeeting({
      cwd: tmpDir,
      project: 'A專案',
      title: 'M2',
      date: '2026-11-20',
      transcriptText: '[00:00:01] **王經理**：我們維持最新決議，上線日為 12/15。'
    });
    // Also cite workspace-root-relative path meetings/A專案/index.md#L1-L5
    fs.appendFileSync(
      path.join(m2.meetingDir, '02-summary.md'),
      '\n- **預計上線日**：12/15 (見 [index.md](meetings/A專案/index.md#L1-L5))\n',
      'utf8'
    );
    const m2Inspect = inspectMeetingDirectory(m2.meetingDir);
    assert.equal(m2Inspect.structureOk, true, JSON.stringify(m2Inspect.verifyIssues));
    assert.equal(m2Inspect.conflicts.length, 0, JSON.stringify(m2Inspect.conflicts));

    // 14e. runCommit must return ok: false (reason: 'commit_failed') when pre-commit hook fails
    const hookPath = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
    fs.writeFileSync(hookPath, '#!/usr/bin/env bash\necho "Hook failed intentionally" >&2\nexit 1\n', { mode: 0o755 });
    fs.appendFileSync(path.join(projDir, '01-spec.md'), '\nNew change to commit.\n', 'utf8');
    const failedCommit = runCommit({ cwd: tmpDir, flags: { m: 'should fail hook' } });
    assert.equal(failedCommit.ok, false);
    assert.equal(failedCommit.reason, 'commit_failed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('15. round-4 microscope audit: Windows CRLF conflict detection, ja/ko prose conflict detection & preserving user-appended sections in .meetnotes/AGENTS.md across lang switch and upgrade', () => {
  const tmpDir = makeTempDir('meetnotes-round4-');
  try {
    runInit({ cwd: tmpDir, flags: { full: true, lang: 'ja', mode: 'workbench' } });

    // 15a. Append custom user section to .meetnotes/AGENTS.md, then switch --lang en and run upgrade -> custom section preserved!
    const hiddenAgentsPath = path.join(tmpDir, HIDDEN_DIR, 'AGENTS.md');
    fs.appendFileSync(hiddenAgentsPath, '\n# USER_APPENDED_TEAM_POLICY_999\nAlways tag security reviewers.\n', 'utf8');

    runInit({ cwd: tmpDir, flags: { full: true, lang: 'en' } });
    const afterLangSwitch = fs.readFileSync(hiddenAgentsPath, 'utf8');
    assert.match(afterLangSwitch, /Locked Language\*\*: `en`/);
    assert.match(afterLangSwitch, /USER_APPENDED_TEAM_POLICY_999/);

    runUpgrade({ cwd: tmpDir });
    const afterUpgrade = fs.readFileSync(hiddenAgentsPath, 'utf8');
    assert.match(afterUpgrade, /USER_APPENDED_TEAM_POLICY_999/);

    // 15b. Japanese & Korean natural-language prose conflict detection
    const jaM1 = createMeeting({
      cwd: tmpDir,
      project: 'JP-KR-Proj',
      title: 'M1',
      date: '2026-11-01',
      transcriptText: '[00:00:05] **田中**：リリース日は 12/01、予算は 500万円。출시일은 12/01, 예산은 5000만원.'
    });
    fs.appendFileSync(
      path.join(jaM1.meetingDir, '02-summary.md'),
      '\n- リリース日は 12/01、予算は 500万円 ([01-transcript.md](./01-transcript.md#L1-L11))\n',
      'utf8'
    );

    const jaM2 = createMeeting({
      cwd: tmpDir,
      project: 'JP-KR-Proj',
      title: 'M2',
      date: '2026-11-20',
      transcriptText: '[00:00:05] **김팀장**：출시일은 12/15, 예산은 6000만원.'
    });
    fs.appendFileSync(
      path.join(jaM2.meetingDir, '02-summary.md'),
      '\n- 출시일은 12/15, 예산은 6000만원 ([01-transcript.md](./01-transcript.md#L1-L11))\n',
      'utf8'
    );

    const jkInspect = inspectMeetingDirectory(jaM2.meetingDir);
    assert.equal(jkInspect.conflicts.some((c) => c.key === '預計上線日' && c.previousValue === '12/01' && c.currentValue === '12/15'), true);
    assert.equal(jkInspect.conflicts.some((c) => c.key === '預算' && c.previousValue === '500万円' && c.currentValue === '6000만원'), true);

    // 15c. Windows CRLF (\r\n) Git merge conflict markers MUST be detected by runCommit!
    const projDir = path.join(tmpDir, 'project');
    for (const f of fs.readdirSync(projDir)) {
      if (f !== 'index.md' && f.endsWith('.md')) {
        fs.writeFileSync(path.join(projDir, f), `# ${f}\nClean content.\n`, 'utf8');
      }
    }
    const crlfConflictFile = path.join(projDir, '01-spec.md');
    fs.writeFileSync(
      crlfConflictFile,
      '# 01-spec.md\r\n<<<<<<< HEAD\r\nLocal CRLF line\r\n=======\r\nRemote CRLF line\r\n>>>>>>> origin/main\r\n',
      'utf8'
    );
    const crlfCommitRes = runCommit({ cwd: tmpDir });
    assert.equal(crlfCommitRes.ok, false);
    assert.equal(crlfCommitRes.reason, 'conflict');
    assert.equal(crlfCommitRes.conflictFiles.includes('project/01-spec.md'), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('16. round-5 deep audit: paired N-backtick inline code, hypothetical/question conflict exclusion, uncited AI-xx todo detection, target-scoped commit & SKILL.md custom suffix preservation', () => {
  const { main } = require('../bin/cli');
  const tmpDir = makeTempDir('meetnotes-round5-');
  try {
    runInit({ cwd: tmpDir, flags: { full: true, lang: 'ja', mode: 'workbench' } });

    // 16a. Append custom user section to .meetnotes/skills/meetnotes/SKILL.md -> preserved across lang switch and upgrade
    const hiddenSkillPath = path.join(tmpDir, HIDDEN_DIR, 'skills', CLI_NAME, 'SKILL.md');
    fs.appendFileSync(hiddenSkillPath, '\n# CUSTOM_SKILL_SECTION_777\nKeep this custom skill section.\n', 'utf8');
    runInit({ cwd: tmpDir, flags: { full: true, lang: 'zh-TW' } });
    assert.match(fs.readFileSync(hiddenSkillPath, 'utf8'), /CUSTOM_SKILL_SECTION_777/);
    runUpgrade({ cwd: tmpDir });
    assert.match(fs.readFileSync(hiddenSkillPath, 'utf8'), /CUSTOM_SKILL_SECTION_777/);

    // 16b. CLI --map with '=' inside value (e.g. "SPEAKER_00=王經理 (Role=PM)") + paired double-backtick inline code with single backtick inside
    const txtPath = path.join(tmpDir, 'raw.txt');
    fs.writeFileSync(txtPath, '[00:00:05] SPEAKER_00: 我們正式決議上線日定在 12/01，預算定在 50 萬。\n', 'utf8');
    const codeExit = main([
      'new-meeting',
      'Project-R5',
      'M1',
      '--date',
      '2026-11-01',
      '--transcript',
      txtPath,
      '--map',
      'SPEAKER_00=王經理 (Role=PM)'
    ]);
    // Note: main() uses process.cwd(), so let's also test createMeeting directly on tmpDir
    assert.equal(typeof codeExit, 'number');

    const m1 = createMeeting({
      cwd: tmpDir,
      project: 'Project-R5',
      title: 'M1',
      date: '2026-11-01',
      transcriptText: '[00:00:05] SPEAKER_00: 我們正式決議上線日定在 12/01，預算定在 50 萬。',
      mapping: { SPEAKER_00: '王經理 (Role=PM)' }
    });
    assert.equal(m1.ok, true);
    assert.match(fs.readFileSync(path.join(m1.meetingDir, '01-transcript.md'), 'utf8'), /\*\*王經理 \(Role=PM\)\*\*/);
    fs.appendFileSync(
      path.join(m1.meetingDir, '02-summary.md'),
      '\n- **預計上線日**：12/01 ([01-transcript.md](./01-transcript.md#L1-L11))\n- **預算**：50 萬 ([01-transcript.md](./01-transcript.md#L1-L11))\n- 範例行內雙反引號含單反引號：``code with ` backtick and {{NOT_A_PLACEHOLDER}} and fake.js#L999``\n',
      'utf8'
    );

    // 16c. Hypothetical ("如果..."), question ("...？"), and unconfirmed ("⚠️") lines must NOT trigger false conflicts
    const m2 = createMeeting({
      cwd: tmpDir,
      project: 'Project-R5',
      title: 'M2',
      date: '2026-11-20',
      transcriptText: '[00:00:05] **王經理**：有人討論如果上線日改為 12/25 會怎樣，但最終維持原案。'
    });
    fs.appendFileSync(
      path.join(m2.meetingDir, '02-summary.md'),
      [
        '',
        '- 如果上線日改為 12/25 會有延遲風險 ([01-transcript.md](./01-transcript.md#L1-L11))',
        '- 預算是否改為 90 萬？ ([01-transcript.md](./01-transcript.md#L1-L11))',
        '- ⚠️ [需人為確認] 上線日改為 12/30 ([01-transcript.md](./01-transcript.md#L1-L11))'
      ].join('\n'),
      'utf8'
    );
    const m2Inspect = inspectMeetingDirectory(m2.meetingDir);
    assert.equal(m2Inspect.conflicts.length, 0, JSON.stringify(m2Inspect.conflicts));

    // 16d. Uncited AI-xx row in 03-todos-and-discussion.md must be caught by inspectMeetingDirectory
    fs.appendFileSync(
      path.join(m1.meetingDir, '03-todos-and-discussion.md'),
      '\n| AI-02 | 未附來源引用的待辦 | 王經理 | 2026-11-30 | 🟢 已驗證事實 | 無引用 | ⏳ Pending |\n',
      'utf8'
    );
    const m1InspectUncited = inspectMeetingDirectory(m1.meetingDir);
    assert.equal(m1InspectUncited.structureOk, false);
    assert.equal(m1InspectUncited.uncitedItems.some((u) => u.file === '03-todos-and-discussion.md'), true);

    // Fix AI-02 citation in m1, then test target-scoped commit: `runCommit({ cwd: tmpDir, target: 'meetings' })`
    // Even though `project/01-spec.md` still has unfilled `{{PACKAGE_NAME}}` placeholders, committing target 'meetings' succeeds and only commits `meetings/`!
    const fixedTodos = fs.readFileSync(path.join(m1.meetingDir, '03-todos-and-discussion.md'), 'utf8')
      .replace('| 無引用 |', '| [01-transcript.md](./01-transcript.md#L1-L11) |');
    fs.writeFileSync(path.join(m1.meetingDir, '03-todos-and-discussion.md'), fixedTodos, 'utf8');

    const scopedCommit = runCommit({ cwd: tmpDir, target: 'meetings', flags: { m: 'docs: commit only meetings' } });
    assert.equal(scopedCommit.ok, true);
    assert.equal(scopedCommit.committed, true);
  } finally {
    // Clean up any accidental Project-R5 created in process.cwd() by main() call above
    const cwdR5 = path.join(process.cwd(), 'meetings', 'Project-R5');
    if (fs.existsSync(cwdR5)) {
      fs.rmSync(cwdR5, { recursive: true, force: true });
      const cwdMeetings = path.join(process.cwd(), 'meetings');
      if (fs.existsSync(cwdMeetings) && fs.readdirSync(cwdMeetings).length === 0) {
        fs.rmSync(cwdMeetings, { recursive: true, force: true });
      }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('17. all-in-one final audit: clean conversational init (0 verify errors, no project/ clutter), WebVTT <v Speaker> tags, 5-lang ⚠️/🔴 inspection, URL-encoded #Lx-Ly refs, backticked table pipes, entity-encoded XSS links, sub-target commit & flag guards', () => {
  const { main } = require('../bin/cli');
  const tmpDir = makeTempDir('meetnotes-final-audit-');
  try {
    // 17a. Default `meetnotes init` (conversational mode) creates meetings/index.md & .meetnotes/rules/post-meeting-inspection.md,
    // does NOT create project/01-spec.md tool-builder clutter, and passes verify + status immediately with 0 errors!
    const initRes = runInit({ cwd: tmpDir, flags: { lang: 'zh-TW' } });
    assert.equal(initRes.ok, true);
    assert.equal(initRes.mode, 'conversational');
    assert.equal(fs.existsSync(path.join(tmpDir, 'project')), false);
    assert.equal(fs.existsSync(path.join(tmpDir, 'meetings', 'index.md')), true);
    assert.equal(fs.existsSync(path.join(tmpDir, HIDDEN_DIR, 'rules', 'post-meeting-inspection.md')), true);

    const freshVerify = runVerify({ cwd: tmpDir, silent: true });
    assert.equal(freshVerify.ok, true, JSON.stringify(freshVerify.issues));

    const freshStatus = runStatus({ cwd: tmpDir });
    assert.equal(freshStatus.ok, true);
    assert.equal(freshStatus.totalStages, 0);

    // 17b. Value-less flags and invalid --mode are cleanly rejected without throwing
    assert.equal(runInit({ cwd: tmpDir, flags: { lang: true } }).ok, false);
    assert.equal(runInit({ cwd: tmpDir, flags: { mode: true } }).ok, false);
    assert.equal(runInit({ cwd: tmpDir, flags: { mode: 'nonexistent-mode' } }).ok, false);
    assert.equal(runCommit({ cwd: tmpDir, flags: { m: true } }).ok, false);
    assert.equal(runPdf({ cwd: tmpDir, flags: { output: true } }).ok, false);
    assert.equal(runBuild({ cwd: tmpDir, flags: { name: true } }).ok, false);
    assert.equal(runScaffold({ cwd: tmpDir, flags: { cli: true } }).ok, false);
    assert.equal(main(['commit', '-m']), 1);
    assert.equal(main(['pdf', '--output']), 1);

    // 17c. WebVTT with UTF-8 BOM, header metadata, cue IDs, and <v SPEAKER_00>text</v> voice tags + already-bolded **SPEAKER_01**
    const vttVoice = applySpeakerMapping({
      transcriptText: [
        '\uFEFFWEBVTT - MS Teams Recording',
        'Kind: captions',
        'Language: zh-TW',
        '',
        'cue-alpha',
        '00:05.000 --> 00:09.000',
        '<v SPEAKER_00>大家好，今天討論架構</v>',
        '<v.loud **SPEAKER_01**>收到，<b>同意</b>！</v>'
      ].join('\n'),
      mapping: { SPEAKER_00: '王經理', SPEAKER_01: '李工程師' }
    });
    assert.equal(vttVoice.lines.length, 2);
    assert.equal(vttVoice.lines[0], '[00:00:05] **王經理**: 大家好，今天討論架構');
    assert.equal(vttVoice.lines[1], '[00:00:05] **李工程師**: 收到，同意！');

    // 17d. Mid-sentence hypothetical exclusion ("王經理討論如果上線日改為 12/28 的影響") + URL-encoded #Lx-Ly + inline HTML comment
    const m1 = createMeeting({
      cwd: tmpDir,
      project: 'A專案',
      title: '週會一',
      date: '2026-11-13',
      transcriptText: '[00:00:10] **王經理**：我們拍板上線日定在 12/01。'
    });
    fs.appendFileSync(
      path.join(m1.meetingDir, '02-summary.md'),
      '\n- **預計上線日**：12/01 ([01-transcript.md](./01-transcript.md#L1-L11))\n',
      'utf8'
    );

    const m2 = createMeeting({
      cwd: tmpDir,
      project: 'A專案',
      title: '週會二',
      date: '2026-11-20',
      transcriptText: '[00:00:10] **王經理**：維持原定計畫。'
    });
    // Add URL-encoded CJK link, inline HTML comment with {{PLACEHOLDER}}, and mid-sentence hypothetical
    const encodedPrevFolder = encodeURIComponent('2026-11-13_週會一');
    fs.appendFileSync(
      path.join(m2.meetingDir, '02-summary.md'),
      [
        '',
        '<!-- Commented out example {{SHOULD_NOT_TRIGGER}} and missing.js#L999 -->',
        `- 🟢 參考上週紀錄（見 [上週摘要](../${encodedPrevFolder}/02-summary.md#L1-L8)）`,
        '- 🟢 王經理討論如果上線日改為 12/28 的影響（見 [01-transcript.md](./01-transcript.md#L1-L11)）'
      ].join('\n'),
      'utf8'
    );

    const m2InspectClean = inspectMeetingDirectory(m2.meetingDir);
    assert.equal(m2InspectClean.ok, true, JSON.stringify(m2InspectClean));
    assert.equal(m2InspectClean.conflicts.length, 0);

    // 17e. Sub-target commit: `runCommit({ cwd: tmpDir, target: 'A專案' })` resolves `meetings/A專案` and commits cleanly
    const subTargetCommit = runCommit({ cwd: tmpDir, target: 'A專案', flags: { m: 'docs: commit A專案' } });
    assert.equal(subTargetCommit.ok, true);
    assert.equal(subTargetCommit.committed, true);

    // 17f. 5-language `⚠️ [Human Review Required]` / `⚠️ [要確認]` / `⚠️ [확인 필요]` / `🔴` detection in inspectMeetingDirectory
    fs.appendFileSync(
      path.join(m2.meetingDir, '02-summary.md'),
      '\n- 🔴 Budget figure unclear ⚠️ [Human Review Required - 00:12:00] ([01-transcript.md](./01-transcript.md#L1-L11))\n',
      'utf8'
    );
    const m2InspectEnWarn = inspectMeetingDirectory(m2.meetingDir);
    assert.equal(m2InspectEnWarn.ok, false);
    assert.equal(m2InspectEnWarn.needsHumanReview, true);
    assert.equal(m2InspectEnWarn.humanInterventionItems.length >= 1, true);

    // 17g. Markdown table with unescaped pipe inside inline code, link with `*` in URL, and numeric entity XSS link
    const advHtml = markdownToHtmlBody([
      '| Flag | Description |',
      '| :--- | :--- |',
      '| `--lang zh-TW|en|ja` | Language option |',
      '',
      'Archive link: [Wayback * Archive](https://web.archive.org/web/*/https://example.com/*)',
      'Entity XSS: [Bad](&#106;avascript:alert(1)) and [HexBad](&#x6a;avascript:alert(1))'
    ].join('\n'));
    assert.match(advHtml, /<td><code>--lang zh-TW\|en\|ja<\/code><\/td>\s*<td>Language option<\/td>/);
    assert.match(advHtml, /<a href="https:\/\/web\.archive\.org\/web\/\*\/https:\/\/example\.com\/\*">Wayback \* Archive<\/a>/);
    assert.doesNotMatch(advHtml, /javascript:/i);

    // 17h. Calendar date validation: 2026-02-31, 2026-02-29 (non-leap), and 2026-13-45 MUST be rejected
    assert.equal(createMeeting({ cwd: tmpDir, project: 'A專案', title: 'BadDate1', date: '2026-02-31', transcriptText: 'hi' }).reason, 'invalid_date');
    assert.equal(createMeeting({ cwd: tmpDir, project: 'A專案', title: 'BadDate2', date: '2026-02-29', transcriptText: 'hi' }).reason, 'invalid_date');
    assert.equal(createMeeting({ cwd: tmpDir, project: 'A專案', title: 'BadDate3', date: '2026-13-45', transcriptText: 'hi' }).reason, 'invalid_date');

    // 17i. Real extracted summary bullets + --force only overwrites 01-transcript.md (saving .bak) while preserving 02 & 03
    const mForce1 = createMeeting({
      cwd: tmpDir,
      project: 'ForceProj',
      title: 'Sync1',
      date: '2026-11-10',
      transcriptText: '[00:00:10] **王經理**：這次預算 50 萬，負責人王經理。'
    });
    assert.equal(mForce1.ok, true);
    const initialSum1 = fs.readFileSync(path.join(mForce1.meetingDir, '02-summary.md'), 'utf8');
    // Verify 02-summary.md extracted the actual statement with exact single-line citation #L11
    assert.match(initialSum1, /這次預算 50 萬，負責人王經理。.*#L11\)/);

    // Human edits 01-transcript.md, 02-summary.md, and 03-todos-and-discussion.md
    fs.appendFileSync(path.join(mForce1.meetingDir, '01-transcript.md'), '\n# OLD_TRANSCRIPT_EDIT\n', 'utf8');
    fs.appendFileSync(path.join(mForce1.meetingDir, '02-summary.md'), '\n# HUMAN_SUMMARY_EDIT_KEEP_ME\n', 'utf8');
    fs.appendFileSync(path.join(mForce1.meetingDir, '03-todos-and-discussion.md'), '\n# HUMAN_TODOS_EDIT_KEEP_ME\n', 'utf8');

    // Re-run with force: true -> 01-transcript.md is updated, 01-transcript.md.bak is saved, and 02 & 03 are PRESERVED!
    const mForceRerun = createMeeting({
      cwd: tmpDir,
      project: 'ForceProj',
      title: 'Sync1',
      date: '2026-11-10',
      transcriptText: '[00:00:10] **王經理**：修正後預算 50 萬，負責人王經理。',
      force: true
    });
    assert.equal(mForceRerun.ok, true);
    assert.equal(fs.existsSync(path.join(mForce1.meetingDir, '01-transcript.md.bak')), true);
    assert.match(fs.readFileSync(path.join(mForce1.meetingDir, '01-transcript.md.bak'), 'utf8'), /OLD_TRANSCRIPT_EDIT/);
    assert.match(fs.readFileSync(path.join(mForce1.meetingDir, '02-summary.md'), 'utf8'), /HUMAN_SUMMARY_EDIT_KEEP_ME/);
    assert.match(fs.readFileSync(path.join(mForce1.meetingDir, '03-todos-and-discussion.md'), 'utf8'), /HUMAN_TODOS_EDIT_KEEP_ME/);

    // 17j. Natural-language conflict detection for "預算 50 萬→改為 60 萬" and "負責人王經理→改由李工程師"
    const mForce2 = createMeeting({
      cwd: tmpDir,
      project: 'ForceProj',
      title: 'Sync2',
      date: '2026-11-17',
      transcriptText: '[00:01:00] **王經理**：今天決議預算 50 萬→改為 60 萬，負責人王經理→改由李工程師。'
    });
    assert.equal(mForce2.ok, true);
    const conflictCheck = inspectMeetingDirectory(mForce2.meetingDir);
    assert.equal(conflictCheck.conflicts.some((c) => c.key === '預算' && c.previousValue === '50 萬' && c.currentValue === '60 萬'), true);
    assert.equal(conflictCheck.conflicts.some((c) => c.key === '負責人' && c.previousValue === '王經理' && c.currentValue === '李工程師'), true);

    // 17k. In-middle edits to .meetnotes/AGENTS.md are backed up to AGENTS.md.bak on upgrade,
    // and running upgrade a SECOND time does NOT overwrite AGENTS.md.bak!
    const agentsPath = path.join(tmpDir, HIDDEN_DIR, 'AGENTS.md');
    fs.writeFileSync(agentsPath, '# Custom In-Middle Edited AGENTS.md\nMiddle content changed.\n', 'utf8');
    runUpgrade({ cwd: tmpDir });
    assert.equal(fs.existsSync(`${agentsPath}.bak`), true);
    assert.match(fs.readFileSync(`${agentsPath}.bak`, 'utf8'), /Custom In-Middle Edited AGENTS\.md/);

    // Second consecutive upgrade run must keep original human edits in AGENTS.md.bak!
    runUpgrade({ cwd: tmpDir });
    assert.match(fs.readFileSync(`${agentsPath}.bak`, 'utf8'), /Custom In-Middle Edited AGENTS\.md/);

    // 17l. Running createMeeting with force / forceAll TWICE (or N times) NEVER overwrites human edits in .bak,
    // and runCommit NEVER stages or commits .bak / .bak.1 files!
    const mForceSecondSame = createMeeting({
      cwd: tmpDir,
      project: 'ForceProj',
      title: 'Sync1',
      date: '2026-11-10',
      transcriptText: '[00:00:10] **王經理**：修正後預算 50 萬，負責人王經理。',
      force: true
    });
    assert.equal(mForceSecondSame.ok, true);
    assert.match(fs.readFileSync(path.join(mForce1.meetingDir, '01-transcript.md.bak'), 'utf8'), /OLD_TRANSCRIPT_EDIT/);

    const mForceThirdDiff = createMeeting({
      cwd: tmpDir,
      project: 'ForceProj',
      title: 'Sync1',
      date: '2026-11-10',
      transcriptText: '[00:00:10] **王經理**：第三次重跑預算 50 萬，由王經理擔任負責人。',
      forceAll: true
    });
    assert.equal(mForceThirdDiff.ok, true);
    // Primary .bak still holds original human edits; 2nd version rotated to .bak.1; 02-summary.md.bak holds HUMAN_SUMMARY_EDIT_KEEP_ME
    assert.match(fs.readFileSync(path.join(mForce1.meetingDir, '01-transcript.md.bak'), 'utf8'), /OLD_TRANSCRIPT_EDIT/);
    assert.equal(fs.existsSync(path.join(mForce1.meetingDir, '01-transcript.md.bak.1')), true);
    assert.match(fs.readFileSync(path.join(mForce1.meetingDir, '02-summary.md.bak'), 'utf8'), /HUMAN_SUMMARY_EDIT_KEEP_ME/);

    // Running forceAll a second time must NOT overwrite 02-summary.md.bak!
    createMeeting({
      cwd: tmpDir,
      project: 'ForceProj',
      title: 'Sync1',
      date: '2026-11-10',
      transcriptText: '[00:00:10] **王經理**：第四次重跑預算 50 萬，由王經理擔任負責人。',
      forceAll: true
    });
    assert.match(fs.readFileSync(path.join(mForce1.meetingDir, '02-summary.md.bak'), 'utf8'), /HUMAN_SUMMARY_EDIT_KEEP_ME/);

    // Commit workspace and verify ZERO .bak files are tracked in git
    const bakCommitRes = runCommit({ cwd: tmpDir, flags: { m: 'test no bak files committed' } });
    assert.equal(bakCommitRes.ok, true);
    const { runGit } = require('../src/utils');
    const trackedFiles = runGit(['ls-files'], tmpDir).stdout;
    assert.doesNotMatch(trackedFiles, /\.bak/);

    // 17m. Conflict detection precision:
    // - Equivalent values ("預算 50 萬" vs "預算 500000 元", "上線日 12/15" vs "2026-12-15") -> 0 conflicts
    // - Rejected proposal ("預算 60 萬的提案被否決，維持現狀") -> 0 conflicts
    // - Owner trailing verb ("由李工程師擔任負責人") -> clean value "李工程師" (not "李工程師擔任")
    // - 7-line transcript keeps all 7 lines in Transcript Excerpts, and 12-line transcript labels truncation clearly while keeping line-12 decision
    const mEq1 = createMeeting({
      cwd: tmpDir,
      project: 'PrecisionProj',
      title: 'M1',
      date: '2026-11-01',
      transcriptText: '[00:00:10] **王經理**：決議預算 50 萬，預計上線日 12/15，由王經理擔任負責人。'
    });
    assert.equal(mEq1.ok, true);

    const sevenLines = [
      '[00:00:01] **王經理**：第一句開場。',
      '[00:00:02] **王經理**：第二句報告。',
      '[00:00:03] **王經理**：第三句討論：預算 500000 元，上線日 2026-12-15。',
      '[00:00:04] **王經理**：第四句：預算 60 萬的提案被否決，維持現狀。',
      '[00:00:05] **王經理**：第五句補充。',
      '[00:00:06] **王經理**：第六句確認由王經理擔任負責人。',
      '[00:00:07] **王經理**：第七句散會。'
    ].join('\n');
    const mEq2 = createMeeting({
      cwd: tmpDir,
      project: 'PrecisionProj',
      title: 'M2',
      date: '2026-11-08',
      transcriptText: sevenLines
    });
    assert.equal(mEq2.ok, true);
    const mEq2Summary = fs.readFileSync(path.join(mEq2.meetingDir, '02-summary.md'), 'utf8');
    // All 7 lines are included in Transcript Excerpts (including line 6 & line 7 "第七句散會")
    assert.match(mEq2Summary, /第七句散會/);
    assert.match(mEq2Summary, /## 逐字稿節錄 \(Transcript Excerpts\)/);

    const eqInspect = inspectMeetingDirectory(mEq2.meetingDir);
    assert.equal(eqInspect.conflicts.length, 0, JSON.stringify(eqInspect.conflicts));

    // Now test owner change with "由李工程師擔任負責人" -> conflicts with previousValue "王經理" and currentValue "李工程師" (no trailing "擔任")
    const mEq3 = createMeeting({
      cwd: tmpDir,
      project: 'PrecisionProj',
      title: 'M3',
      date: '2026-11-15',
      transcriptText: Array.from({ length: 12 }, (_, i) =>
        i === 11
          ? '[00:02:00] **王經理**：第十二句最終拍板由李工程師擔任負責人。'
          : `[00:00:${String(i + 1).padStart(2, '0')}] **王經理**：一般過程討論第 ${i + 1} 句。`
      ).join('\n')
    });
    assert.equal(mEq3.ok, true);
    const mEq3Summary = fs.readFileSync(path.join(mEq3.meetingDir, '02-summary.md'), 'utf8');
    // 12-line transcript explicitly labels "僅節錄前 10/12 句" AND still captures the line-12 decision in Key Points & Decisions!
    assert.match(mEq3Summary, /僅節錄前 10\/12 句，完整決議需由 AI 或人工提煉/);
    assert.match(mEq3Summary, /第十二句最終拍板由李工程師擔任負責人/);

    const ownerConflictInspect = inspectMeetingDirectory(mEq3.meetingDir);
    assert.equal(
      ownerConflictInspect.conflicts.some(
        (c) => c.key === '負責人' && c.previousValue === '王經理' && c.currentValue === '李工程師'
      ),
      true,
      JSON.stringify(ownerConflictInspect.conflicts)
    );

    // 17n. ChatGPT Audit fixes:
    // - Local timezone date formatting (getLocalDateString)
    // - Stale downstream hash detection (staleFiles) after --force updates 01-transcript.md without --force-all
    // - Real Action Items extraction into 03-todos-and-discussion.md (task, assignee, due date, #L<n>)
    // - Native 0-dependency WAV duration probing in getMediaMetadata
    // - Same-day chronological ordering (2026-11-20_Morning-Sync -> 2026-11-20_Afternoon-Sync despite 'Afternoon' < 'Morning')
    // - Structured Markdown Table decision conflict detection (| 資料庫架構 | PostgreSQL | vs | 資料庫架構 | MySQL |)
    const { getLocalDateString } = require('../src/utils');
    const { getMediaMetadata } = require('../src/meeting');
    const localSample = new Date(2026, 10, 20, 0, 30, 0); // Local 2026-11-20 00:30:00
    assert.equal(getLocalDateString(localSample), '2026-11-20');

    // Create a valid 5-second RIFF/WAVE file header (byteRate = 16000, data size = 80000 -> 5.0s)
    const wavPath = path.join(tmpDir, 'recording.wav');
    const wavBuf = Buffer.alloc(44 + 80000);
    wavBuf.write('RIFF', 0, 'ascii');
    wavBuf.writeUInt32LE(36 + 80000, 4);
    wavBuf.write('WAVE', 8, 'ascii');
    wavBuf.write('fmt ', 12, 'ascii');
    wavBuf.writeUInt32LE(16, 16);
    wavBuf.writeUInt16LE(1, 20); // PCM
    wavBuf.writeUInt16LE(1, 22); // 1 channel
    wavBuf.writeUInt32LE(8000, 24); // sampleRate
    wavBuf.writeUInt32LE(16000, 28); // byteRate = 16000 bytes/sec
    wavBuf.writeUInt16LE(2, 32);
    wavBuf.writeUInt16LE(16, 34);
    wavBuf.write('data', 36, 'ascii');
    wavBuf.writeUInt32LE(80000, 40);
    fs.writeFileSync(wavPath, wavBuf);

    const wavMeta = getMediaMetadata(wavPath);
    assert.equal(wavMeta.durationSeconds, 5);
    assert.equal(wavMeta.durationFormatted, '00:00:05');

    // Same-day Meeting 1: Morning-Sync (created first) with action item and table decision
    const mMorning = createMeeting({
      cwd: tmpDir,
      project: 'SameDayProj',
      title: 'Morning-Sync',
      date: '2026-11-20',
      mediaFile: wavPath,
      transcriptText: '[00:00:02] **王經理**：請李工程師於 11/25 前完成壓力測試報告。'
    });
    assert.equal(mMorning.ok, true);
    assert.match(fs.readFileSync(path.join(mMorning.meetingDir, '01-transcript.md'), 'utf8'), /時長: 00:00:05/);
    const morningTodos = fs.readFileSync(path.join(mMorning.meetingDir, '03-todos-and-discussion.md'), 'utf8');
    // Real action item extracted with [委派] tag, owner "李工程師", due date "11/25", and exact citation #L12
    assert.match(morningTodos, /\|\s*AI-01\s*\|\s*\[委派\] 請李工程師於 11\/25 前完成壓力測試報告。\s*\|\s*李工程師\s*\|\s*11\/25\s*\|\s*🟢 已溯源至逐字稿\s*\|.*#L12\)/);

    fs.appendFileSync(
      path.join(mMorning.meetingDir, '02-summary.md'),
      '\n| 項目 | 決議 |\n| :--- | :--- |\n| 資料庫引擎 | PostgreSQL ([01-transcript.md](./01-transcript.md#L12)) |\n',
      'utf8'
    );

    // Same-day Meeting 2: Afternoon-Sync (created second, even though 'Afternoon' < 'Morning' alphabetically!)
    const mAfternoon = createMeeting({
      cwd: tmpDir,
      project: 'SameDayProj',
      title: 'Afternoon-Sync',
      date: '2026-11-20',
      transcriptText: '[00:00:05] **王經理**：下午重新評估資料庫架構。'
    });
    assert.equal(mAfternoon.ok, true);
    fs.appendFileSync(
      path.join(mAfternoon.meetingDir, '02-summary.md'),
      '\n| 項目 | 決議 |\n| :--- | :--- |\n| 資料庫引擎 | MySQL ([01-transcript.md](./01-transcript.md#L11)) |\n',
      'utf8'
    );

    const afternoonInspect = inspectMeetingDirectory(mAfternoon.meetingDir);
    assert.equal(
      afternoonInspect.conflicts.some(
        (c) => c.key === '資料庫引擎' && c.previousValue === 'PostgreSQL' && c.currentValue === 'MySQL'
      ),
      true,
      JSON.stringify(afternoonInspect.conflicts)
    );

    // Now update mMorning's transcript with force: true (without forceAll) -> 02 & 03 become stale!
    const forceStaleRes = createMeeting({
      cwd: tmpDir,
      project: 'SameDayProj',
      title: 'Morning-Sync',
      date: '2026-11-20',
      mediaFile: wavPath,
      transcriptText: '[00:00:02] **王經理**：更新後的逐字稿內容，請李工程師於 11/28 前完成壓力測試報告。',
      force: true
    });
    assert.deepEqual(forceStaleRes.staleFiles, ['02-summary.md', '03-todos-and-discussion.md']);
    const staleInspect = inspectMeetingDirectory(mMorning.meetingDir);
    assert.equal(staleInspect.ok, false);
    assert.deepEqual(staleInspect.staleFiles, ['02-summary.md', '03-todos-and-discussion.md']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('18. BUG-001~BUG-007 regression suite: general discussion vs 🟢 decision, deliverable overwrite lock, multi-chunk WAV duration, action item delegation/commitment/suggestion semantics, --no-push & verify stale-hash gate', () => {
  const { getMediaMetadata } = require('../src/meeting');
  const { runGit } = require('../src/utils');
  const tmpDir = makeTempDir('meetnotes-bug001-007-');
  try {
    runInit({ cwd: tmpDir, flags: { lang: 'zh-TW' } });

    // BUG-001: General discussion lines use 📝 (never 🟢) and do NOT get promoted into 🟢 decisions
    const mGen = createMeeting({
      cwd: tmpDir,
      project: 'BugProj',
      title: 'Casual-Chat',
      date: '2026-11-10',
      transcriptText: '[00:00:01] **王經理**：今天天氣不錯，大家早安。\n[00:00:05] **李工程師**：早安，剛泡好咖啡。'
    });
    assert.equal(mGen.ok, true);
    const genSum = fs.readFileSync(path.join(mGen.meetingDir, '02-summary.md'), 'utf8');
    assert.match(genSum, /🟡 \*\*待提煉決議\*\*/);
    assert.match(genSum, /- 📝 \[00:00:01\] \*\*王經理\*\*：今天天氣不錯，大家早安。/);
    assert.doesNotMatch(genSum, /- 🟢 \[00:00:01\]/);

    // BUG-002: generateDeliverableFromTemplate refuses overwrite unless force: true (saving .bak)
    const tplPath = path.join(mGen.projectDir, 'templates', 'change-request.md');
    const d1 = generateDeliverableFromTemplate({
      meetingDir: mGen.meetingDir,
      templatePath: tplPath,
      outputName: 'cr.md',
      values: { PROJECT_NAME: 'BugProj', REQUESTER: 'OriginalAuthor' }
    });
    assert.equal(d1.ok, true);

    const d2Blocked = generateDeliverableFromTemplate({
      meetingDir: mGen.meetingDir,
      templatePath: tplPath,
      outputName: 'cr.md',
      values: { PROJECT_NAME: 'BugProj', REQUESTER: 'NewAuthor' }
    });
    assert.equal(d2Blocked.ok, false);
    assert.equal(d2Blocked.reason, 'deliverable_already_exists');
    assert.match(fs.readFileSync(d1.outputPath, 'utf8'), /OriginalAuthor/);

    const d3Force = generateDeliverableFromTemplate({
      meetingDir: mGen.meetingDir,
      templatePath: tplPath,
      outputName: 'cr.md',
      values: { PROJECT_NAME: 'BugProj', REQUESTER: 'NewAuthor' },
      force: true
    });
    assert.equal(d3Force.ok, true);
    assert.match(fs.readFileSync(d3Force.outputPath, 'utf8'), /NewAuthor/);
    assert.match(fs.readFileSync(`${d3Force.outputPath}.bak`, 'utf8'), /OriginalAuthor/);

    // BUG-003: WAV with extra JUNK (100 bytes) + LIST (20 bytes) chunks before fmt & data parses exact 5.0s duration
    const junkWavPath = path.join(tmpDir, 'with-junk.wav');
    const junkPayloadSize = 100;
    const listPayloadSize = 20;
    const dataSize = 80000; // 5s at 16000 byteRate
    const totalSize = 12 + (8 + junkPayloadSize) + (8 + listPayloadSize) + (8 + 16) + (8 + dataSize);
    const buf = Buffer.alloc(totalSize);
    let p = 0;
    buf.write('RIFF', p, 'ascii'); p += 4;
    buf.writeUInt32LE(totalSize - 8, p); p += 4;
    buf.write('WAVE', p, 'ascii'); p += 4;
    // Extra JUNK chunk
    buf.write('JUNK', p, 'ascii'); p += 4;
    buf.writeUInt32LE(junkPayloadSize, p); p += 4;
    p += junkPayloadSize;
    // Extra LIST chunk
    buf.write('LIST', p, 'ascii'); p += 4;
    buf.writeUInt32LE(listPayloadSize, p); p += 4;
    p += listPayloadSize;
    // fmt  chunk
    buf.write('fmt ', p, 'ascii'); p += 4;
    buf.writeUInt32LE(16, p); p += 4;
    buf.writeUInt16LE(1, p); p += 2;
    buf.writeUInt16LE(1, p); p += 2;
    buf.writeUInt32LE(8000, p); p += 4;
    buf.writeUInt32LE(16000, p); p += 4; // byteRate
    buf.writeUInt16LE(2, p); p += 2;
    buf.writeUInt16LE(16, p); p += 2;
    // data chunk
    buf.write('data', p, 'ascii'); p += 4;
    buf.writeUInt32LE(dataSize, p); p += 4;
    fs.writeFileSync(junkWavPath, buf);

    const junkWavMeta = getMediaMetadata(junkWavPath);
    assert.equal(junkWavMeta.durationSeconds, 5);
    assert.equal(junkWavMeta.durationFormatted, '00:00:05');

    // BUG-004 & BUG-005: Action items distinguish Delegation, Self-Commitment, Unassigned TODO (never speaker!), and Suggestion
    const mActions = createMeeting({
      cwd: tmpDir,
      project: 'BugProj',
      title: 'Actions-Semantics',
      date: '2026-11-12',
      transcriptText: [
        '[00:00:01] **王經理**：待辦：下週要補齊系統文件。',
        '[00:00:05] **陳工程師**：我會負責於 11/20 前完成單元測試。',
        '[00:00:10] **王經理**：建議可以考慮於 11/30 前完成壓測。'
      ].join('\n')
    });
    assert.equal(mActions.ok, true);
    const actTodos = fs.readFileSync(path.join(mActions.meetingDir, '03-todos-and-discussion.md'), 'utf8');
    // Unassigned TODO must be 待確認 (TBD), NOT 王經理!
    assert.match(actTodos, /\|\s*AI-01\s*\|\s*\[待辦\] 待辦：下週要補齊系統文件。\s*\|\s*待確認 \(TBD\)\s*\|/);
    // Self-commitment assigns speaker 陳工程師
    assert.match(actTodos, /\|\s*AI-02\s*\|\s*\[承諾\] 我會負責於 11\/20 前完成單元測試。\s*\|\s*陳工程師\s*\|\s*11\/20\s*\|\s*🟢 已溯源至逐字稿\s*\|/);
    // Suggestion is marked [建議 - 需確認] and 🟡 建議事項（未拍板）
    assert.match(actTodos, /\|\s*AI-03\s*\|\s*\[建議 - 需確認\] 建議可以考慮於 11\/30 前完成壓測。\s*\|\s*待確認 \(TBD\)\s*\|.*🟡 建議事項（未拍板）/);

    // BUG-006: runCommit with --no-push skips remote sync even when a broken/unreachable remote is configured
    runGit(['remote', 'add', 'origin', '/tmp/non-existent-remote-repo-99999.git'], tmpDir);
    const localOnlyCommit = runCommit({ cwd: tmpDir, flags: { m: 'chore: local only commit', 'no-push': true } });
    assert.equal(localOnlyCommit.ok, true);
    assert.equal(localOnlyCommit.committed, true);
    assert.equal(localOnlyCommit.pushed, false);

    // BUG-007: Updating 01-transcript.md via --force makes verify AND commit actively FAIL with stale_transcript!
    createMeeting({
      cwd: tmpDir,
      project: 'BugProj',
      title: 'Actions-Semantics',
      date: '2026-11-12',
      transcriptText: '[00:00:01] **王經理**：逐字稿已大幅更新。',
      force: true
    });
    const staleVerify = runVerify({ cwd: tmpDir, target: mActions.meetingDir, silent: true });
    assert.equal(staleVerify.ok, false);
    assert.equal(staleVerify.issues.some((i) => i.type === 'stale_transcript'), true);

    const staleCommit = runCommit({ cwd: tmpDir, target: mActions.meetingDir, flags: { m: 'should block stale', 'no-push': true } });
    assert.equal(staleCommit.ok, false);
    assert.equal(staleCommit.reason, 'verify_failed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('19. Parenthesized paths in Markdown #Lx-Ly refs and meetnotes sync-hash command', () => {
  const tmpDir = makeTempDir();
  try {
    runInit({ cwd: tmpDir, flags: { lang: 'zh-TW' } });

    // Part A: Folder and file names containing balanced parentheses () must verify cleanly
    const parenDir = path.join(tmpDir, 'meetings', 'Project(v2)', '2026-11-20_週會_(上午場)');
    fs.mkdirSync(parenDir, { recursive: true });
    const parenTranscript = path.join(parenDir, '01-transcript.md');
    const parenNotes = path.join(parenDir, 'notes(final).md');
    fs.writeFileSync(parenTranscript, 'line1\nline2\nline3\nline4\n', 'utf8');
    fs.writeFileSync(parenNotes, 'note1\nnote2\n', 'utf8');

    const parenSummary = path.join(parenDir, '02-summary.md');
    fs.writeFileSync(
      parenSummary,
      [
        '# Summary',
        '- 🟢 決議一（來源：[01-transcript.md](2026-11-20_週會_(上午場)/01-transcript.md#L1-L3)）',
        '- 🟢 決議二（來源：[notes](notes(final).md#L1-L2)）',
        '- 🟢 決議三（來源：[full](meetings/Project(v2)/2026-11-20_週會_(上午場)/01-transcript.md#L2-L4)）',
        '- 遠端連結忽略：https://en.wikipedia.org/wiki/Markdown_(markup)#L999'
      ].join('\n') + '\n',
      'utf8'
    );

    // Note: relative from parenDir, 2026-11-20_週會_(上午場)/01-transcript.md won't exist unless referenced from Project(v2)/index.md;
    // test both from parent index.md and sibling notes(final).md
    const parentIndex = path.join(tmpDir, 'meetings', 'Project(v2)', 'index.md');
    fs.writeFileSync(
      parentIndex,
      '# Project(v2)\n- [上午場逐字稿](2026-11-20_週會_(上午場)/01-transcript.md#L1-L4)\n',
      'utf8'
    );
    fs.writeFileSync(
      parenSummary,
      [
        '# Summary',
        '- 🟢 決議一（來源：[01-transcript.md](./01-transcript.md#L1-L3)）',
        '- 🟢 決議二（來源：[notes](notes(final).md#L1-L2)）',
        '- 🟢 決議三（來源：[full](meetings/Project(v2)/2026-11-20_週會_(上午場)/01-transcript.md#L2-L4)）',
        '- 🟢 決議四（來源：[spaced](<notes (final v2).md#L1-L2>)）',
        '- 遠端連結忽略：https://en.wikipedia.org/wiki/Markdown_(markup)#L999'
      ].join('\n') + '\n',
      'utf8'
    );
    fs.writeFileSync(path.join(parenDir, 'notes (final v2).md'), 'line1\nline2\n', 'utf8');

    const parenVerifyOk = runVerify({ cwd: tmpDir, target: path.join(tmpDir, 'meetings', 'Project(v2)'), silent: true });
    assert.equal(parenVerifyOk.ok, true, `Expected parenthesized refs to verify, got: ${JSON.stringify(parenVerifyOk.issues)}`);

    // Out-of-range line on parenthesized path must still be caught as broken_lines
    fs.appendFileSync(parenSummary, '- Bad range: [notes](notes(final).md#L1-L99)\n', 'utf8');
    const parenVerifyBad = runVerify({ cwd: tmpDir, target: parenSummary, silent: true });
    assert.equal(parenVerifyBad.ok, false);
    assert.equal(parenVerifyBad.issues.some((i) => i.type === 'broken_lines'), true);

    // Part B: sync-hash unlocks stale_transcript after manual typo edit while preserving custom prose
    const mSync = createMeeting({
      cwd: tmpDir,
      project: 'SyncProj',
      title: 'Typo-Fix',
      date: '2026-11-20',
      transcriptText: '[00:00:01] **王經理**：決議預算為 50 萬，請李工程師負責於 11/25 前完成。\n'
    });
    assert.equal(mSync.ok, true);

    // Human edits 02-summary.md with custom insight
    const sumPath = path.join(mSync.meetingDir, '02-summary.md');
    const todosPath = path.join(mSync.meetingDir, '03-todos-and-discussion.md');
    fs.appendFileSync(sumPath, '\n<!-- custom-note -->\n- 🟡 人工補充的重要備註\n', 'utf8');

    // Human manually fixes a typo in 01-transcript.md
    const transPath = path.join(mSync.meetingDir, '01-transcript.md');
    const fixedTrans = fs.readFileSync(transPath, 'utf8').replace('50 萬', '50 萬元');
    fs.writeFileSync(transPath, fixedTrans, 'utf8');

    // Verify must now fail with stale_transcript
    const beforeSync = runVerify({ cwd: tmpDir, target: mSync.meetingDir, silent: true });
    assert.equal(beforeSync.ok, false);
    assert.equal(beforeSync.issues.some((i) => i.type === 'stale_transcript'), true);

    // Run CLI `meetnotes sync-hash <meetingDir>`
    const exitCode = main(['sync-hash', mSync.meetingDir]);
    assert.equal(exitCode, 0);

    // Verify must now pass and human-edited prose must remain 100% intact
    const afterSync = runVerify({ cwd: tmpDir, target: mSync.meetingDir, silent: true });
    assert.equal(afterSync.ok, true, `Expected verify to pass after sync-hash, got: ${JSON.stringify(afterSync.issues)}`);
    assert.match(fs.readFileSync(sumPath, 'utf8'), /人工補充的重要備註/);
    assert.equal(fs.existsSync(todosPath), true);

    // Second call to syncTranscriptHash is idempotent
    const secondSync = syncTranscriptHash(mSync.meetingDir);
    assert.equal(secondSync.ok, true);
    assert.deepEqual(secondSync.updatedFiles, []);
    assert.deepEqual(secondSync.alreadySyncedFiles, ['02-summary.md', '03-todos-and-discussion.md']);

    // Part C: CRLF re-save of 01-transcript.md must NOT trigger stale_transcript
    const crlfTrans = fs.readFileSync(transPath, 'utf8').replace(/\n/g, '\r\n');
    fs.writeFileSync(transPath, crlfTrans, 'utf8');
    const crlfVerify = runVerify({ cwd: tmpDir, target: mSync.meetingDir, silent: true });
    assert.equal(crlfVerify.ok, true);
    assert.equal(inspectMeetingDirectory(mSync.meetingDir).staleFiles.length, 0);

    // Part D: sync-hash blocks large (>5%) rewrites or broken citations unless --yes is passed
    fs.writeFileSync(transPath, '# 完全不同\n只剩一行\n', 'utf8');
    const blockedBroken = syncTranscriptHash(mSync.meetingDir);
    assert.equal(blockedBroken.ok, false);
    assert.equal(blockedBroken.reason, 'broken_citations');

    // Now test >5% rewrite where citations stay in bounds -> requires --yes
    const longBaseline = Array.from({ length: 20 }, (_, i) => `[00:00:${String(i + 1).padStart(2, '0')}] **王經理**：第 ${i + 1} 句內容。`).join('\n');
    const mGuard = createMeeting({
      cwd: tmpDir,
      project: 'SyncProj',
      title: 'Guard-Test',
      date: '2026-11-21',
      transcriptText: longBaseline
    });
    assert.equal(mGuard.ok, true);
    const rewrittenLong = Array.from({ length: 20 }, (_, i) => `[00:00:${String(i + 1).padStart(2, '0')}] **王經理**：改寫第 ${i + 1} 句。`).join('\n');
    createMeeting({
      cwd: tmpDir,
      project: 'SyncProj',
      title: 'Guard-Test',
      date: '2026-11-21',
      transcriptText: rewrittenLong,
      force: true
    });
    const blockedLarge = syncTranscriptHash(mGuard.meetingDir);
    assert.equal(blockedLarge.ok, false);
    assert.equal(blockedLarge.reason, 'confirmation_required');
    assert.equal(main(['sync-hash', mGuard.meetingDir]), 1);
    assert.equal(main(['sync-hash', mGuard.meetingDir, '--yes']), 0);
    assert.equal(runVerify({ cwd: tmpDir, target: mGuard.meetingDir, silent: true }).ok, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('20. CLI command parity: every switch(cmd) group in bin/cli.js is documented in --help, READMEs, and SKILL.md', () => {
  const repoRoot = path.join(__dirname, '..');
  const cliSrc = fs.readFileSync(path.join(repoRoot, 'bin', 'cli.js'), 'utf8');
  const { renderSkillMd, renderWorkspaceReadme } = require('../src/templates');

  // Extract switch(cmd) case groups dynamically so any new CLI command added to bin/cli.js is checked automatically
  const switchMatch = cliSrc.match(/switch\s*\(cmd\)\s*\{([\s\S]*?)\n\s*default:/);
  assert.ok(switchMatch, 'Could not locate switch (cmd) in bin/cli.js');

  const caseGroups = [];
  let currentGroup = [];
  for (const line of switchMatch[1].split(/\r?\n/)) {
    const m = line.match(/^\s*case\s+'([^']+)'\s*:/);
    if (m) {
      currentGroup.push(m[1]);
      if (line.includes('{')) {
        caseGroups.push(currentGroup);
        currentGroup = [];
      }
    }
  }
  assert.ok(caseGroups.length >= 10, `Expected at least 10 CLI command groups, found ${caseGroups.length}`);

  // Capture --help output
  let helpText = '';
  const origLog = console.log;
  console.log = (...args) => { helpText += args.join(' ') + '\n'; };
  try {
    main(['--help']);
  } finally {
    console.log = origLog;
  }

  const readmeFiles = ['readme.md', 'README.zh-TW.md', 'README.zh-CN.md', 'README.en.md'];
  const readmeContents = readmeFiles.map((f) => ({
    file: f,
    text: fs.readFileSync(path.join(repoRoot, f), 'utf8')
  }));

  for (const group of caseGroups) {
    assert.equal(
      group.some((name) => helpText.includes(name)),
      true,
      `CLI command group [${group.join(', ')}] is missing from printHelp() in bin/cli.js`
    );
    for (const { file, text } of readmeContents) {
      assert.equal(
        group.some((name) => text.includes(name)),
        true,
        `CLI command group [${group.join(', ')}] is missing from ${file}`
      );
    }
  }

  // Meeting-workflow commands must also be present in conversational SKILL.md and ja/ko READMEs + templates
  const meetingCommands = ['new-meeting', 'sync-hash', 'inspect', 'verify', 'pdf', 'commit'];
  const skillMd = renderSkillMd({ lang: 'zh-TW', mode: 'conversational', cliName: 'meetnotes', pkgName: '@loviusc/ai-meeting-notes' });
  for (const cmdName of meetingCommands) {
    assert.equal(
      skillMd.includes(cmdName),
      true,
      `Meeting command "${cmdName}" is missing from conversational SKILL.md in src/templates.js`
    );
  }

  const jaKoFiles = ['README.ja.md', 'README.ko.md'];
  for (const f of jaKoFiles) {
    const txt = fs.readFileSync(path.join(repoRoot, f), 'utf8');
    for (const cmdName of ['verify', 'inspect', 'sync-hash', 'pdf', 'commit']) {
      assert.equal(txt.includes(cmdName), true, `Command "${cmdName}" is missing from ${f}`);
    }
  }

  for (const lang of ['zh-TW', 'zh-CN', 'en', 'ja', 'ko']) {
    const tplReadme = renderWorkspaceReadme({ lang, mode: 'conversational' });
    assert.equal(
      tplReadme.includes('sync-hash'),
      true,
      `Generated ${lang} README template in src/templates.js is missing sync-hash`
    );
  }
});
