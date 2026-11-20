'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { ensureDir, readConfig } = require('./utils');
const { t } = require('./i18n');
const { resolveTargets } = require('./verify');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatInlineMarkdown(text) {
  let out = escapeHtml(text);
  // Inline code
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Checkboxes
  out = out.replace(/^\[x\]\s+/i, '☑️ ');
  out = out.replace(/^\[\s\]\s+/, '⬜ ');
  // Links
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

/**
 * Lightweight 0-Token Markdown to HTML converter (Zero external dependencies)
 */
function markdownToHtmlBody(md) {
  const lines = md.split(/\r?\n/);
  const html = [];
  let inCodeBlock = false;
  let codeBuffer = [];
  let inList = false;
  let inTable = false;
  let tableHeaderDone = false;

  const closeOpenBlocks = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
    if (inTable) {
      html.push('</tbody></table>');
      inTable = false;
      tableHeaderDone = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // Fenced code blocks
    if (/^\s*```/.test(raw)) {
      closeOpenBlocks();
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBuffer = [];
      } else {
        inCodeBlock = false;
        html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(raw);
      continue;
    }

    // Table rows
    if (/^\s*\|.*\|\s*$/.test(raw)) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      const cells = raw
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim());

      // Check if separator line like | :--- | :--- |
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) {
        continue;
      }

      if (!inTable) {
        inTable = true;
        tableHeaderDone = false;
        html.push('<table><thead><tr>');
        for (const c of cells) {
          html.push(`<th>${formatInlineMarkdown(c)}</th>`);
        }
        html.push('</tr></thead><tbody>');
        tableHeaderDone = true;
      } else if (tableHeaderDone) {
        html.push('<tr>');
        for (const c of cells) {
          html.push(`<td>${formatInlineMarkdown(c)}</td>`);
        }
        html.push('</tr>');
      }
      continue;
    } else if (inTable) {
      html.push('</tbody></table>');
      inTable = false;
      tableHeaderDone = false;
    }

    // Headings
    const hMatch = raw.match(/^(#{1,6})\s+(.*)$/);
    if (hMatch) {
      closeOpenBlocks();
      const level = hMatch[1].length;
      html.push(`<h${level}>${formatInlineMarkdown(hMatch[2])}</h${level}>`);
      continue;
    }

    // Blockquote
    if (/^\s*>\s*(.*)$/.test(raw)) {
      closeOpenBlocks();
      const qText = raw.replace(/^\s*>\s*/, '');
      html.push(`<blockquote>${formatInlineMarkdown(qText)}</blockquote>`);
      continue;
    }

    // Horizontal rule
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(raw)) {
      closeOpenBlocks();
      html.push('<hr/>');
      continue;
    }

    // List items
    const listMatch = raw.match(/^\s*(?:[-*+]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      if (!inList) {
        inList = true;
        html.push('<ul>');
      }
      html.push(`<li>${formatInlineMarkdown(listMatch[1])}</li>`);
      continue;
    } else if (inList && raw.trim() === '') {
      html.push('</ul>');
      inList = false;
      continue;
    }

    if (raw.trim() === '') {
      continue;
    }

    html.push(`<p>${formatInlineMarkdown(raw)}</p>`);
  }

  closeOpenBlocks();
  if (inCodeBlock) {
    html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
  }

  return html.join('\n');
}

function buildA4HtmlDocument(sections, title = 'Document') {
  const bodyHtml = sections
    .map((sec, idx) => {
      const pageBreak = idx > 0 ? '<div class="page-break"></div>' : '';
      return `${pageBreak}\n<section class="doc-section">\n${markdownToHtmlBody(sec.content)}\n</section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: A4;
      margin: 18mm 16mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", "Hiragino Sans", "Malgun Gothic", sans-serif;
      font-size: 11pt;
      line-height: 1.65;
      color: #1f2937;
      margin: 0;
      padding: 0;
    }
    h1, h2, h3, h4 {
      color: #111827;
      margin-top: 1.2em;
      margin-bottom: 0.5em;
      page-break-after: avoid;
    }
    h1 { font-size: 20pt; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; }
    h2 { font-size: 15pt; border-bottom: 1px solid #f3f4f6; padding-bottom: 4px; }
    h3 { font-size: 12.5pt; }
    p, li { margin: 0.4em 0; }
    code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      background: #f3f4f6;
      padding: 2px 5px;
      border-radius: 4px;
      font-size: 9.5pt;
    }
    pre {
      background: #1f2937;
      color: #f9fafb;
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      page-break-inside: avoid;
    }
    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
    }
    blockquote {
      border-left: 4px solid #3b82f6;
      background: #eff6ff;
      margin: 0.8em 0;
      padding: 8px 14px;
      color: #1e3a8a;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1em 0;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 7px 10px;
      text-align: left;
      font-size: 10pt;
    }
    th {
      background: #f9fafb;
      font-weight: 600;
    }
    .page-break {
      page-break-before: always;
    }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

function findBrowserExecutable() {
  if (process.env.GENAITOOL_BROWSER_BIN && fs.existsSync(process.env.GENAITOOL_BROWSER_BIN)) {
    return process.env.GENAITOOL_BROWSER_BIN;
  }

  const platform = os.platform();
  const candidates = [];

  if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    );
  } else if (platform === 'win32') {
    const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
    const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA || '';
    candidates.push(
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    );
  } else {
    const linuxBins = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'];
    for (const bin of linuxBins) {
      const whichRes = spawnSync('which', [bin], { encoding: 'utf8' });
      if (whichRes.status === 0 && whichRes.stdout.trim()) {
        return whichRes.stdout.trim();
      }
    }
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function convertHtmlToPdf(htmlPath, pdfPath) {
  // 1. Try Headless Chrome / Edge with isolated --user-data-dir
  const browserBin = findBrowserExecutable();
  if (browserBin) {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genaitool-chrome-profile-'));
    try {
      const fileUrl = pathToFileURL(htmlPath).href;
      const args = [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--no-pdf-header-footer',
        `--user-data-dir=${userDataDir}`,
        `--print-to-pdf=${pdfPath}`,
        fileUrl
      ];
      const res = spawnSync(browserBin, args, { encoding: 'utf8', timeout: 30000 });
      if (res.status === 0 && fs.existsSync(pdfPath)) {
        return { ok: true, engine: 'headless-browser', binary: browserBin };
      }
    } finally {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  // 2. Try wkhtmltopdf
  const wkCheck = spawnSync(os.platform() === 'win32' ? 'where' : 'which', ['wkhtmltopdf'], { encoding: 'utf8' });
  if (wkCheck.status === 0 && wkCheck.stdout.trim()) {
    const wkBin = wkCheck.stdout.trim().split(/\r?\n/)[0];
    const res = spawnSync(wkBin, ['--page-size', 'A4', '--encoding', 'utf-8', htmlPath, pdfPath], {
      encoding: 'utf8',
      timeout: 30000
    });
    if (res.status === 0 && fs.existsSync(pdfPath)) {
      return { ok: true, engine: 'wkhtmltopdf', binary: wkBin };
    }
  }

  // 3. Try macOS cupsfilter
  if (os.platform() === 'darwin' && fs.existsSync('/usr/sbin/cupsfilter')) {
    const res = spawnSync('/usr/sbin/cupsfilter', [htmlPath], {
      encoding: 'buffer',
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000
    });
    if (res.status === 0 && res.stdout && res.stdout.length > 0) {
      fs.writeFileSync(pdfPath, res.stdout);
      return { ok: true, engine: 'cupsfilter', binary: '/usr/sbin/cupsfilter' };
    }
  }

  return { ok: false };
}

function runPdf({ cwd = process.cwd(), target = null, flags = {} } = {}) {
  const cfg = readConfig(cwd);
  const lang = cfg.lang;

  console.log(t(lang, 'pdfStart'));

  const files = resolveTargets(cwd, target);
  if (files.length === 0) {
    const msg = `No markdown files found for PDF export in ${cwd}`;
    console.error(msg);
    return { ok: false, error: msg };
  }

  const shouldMerge = Boolean(flags.merge) || (files.length === 1 && Boolean(flags.output));
  const htmlOnly = Boolean(flags.html);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genaitool-pdf-html-'));

  try {
    if (shouldMerge || files.length === 1) {
      const sections = files.map((f) => ({
        file: f,
        content: fs.readFileSync(f, 'utf8')
      }));
      const ext = htmlOnly ? '.html' : '.pdf';
      const defaultOutName = files.length === 1
        ? path.basename(files[0], '.md') + ext
        : `project-merged${ext}`;
      const outPath = flags.output
        ? (path.isAbsolute(flags.output) ? flags.output : path.join(cwd, flags.output))
        : path.join(cwd, defaultOutName);
      ensureDir(path.dirname(outPath));

      const htmlContent = buildA4HtmlDocument(sections, path.basename(outPath, ext));
      if (htmlOnly) {
        fs.writeFileSync(outPath, htmlContent, 'utf8');
        console.log(t(lang, 'pdfSuccess', outPath));
        return { ok: true, outputs: [outPath], engine: 'html' };
      }

      const htmlPath = path.join(tmpDir, 'merged.html');
      fs.writeFileSync(htmlPath, htmlContent, 'utf8');

      const conv = convertHtmlToPdf(htmlPath, outPath);
      if (!conv.ok) {
        console.error(t(lang, 'pdfNoEngine'));
        return { ok: false, reason: 'no_engine' };
      }

      console.log(t(lang, 'pdfSuccess', outPath));
      return { ok: true, outputs: [outPath], engine: conv.engine };
    } else {
      const outputs = [];
      for (const f of files) {
        const ext = htmlOnly ? '.html' : '.pdf';
        const outPath = path.join(path.dirname(f), path.basename(f, '.md') + ext);
        const htmlContent = buildA4HtmlDocument(
          [{ file: f, content: fs.readFileSync(f, 'utf8') }],
          path.basename(f, '.md')
        );
        if (htmlOnly) {
          fs.writeFileSync(outPath, htmlContent, 'utf8');
          outputs.push(outPath);
          console.log(t(lang, 'pdfSuccess', outPath));
          continue;
        }

        const htmlPath = path.join(tmpDir, path.basename(f, '.md') + '.html');
        fs.writeFileSync(htmlPath, htmlContent, 'utf8');

        const conv = convertHtmlToPdf(htmlPath, outPath);
        if (!conv.ok) {
          console.error(t(lang, 'pdfNoEngine'));
          return { ok: false, reason: 'no_engine' };
        }
        outputs.push(outPath);
        console.log(t(lang, 'pdfSuccess', outPath));
      }
      return { ok: true, outputs, engine: htmlOnly ? 'html' : undefined };
    }
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

module.exports = {
  runPdf,
  markdownToHtmlBody,
  buildA4HtmlDocument,
  findBrowserExecutable
};
