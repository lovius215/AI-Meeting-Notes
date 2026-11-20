'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { ensureDir, getLocalDateString, saveSafeBackup, computeTranscriptHash, runGit } = require('./utils');
const { verifyFile } = require('./verify');

let meetingCreationSeq = 0;

function formatDurationHMS(totalSeconds) {
  if (typeof totalSeconds !== 'number' || !Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return null;
  }
  const rounded = Math.round(totalSeconds);
  const hrs = Math.floor(rounded / 3600);
  const mins = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Zero-dependency media duration prober:
 * 1. Parses RIFF/WAVE (.wav) chunks dynamically (properly skipping JUNK/LIST/INFO/bext/fact chunks before/after fmt & data).
 * 2. Optionally invokes `ffprobe` if installed on the system for .mp3/.m4a/.mp4/.mov/.mkv/etc.
 */
function probeMediaDurationSeconds(filePath, fileSize) {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const riffHeader = Buffer.alloc(12);
      const readRiff = fs.readSync(fd, riffHeader, 0, 12, 0);
      if (
        readRiff >= 12 &&
        riffHeader.toString('ascii', 0, 4) === 'RIFF' &&
        riffHeader.toString('ascii', 8, 12) === 'WAVE'
      ) {
        let offset = 12;
        let byteRate = 0;
        let dataSize = 0;
        const chunkHeader = Buffer.alloc(8);
        let guard = 0;

        while (offset + 8 <= fileSize && guard < 256) {
          guard++;
          const r = fs.readSync(fd, chunkHeader, 0, 8, offset);
          if (r < 8) break;
          const chunkId = chunkHeader.toString('ascii', 0, 4);
          const chunkSize = chunkHeader.readUInt32LE(4);
          const payloadOffset = offset + 8;

          if (chunkId === 'fmt ' && chunkSize >= 16 && payloadOffset + 12 <= fileSize) {
            const fmtBuf = Buffer.alloc(12);
            if (fs.readSync(fd, fmtBuf, 0, 12, payloadOffset) >= 12) {
              byteRate = fmtBuf.readUInt32LE(8);
            }
          } else if (chunkId === 'data') {
            dataSize = Math.min(chunkSize, Math.max(0, fileSize - payloadOffset));
          }

          if (byteRate > 0 && dataSize > 0) {
            return Math.round((dataSize / byteRate) * 100) / 100;
          }

          // RIFF chunks are word-aligned (even byte boundary)
          const step = 8 + chunkSize + (chunkSize % 2);
          if (step <= 8) break;
          offset += step;
        }
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch (_) {}

  try {
    const res = spawnSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    if (res.status === 0 && res.stdout) {
      const parsed = parseFloat(res.stdout.trim());
      if (Number.isFinite(parsed) && parsed >= 0) {
        return Math.round(parsed * 100) / 100;
      }
    }
  } catch (_) {}

  return null;
}

/**
 * Compute SHA-256 checksum, file size, and optional duration of a media file using 64 KiB streaming chunks
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
  const durationSeconds = probeMediaDurationSeconds(filePath, stat.size);
  return {
    fileName: path.basename(filePath),
    sizeBytes: stat.size,
    sha256: hash.digest('hex'),
    durationSeconds,
    durationFormatted: formatDurationHMS(durationSeconds)
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
  const cleanedText = String(transcriptText).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const rawLines = cleanedText.split('\n');
  const normalizedLines = [];
  let activeTimestamp = null;
  let inVttHeader = false;

  const tsLineRegex = /^((?:\d{2}:)?\d{2}:\d{2})[.,]\d{3}\s*-->\s*(?:\d{2}:)?\d{2}:\d{2}[.,]\d{3}(?:\s+.*)?$/;

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i].trim();
    if (!line) {
      activeTimestamp = null;
      inVttHeader = false;
      continue;
    }
    if (/^WEBVTT(?:\s|$|-)/i.test(line)) {
      inVttHeader = true;
      continue;
    }
    if (/^(?:NOTE|STYLE|REGION)(?:\s|$)/i.test(line)) {
      inVttHeader = true;
      continue;
    }
    if (inVttHeader && !tsLineRegex.test(line)) {
      const nextLine = (rawLines[i + 1] || '').trim();
      if (!tsLineRegex.test(nextLine)) {
        continue;
      }
      inVttHeader = false;
    }
    // Only skip a cue sequence number or cue identifier if we are NOT inside an active cue
    // and the very next line is a timestamp line (so numeric dialogue like "500000" is never stripped!)
    if (activeTimestamp === null && !tsLineRegex.test(line)) {
      const nextLine = (rawLines[i + 1] || '').trim();
      if (tsLineRegex.test(nextLine)) {
        continue;
      }
    }
    // Match SRT/VTT timestamp line: either HH:MM:SS.mmm or MM:SS.mmm (with comma or dot, and optional cue settings)
    const tsMatch = line.match(tsLineRegex);
    if (tsMatch) {
      activeTimestamp = normalizeTimestamp(tsMatch[1]);
      inVttHeader = false;
      continue;
    }

    // Convert WebVTT voice tags `<v SPEAKER_00>text</v>` or `<v.loud SPEAKER_00>text` into `SPEAKER_00: text`
    line = line
      .replace(/<v(?:\.[^>\s]+)*\s+([^>]+)>([\s\S]*?)(?:<\/v>|$)/gi, '$1: $2')
      .replace(/<\/?(?:v|c|b|i|u|ruby|rt)(?:\.[^>\s]+)*>/gi, '')
      .trim();
    if (!line) continue;

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
        `(?:\\*\\*)?(?<![A-Za-z0-9_])(${speakerEntries.map(([k]) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![A-Za-z0-9_])(?:\\*\\*)?`,
        'g'
      )
    : null;

  for (let idx = 0; idx < normalizedLines.length; idx++) {
    let line = normalizedLines[idx];

    // 1. Single-pass terminology replacement
    if (termRegex) {
      line = line.replace(termRegex, (matched) => termMap.get(matched) ?? matched);
    }

    // 2. Single-pass speaker replacement (supports both ASCII SPEAKER_00 and Unicode/CJK labels like 語者A / 發言人1 without double-bolding)
    if (speakerRegex) {
      line = line.replace(speakerRegex, (_, rawKey) => `**${speakerMap.get(rawKey)}**`);
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

function isValidCalendarDate(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    return false;
  }
  const [y, m, d] = dateStr.trim().split('-').map((n) => parseInt(n, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function isSubPath(parentDir, childPath) {
  const rel = path.relative(path.resolve(parentDir), path.resolve(childPath));
  return Boolean(rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function extractActionItemsFromLines(mappedLines, firstContentLine, transcriptTotalLines, hasRealTranscript) {
  const actionRegex = /(?:待辦|待办|TODO|Action\s*Item|請\s*[^，,。：:\s]{2,12}\s*(?:於|在|負責|负责|處理|处理|協助|协助|提供|準備|准备|完成|跟進|跟进)|由\s*[^，,。：:\s]{2,12}\s*(?:負責|负责|處理|处理|跟進|跟进|準備|准备|完成)|(?:我會|我会|我來|我来)(?:負責|负责|處理|处理|準備|准备|完成|跟進|跟进)|於\s*[^，,。\s]{2,15}\s*前(?:完成|提交|交付|提供)|I\s+will\s+(?:prepare|handle|send|update|fix|follow\s+up|complete)|action\s+item|宿題|対応する|할\s*일)/i;
  const suggestionRegex = /(?:建議|建议|可以考慮|可以考虑|或許可以|或许可以|不妨|\bsuggest\b|\bmaybe\s+we\s+should\b|\bcould\s+consider\b|提案ですが|제안)/i;
  const selfCommitRegex = /(?:我會|我会|我來|我来|由我|我負責|我负责|\bI\s+will\b|\bI'll\b|私が担当|제가\s*담당)/i;
  const extractedRows = [];

  if (hasRealTranscript && Array.isArray(mappedLines)) {
    for (let idx = 0; idx < mappedLines.length; idx++) {
      const raw = mappedLines[idx].trim();
      if (!raw || raw.includes('⚠️')) continue;
      if (!actionRegex.test(raw)) continue;

      const exactLine = firstContentLine + idx;
      const speakerMatch = raw.match(/\*\*([^*]+)\*\*/);
      const speakerName = speakerMatch ? speakerMatch[1].trim() : null;

      const isSuggestion = suggestionRegex.test(raw);
      const isSelfCommit = selfCommitRegex.test(raw);
      const assigneeMatch =
        raw.match(/(?:請|由)\s*([A-Za-z0-9_\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]{2,10}?)(?=\s*(?:於|在|負責|负责|處理|处理|協助|协助|提供|準備|准备|完成|跟進|跟进|提交|交付))/) ||
        raw.match(/(?:負責人|负责人|Owner|PIC|担当者|담당자)(?:為|为|是|[:：]|\s+)\s*([A-Za-z0-9_\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]{2,12})/);

      // Distinguish delegation vs self-commitment vs suggestion vs unassigned task:
      // NEVER blindly assign speakerName when no explicit delegation or self-commitment ("我會/我來/I will") is present!
      let semanticTag = '[待辦]';
      let owner = '待確認 (TBD)';
      if (isSuggestion) {
        semanticTag = '[建議 - 需確認]';
        if (assigneeMatch) {
          owner = assigneeMatch[1].replace(/(?:擔任|担任|負責|负责|處理|处理)+$/, '').trim() || '待確認 (TBD)';
        }
      } else if (assigneeMatch) {
        semanticTag = '[委派]';
        owner = assigneeMatch[1].replace(/(?:擔任|担任|負責|负责|處理|处理)+$/, '').trim() || '待確認 (TBD)';
      } else if (isSelfCommit && speakerName) {
        semanticTag = '[承諾]';
        owner = speakerName;
      }

      const dueMatch = raw.match(/([0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}|[0-9]{1,2}\/[0-9]{1,2}|[0-9]{1,2}月[0-9]{1,2}日|下週[一二三四五六日]?|本週[一二三四五六日]?|下周[一二三四五六日]?|本周[一二三四五六日]?|Friday|Monday|Tuesday|Wednesday|Thursday)/i);
      const dueDate = dueMatch ? dueMatch[1].trim() : '待確認 (TBD)';

      const cleanTask = raw
        .replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '')
        .replace(/^\*\*[^*]+\*\*[:：]\s*/, '')
        .replace(/\|/g, '｜')
        .trim();

      const hasBothOwnerAndDue = owner !== '待確認 (TBD)' && dueDate !== '待確認 (TBD)';
      const badge = isSuggestion
        ? '🟡 建議事項（未拍板）'
        : (hasBothOwnerAndDue ? '🟢 已溯源至逐字稿' : '🟡 待確認負責人/期限 (TBD)');
      const aiId = `AI-${String(extractedRows.length + 1).padStart(2, '0')}`;
      extractedRows.push(
        `| ${aiId} | ${semanticTag} ${cleanTask} | ${owner} | ${dueDate} | ${badge} | [01-transcript.md](./01-transcript.md#L${exactLine}) | ⏳ Pending |`
      );
    }
  }

  if (extractedRows.length === 0) {
    const todoRiskBadge = hasRealTranscript ? '🟡 待確認負責人 (TBD)' : '🔴 ⚠️ [需人為確認 - 無逐字稿來源]';
    extractedRows.push(
      `| AI-01 | 確認本次會議待辦事項與負責人 | 待確認 (TBD) | 待確認 (TBD) | ${todoRiskBadge} | [01-transcript.md](./01-transcript.md#L${firstContentLine}-L${transcriptTotalLines}) | ⏳ Pending |`
    );
  }
  return extractedRows;
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
  date = getLocalDateString(),
  attendees = [],
  mediaFile = null,
  transcriptFile = null,
  transcriptText = '',
  mapping = {},
  terms = {},
  allowEmpty = false,
  force = false,
  forceAll = false
} = {}) {
  // 1. Validate calendar date format (strictly real YYYY-MM-DD, rejecting 2026-02-31 or 2026-13-45) & prevent path traversal
  if (!isValidCalendarDate(date)) {
    return {
      ok: false,
      reason: 'invalid_date',
      error: `Invalid calendar date "${date}". Expected a valid YYYY-MM-DD date.`
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

  if (!isSubPath(meetingsRoot, projectDir) || !isSubPath(projectDir, meetingDir)) {
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
  const hadExistingTranscript = fs.existsSync(transcriptPath);
  if (hadExistingTranscript && !force && !forceAll) {
    return {
      ok: false,
      reason: 'meeting_already_exists',
      error: `Meeting transcript already exists at ${transcriptPath}. Pass --force to overwrite (a .bak backup will be saved).`
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
        `- **原始媒體檔案**：[${mediaMeta.fileName}](./media/${mediaMeta.fileName}) (${mediaMeta.sizeBytes} bytes${mediaMeta.durationFormatted ? `, 時長: ${mediaMeta.durationFormatted}` : ''})`,
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
  const transcriptSha256 = computeTranscriptHash(transcriptMd);
  const createdAtIso = `${new Date().toISOString()}-${String(++meetingCreationSeq).padStart(6, '0')}`;
  const metaComment = `<!-- meeting-date: ${cleanDate} | created-at: ${createdAtIso} | transcript-sha256: ${transcriptSha256} -->`;

  if (hadExistingTranscript && (force || forceAll)) {
    saveSafeBackup(transcriptPath, transcriptMd);
  }
  fs.writeFileSync(transcriptPath, transcriptMd, 'utf8');

  // 6. Create 02-summary.md (BUG-001: separate formal decision bullets 🟢 from general transcript excerpts 📝;
  // by default --force only overwrites 01-transcript.md unless --force-all is passed, and always uses saveSafeBackup before overwriting)
  const decisionRegex = /(?:決議|决议|決定|决定|拍板|定案|上線日|上线日|預算|预算|負責人|负责人|同意|通過|通过|launch\s+date|budget|owner|decided|agreed|リリース日|予算|担当者|決定|출시일|예산|담당자|결정)/i;
  const nonDecisionRegex = /(?:如果|假如|假設|假设|是否|討論是否|讨论是否|被否決|被否决|否決|否决|維持現狀|维持现状|維持原案|维持原案|[\?？])/;
  const decisionBullets = [];
  const excerptBullets = [];
  let verifiedLineCount = 0;

  if (hasRealTranscript) {
    for (let idx = 0; idx < mapped.lines.length; idx++) {
      const lineText = mapped.lines[idx].trim();
      if (!lineText || lineText.includes('⚠️')) continue;
      verifiedLineCount++;
      const exactLine = firstContentLine + idx;
      const isDecisionLine = decisionRegex.test(lineText) && !nonDecisionRegex.test(lineText);
      if (isDecisionLine) {
        decisionBullets.push(`- 🟢 ${lineText}（來源：[01-transcript.md](./01-transcript.md#L${exactLine})）`);
      }
      // General transcript excerpts use neutral 📝 instead of 🟢 so normal discussion is never mistaken for a formal decision
      excerptBullets.push(`- 📝 ${lineText}（來源：[01-transcript.md](./01-transcript.md#L${exactLine})）`);
    }
  }

  const maxExcerpts = 10;
  const shownExcerpts = excerptBullets.slice(0, maxExcerpts);
  const isTruncatedExcerpts = excerptBullets.length > maxExcerpts;
  const excerptHeading = isTruncatedExcerpts
    ? `## 逐字稿節錄 (Transcript Excerpts — 僅節錄前 ${shownExcerpts.length}/${verifiedLineCount} 句，完整決議需由 AI 或人工提煉)`
    : '## 逐字稿節錄 (Transcript Excerpts)';

  if (decisionBullets.length === 0) {
    const fallbackBadge = hasRealTranscript ? '🟡' : '🔴 ⚠️ [需人為確認 - 尚未匯入逐字稿]';
    decisionBullets.push(
      `- ${fallbackBadge} **待提煉決議**：尚無明確決議關鍵句，請由 AI 或人工從下方逐字稿節錄提煉（來源：[01-transcript.md](./01-transcript.md#L${firstContentLine}-L${transcriptTotalLines})）。`
    );
  }

  const summaryBadge = hasRealTranscript ? '🟢' : '🔴 ⚠️ [需人為確認 - 尚未匯入逐字稿]';
  const riskLegendLine = hasRealTranscript
    ? '\n> **風險標記定義**：`🟢 已溯源決議`（具備 `#Lx-Ly` 行號依據之決議句；若來源為 ASR 初稿，關鍵數字仍建議對照原音複核）｜`📝 一般逐字稿節錄`（非正式決議）｜`🟡 上下文推論 / 待確認`｜`🔴 高不確定性需人為介入`\n'
    : '';
  const summaryMd = `# 02. 會議摘要與重點決議 (${safeProject} - ${cleanDate})
${riskLegendLine}
## 執行摘要 (Executive Summary)
- ${summaryBadge} 本次 **${safeProject}**（${title}）共記錄 ${hasRealTranscript ? mapped.lines.length : 0} 句對話（決議句 ${decisionBullets.filter((b) => b.startsWith('- 🟢')).length} 條，逐字稿節錄 ${verifiedLineCount} 句，待確認 ${mapped.uncertaintyFlags.length} 項；來源：[01-transcript.md](./01-transcript.md#L${firstContentLine}-L${transcriptTotalLines})）。

## 核心討論重點與決議 (Key Points & Decisions)
${decisionBullets.join('\n')}

${excerptHeading}
${shownExcerpts.length > 0 ? shownExcerpts.join('\n') : `- ${summaryBadge} 詳見 [01-transcript.md](./01-transcript.md#L${firstContentLine}-L${transcriptTotalLines})`}
${metaComment}
`;
  const summaryPath = path.join(meetingDir, '02-summary.md');
  const staleFiles = [];
  if (!fs.existsSync(summaryPath) || forceAll) {
    if (fs.existsSync(summaryPath) && forceAll) {
      saveSafeBackup(summaryPath, summaryMd);
    }
    fs.writeFileSync(summaryPath, summaryMd, 'utf8');
  } else {
    const existingSum = fs.readFileSync(summaryPath, 'utf8');
    const sumHashMatch = existingSum.match(/transcript-sha256:\s*([0-9a-f]{8,64})/i);
    if (sumHashMatch && sumHashMatch[1] !== transcriptSha256) {
      staleFiles.push('02-summary.md');
    }
  }

  // 7. Create 03-todos-and-discussion.md (extract real action items from transcript; preserved on --force unless --force-all is passed)
  const uncertaintySection = mapped.uncertaintyFlags.length > 0
    ? mapped.uncertaintyFlags.map((u, idx) => `- 🚨 **[需人為確認 #${idx + 1}]** (${u.type}): \`${u.preview}\``).join('\n')
    : '- 無高不確定性待確認項目。';

  const actionItemRows = extractActionItemsFromLines(
    mapped.lines,
    firstContentLine,
    transcriptTotalLines,
    hasRealTranscript
  );

  const todosMd = `# 03. 待辦事項與會後延伸討論 (${safeProject} - ${cleanDate})

## 待辦事項清單 (Action Items)

| 編號 | 待辦事項 | 負責人 (Owner) | 期限 (Due Date) | 風險等級 | 來源引用 | 狀態 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${actionItemRows.join('\n')}

## 🚨 需人為介入與風險確認清單 (Human Intervention Required)
${uncertaintySection}

## ⚡ 跨期會議衝突提醒 (Cross-Meeting Conflict Alerts)
- 尚未偵測到與過往會議決議衝突之項目。

## 會後延伸討論區 (Post-Meeting Discussion)
- 可於此處與 AI 持續針對會議決議與待辦進行延伸討論並回寫紀錄。
${metaComment}
`;
  const todosPath = path.join(meetingDir, '03-todos-and-discussion.md');
  if (!fs.existsSync(todosPath) || forceAll) {
    if (fs.existsSync(todosPath) && forceAll) {
      saveSafeBackup(todosPath, todosMd);
    }
    fs.writeFileSync(todosPath, todosMd, 'utf8');
  } else {
    const existingTodos = fs.readFileSync(todosPath, 'utf8');
    const todosHashMatch = existingTodos.match(/transcript-sha256:\s*([0-9a-f]{8,64})/i);
    if (todosHashMatch && todosHashMatch[1] !== transcriptSha256) {
      staleFiles.push('03-todos-and-discussion.md');
    }
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
    staleFiles,
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
  values = {},
  force = false
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
  if (!isSubPath(deliverablesDir, outPath)) {
    return { ok: false, reason: 'invalid_output_name', error: 'Path traversal detected in outputName.' };
  }

  // BUG-002: Protect existing deliverable from accidental overwrite unless force: true (saving .bak backup)
  if (fs.existsSync(outPath)) {
    if (!force) {
      return {
        ok: false,
        reason: 'deliverable_already_exists',
        error: `Deliverable already exists at ${outPath}. Pass --force to overwrite (a .bak backup will be saved).`
      };
    }
    saveSafeBackup(outPath, filledContent);
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
    if (/上線日|上线日|launch\s*date|リリース日|公開日|ローンチ日|출시일|오픈일|런칭일/i.test(k)) return '預計上線日';
    if (/預算|预算|budget|予算|예산/i.test(k)) return '預算';
    if (/負責人|负责人|owner|pic|担当者|責任者|담당자|책임자/i.test(k)) return '負責人';
    return k;
  };

  const cleanCapturedValue = (v) =>
    String(v || '')
      .replace(
        /\s*(?:\((?:[^()\r\n]|\([^()\r\n]*\))*#L\d+(?:[^()\r\n]|\([^()\r\n]*\))*\)|（(?:[^（）\r\n]|\([^()\r\n]*\))*#L\d+(?:[^（）\r\n]|\([^()\r\n]*\))*）|(?:\(|（)[^()（）\r\n]*\[[^\]]*\]\([^()\r\n]*#L\d+[^()\r\n]*\)[^()（）\r\n]*(?:\)|）)|\((?:來源|来源|見|见|參見|参见|source|see)[\s:：].*?\)|（(?:來源|来源|見|见|參見|参见)[\s:：].*?）)\s*$/i,
        ''
      )
      .replace(/^[\s:：→\-*>]+|[\s，,。；;！!]+$/g, '')
      .trim();

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNum = i + 1;

    // Skip hypothetical questions, unconfirmed ⚠️ lines, conditional clauses, or rejected/status-quo proposals ("被否決，維持現狀") so they don't trigger false decision conflicts
    if (
      /⚠️|[\?？]/.test(rawLine) ||
      /(?:如果|假如|假設|假设|是否|討論是否|讨论是否|評估是否|评估是否|尚未決定|尚未决定|未決議|未决议|(?:^|[\s，,：:])若|\bif\b|\bwhether\b|\bwhat\s+if\b|もし|仮に|만약|혹시)/i.test(rawLine) ||
      /(?:被否決|被否决|否決|否决|不採納|不采纳|不通過|不通过|維持現狀|维持现状|維持原案|维持原案|維持不變|维持不变|駁回|驳回|取消該提案|取消该提案|\brejected\b|\bvoted\s+down\b|\bkeep\s+as\s+is\b|\bunchanged\b|却下|見送り|現状維持|기각|부결|현상\s*유지)/i.test(rawLine)
    ) {
      continue;
    }

    // Strip leading timestamp & speaker prefix (e.g. `- 🟢 [00:01:00] **王經理 (PM)**: `) and trailing source citations before prose matching
    const proseBody = cleanCapturedValue(
      rawLine.replace(/^\s*(?:[-*]\s*)?(?:(?:🟢|🟡|🔴)\s*)?(?:\[\d{2}:\d{2}:\d{2}\]\s*)?(?:\*\*[^*:：]+\*\*[:：]\s*)?(?=\S)/, '')
    );

    // 1. Structured `- **Key**: Value` (strip trailing parenthetical source/line citations before comparison)
    const m = rawLine.match(factRegex);
    if (m) {
      const rawKey = m[1].trim();
      let val = cleanCapturedValue(m[2]);
      // If value contains a transition arrow or "改為/改由/->", take the new value after the transition
      const arrowParts = val.split(/(?:(?:→|->)\s*)?(?:改為|改为|改由|調整為|调整为|調整至|调整至|延至|延後至|延后至|延後到|延后到|changed\s+to|moved\s+to|delayed\s+to)|(?:→|->)/i);
      if (arrowParts.length > 1 && arrowParts[arrowParts.length - 1].trim()) {
        val = cleanCapturedValue(arrowParts[arrowParts.length - 1]);
      }
      if (!ignoreKeys.has(rawKey) && val && !val.startsWith('{{')) {
        const key = normalizeFactKey(rawKey);
        facts[key] = { value: val, line: lineNum, source: sourceLabel };
      }
    }

    // 1b. Structured Markdown table row `| Key | Value |` (skipping table headers, separators, and AI-xx todo rows)
    const tableRowMatch = rawLine.match(/^\s*\|\s*([^|\r\n]{2,25}?)\s*\|\s*([^|\r\n]+?)\s*\|/);
    if (tableRowMatch) {
      const col1 = tableRowMatch[1].replace(/\*\*/g, '').trim();
      let col2 = cleanCapturedValue(tableRowMatch[2]);
      if (
        col1 &&
        col2 &&
        !/^:?-{2,}:?$/.test(col1) &&
        !/^:?-{2,}:?$/.test(col2) &&
        !/^(?:編號|编号|ID|項目|项目|欄位|栏位|Field|Key|階段|阶段|Stage|AI-\d+)$/i.test(col1) &&
        !ignoreKeys.has(col1) &&
        !col2.startsWith('{{')
      ) {
        const key = normalizeFactKey(col1);
        facts[key] = { value: col2, line: lineNum, source: sourceLabel };
      }
    }

    // 2. Natural-language prose: 上線日 / 上线日 / Launch Date / リリース日 / 출시일 (supports direct "上線日 12/01", verb phrases, and "12/01 → 改為 12/15")
    const dateToken = '([0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}|[0-9]{1,2}\\/[0-9]{1,2}|[0-9]{1,2}月[0-9]{1,2}日|[0-9]{1,2}월\\s*[0-9]{1,2}일|[A-Za-z]+\\s+\\d{1,2})';
    const launchTransition = proseBody.match(
      new RegExp(`(?:預計|预计)?(?:上線日|上线日|launch\\s+date|リリース日|公開日|ローンチ日|출시일|오픈일|런칭일)[^。；;\\r\\n]*?(?:(?:(?:→|->)\\s*)?(?:改為|改为|調整為|调整为|調整至|调整至|延至|延後至|延后至|延後到|延后到|changed\\s+to|moved\\s+to|delayed\\s+to)|(?:→|->))\\s*${dateToken}`, 'i')
    );
    const launchDirect =
      proseBody.match(new RegExp(`(?:預計|预计)?(?:上線日|上线日)(?:期)?(?:鎖定在|锁定在|鎖定為|锁定为|定在|定為|定为|改為|改为|延後到|延后到|延後至|延后至|延至|調整至|调整至|調整為|调整为|為|为|是|[:：]|\\s+)\\s*${dateToken}`)) ||
      proseBody.match(new RegExp(`launch\\s+date(?:\\s+is|\\s+was)?(?:\\s+set\\s+to|\\s+locked\\s+at|\\s+changed\\s+to|\\s+moved\\s+to|\\s+delayed\\s+to|[:：]|\\s+)\\s*${dateToken}`, 'i')) ||
      proseBody.match(new RegExp(`(?:リリース日|公開日|ローンチ日)(?:は|を|が|[:：]|\\s+)\\s*${dateToken}`)) ||
      proseBody.match(new RegExp(`(?:출시일|오픈일|런칭일)(?:은|는|을|를|이|가|[:：]|\\s+)\\s*${dateToken}`));
    const launchMatch = launchTransition || launchDirect;
    if (launchMatch) {
      facts['預計上線日'] = { value: cleanCapturedValue(launchMatch[1]), line: lineNum, source: sourceLabel };
    }

    // 3. Natural-language prose: 預算 / 预算 / Budget / 予算 / 예산 (supports "預算 50 萬", "預算改為 60 萬", "預算 50 萬→改為 60 萬"; longer multi-char units first)
    const budgetToken = '(\\$?[0-9.,]+\\s*(?:万円|億円|만원|억원|USD|TWD|NTD|JPY|KRW|萬|万|億|亿|元|円|원|만|k|K|M)?)';
    const budgetTransition = proseBody.match(
      new RegExp(`(?:預算|预算|budget|予算|예산)[^。；;\\r\\n]*?(?:(?:(?:→|->)\\s*)?(?:改為|改为|調整為|调整为|調整至|调整至|增加到|提高到|降為|降为|changed\\s+to|increased\\s+to|reduced\\s+to)|(?:→|->))\\s*${budgetToken}`, 'i')
    );
    const budgetDirect =
      proseBody.match(new RegExp(`(?:預算|预算)(?:金額|金额|上限|部分)?(?:鎖定在|锁定在|鎖定為|锁定为|定在|定為|定为|改為|改为|調整為|调整为|調整至|调整至|增加到|提高到|降為|降为|為|为|是|[:：]|\\s+)\\s*${budgetToken}`)) ||
      proseBody.match(new RegExp(`budget(?:\\s+is|\\s+was)?(?:\\s+set\\s+to|\\s+locked\\s+at|\\s+changed\\s+to|\\s+increased\\s+to|\\s+reduced\\s+to|[:：]|\\s+)\\s*${budgetToken}`, 'i')) ||
      proseBody.match(new RegExp(`予算(?:上限|金額)?(?:は|を|が|[:：]|\\s+)\\s*${budgetToken}`)) ||
      proseBody.match(new RegExp(`예산(?:은|는|을|를|이|가|[:：]|\\s+)\\s*${budgetToken}`));
    const budgetMatch = budgetTransition || budgetDirect;
    if (budgetMatch) {
      facts['預算'] = { value: cleanCapturedValue(budgetMatch[1]), line: lineNum, source: sourceLabel };
    }

    // 4. Natural-language prose: 負責人 / 负责人 / Owner / PIC / 担当者 / 담당자 (supports "負責人王經理", "負責人：王經理", "由王經理負責", "負責人王經理→改由李工程師", "改由李工程師負責")
    const personToken = '([A-Za-z0-9_\\u4e00-\\u9fa5\\u3040-\\u30ff\\uac00-\\ud7af]{2,15}(?:\\s*\\((?!來源|来源|見|见|source|see)[^()#\\r\\n]{1,15}\\))?)';
    const ownerTransition =
      proseBody.match(new RegExp(`(?:負責人|负责人|owner|pic|担当者|담당자)[^。；;\\r\\n]*?(?:(?:(?:→|->)\\s*)?(?:改為|改为|改由|換成|换成|換由|换由|changed\\s+to|reassigned\\s+to)|(?:→|->))\\s*${personToken}(?:負責|负责)?`, 'i')) ||
      proseBody.match(new RegExp(`(?:→|->)?\\s*(?:改由|換由|换由)\\s*${personToken}\\s*(?:負責|负责)`));
    const ownerDirect =
      proseBody.match(new RegExp(`(?:負責人|负责人)(?:鎖定為|锁定为|定為|定为|改為|改为|改由|為|为|是|[:：]|\\s+)?\\s*${personToken}`)) ||
      proseBody.match(new RegExp(`(?:由)\\s*${personToken}\\s*(?:擔任|担任)?(?:負責人|负责人|主責|主责|負責|负责)`)) ||
      proseBody.match(new RegExp(`(?:owner|pic)(?:\\s+is|\\s+was)?(?:\\s+set\\s+to|\\s+changed\\s+to|\\s+assigned\\s+to|[:：])\\s*${personToken}`, 'i')) ||
      proseBody.match(new RegExp(`(?:担当者|責任者)(?:は|を|が|[:：])\\s*${personToken}`)) ||
      proseBody.match(new RegExp(`(?:담당자|책임자)(?:은|는|을|를|이|가|[:：])\\s*${personToken}`));
    const ownerMatch = ownerTransition || ownerDirect;
    if (ownerMatch) {
      const candidateOwner = cleanCapturedValue(ownerMatch[1])
        .replace(/^(?:改由|改為|改为|換由|换由|換成|换成|為|为|是)\s*/, '')
        .replace(/(?:擔任|担任|負責|负责|處理|处理|接手|主導|主导|主責|主责|執行|执行)+$/, '')
        .trim();
      if (candidateOwner && !/^(?:待確認|待确认|TBD)$/i.test(candidateOwner)) {
        facts['負責人'] = { value: candidateOwner, line: lineNum, source: sourceLabel };
      }
    }
  }
  return facts;
}

function parseCanonicalBudget(val) {
  const s = String(val || '').replace(/,/g, '').trim();
  const m = s.match(/^(\$)?\s*([0-9]+(?:\.[0-9]+)?)\s*(万円|億円|만원|억원|USD|TWD|NTD|JPY|KRW|萬|万|億|亿|元|円|원|만|k|K|M)?$/i);
  if (!m) return null;
  const hasDollar = Boolean(m[1]);
  const num = parseFloat(m[2]);
  if (Number.isNaN(num)) return null;
  const unit = (m[3] || '').toLowerCase();
  let multiplier = 1;
  if (unit === '萬' || unit === '万' || unit === '万円' || unit === '만원' || unit === '만') {
    multiplier = 10000;
  } else if (unit === '億' || unit === '亿' || unit === '億円' || unit === '억원') {
    multiplier = 100000000;
  } else if (unit === 'k') {
    multiplier = 1000;
  } else if (unit === 'm') {
    multiplier = 1000000;
  }
  let currency = 'default';
  if (hasDollar || unit === 'usd') currency = 'usd';
  else if (unit === '万円' || unit === '億円' || unit === '円' || unit === 'jpy') currency = 'jpy';
  else if (unit === '만원' || unit === '억원' || unit === '원' || unit === '만' || unit === 'krw') currency = 'krw';
  return { amount: Math.round(num * multiplier * 100) / 100, currency };
}

function parseCanonicalDate(val) {
  const s = String(val || '').trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return { year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
  m = s.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (m) return { year: null, month: parseInt(m[1], 10), day: parseInt(m[2], 10) };
  m = s.match(/^(?:(\d{4})年\s*)?(\d{1,2})月\s*(\d{1,2})日$/);
  if (m) return { year: m[1] ? parseInt(m[1], 10) : null, month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
  m = s.match(/^(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일$/);
  if (m) return { year: m[1] ? parseInt(m[1], 10) : null, month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
  return null;
}

function areFactValuesEquivalent(key, valA, valB) {
  if (valA === valB) return true;
  if (key === '預算') {
    const bA = parseCanonicalBudget(valA);
    const bB = parseCanonicalBudget(valB);
    if (bA && bB && (bA.currency === bB.currency || bA.currency === 'default' || bB.currency === 'default')) {
      return bA.amount === bB.amount;
    }
  }
  if (key === '預計上線日') {
    const dA = parseCanonicalDate(valA);
    const dB = parseCanonicalDate(valB);
    if (dA && dB) {
      const sameYear = !dA.year || !dB.year || dA.year === dB.year;
      return sameYear && dA.month === dB.month && dA.day === dB.day;
    }
  }
  return false;
}

function parseMeetingChronology(folderName, summaryPath) {
  const folderDateMatch = String(folderName).match(/^(\d{4}-\d{2}-\d{2})/);
  let meetingDate = folderDateMatch ? folderDateMatch[1] : '0000-00-00';
  let createdAt = '';
  let mtimeMs = 0;

  if (summaryPath && fs.existsSync(summaryPath)) {
    try {
      const content = fs.readFileSync(summaryPath, 'utf8');
      const metaMatch = content.match(/<!--\s*meeting-date:\s*([0-9-]+)\s*\|\s*created-at:\s*([^\s|]+)/);
      if (metaMatch) {
        meetingDate = metaMatch[1];
        createdAt = metaMatch[2];
      }
      mtimeMs = fs.statSync(summaryPath).mtimeMs;
    } catch (_) {}
  }
  return { folderName, meetingDate, createdAt, mtimeMs };
}

function isEarlierMeeting(candChrono, currChrono) {
  if (candChrono.folderName === currChrono.folderName) return false;
  if (candChrono.meetingDate !== currChrono.meetingDate) {
    return candChrono.meetingDate < currChrono.meetingDate;
  }
  // Same calendar date: compare embedded created-at ISO timestamp if both have it and differ
  if (candChrono.createdAt && currChrono.createdAt && candChrono.createdAt !== currChrono.createdAt) {
    return candChrono.createdAt < currChrono.createdAt;
  }
  if (candChrono.mtimeMs && currChrono.mtimeMs && Math.abs(candChrono.mtimeMs - currChrono.mtimeMs) > 5) {
    return candChrono.mtimeMs < currChrono.mtimeMs;
  }
  return candChrono.folderName < currChrono.folderName;
}

/**
 * Deterministically inspect a single meeting folder (Post-Creation Inspection Rule)
 * and check for cross-meeting conflicts against sibling meetings / index.md in the same project.
 * Note: `ok` is true ONLY when structure is valid AND there are zero unresolved human-intervention
 * items (⚠️ / 🚨 / SPEAKER_XX / stale downstream files) AND zero unresolved cross-meeting conflicts (⚡).
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
      staleFiles: [],
      uncitedItems: [],
      verifyIssues: [],
      humanInterventionItems: [],
      conflicts: []
    };
  }

  const requiredFiles = ['01-transcript.md', '02-summary.md', '03-todos-and-discussion.md'];
  const missingFiles = requiredFiles.filter((f) => !fs.existsSync(path.join(meetingDir, f)));
  const staleFiles = [];
  const humanInterventionItems = [];
  const conflicts = [];
  const uncitedItems = [];
  const verifyIssues = [];

  const projectDir = path.dirname(meetingDir);
  const meetingsRoot = path.dirname(projectDir);
  const workspaceRoot = path.basename(meetingsRoot) === 'meetings'
    ? path.dirname(meetingsRoot)
    : projectDir;

  const transcriptPath = path.join(meetingDir, '01-transcript.md');
  const currentTranscriptHash = fs.existsSync(transcriptPath)
    ? computeTranscriptHash(fs.readFileSync(transcriptPath, 'utf8'))
    : null;

  for (const fname of requiredFiles) {
    const fpath = path.join(meetingDir, fname);
    if (!fs.existsSync(fpath)) continue;
    verifyIssues.push(...verifyFile(fpath, workspaceRoot));
    const content = fs.readFileSync(fpath, 'utf8');
    const lines = content.split(/\r?\n/);

    // Check if downstream 02-summary.md or 03-todos-and-discussion.md is stale after 01-transcript.md was updated via --force
    if (fname !== '01-transcript.md' && currentTranscriptHash) {
      const hashMatch = content.match(/transcript-sha256:\s*([0-9a-f]{8,64})/i);
      if (hashMatch && hashMatch[1] !== currentTranscriptHash) {
        staleFiles.push(fname);
        humanInterventionItems.push({
          file: fname,
          line: 1,
          type: 'stale_downstream',
          text: `⚠️ [逐字稿已更新 (Stale Transcript Hash: ${hashMatch[1]} -> ${currentTranscriptHash}) - 請重新檢視並更新 ${fname}]`
        });
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        /⚠️\s*\[[^\]]+\]/.test(line) ||
        /(?<![A-Za-z0-9_])(SPEAKER_\d+|Speaker\s+[A-Z0-9]+|(?:語者|發言人|发言人|話者|화자)\s*[A-Z0-9一二三四五六七八九十甲乙丙丁]+)(?![A-Za-z0-9_])/.test(line) ||
        /^\s*-\s+🔴/.test(line)
      ) {
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
      if (fname === '03-todos-and-discussion.md' && /^\s*\|\s*AI-\d+\s*\|/.test(line)) {
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
        if (/⚠️\s*\[[^\]]+\]/.test(dLines[i])) {
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
    const currChrono = parseMeetingChronology(currentFolder, currentSummaryPath);

    const siblings = fs.readdirSync(projectDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== 'templates' && d.name !== currentFolder)
      .map((d) => parseMeetingChronology(d.name, path.join(projectDir, d.name, '02-summary.md')))
      .filter((c) => isEarlierMeeting(c, currChrono))
      .sort((a, b) => (isEarlierMeeting(a, b) ? -1 : 1))
      .map((c) => c.folderName);

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
      if (baselineFacts[key] && !areFactValuesEquivalent(key, baselineFacts[key].value, curr.value)) {
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
    staleFiles,
    uncitedItems,
    verifyIssues,
    humanInterventionItems,
    conflicts
  };
}

function computeLineChangeRatio(oldText, newText) {
  const oldLines = String(oldText || '').replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  const newLines = String(newText || '').replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  const maxLen = Math.max(oldLines.length, newLines.length, 1);
  const oldCounts = new Map();
  for (const l of oldLines) {
    oldCounts.set(l, (oldCounts.get(l) || 0) + 1);
  }
  let matched = 0;
  for (const l of newLines) {
    const c = oldCounts.get(l) || 0;
    if (c > 0) {
      matched++;
      oldCounts.set(l, c - 1);
    }
  }
  return Math.max(0, Math.round((1 - matched / maxLen) * 1000) / 1000);
}

function findBaselineTranscriptText(transcriptPath) {
  const dir = path.dirname(transcriptPath);
  const base = path.basename(transcriptPath);
  const primaryBak = path.join(dir, `${base}.bak`);
  if (fs.existsSync(primaryBak)) {
    let latestBak = primaryBak;
    let seq = 1;
    while (fs.existsSync(path.join(dir, `${base}.bak.${seq}`))) {
      latestBak = path.join(dir, `${base}.bak.${seq}`);
      seq++;
    }
    return fs.readFileSync(latestBak, 'utf8');
  }
  const topRes = runGit(['rev-parse', '--show-toplevel'], dir);
  if (topRes.ok && topRes.stdout) {
    const relPath = path.relative(topRes.stdout, transcriptPath).split(path.sep).join('/');
    const gitRes = runGit(['show', `HEAD:${relPath}`], topRes.stdout);
    if (gitRes.ok && gitRes.stdout) {
      return gitRes.stdout;
    }
  }
  return null;
}

/**
 * Synchronize the recorded `transcript-sha256` metadata comment in downstream meeting files
 * (`02-summary.md`, `03-todos-and-discussion.md`) with the current `01-transcript.md` without
 * overwriting any human-edited prose. Blocks large (>5%) transcript rewrites or broken citations
 * unless `yes: true` (`--yes`) is explicitly provided.
 */
function syncTranscriptHash(meetingDir, { yes = false } = {}) {
  if (!meetingDir || !fs.existsSync(meetingDir) || !fs.statSync(meetingDir).isDirectory()) {
    return {
      ok: false,
      error: `Meeting directory does not exist: ${meetingDir}`
    };
  }
  const transcriptPath = path.join(meetingDir, '01-transcript.md');
  if (!fs.existsSync(transcriptPath) || !fs.statSync(transcriptPath).isFile()) {
    return {
      ok: false,
      error: `01-transcript.md not found in: ${meetingDir}`
    };
  }

  const currentTranscriptText = fs.readFileSync(transcriptPath, 'utf8');
  const currentHash = computeTranscriptHash(currentTranscriptText);

  const projectDir = path.dirname(meetingDir);
  const meetingsRoot = path.dirname(projectDir);
  const workspaceRoot = path.basename(meetingsRoot) === 'meetings'
    ? path.dirname(meetingsRoot)
    : projectDir;

  const downstreamNames = ['02-summary.md', '03-todos-and-discussion.md'];
  const brokenCitations = [];
  const affectedRefs = [];
  const citeLineRegex = /01-transcript\.md#L\d+(?:-L?\d+)?/g;

  for (const fname of downstreamNames) {
    const fpath = path.join(meetingDir, fname);
    if (!fs.existsSync(fpath) || !fs.statSync(fpath).isFile()) continue;

    const issues = verifyFile(fpath, workspaceRoot).filter(
      (i) => i.type === 'broken_lines' || i.type === 'broken_file'
    );
    brokenCitations.push(...issues);

    const lines = fs.readFileSync(fpath, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const matches = lines[i].match(citeLineRegex);
      if (matches) {
        affectedRefs.push({ file: fname, line: i + 1, refs: matches });
      }
    }
  }

  const baselineText = findBaselineTranscriptText(transcriptPath);
  const changeRatio = baselineText !== null ? computeLineChangeRatio(baselineText, currentTranscriptText) : null;

  if (!yes && brokenCitations.length > 0) {
    return {
      ok: false,
      reason: 'broken_citations',
      changeRatio,
      brokenCitations,
      affectedRefs,
      error: `Refusing to sync-hash: ${brokenCitations.length} citation(s) in downstream files point to invalid or out-of-range lines in 01-transcript.md. Fix citations first or pass --yes to override.`
    };
  }

  if (!yes && changeRatio !== null && changeRatio > 0.05) {
    const pct = Math.round(changeRatio * 100);
    return {
      ok: false,
      reason: 'confirmation_required',
      changeRatio,
      brokenCitations,
      affectedRefs,
      error: `Refusing to sync-hash without --yes: 01-transcript.md changed by ~${pct}% (>5%), which may shift ${affectedRefs.length} #Lx-Ly citation(s). Review citations and re-run with --yes (or --force-all to regenerate).`
    };
  }

  const updatedFiles = [];
  const alreadySyncedFiles = [];
  const hashTokenRegex = /(transcript-sha256:\s*)([0-9a-f]{8,64})/i;

  for (const fname of downstreamNames) {
    const fpath = path.join(meetingDir, fname);
    if (!fs.existsSync(fpath) || !fs.statSync(fpath).isFile()) continue;

    const content = fs.readFileSync(fpath, 'utf8');
    const match = content.match(hashTokenRegex);
    if (match) {
      if (match[2] === currentHash) {
        alreadySyncedFiles.push(fname);
        continue;
      }
      const updated = content.replace(hashTokenRegex, `$1${currentHash}`);
      fs.writeFileSync(fpath, updated, 'utf8');
      updatedFiles.push(fname);
    } else {
      const separator = content.endsWith('\n') ? '' : '\n';
      const updated = `${content}${separator}<!-- transcript-sha256: ${currentHash} -->\n`;
      fs.writeFileSync(fpath, updated, 'utf8');
      updatedFiles.push(fname);
    }
  }

  return {
    ok: true,
    meetingDir,
    transcriptSha256: currentHash,
    updatedFiles,
    alreadySyncedFiles,
    changeRatio,
    affectedRefs,
    brokenCitations
  };
}

module.exports = {
  getMediaMetadata,
  applySpeakerMapping,
  createMeeting,
  generateDeliverableFromTemplate,
  extractKeyFacts,
  inspectMeetingDirectory,
  syncTranscriptHash
};
