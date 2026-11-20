'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ensureDir } = require('./utils');
const { verifyFile } = require('./verify');

/**
 * Compute SHA-256 checksum and file size of a media file using 64 KiB streaming chunks
 * so large multi-GB video files (.mp4 / .mkv) never exceed Node.js Buffer memory limits.
 */
function getMediaMetadata(filePath) {
  if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return null;
  }
  const stat = fs.statSync(filePath);
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const chunkBuf = Buffer.allocUnsafe(65536);
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, chunkBuf, 0, chunkBuf.length, null)) > 0) {
      hash.update(bytesRead === chunkBuf.length ? chunkBuf : chunkBuf.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return {
    fileName: path.basename(filePath),
    sizeBytes: stat.size,
    sha256: hash.digest('hex')
  };
}

function normalizeTimestamp(tsRaw) {
  const parts = String(tsRaw).split(':');
  if (parts.length === 2) {
    return `00:${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }
  if (parts.length === 3) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`;
  }
  return tsRaw;
}

/**
 * Parse .srt / .vtt (including hourless MM:SS.mmm and multi-line cues) / plain text rough transcript
 * and deterministically apply speaker & terminology mapping without LLM Output Token re-generation.
 */
function applySpeakerMapping({ transcriptText = '', mapping = {}, terms = {} } = {}) {
  const rawLines = String(transcriptText).replace(/\r\n/g, '\n').split('\n');
  const normalizedLines = [];
  let activeTimestamp = null;

  const tsLineRegex = /^((?:\d{2}:)?\d{2}:\d{2})[.,]\d{3}\s*-->\s*(?:\d{2}:)?\d{2}:\d{2}[.,]\d{3}(?:\s+.*)?$/;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) {
      activeTimestamp = null;
      continue;
    }
    if (line === 'WEBVTT' || /^NOTE(?:\s|$)/.test(line)) {
      continue;
    }
    // Only skip a bare integer line if the next non-empty line is a timestamp (SRT cue sequence number),
    // so numeric dialogue lines (e.g. "500000" or "2026") are never accidentally stripped!
    if (/^\d+$/.test(line)) {
      const nextLine = (rawLines[i + 1] || '').trim();
      if (tsLineRegex.test(nextLine)) {
        continue;
      }
    }
    // Match SRT/VTT timestamp line: either HH:MM:SS.mmm or MM:SS.mmm (with comma or dot, and optional cue settings)
    const tsMatch = line.match(tsLineRegex);
    if (tsMatch) {
      activeTimestamp = normalizeTimestamp(tsMatch[1]);
      continue;
    }
    if (activeTimestamp) {
      if (/^\[\d{2}:\d{2}:\d{2}\]/.test(line)) {
        normalizedLines.push(line);
      } else {
        normalizedLines.push(`[${activeTimestamp}] ${line}`);
      }
    } else {
      normalizedLines.push(line);
    }
  }

  const unmappedSpeakers = new Set();
  const uncertaintyFlags = [];
  const outputLines = [];

  // Prepare single-pass simultaneous regexes for terms and speakers (sorted longest-key first)
  // so replacements never cascade into already-replaced text (e.g. Alex -> Alex Chen, Chen -> Manager Chen)
  const termEntries = Object.entries(terms || {}).filter(([k, v]) => k && v !== undefined && v !== null);
  termEntries.sort((a, b) => b[0].length - a[0].length);
  const termMap = new Map(termEntries.map(([k, v]) => [k, String(v)]));
  const termRegex = termEntries.length > 0
    ? new RegExp(termEntries.map(([k]) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g')
    : null;

  const speakerEntries = Object.entries(mapping || {}).filter(([k, v]) => k && v);
  speakerEntries.sort((a, b) => b[0].length - a[0].length);
  const speakerMap = new Map(speakerEntries.map(([k, v]) => [k, String(v)]));
  const speakerRegex = speakerEntries.length > 0
    ? new RegExp(
        `(?<![A-Za-z0-9_])(?:${speakerEntries.map(([k]) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![A-Za-z0-9_])`,
        'g'
      )
    : null;

  for (let idx = 0; idx < normalizedLines.length; idx++) {
    let line = normalizedLines[idx];

    // 1. Single-pass terminology replacement
    if (termRegex) {
      line = line.replace(termRegex, (matched) => termMap.get(matched) ?? matched);
    }

    // 2. Single-pass speaker replacement (supports both ASCII SPEAKER_00 and Unicode/CJK labels like 語者A / 發言人1)
    if (speakerRegex) {
      line = line.replace(speakerRegex, (matched) => `**${speakerMap.get(matched)}**`);
    }

    // 3. Detect ALL remaining unmapped SPEAKER_XX, Speaker A/B, or CJK 語者X / 發言人X / 話者X / 화자X tokens on the line
    const unknownSpeakerGlobalRegex = /(?<![A-Za-z0-9_])(SPEAKER_\d+|Speaker\s+[A-Z0-9]+|(?:語者|發言人|发言人|話者|화자)\s*[A-Z0-9一二三四五六七八九十甲乙丙丁]+)(?![A-Za-z0-9_])/g;
    const foundUnknownsOnLine = [];
    line = line.replace(unknownSpeakerGlobalRegex, (unk) => {
      unmappedSpeakers.add(unk);
      foundUnknownsOnLine.push(unk);
      return `⚠️ [待確認語者: ${unk}]`;
    });
    for (const unk of foundUnknownsOnLine) {
      uncertaintyFlags.push({
        type: 'unknown_speaker',
        speaker: unk,
        lineOffset: idx + 1,
        preview: line
      });
    }

    // Detect low-confidence audio markers like [inaudible], [?], (聽不清楚), ???
    if (/(\[inaudible\]|\[\?\]|\(\?\)|（聽不清楚）|（模糊）|\?{3,})/i.test(line)) {
      if (!line.includes('⚠️ [需人為確認')) {
        line = `${line} ⚠️ [需人為確認原音]`;
      }
      uncertaintyFlags.push({
        type: 'low_confidence_audio',
        lineOffset: idx + 1,
        preview: line
      });
    }

    outputLines.push(line);
  }

  const formattedText = outputLines.join('\n');
  const estimatedFullTokens = Math.max(1, Math.ceil(formattedText.length / 2));
  const mappingTokens = Math.max(1, Math.ceil(JSON.stringify({ mapping, terms }).length / 3));
  const savedRatio = estimatedFullTokens > mappingTokens
    ? Math.round(((estimatedFullTokens - mappingTokens) / estimatedFullTokens) * 100)
    : 0;

  return {
    formattedText,
    lines: outputLines,
    unmappedSpeakers: Array.from(unmappedSpeakers),
    uncertaintyFlags,
    tokenStats: {
      estimatedFullOutputTokens: estimatedFullTokens,
      mappingDictionaryTokens: mappingTokens,
      savedPercentage: savedRatio
    }
  };
}

function isSafePathSegment(seg) {
  if (!seg || typeof seg !== 'string') return false;
  const trimmed = seg.trim();
  if (!trimmed || trimmed === '.' || trimmed === '..') return false;
  if (trimmed.includes('..') || /[<>:"/\\|?*\x00-\x1f]/.test(trimmed)) return false;
  return true;
}

/**
 * Create a periodic meeting folder under meetings/<project>/<date>_<title>/
 * Enforces strict zero-hallucination, path-traversal prevention, media file validation,
 * and overwrite protection on existing 01-transcript.md.
 */
function createMeeting({
  cwd = process.cwd(),
  project = 'Project-A',
  title = 'Weekly-Sync',
  date = new Date().toISOString().slice(0, 10),
  attendees = [],
  mediaFile = null,
  transcriptFile = null,
  transcriptText = '',
  mapping = {},
  terms = {},
  allowEmpty = false,
  force = false
} = {}) {
  // 1. Validate date format (strictly YYYY-MM-DD) & prevent path traversal
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    return {
      ok: false,
      reason: 'invalid_date',
      error: `Invalid date "${date}". Expected strict YYYY-MM-DD format.`
    };
  }
  const cleanDate = date.trim();

  if (!isSafePathSegment(project)) {
    return {
      ok: false,
      reason: 'invalid_path',
      error: `Invalid project name "${project}". Path traversal or special path characters are not allowed.`
    };
  }
  const safeProject = project.trim();

  const normalizedTitle = typeof title === 'string' ? title.trim().replace(/\s+/g, '-') : '';
  if (!isSafePathSegment(normalizedTitle)) {
    return {
      ok: false,
      reason: 'invalid_path',
      error: `Invalid meeting title "${title}". Path traversal or special path characters are not allowed.`
    };
  }
  const folderName = `${cleanDate}_${normalizedTitle}`;

  const meetingsRoot = path.resolve(cwd, 'meetings');
  const projectDir = path.resolve(meetingsRoot, safeProject);
  const meetingDir = path.resolve(projectDir, folderName);

  if (!projectDir.startsWith(meetingsRoot + path.sep) || !meetingDir.startsWith(projectDir + path.sep)) {
    return {
      ok: false,
      reason: 'invalid_path',
      error: 'Path traversal detected outside meetings/ directory.'
    };
  }

  // 2. Validate mediaFile and transcriptFile paths if provided (never silently ignore bad paths!)
  let resolvedMediaInput = null;
  if (mediaFile !== null && mediaFile !== undefined && mediaFile !== false) {
    if (typeof mediaFile !== 'string' || !mediaFile.trim()) {
      return { ok: false, reason: 'media_not_found', error: 'Invalid --media file path.' };
    }
    resolvedMediaInput = path.isAbsolute(mediaFile) ? mediaFile : path.join(cwd, mediaFile);
    if (!fs.existsSync(resolvedMediaInput) || !fs.statSync(resolvedMediaInput).isFile()) {
      return {
        ok: false,
        reason: 'media_not_found',
        error: `Media file not found: ${mediaFile}`
      };
    }
  }

  let effectiveTranscriptText = typeof transcriptText === 'string' ? transcriptText : '';
  if (transcriptFile !== null && transcriptFile !== undefined && transcriptFile !== false) {
    if (typeof transcriptFile !== 'string' || !transcriptFile.trim()) {
      return { ok: false, reason: 'transcript_not_found', error: 'Invalid --transcript file path.' };
    }
    const resolvedTranscriptInput = path.isAbsolute(transcriptFile)
      ? transcriptFile
      : path.join(cwd, transcriptFile);
    if (!fs.existsSync(resolvedTranscriptInput) || !fs.statSync(resolvedTranscriptInput).isFile()) {
      return {
        ok: false,
        reason: 'transcript_not_found',
        error: `Transcript file not found: ${transcriptFile}`
      };
    }
    effectiveTranscriptText = fs.readFileSync(resolvedTranscriptInput, 'utf8');
  }

  const hasRealTranscript = Boolean(effectiveTranscriptText && effectiveTranscriptText.trim());
  if (!hasRealTranscript && !allowEmpty) {
    return {
      ok: false,
      reason: 'missing_transcript',
      error: 'No transcript content provided (--transcript or transcriptText required; pass --empty / allowEmpty: true only to create an unverified skeleton).'
    };
  }

  // 3. Protect existing human-edited 01-transcript.md unless force: true (--force)
  const transcriptPath = path.join(meetingDir, '01-transcript.md');
  if (fs.existsSync(transcriptPath) && !force) {
    return {
      ok: false,
      reason: 'meeting_already_exists',
      error: `Meeting transcript already exists at ${transcriptPath}. Pass --force to overwrite.`
    };
  }

  const templatesDir = path.join(projectDir, 'templates');
  const mediaDir = path.join(meetingDir, 'media');
  const deliverablesDir = path.join(meetingDir, 'deliverables');

  ensureDir(mediaDir);
  ensureDir(deliverablesDir);
  ensureDir(templatesDir);

  // 4. Copy media file into meetings/<project>/<date>_<title>/media/ if provided
  let mediaMeta = null;
  if (resolvedMediaInput) {
    const destMedia = path.join(mediaDir, path.basename(resolvedMediaInput));
    if (path.resolve(resolvedMediaInput) !== path.resolve(destMedia)) {
      fs.copyFileSync(resolvedMediaInput, destMedia);
    }
    mediaMeta = getMediaMetadata(destMedia);
  }

  // 5. Process transcript (Zero-Hallucination: never fabricate dialogue or mark 🟢 without real input!)
  const mapped = hasRealTranscript
    ? applySpeakerMapping({ transcriptText: effectiveTranscriptText, mapping, terms })
    : {
        formattedText: '⚠️ [需人為確認 - 尚未匯入逐字稿內容 (Pending Transcript Import)]',
        lines: ['⚠️ [需人為確認 - 尚未匯入逐字稿內容 (Pending Transcript Import)]'],
        unmappedSpeakers: [],
        uncertaintyFlags: [{ type: 'missing_transcript', lineOffset: 1, preview: '⚠️ [需人為確認 - 尚未匯入逐字稿內容]' }],
        tokenStats: { estimatedFullOutputTokens: 0, mappingDictionaryTokens: 0, savedPercentage: 0 }
      };

  const mediaHeaderLines = mediaMeta
    ? [
        `- **原始媒體檔案**：[${mediaMeta.fileName}](./media/${mediaMeta.fileName}) (${mediaMeta.sizeBytes} bytes)`,
        `- **媒體 SHA-256**：\`${mediaMeta.sha256}\``
      ]
    : ['- **原始媒體檔案**：無外部影音檔（純文字紀錄）'];

  const attendeeList = attendees.length > 0
    ? attendees.join(', ')
    : (Object.values(mapping).length > 0 ? Object.values(mapping).join(', ') : '待確認 (TBD)');

  const headerLines = [
    `# 01. 語者分離逐字稿 (${safeProject} - ${cleanDate})`,
    '',
    `- **專案名稱**：${safeProject}`,
    `- **會議日期**：${cleanDate}`,
    `- **會議主題**：${title}`,
    `- **與會者名單**：${attendeeList}`,
    ...mediaHeaderLines,
    '',
    '## 逐字稿內容',
    ''
  ];

  // Exact 1-based line number where the first content line starts
  const firstContentLine = headerLines.length + 1;
  const transcriptLines = [...headerLines, ...mapped.lines];
  const transcriptTotalLines = transcriptLines.length;
  const transcriptMd = transcriptLines.join('\n') + '\n';
  fs.writeFileSync(transcriptPath, transcriptMd, 'utf8');

  // 6. Create 02-summary.md (only mark 🟢 if real transcript was provided and has no uncertainty; otherwise mark 🔴/⚠️!)
  const summaryBadge = hasRealTranscript ? '🟢' : '🔴 ⚠️ [需人為確認 - 尚未匯入逐字稿]';
  const summaryMd = `# 02. 會議摘要與重點決議 (${safeProject} - ${cleanDate})

## 執行摘要 (Executive Summary)
- ${summaryBadge} 本次會議針對 **${safeProject}**（${title}）進行紀錄整理（來源：[01-transcript.md](./01-transcript.md#L${firstContentLine}-L${transcriptTotalLines})）。

## 核心討論重點與決議 (Key Points & Decisions)
- ${summaryBadge} **討論事項 1**：詳見逐字稿原始對話紀錄（來源：[01-transcript.md](./01-transcript.md#L${firstContentLine}-L${transcriptTotalLines})）。
`;
  const summaryPath = path.join(meetingDir, '02-summary.md');
  if (!fs.existsSync(summaryPath) || force) {
    fs.writeFileSync(summaryPath, summaryMd, 'utf8');
  }

  // 7. Create 03-todos-and-discussion.md
  const uncertaintySection = mapped.uncertaintyFlags.length > 0
    ? mapped.uncertaintyFlags.map((u, idx) => `- 🚨 **[需人為確認 #${idx + 1}]** (${u.type}): \`${u.preview}\``).join('\n')
    : '- 無高不確定性待確認項目。';

  const todoRiskBadge = hasRealTranscript ? '🟡 待確認負責人 (TBD)' : '🔴 ⚠️ [需人為確認 - 無逐字稿來源]';

  const todosMd = `# 03. 待辦事項與會後延伸討論 (${safeProject} - ${cleanDate})

## 待辦事項清單 (Action Items)

| 編號 | 待辦事項 | 負責人 (Owner) | 期限 (Due Date) | 風險等級 | 來源引用 | 狀態 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| AI-01 | 確認本次會議待辦事項與負責人 | 待確認 (TBD) | 待確認 (TBD) | ${todoRiskBadge} | [01-transcript.md](./01-transcript.md#L${firstContentLine}-L${transcriptTotalLines}) | ⏳ Pending |

## 🚨 需人為介入與風險確認清單 (Human Intervention Required)
${uncertaintySection}

## ⚡ 跨期會議衝突提醒 (Cross-Meeting Conflict Alerts)
- 尚未偵測到與過往會議決議衝突之項目。

## 會後延伸討論區 (Post-Meeting Discussion)
- 可於此處與 AI 持續針對會議決議與待辦進行延伸討論並回寫紀錄。
`;
  const todosPath = path.join(meetingDir, '03-todos-and-discussion.md');
  if (!fs.existsSync(todosPath) || force) {
    fs.writeFileSync(todosPath, todosMd, 'utf8');
  }

  // 8. Ensure project-level index.md rolling snapshot exists and lists this meeting
  const projectIndexPath = path.join(projectDir, 'index.md');
  if (!fs.existsSync(projectIndexPath)) {
    const projIndexMd = `# ${safeProject} — 專案會議總覽與滾動基準快照 (Project Rolling Snapshot)

## 當前有效決議與基準快照 (Active Decisions & Baseline Snapshot)
- **專案名稱**：${safeProject}
- **固定與會成員**：${attendeeList}

## 歷次會議索引 (Meeting History)
- [${folderName}](./${folderName}/02-summary.md) — [逐字稿](./${folderName}/01-transcript.md) | [待辦與討論](./${folderName}/03-todos-and-discussion.md)
`;
    fs.writeFileSync(projectIndexPath, projIndexMd, 'utf8');
  } else {
    const existingIdx = fs.readFileSync(projectIndexPath, 'utf8');
    if (!existingIdx.includes(folderName)) {
      const entryLine = `- [${folderName}](./${folderName}/02-summary.md) — [逐字稿](./${folderName}/01-transcript.md) | [待辦與討論](./${folderName}/03-todos-and-discussion.md)\n`;
      fs.writeFileSync(projectIndexPath, existingIdx.replace(/\r?\n$/, '') + '\n' + entryLine, 'utf8');
    }
  }

  // 9. Create default sample template in meetings/<project>/templates/change-request.md if missing
  const defaultTplPath = path.join(templatesDir, 'change-request.md');
  if (!fs.existsSync(defaultTplPath)) {
    fs.writeFileSync(
      defaultTplPath,
      `# 規格變更申請單 (Change Request)

- **專案名稱**：{{PROJECT_NAME}}
- **會議日期**：{{MEETING_DATE}}
- **申請人**：{{REQUESTER}}
- **變更內容摘要**：{{CHANGE_SUMMARY}}
- **預計上線日**：{{LAUNCH_DATE}}
- **預算影響**：{{BUDGET_IMPACT}}
`,
      'utf8'
    );
  }

  return {
    ok: true,
    projectDir,
    meetingDir,
    firstContentLine,
    transcriptTotalLines,
    mediaMeta,
    mapped
  };
}

/**
 * Generate a post-meeting deliverable from a template without hallucinating missing fields.
 * Rejects boolean flags (e.g. --REQUESTER with no value) and path traversal in outputName.
 */
function generateDeliverableFromTemplate({
  meetingDir,
  templatePath,
  outputName = 'deliverable.md',
  values = {}
} = {}) {
  if (!outputName || typeof outputName !== 'string' || !isSafePathSegment(outputName)) {
    return {
      ok: false,
      reason: 'invalid_output_name',
      error: `Invalid deliverable output filename: "${outputName}"`
    };
  }
  if (!templatePath || typeof templatePath !== 'string' || !fs.existsSync(templatePath) || !fs.statSync(templatePath).isFile()) {
    return { ok: false, reason: 'template_not_found', error: `Template not found: ${templatePath}` };
  }

  const tplContent = fs.readFileSync(templatePath, 'utf8');
  const missingFields = [];

  const filledContent = tplContent.replace(/\{\{([A-Za-z0-9_.-]+)\}\}/g, (_, key) => {
    const rawVal = Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;
    // Reject boolean true/false from value-less CLI flags like --REQUESTER
    if (typeof rawVal === 'string' && rawVal.trim() !== '') {
      return rawVal.trim();
    }
    if (typeof rawVal === 'number' && !Number.isNaN(rawVal)) {
      return String(rawVal);
    }
    missingFields.push(key);
    return `⚠️ [會議未提及 - 需人工補填: ${key}]`;
  });

  const deliverablesDir = path.resolve(meetingDir, 'deliverables');
  ensureDir(deliverablesDir);
  const outPath = path.resolve(deliverablesDir, outputName);
  if (!outPath.startsWith(deliverablesDir + path.sep)) {
    return { ok: false, reason: 'invalid_output_name', error: 'Path traversal detected in outputName.' };
  }

  fs.writeFileSync(outPath, filledContent, 'utf8');

  return {
    ok: true,
    outputPath: outPath,
    missingFields
  };
}

/**
 * Extract both structured (`- **Key**: Value`) AND natural-language prose facts
 * (such as 上線日 / 預算 / 負責人 / Launch Date / Budget) to detect cross-meeting conflicts.
 */
function extractKeyFacts(mdContent, sourceLabel) {
  const facts = {};
  const lines = String(mdContent).split(/\r?\n/);
  const factRegex = /(?:^|[-*]\s+)\*\*([^*:：]{2,20})\*\*[:：]\s*([^\r\n]+)/;
  const ignoreKeys = new Set([
    '專案名稱',
    '會議日期',
    '會議主題',
    '與會者名單',
    '原始媒體檔案',
    '媒體 SHA-256',
    '鎖定語言',
    '工具互動模式',
    '管理 CLI'
  ]);

  const normalizeFactKey = (k) => {
    if (/上線日|launch\s*date/i.test(k)) return '預計上線日';
    if (/預算|budget/i.test(k)) return '預算';
    return k;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNum = i + 1;

    // 1. Structured `- **Key**: Value` (strip trailing parenthetical source/line citations before comparison)
    const m = rawLine.match(factRegex);
    if (m) {
      const rawKey = m[1].trim();
      const val = m[2]
        .replace(/\s*(?:\([^()\r\n]*#L\d+[^()\r\n]*\)|（[^（）\r\n]*#L\d+[^（）\r\n]*）|\((?:來源|来源|見|见|參見|参见|source|see)[\s:：].*?\)|（(?:來源|来源|見|见|參見|参见)[\s:：].*?）)\s*$/i, '')
        .trim();
      if (!ignoreKeys.has(rawKey) && val && !val.startsWith('{{')) {
        const key = normalizeFactKey(rawKey);
        facts[key] = { value: val, line: lineNum, source: sourceLabel };
      }
    }

    // 2. Natural-language prose: 上線日 / 上线日 / Launch Date (zh-TW, zh-CN, en)
    const launchMatch =
      rawLine.match(/(?:預計|预计)?(?:上線日|上线日)(?:期)?(?:鎖定在|锁定在|鎖定為|锁定为|定在|定為|定为|改為|改为|延後到|延后到|延後至|延后至|延至|調整至|调整至|調整為|调整为|為|为|是|[:：]\s*)\s*([0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}|[0-9]{1,2}\/[0-9]{1,2}|[0-9]{1,2}月[0-9]{1,2}日)/) ||
      rawLine.match(/launch\s+date(?:\s+is|\s+was)?(?:\s+set\s+to|\s+locked\s+at|\s+changed\s+to|\s+moved\s+to|\s+delayed\s+to|[:：]\s*)\s*([0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}|[0-9]{1,2}\/[0-9]{1,2}|[A-Za-z]+\s+\d{1,2})/i);
    if (launchMatch) {
      facts['預計上線日'] = { value: launchMatch[1].trim(), line: lineNum, source: sourceLabel };
    }

    // 3. Natural-language prose: 預算 / 预算 / Budget (zh-TW, zh-CN, en)
    const budgetMatch =
      rawLine.match(/(?:預算|预算)(?:金額|金额|上限)?(?:鎖定在|锁定在|鎖定為|锁定为|定在|定為|定为|改為|改为|調整為|调整为|調整至|调整至|增加到|提高到|降為|降为|為|为|是|[:：]\s*)\s*([0-9.,]+\s*(?:萬|万|億|亿|元|k|K|M|USD|TWD|NTD)?)/) ||
      rawLine.match(/budget(?:\s+is|\s+was)?(?:\s+set\s+to|\s+locked\s+at|\s+changed\s+to|\s+increased\s+to|\s+reduced\s+to|[:：]\s*)\s*(\$?[0-9.,]+\s*(?:k|K|M|USD|TWD)?)/i);
    if (budgetMatch) {
      facts['預算'] = { value: budgetMatch[1].trim(), line: lineNum, source: sourceLabel };
    }
  }
  return facts;
}

/**
 * Deterministically inspect a single meeting folder (Post-Creation Inspection Rule)
 * and check for cross-meeting conflicts against sibling meetings / index.md in the same project.
 * Note: `ok` is true ONLY when structure is valid AND there are zero unresolved human-intervention
 * items (⚠️ / 🚨 / SPEAKER_XX) AND zero unresolved cross-meeting conflicts (⚡).
 */
function inspectMeetingDirectory(meetingDir) {
  if (!meetingDir || !fs.existsSync(meetingDir) || !fs.statSync(meetingDir).isDirectory()) {
    return {
      ok: false,
      exists: false,
      structureOk: false,
      needsHumanReview: false,
      meetingDir,
      missingFiles: ['01-transcript.md', '02-summary.md', '03-todos-and-discussion.md'],
      uncitedItems: [],
      verifyIssues: [],
      humanInterventionItems: [],
      conflicts: []
    };
  }

  const requiredFiles = ['01-transcript.md', '02-summary.md', '03-todos-and-discussion.md'];
  const missingFiles = requiredFiles.filter((f) => !fs.existsSync(path.join(meetingDir, f)));
  const humanInterventionItems = [];
  const conflicts = [];
  const uncitedItems = [];
  const verifyIssues = [];

  const projectDir = path.dirname(meetingDir);
  const meetingsRoot = path.dirname(projectDir);
  const workspaceRoot = path.basename(meetingsRoot) === 'meetings'
    ? path.dirname(meetingsRoot)
    : projectDir;

  for (const fname of requiredFiles) {
    const fpath = path.join(meetingDir, fname);
    if (!fs.existsSync(fpath)) continue;
    verifyIssues.push(...verifyFile(fpath, workspaceRoot));
    const content = fs.readFileSync(fpath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/⚠️\s*\[(需人為確認|待確認語者|會議未提及)[^\]]*\]/.test(line) || /\bSPEAKER_\d+\b/.test(line)) {
        humanInterventionItems.push({
          file: fname,
          line: i + 1,
          text: line.trim()
        });
      }
      if (fname === '02-summary.md' && /^\s*-\s+(?:🟢|🟡|🔴|\*\*決議)/.test(line)) {
        if (!/#L\d+/.test(line)) {
          uncitedItems.push({
            file: fname,
            line: i + 1,
            text: line.trim()
          });
        }
      }
    }
  }

  // Also scan deliverables/*.md for ⚠️ [會議未提及 - 需人工補填] and verify their #Lx-Ly citations
  const deliverablesDir = path.join(meetingDir, 'deliverables');
  if (fs.existsSync(deliverablesDir)) {
    for (const df of fs.readdirSync(deliverablesDir)) {
      if (!df.endsWith('.md')) continue;
      const dfPath = path.join(deliverablesDir, df);
      verifyIssues.push(...verifyFile(dfPath, workspaceRoot));
      const dLines = fs.readFileSync(dfPath, 'utf8').split(/\r?\n/);
      for (let i = 0; i < dLines.length; i++) {
        if (/⚠️\s*\[(需人為確認|待確認語者|會議未提及)[^\]]*\]/.test(dLines[i])) {
          humanInterventionItems.push({
            file: `deliverables/${df}`,
            line: i + 1,
            text: dLines[i].trim()
          });
        }
      }
    }
  }

  // Cross-meeting conflict check against earlier meetings and index.md in the same project folder
  const currentFolder = path.basename(meetingDir);
  const currentSummaryPath = path.join(meetingDir, '02-summary.md');

  if (fs.existsSync(currentSummaryPath) && fs.existsSync(projectDir)) {
    const currentFacts = extractKeyFacts(fs.readFileSync(currentSummaryPath, 'utf8'), `${currentFolder}/02-summary.md`);
    const baselineFacts = {};

    const siblings = fs.readdirSync(projectDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== 'templates' && d.name < currentFolder)
      .map((d) => d.name)
      .sort();

    for (const sib of siblings) {
      const sibSummary = path.join(projectDir, sib, '02-summary.md');
      if (fs.existsSync(sibSummary)) {
        Object.assign(baselineFacts, extractKeyFacts(fs.readFileSync(sibSummary, 'utf8'), `${sib}/02-summary.md`));
      }
    }

    // Active rolling snapshot in index.md takes precedence over older superseded meetings
    const indexPath = path.join(projectDir, 'index.md');
    if (fs.existsSync(indexPath)) {
      Object.assign(baselineFacts, extractKeyFacts(fs.readFileSync(indexPath, 'utf8'), 'index.md'));
    }

    for (const [key, curr] of Object.entries(currentFacts)) {
      if (baselineFacts[key] && baselineFacts[key].value !== curr.value) {
        conflicts.push({
          key,
          currentValue: curr.value,
          currentRef: `${curr.source}#L${curr.line}`,
          previousValue: baselineFacts[key].value,
          previousRef: `${baselineFacts[key].source}#L${baselineFacts[key].line}`
        });
      }
    }
  }

  const structureOk = missingFiles.length === 0 && uncitedItems.length === 0 && verifyIssues.length === 0;
  const needsHumanReview = humanInterventionItems.length > 0 || conflicts.length > 0;

  return {
    ok: structureOk && !needsHumanReview,
    structureOk,
    needsHumanReview,
    meetingDir,
    missingFiles,
    uncitedItems,
    verifyIssues,
    humanInterventionItems,
    conflicts
  };
}

module.exports = {
  getMediaMetadata,
  applySpeakerMapping,
  createMeeting,
  generateDeliverableFromTemplate,
  extractKeyFacts,
  inspectMeetingDirectory
};
