'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { CLI_NAME, HIDDEN_DIR, CONFIG_FILENAME } = require('../src/config');
const { parseCliArgs, readConfig } = require('../src/utils');
const { getInitPrompts } = require('../src/i18n');
const { promptInitFeatures } = require('../bin/cli');
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
  inspectMeetingDirectory
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
    const inspectRes = inspectMeetingDirectory(m2.meetingDir);
    assert.equal(inspectRes.ok, true);
    assert.equal(inspectRes.humanInterventionItems.length >= 2, true);
    assert.equal(inspectRes.conflicts.some((c) => c.key === '預計上線日' && c.previousValue.includes('2026-12-01') && c.currentValue.includes('2026-12-15')), true);

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
  assert.match(renderedHtml, /<ol>\s*<li>First ordered<\/li>\s*<li>Second ordered<\/li>\s*<ul>\s*<li>Nested bullet<\/li>\s*<\/ul>\s*<\/ol>\s*<p>Paragraph right after list<\/p>/);
  assert.match(renderedHtml, /<code>\*b\*<\/code>/);
  assert.doesNotMatch(renderedHtml, /<code><em>b<\/em><\/code>/);
  assert.match(renderedHtml, /<a href="#">click<\/a>/);
  assert.doesNotMatch(renderedHtml, /href="javascript:/i);
  assert.match(renderedHtml, /<td>a \| b<\/td>\s*<td>c<\/td>/);
});
