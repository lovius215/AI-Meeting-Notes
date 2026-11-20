'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'bin', 'cli.js');
const NPM_BIN = os.platform() === 'win32' ? 'npm.cmd' : 'npm';
const { HIDDEN_DIR, CONFIG_FILENAME } = require('../src/config');

function runCmd(bin, args, cwd) {
  return spawnSync(bin, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' }
  });
}

test('E2E: full real-world CLI lifecycle for genaitool AND generated derived npm tool', () => {
  const authorWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'genaitool-e2e-author-'));
  const endUserWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'genaitool-e2e-enduser-'));

  try {
    // =========================================================================
    // PART 1: Developer uses genaitool CLI end-to-end to design & pack a tool
    // =========================================================================
    const initRes = runCmd(process.execPath, [CLI_ENTRY, 'init', '--full', '--lang', 'zh-TW', '--yes'], authorWorkspace);
    assert.equal(initRes.status, 0, initRes.stderr || initRes.stdout);
    assert.equal(fs.existsSync(path.join(authorWorkspace, HIDDEN_DIR, 'rules', 'invariants.md')), true);
    assert.equal(fs.existsSync(path.join(authorWorkspace, '.git', 'hooks', 'pre-commit')), true);

    // Bug/Guardrail check: verify MUST fail while {{...}} placeholders are unfilled
    const preVerify = runCmd(process.execPath, [CLI_ENTRY, 'verify'], authorWorkspace);
    assert.notEqual(preVerify.status, 0);

    // Simulate AI + User filling project/01-spec.md .. 04-release-plan.md
    const projDir = path.join(authorWorkspace, 'project');
    fs.writeFileSync(
      path.join(projDir, '01-spec.md'),
      '# 01. 工具定位\n\n- **npm 套件名稱 (Package Name)**：@loviusc/e2e-mate\n- **CLI 指令名稱 (CLI Name)**：e2emate\n- **終端使用者互動型態 (Interaction Mode)**：`conversational`\n\n## 核心痛點與價值主張\n端到端實測驗證產出的免指令對話式工具。\n',
      'utf8'
    );
    fs.writeFileSync(path.join(projDir, '02-workflow.md'), '# 02. 流程\n1. 提問釐清\n2. 產出文件\n', 'utf8');
    fs.writeFileSync(path.join(projDir, '03-agent-rules.md'), '# 03. 規則\n- 遵守雙軌驗證清單\n', 'utf8');
    fs.writeFileSync(path.join(projDir, '04-release-plan.md'), '# 04. 發布\n- 通過 npm test 並可發布\n', 'utf8');

    // Verify must now pass via real CLI
    const passVerify = runCmd(process.execPath, [CLI_ENTRY, 'verify'], authorWorkspace);
    assert.equal(passVerify.status, 0, passVerify.stderr || passVerify.stdout);

    // Export HTML report via real CLI (boolean --merge & --html must not swallow --output)
    const htmlOut = path.join(authorWorkspace, 'dist', 'report.html');
    const htmlRes = runCmd(process.execPath, [CLI_ENTRY, 'pdf', '--merge', '--html', '--output', htmlOut], authorWorkspace);
    assert.equal(htmlRes.status, 0, htmlRes.stderr || htmlRes.stdout);
    assert.equal(fs.existsSync(htmlOut), true);

    // Assemble & pack the derived npm package in-place via real CLI
    const packRes = runCmd(process.execPath, [CLI_ENTRY, 'pack'], authorWorkspace);
    assert.equal(packRes.status, 0, packRes.stderr || packRes.stdout);

    // Logic check: mother agent/skills/config MUST NOT remain in derived npm project, and private MUST be removed
    assert.equal(fs.existsSync(path.join(authorWorkspace, 'AGENTS.md')), false);
    assert.equal(fs.existsSync(path.join(authorWorkspace, HIDDEN_DIR)), false);
    assert.equal(fs.existsSync(path.join(authorWorkspace, 'skills')), false);
    assert.equal(fs.existsSync(path.join(authorWorkspace, CONFIG_FILENAME)), false);

    const derivedPkg = JSON.parse(fs.readFileSync(path.join(authorWorkspace, 'package.json'), 'utf8'));
    assert.equal(derivedPkg.name, '@loviusc/e2e-mate');
    assert.equal(derivedPkg.bin.e2emate, './bin/cli.js');
    assert.equal(derivedPkg.private, undefined);

    // Commit via real CLI (triggers verify + index update + pre-commit hook)
    const commitRes = runCmd(process.execPath, [CLI_ENTRY, 'commit', '-m', 'feat: e2e assemble @loviusc/e2e-mate'], authorWorkspace);
    assert.equal(commitRes.status, 0, commitRes.stderr || commitRes.stdout);
    assert.match(fs.readFileSync(path.join(projDir, 'index.md'), 'utf8'), /✅ Verified/);

    // =========================================================================
    // PART 2: Derived tool runs its OWN check & test suite
    // =========================================================================
    const derivedCheck = runCmd(NPM_BIN, ['run', 'check'], authorWorkspace);
    assert.equal(derivedCheck.status, 0, derivedCheck.stderr || derivedCheck.stdout);

    // Only run the unit tests (cli.test.js) inside derived package to avoid recursive E2E spawning
    const derivedUnitTest = runCmd(process.execPath, ['--test', 'test/cli.test.js'], authorWorkspace);
    assert.equal(derivedUnitTest.status, 0, derivedUnitTest.stderr || derivedUnitTest.stdout);

    // =========================================================================
    // PART 3: End-user installs/runs the derived tool in a fresh workspace
    // =========================================================================
    const derivedCli = path.join(authorWorkspace, 'bin', 'cli.js');

    const verRes = runCmd(process.execPath, [derivedCli, '--version'], endUserWorkspace);
    assert.equal(verRes.status, 0, verRes.stderr || verRes.stdout);
    assert.match(verRes.stdout, /@loviusc\/e2e-mate/);

    const userInit = runCmd(process.execPath, [derivedCli, 'init', '--full', '--lang', 'en', '--yes'], endUserWorkspace);
    assert.equal(userInit.status, 0, userInit.stderr || userInit.stdout);

    // Derived conversational AGENTS.md & hidden .e2emate/ structure logic checks (nothing visible at root)
    assert.equal(fs.existsSync(path.join(endUserWorkspace, 'AGENTS.md')), false);
    assert.equal(fs.existsSync(path.join(endUserWorkspace, 'skills')), false);
    assert.equal(fs.existsSync(path.join(endUserWorkspace, 'rules')), false);
    const userAgents = fs.readFileSync(path.join(endUserWorkspace, '.e2emate', 'AGENTS.md'), 'utf8');
    assert.doesNotMatch(userAgents, /tool:scaffold/);
    assert.match(userAgents, /Zero-Command Conversational Mode/);
    assert.match(userAgents, /Work Checklist/);
    assert.match(userAgents, /Verification Checklist/);
    assert.equal(fs.existsSync(path.join(endUserWorkspace, '.e2emate', 'skills', 'e2emate', 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(endUserWorkspace, '.e2emate', 'rules', 'invariants.md')), true);

    // End-user fills deliverables and runs verify -> pdf --html -> commit
    const userProj = path.join(endUserWorkspace, 'project');
    for (const f of fs.readdirSync(userProj)) {
      if (f !== 'index.md' && f.endsWith('.md')) {
        fs.writeFileSync(path.join(userProj, f), `# ${f}\nEnd-user deliverable completed.\n`, 'utf8');
      }
    }
    const userVerify = runCmd(process.execPath, [derivedCli, 'verify'], endUserWorkspace);
    assert.equal(userVerify.status, 0, userVerify.stderr || userVerify.stdout);

    const userHtml = runCmd(process.execPath, [derivedCli, 'pdf', '--merge', '--html', '--output', 'summary.html'], endUserWorkspace);
    assert.equal(userHtml.status, 0, userHtml.stderr || userHtml.stdout);
    assert.equal(fs.existsSync(path.join(endUserWorkspace, 'summary.html')), true);

    const userCommit = runCmd(process.execPath, [derivedCli, 'commit', '-m', 'docs: end-user deliverable'], endUserWorkspace);
    assert.equal(userCommit.status, 0, userCommit.stderr || userCommit.stdout);
  } finally {
    fs.rmSync(authorWorkspace, { recursive: true, force: true });
    fs.rmSync(endUserWorkspace, { recursive: true, force: true });
  }
});
