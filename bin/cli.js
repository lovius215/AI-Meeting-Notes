#!/usr/bin/env node
'use strict';

const readline = require('node:readline');
const { PACKAGE_NAME, CLI_NAME, VERSION, SUPPORTED_LANGS, TOOL_MODES } = require('../src/config');
const { parseCliArgs, readConfig } = require('../src/utils');
const { t, getInitPrompts } = require('../src/i18n');
const { runInit } = require('../src/init');
const { runVerify } = require('../src/verify');
const { runCommit } = require('../src/commit');
const { runPdf } = require('../src/pdf');
const { runUpgrade } = require('../src/upgrade');
const { runStatus } = require('../src/status');
const { runScaffold } = require('../src/scaffold');
const { runBuild } = require('../src/build');
const { createMeeting, inspectMeetingDirectory, generateDeliverableFromTemplate } = require('../src/meeting');

function printHelp(lang = 'zh-TW') {
  console.log(`
${t(lang, 'banner')} (v${VERSION})

Usage:
  ${CLI_NAME} <command> [options]

Standard Commands:
  init [--full] [--lang <lang>] [--mode <mode>] [--no-git] [--no-pdf]
      Initialize AI Agent workspace (.gitignore, AGENTS.md, readme.md, .${CLI_NAME}/skills/, project/, and .${CLI_NAME}/rules/ with --full)
      Supported --lang: ${SUPPORTED_LANGS.join(' | ')}
      Supported --mode: ${TOOL_MODES.join(' | ')}

  verify [target]
      0-Token anti-hallucination check: detects unfilled {{...}} placeholders & verifies #Lx-Ly line refs

  build | scaffold | pack [--name <pkg>] [--cli <cmd>] [--mode conversational|workbench|cli] [--out <dir>]
      Assembles the specification & templates designed in project/ into a complete, publishable npm package
      in-place (including package.json, bin/, src/, scripts/, .github/workflows/publish.yml, and 5-language READMEs)
      and verifies npm pack readiness.

  commit [target] [-m <msg>]
      Runs verify -> updates project/index.md -> safe Git commit & remote sync (pull --no-rebase + push)
      Safely stops on merge conflicts without stripping <<<<<<< markers; excludes sensitive files

  pdf [file|dir|id] [--merge] [--output <file.pdf>]   (alias: md2pdf)
      0-Token Markdown to A4 PDF export via local Headless Chrome/Edge, wkhtmltopdf, or macOS cupsfilter

  upgrade [--dry-run]                                 (alias: update)
      Non-destructively updates .${CLI_NAME}/{AGENTS.md,skills/,rules/} (preserving language & <claude-mem-context>)

  status | check | doctor [--self]
      Displays project stage progress, workspace file integrity, and environment health
`);
}

function main(argv = process.argv.slice(2)) {
  const { positional, flags } = parseCliArgs(argv);
  const cmd = positional[0];
  const target = positional[1] || null;
  const cwd = process.cwd();
  const cfg = readConfig(cwd);

  if (flags.version || flags.v || cmd === 'version') {
    console.log(`${PACKAGE_NAME} v${VERSION}`);
    return 0;
  }

  if (!cmd || flags.help || flags.h || cmd === 'help') {
    printHelp(flags.lang || cfg.lang);
    return 0;
  }

  switch (cmd) {
    case 'init': {
      const res = runInit({ cwd, flags });
      return res.ok ? 0 : 1;
    }
    case 'verify': {
      const res = runVerify({ cwd, target });
      return res.ok ? 0 : 1;
    }
    case 'commit': {
      const res = runCommit({ cwd, target, flags });
      return res.ok ? 0 : 1;
    }
    case 'pdf':
    case 'md2pdf': {
      const res = runPdf({ cwd, target, flags });
      return res.ok ? 0 : 1;
    }
    case 'upgrade':
    case 'update': {
      const res = runUpgrade({ cwd, flags });
      return res.ok ? 0 : 1;
    }
    case 'status':
    case 'check':
    case 'doctor': {
      const res = runStatus({ cwd, subcommand: cmd, flags });
      return res.ok ? 0 : 1;
    }
    case 'build':
    case 'pack': {
      const res = runBuild({ cwd, subcommand: cmd, flags });
      return res.ok ? 0 : 1;
    }
    case 'scaffold':
    case 'new':
    case 'create':
    case 'create-tool': {
      if (!target && !flags.out && !flags.name) {
        const res = runBuild({ cwd, subcommand: 'pack', flags });
        return res.ok ? 0 : 1;
      }
      const res = runScaffold({ cwd, target, flags });
      return res.ok ? 0 : 1;
    }
    case 'meeting':
    case 'new-meeting': {
      const fs = require('node:fs');
      const project = flags.project || target || 'Project-A';
      const title = flags.title || positional[2] || 'Weekly-Sync';
      const date = flags.date || new Date().toISOString().slice(0, 10);
      const transcriptText = flags.transcript && fs.existsSync(flags.transcript)
        ? fs.readFileSync(flags.transcript, 'utf8')
        : '';
      let mapping = {};
      if (flags.map) {
        for (const pair of String(flags.map).split(',')) {
          const [k, v] = pair.split('=');
          if (k && v) mapping[k.trim()] = v.trim();
        }
      }
      const res = createMeeting({
        cwd,
        project,
        title,
        date,
        mediaFile: flags.media || null,
        transcriptText,
        mapping
      });
      console.log(`✅ Meeting created: ${res.meetingDir}`);
      return res.ok ? 0 : 1;
    }
    case 'inspect': {
      const path = require('node:path');
      const meetingDir = target
        ? (path.isAbsolute(target) ? target : path.join(cwd, target))
        : cwd;
      const res = inspectMeetingDirectory(meetingDir);
      console.log(JSON.stringify(res, null, 2));
      return res.ok ? 0 : 1;
    }
    case 'deliverable': {
      const path = require('node:path');
      const meetingDir = flags.meeting
        ? (path.isAbsolute(flags.meeting) ? flags.meeting : path.join(cwd, flags.meeting))
        : cwd;
      const templatePath = flags.template
        ? (path.isAbsolute(flags.template) ? flags.template : path.join(cwd, flags.template))
        : '';
      const res = generateDeliverableFromTemplate({
        meetingDir,
        templatePath,
        outputName: flags.out || 'deliverable.md',
        values: flags
      });
      if (!res.ok) {
        console.error(res.error);
        return 1;
      }
      console.log(`✅ Deliverable generated: ${res.outputPath}`);
      return 0;
    }
    default: {
      console.error(`Unknown command: "${cmd}". Run "${CLI_NAME} --help" for available commands.`);
      return 1;
    }
  }
}

async function askYesNo(rl, question, defaultYes = true) {
  return new Promise((resolve) => {
    const suffix = defaultYes ? ' (Y/n): ' : ' (y/N): ';
    rl.question(`${question}${suffix}`, (ans) => {
      const trimmed = ans.trim().toLowerCase();
      if (!trimmed) return resolve(defaultYes);
      resolve(trimmed === 'y' || trimmed === 'yes');
    });
  });
}

async function promptInitFeatures(flags, lang, askFn = null) {
  const prompts = getInitPrompts(lang, CLI_NAME);
  let rl = null;
  const ask = askFn || (async (question, defaultYes = true) => askYesNo(rl, question, defaultYes));
  if (!askFn) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(prompts.header);
  }
  try {
    if (!flags['no-git'] && !flags.git) {
      const needGit = await ask(prompts.git, true);
      if (!needGit) flags['no-git'] = true;
    }
    if (!flags['no-pdf'] && !flags.pdf) {
      const needPdf = await ask(prompts.pdf, true);
      if (!needPdf) flags['no-pdf'] = true;
    }
    if (!flags['no-html'] && !flags.html) {
      const needHtml = await ask(prompts.html, true);
      if (!needHtml) flags['no-html'] = true;
    }
    if (!flags['no-npm'] && !flags.npm) {
      const needNpm = await ask(prompts.npm, true);
      if (!needNpm) flags['no-npm'] = true;
    }
  } finally {
    if (rl) rl.close();
  }
  return flags;
}

async function promptInitFeaturesIfTty(flags, lang) {
  if (!process.stdin.isTTY || flags.yes || flags.y || flags['non-interactive']) {
    return flags;
  }
  return promptInitFeatures(flags, lang);
}

if (require.main === module) {
  const rawArgv = process.argv.slice(2);
  const { positional, flags } = parseCliArgs(rawArgv);
  if (positional[0] === 'init' && !flags.help && !flags.h && !flags.version && !flags.v) {
    const cfg = readConfig(process.cwd());
    const lang = flags.lang || cfg.lang;
    promptInitFeaturesIfTty(flags, lang).then((updatedFlags) => {
      const res = runInit({ cwd: process.cwd(), flags: updatedFlags });
      process.exitCode = res.ok ? 0 : 1;
    });
  } else {
    const code = main(rawArgv);
    process.exitCode = code;
  }
}

module.exports = { main, printHelp, promptInitFeatures };
