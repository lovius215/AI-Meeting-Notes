'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ensureDir } = require('./utils');

/**
 * Compute SHA-256 checksum and file size of a media file
 */
function getMediaMetadata(filePath) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return null;
  }
  const stat = fs.statSync(filePath);
  const hash = crypto.createHash('sha256');
  const buf = fs.readFileSync(filePath);
  hash.update(buf);
  return {
    fileName: path.basename(filePath),
    sizeBytes: stat.size,
    sha256: hash.digest('hex')
  };
}

/**
 * Parse .srt / .vtt / plain text rough transcript and deterministically apply
 * speaker & terminology mapping without LLM Output Token re-generation.
 */
function applySpeakerMapping({ transcriptText = '', mapping = {}, terms = {} } = {}) {
  const rawLines = String(transcriptText).replace(/\r\n/g, '\n').split('\n');
  const normalizedLines = [];
  let pendingTimestamp = null;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line || line === 'WEBVTT' || /^\d+$/.test(line)) {
      continue;
    }
    // Match SRT/VTT timestamp line: 00:01:23,456 --> 00:01:28,000
    const tsMatch = line.match(/^(\d{2}:\d{2}:\d{2})[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/);
    if (tsMatch) {
      pendingTimestamp = tsMatch[1];
      continue;
    }
    if (pendingTimestamp) {
      normalizedLines.push(`[${pendingTimestamp}] ${line}`);
      pendingTimestamp = null;
    } else {
      normalizedLines.push(line);
    }
  }

  const unmappedSpeakers = new Set();
  const uncertaintyFlags = [];
  const outputLines = [];

  for (let idx = 0; idx < normalizedLines.length; idx++) {
    let line = normalizedLines[idx];

    // Replace terminology errors first
    for (const [wrongTerm, rightTerm] of Object.entries(terms)) {
      if (wrongTerm && line.includes(wrongTerm)) {
        line = line.split(wrongTerm).join(rightTerm);
      }
    }

    // Replace mapped speakers (e.g. SPEAKER_00 -> 王經理 (PM))
    for (const [speakerId, realName] of Object.entries(mapping)) {
      if (speakerId && realName) {
        const escaped = speakerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'g');
        line = line.replace(regex, `**${realName}**`);
      }
    }

    // Detect remaining unmapped SPEAKER_XX or Speaker A/B tokens
    const unknownMatch = line.match(/\b(SPEAKER_\d+|Speaker\s+[A-Z0-9]+)\b/);
    if (unknownMatch) {
      const unk = unknownMatch[1];
      unmappedSpeakers.add(unk);
      line = line.replace(unk, `⚠️ [待確認語者: ${unk}]`);
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

/**
 * Create or update a periodic meeting folder under meetings/<project>/<date>_<title>/
 */
function createMeeting({
  cwd = process.cwd(),
  project = 'Project-A',
  title = 'Weekly-Sync',
  date = new Date().toISOString().slice(0, 10),
  attendees = [],
  mediaFile = null,
  transcriptText = '',
  mapping = {},
  terms = {}
} = {}) {
  const safeProject = project.replace(/[<>:"/\\|?*]/g, '-').trim() || 'Project-A';
  const safeTitle = title.replace(/[<>:"/\\|?*\s]+/g, '-').trim() || 'Meeting';
  const folderName = `${date}_${safeTitle}`;

  const projectDir = path.join(cwd, 'meetings', safeProject);
  const templatesDir = path.join(projectDir, 'templates');
  const meetingDir = path.join(projectDir, folderName);
  const mediaDir = path.join(meetingDir, 'media');
  const deliverablesDir = path.join(meetingDir, 'deliverables');

  ensureDir(mediaDir);
  ensureDir(deliverablesDir);
  ensureDir(templatesDir);

  // 1. Copy media file into meetings/<project>/<date>_<title>/media/ if provided
  let mediaMeta = null;
  if (mediaFile) {
    const srcMedia = path.isAbsolute(mediaFile) ? mediaFile : path.join(cwd, mediaFile);
    if (fs.existsSync(srcMedia) && fs.statSync(srcMedia).isFile()) {
      const destMedia = path.join(mediaDir, path.basename(srcMedia));
      if (path.resolve(srcMedia) !== path.resolve(destMedia)) {
        fs.copyFileSync(srcMedia, destMedia);
      }
      mediaMeta = getMediaMetadata(destMedia);
    }
  }

  // 2. Process transcript with 0-Token batch mapping
  const defaultTranscript = transcriptText || '[00:00:05] **主持人**：會議開始，確認專案進度與待辦事項。';
  const mapped = applySpeakerMapping({ transcriptText: defaultTranscript, mapping, terms });

  const mediaHeader = mediaMeta
    ? `- **原始媒體檔案**：[${mediaMeta.fileName}](./media/${mediaMeta.fileName}) (${mediaMeta.sizeBytes} bytes)\n- **媒體 SHA-256**：\`${mediaMeta.sha256}\``
    : '- **原始媒體檔案**：無外部影音檔（純文字紀錄）';

  const attendeeList = attendees.length > 0
    ? attendees.join(', ')
    : (Object.values(mapping).length > 0 ? Object.values(mapping).join(', ') : '與會團隊');

  const transcriptMd = `# 01. 語者分離逐字稿 (${safeProject} - ${date})

- **專案名稱**：${safeProject}
- **會議日期**：${date}
- **會議主題**：${title}
- **與會者名單**：${attendeeList}
${mediaHeader}

## 逐字稿內容

${mapped.lines.join('\n')}
`;
  const transcriptPath = path.join(meetingDir, '01-transcript.md');
  fs.writeFileSync(transcriptPath, transcriptMd, 'utf8');

  const transcriptTotalLines = transcriptMd.replace(/\r?\n$/, '').split(/\r?\n/).length;
  const firstContentLine = Math.min(11, transcriptTotalLines);

  // 3. Create 02-summary.md with valid #Lx-Ly citation to 01-transcript.md
  const summaryMd = `# 02. 會議摘要與重點決議 (${safeProject} - ${date})

## 執行摘要 (Executive Summary)
- 🟢 本次會議針對 **${safeProject}**（${title}）進行進度同步與決議確認（來源：[01-transcript.md](./01-transcript.md#L${firstContentLine}-L${transcriptTotalLines})）。

## 核心討論重點與決議 (Key Points & Decisions)
- 🟢 **決議事項 1**：確認本次會議核心討論脈絡（來源：[01-transcript.md](./01-transcript.md#L${firstContentLine}-L${transcriptTotalLines})）。
`;
  const summaryPath = path.join(meetingDir, '02-summary.md');
  if (!fs.existsSync(summaryPath)) {
    fs.writeFileSync(summaryPath, summaryMd, 'utf8');
  }

  // 4. Create 03-todos-and-discussion.md with valid #Lx-Ly citations and Human-in-the-Loop section
  const uncertaintySection = mapped.uncertaintyFlags.length > 0
    ? mapped.uncertaintyFlags.map((u, idx) => `- 🚨 **[需人為確認 #${idx + 1}]** (${u.type}): \`${u.preview}\``).join('\n')
    : '- 無高不確定性待確認項目。';

  const todosMd = `# 03. 待辦事項與會後延伸討論 (${safeProject} - ${date})

## 待辦事項清單 (Action Items)

| 編號 | 待辦事項 | 負責人 (Owner) | 期限 (Due Date) | 風險等級 | 來源引用 | 狀態 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| AI-01 | 追蹤本次會議決議執行進度 | 待確認 (TBD) | 待確認 (TBD) | 🟢 已驗證事實 | [01-transcript.md](./01-transcript.md#L${firstContentLine}-L${transcriptTotalLines}) | ⏳ Pending |

## 🚨 需人為介入與風險確認清單 (Human Intervention Required)
${uncertaintySection}

## ⚡ 跨期會議衝突提醒 (Cross-Meeting Conflict Alerts)
- 尚未偵測到與過往會議決議衝突之項目。

## 會後延伸討論區 (Post-Meeting Discussion)
- 可於此處與 AI 持續針對會議決議與待辦進行延伸討論並回寫紀錄。
`;
  const todosPath = path.join(meetingDir, '03-todos-and-discussion.md');
  if (!fs.existsSync(todosPath)) {
    fs.writeFileSync(todosPath, todosMd, 'utf8');
  }

  // 5. Ensure project-level index.md rolling snapshot exists and lists this meeting
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

  // 6. Create default sample template in meetings/<project>/templates/change-request.md if missing
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
    mediaMeta,
    mapped
  };
}

/**
 * Generate a post-meeting deliverable from a template without hallucinating missing fields.
 * Any {{FIELD}} not provided in `values` is automatically marked with
 * `⚠️ [會議未提及 - 需人工補填: FIELD]` so zero unfilled `{{...}}` placeholders remain!
 */
function generateDeliverableFromTemplate({
  meetingDir,
  templatePath,
  outputName = 'deliverable.md',
  values = {}
} = {}) {
  if (!fs.existsSync(templatePath)) {
    return { ok: false, error: `Template not found: ${templatePath}` };
  }
  const tplContent = fs.readFileSync(templatePath, 'utf8');
  const missingFields = [];

  const filledContent = tplContent.replace(/\{\{([A-Za-z0-9_.-]+)\}\}/g, (_, key) => {
    if (Object.prototype.hasOwnProperty.call(values, key) && values[key] !== undefined && values[key] !== null && String(values[key]).trim() !== '') {
      return String(values[key]);
    }
    missingFields.push(key);
    return `⚠️ [會議未提及 - 需人工補填: ${key}]`;
  });

  const deliverablesDir = path.join(meetingDir, 'deliverables');
  ensureDir(deliverablesDir);
  const outPath = path.join(deliverablesDir, outputName);
  fs.writeFileSync(outPath, filledContent, 'utf8');

  return {
    ok: true,
    outputPath: outPath,
    missingFields
  };
}

/**
 * Extract key-value baseline facts (such as 上線日 / 預算 / 決議 / 負責人 / Launch Date / Budget)
 * from markdown files to deterministically detect cross-meeting conflicts.
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

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(factRegex);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim();
      if (!ignoreKeys.has(key) && val && !val.startsWith('{{')) {
        facts[key] = {
          value: val,
          line: i + 1,
          source: sourceLabel
        };
      }
    }
  }
  return facts;
}

/**
 * Deterministically inspect a single meeting folder (Post-Creation Inspection Rule)
 * and check for cross-meeting conflicts against sibling meetings / index.md in the same project.
 */
function inspectMeetingDirectory(meetingDir) {
  const requiredFiles = ['01-transcript.md', '02-summary.md', '03-todos-and-discussion.md'];
  const missingFiles = requiredFiles.filter((f) => !fs.existsSync(path.join(meetingDir, f)));
  const humanInterventionItems = [];
  const conflicts = [];
  const uncitedItems = [];

  for (const fname of requiredFiles) {
    const fpath = path.join(meetingDir, fname);
    if (!fs.existsSync(fpath)) continue;
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

  // Cross-meeting conflict check against earlier meetings and index.md in the same project folder
  const projectDir = path.dirname(meetingDir);
  const currentFolder = path.basename(meetingDir);
  const currentSummaryPath = path.join(meetingDir, '02-summary.md');

  if (fs.existsSync(currentSummaryPath) && fs.existsSync(projectDir)) {
    const currentFacts = extractKeyFacts(fs.readFileSync(currentSummaryPath, 'utf8'), `${currentFolder}/02-summary.md`);
    const baselineFacts = {};

    // Read project index.md baseline
    const indexPath = path.join(projectDir, 'index.md');
    if (fs.existsSync(indexPath)) {
      Object.assign(baselineFacts, extractKeyFacts(fs.readFileSync(indexPath, 'utf8'), 'index.md'));
    }

    // Read earlier sibling meeting folders sorted chronologically
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

  return {
    ok: missingFiles.length === 0 && uncitedItems.length === 0,
    meetingDir,
    missingFiles,
    uncitedItems,
    humanInterventionItems,
    conflicts
  };
}

module.exports = {
  getMediaMetadata,
  applySpeakerMapping,
  createMeeting,
  generateDeliverableFromTemplate,
  inspectMeetingDirectory
};
