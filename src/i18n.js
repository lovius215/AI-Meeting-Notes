'use strict';

const { DEFAULT_LANG, SUPPORTED_LANGS, CLI_NAME, PACKAGE_NAME } = require('./config');

const DICT = {
  'zh-TW': {
    langName: '繁體中文 (zh-TW)',
    banner: `${PACKAGE_NAME} (${CLI_NAME}) — 零依賴 AI Agent 工作台與工具母機`,
    selectLangPrompt: '請選擇專案鎖定語言 / Please select project language (1-5):',
    invalidLang: (lang) => `不支援的語系 "${lang}"。支援語系：${SUPPORTED_LANGS.join(', ')}`,
    initSuccess: (dir, lang, mode, features = { git: true, pdf: true, html: true, npm: true, hideSkillsRules: true }) => `✅ 工作區初始化完成！
  - 目錄：${dir}
  - 鎖定語系：${lang}
  - 預設模式：${mode}

🧰 已配置功能（這些功能之後都可以隨時透過指令或對話補上）：
  • Git 版本控制與安全歸檔：${features.git ? '✅ 已啟用' : '⏸️ 未啟用（--no-git）'}
  • 0-Token A4 PDF 匯出：${features.pdf ? '✅ 已啟用' : '⏸️ 未啟用（--no-pdf）'}
  • HTML 報告匯出：${features.html ? '✅ 已啟用' : '⏸️ 未啟用（--no-html）'}（${CLI_NAME} pdf --html）
  • npm 套件發布結構：${features.npm ? `✅ 已啟用（skills/rules ${features.hideSkillsRules ? '隱藏於 .' + CLI_NAME + '/ [OpenSpec 作法]' : '顯示於根目錄'}）` : '⏸️ 未啟用（僅本機工作區，--no-npm）'}

🤖 ${mode === 'conversational'
      ? `建議會議整理流程（免指令純自然語言對話 / meetings/ 目錄已就緒）：
  1. 直接在 AI 對話視窗拖入錄音 (.mp3/.m4a)、錄影 (.mp4) 或文字（或執行 ${CLI_NAME} new-meeting <專案> <主題>）
  2. AI 自動建立 meetings/<專案>/<YYYY-MM-DD_主題>/ 並產出 01-transcript.md、02-summary.md、03-todos-and-discussion.md
  3. 自動執行完稿檢核 Rule（回報 🟢/🟡/🔴 風險、🚨 需人為介入確認清單與 ⚡ 跨期會議衝突提醒）
  4. 會後可隨時針對會議延伸討論，或套用 meetings/<專案>/templates/ 範本產出衍生文件至 deliverables/
  5. 驗證與匯出：${CLI_NAME} verify meetings / ${CLI_NAME} inspect <會議目錄> / ${CLI_NAME} pdf meetings --merge`
      : `建議開發流程（請在 AI 對話視窗操作）：
  1. 先打開 project/01-spec.md、02-workflow.md（或 project/index.md）把您的需求與流程填入
  2. 輸入 tool:propose (gtp) -> 請 AI 審查檢查需求並給予補充想法
  3. 輸入 tool:analyze  (gta) -> 起草完整規格與規則
  4. ${features.npm ? '輸入 tool:scaffold (gts) -> 原地組裝可發布的 npm 套件，並執行 npm test 測試整個 AI 工具流程！' : '完成規格後即可直接測試整個 AI 工具的對話與產出流程！'}
  5. 驗證與歸檔：${CLI_NAME} verify / ${CLI_NAME} pdf --merge / ${CLI_NAME} commit`}`,
    gitInitDone: '✅ 已初始化本機 Git 儲存庫 (git init)',
    gitAlreadyExists: 'ℹ️ 已偵測到現有 Git 儲存庫',
    verifyStart: '🔍 開始執行 0-Token 防幻覺與完整性檢查 (verify)...',
    verifyPass: '✅ 驗證通過！所有文件皆無未填寫佔位符，且所有來源引用真實有效。',
    verifyFail: (count) => `❌ 驗證未通過，共發現 ${count} 項問題：`,
    unfilledPlaceholder: (file, line, token) => `[未填寫佔位符] ${file}:${line} -> 發現未替換模板標記 ${token}`,
    brokenRefFile: (file, line, ref) => `[無效檔案引用] ${file}:${line} -> 找不到來源檔案 ${ref}`,
    brokenRefLines: (file, line, ref, maxLine) => `[無效行號引用] ${file}:${line} -> 引用 ${ref} 超出檔案實際行數 (共 ${maxLine} 行)`,
    commitStart: '📦 準備執行歸檔與安全 Git 同步 (commit)...',
    commitVerifyFailed: '⛔ 歸檔前 verify 檢查未通過，已中止 commit。請先修正上述問題。',
    commitConflictDetected: '⚠️ 偵測到 Git 合併衝突！為保護檔案完整性，CLI 已安全停止（嚴禁自動刪除 <<<<<<< 衝突標記）。請交由 AI 進行語意合併或人工處理以下衝突檔案：',
    commitIndexUpdated: '✅ 已更新 project/index.md 狀態表',
    commitExcludedSensitive: (files) => `🔒 已自動排除敏感設定檔：${files.join(', ')}`,
    commitSuccess: (hash) => `✅ 本機 Git commit 完成 (${hash})`,
    commitNothing: 'ℹ️ 工作區沒有需要提交的變更。',
    commitPushSuccess: '✅ 已成功同步至遠端 Git 儲存庫 (pull --no-rebase + push)',
    pdfStart: '📄 開始執行 0-Token Markdown 轉 A4 PDF...',
    pdfSuccess: (out) => `✅ PDF 產出成功：${out}`,
    pdfNoEngine: '❌ 找不到可用的本機 PDF 轉換引擎（需要 Chrome / Edge / Chromium / wkhtmltopdf / macOS cupsfilter）。',
    upgradeStart: (lang) => `🔄 開始執行無損升級 (upgrade)，保留現有專案語系：${lang}...`,
    upgradeDryRun: 'ℹ️ [Dry-Run 模式] 以下為預計更新的項目（未實際寫入磁碟）：',
    upgradeDone: '✅ 工作區無損升級完成！（已保留 <claude-mem-context> 與現有產出文件）',
    statusTitle: '📊 專案狀態與健康度報告',
    checkPass: '✅ 所有核心工作區檔案與結構檢查通過！',
    checkFail: (missing) => `❌ 缺少以下必要檔案或目錄：${missing.join(', ')}`,
    scaffoldStart: (name, mode, out) => `🚀 正在產出新 npm AI 工具套件 [${name}] (模式: ${mode}) -> ${out}`,
    scaffoldDone: (out, mode) => mode === 'conversational'
      ? `✅ 免指令對話式 npm AI 工具套件已產出於：${out}\n💡 此工具本身即為完整可發布的 npm 套件（含 package.json 與 publish.yml），使用者安裝並 init 後無需輸入任何 CLI 指令，直接開啟 AI 對話即可開始（例如：「幫我規劃東京五日遊」）。`
      : `✅ 新 npm AI CLI 工具專案已產出於：${out}\n💡 可直接進入該目錄執行 npm test 或發布至 npm！`,
    buildVerifyFailed: '⛔ 組裝前 verify 檢查未通過，請先填寫完 project/ 中的 {{...}} 佔位符並修正問題。',
    buildStart: (pkg, cli, mode, out) => `🔨 正在將工作區規格組裝為可發布的 npm 套件 [${pkg}] (CLI: ${cli}, 模式: ${mode}) -> ${out}`,
    buildDone: (out, pkg, cli) => `✅ npm 套件組裝完成 (${pkg} / ${cli})！\n  - 目錄：${out}\n  - 已產出：package.json, bin/cli.js, src/, scripts/, .github/workflows/publish.yml, 5 語系 README`,
    packSuccess: (pkg) => `📦 [${pkg}] npm pack 封裝驗證通過！隨時可透過 GitHub Release 自動發布或執行 npm publish --access public。`
  },
  'zh-CN': {
    langName: '简体中文 (zh-CN)',
    banner: `${PACKAGE_NAME} (${CLI_NAME}) — 零依赖 AI Agent 工作台与工具母机`,
    selectLangPrompt: '请选择项目锁定语言 / Please select project language (1-5):',
    invalidLang: (lang) => `不支持的语系 "${lang}"。支持语系：${SUPPORTED_LANGS.join(', ')}`,
    initSuccess: (dir, lang, mode, features = { git: true, pdf: true, html: true, npm: true, hideSkillsRules: true }) => `✅ 工作区初始化完成！
  - 目录：${dir}
  - 锁定语系：${lang}
  - 默认模式：${mode}

🧰 已配置功能（这些功能之后都可以随时通过指令或对话补上）：
  • Git 版本控制与安全归档：${features.git ? '✅ 已启用' : '⏸️ 未启用（--no-git）'}
  • 0-Token A4 PDF 导出：${features.pdf ? '✅ 已启用' : '⏸️ 未启用（--no-pdf）'}
  • HTML 报告导出：${features.html ? '✅ 已启用' : '⏸️ 未启用（--no-html）'}（${CLI_NAME} pdf --html）
  • npm 套件发布结构：${features.npm ? `✅ 已启用（skills/rules ${features.hideSkillsRules ? '隐藏于 .' + CLI_NAME + '/ [OpenSpec 做法]' : '显示于根目录'}）` : '⏸️ 未启用（仅本地工作区，--no-npm）'}

🤖 建议开发流程（请在 AI 对话窗口操作）：
  1. 先打开 project/01-spec.md、02-workflow.md（或 project/index.md）把您的需求与流程填入
  2. 输入 tool:propose (gtp) -> 请 AI 审查检查需求并给予补充想法
  3. 输入 tool:analyze  (gta) -> 起草完整规格与规则
  4. ${features.npm ? '输入 tool:scaffold (gts) -> 原地组装可发布的 npm 套件，并执行 npm test 测试整个 AI 工具流程！' : '完成规格后即可直接测试整个 AI 工具的对话与产出流程！'}
  5. 验证与归档：${CLI_NAME} verify / ${CLI_NAME} pdf --merge / ${CLI_NAME} commit`,
    gitInitDone: '✅ 已初始化本地 Git 仓库 (git init)',
    gitAlreadyExists: 'ℹ️ 已检测到现有 Git 仓库',
    verifyStart: '🔍 开始执行 0-Token 防幻觉与完整性检查 (verify)...',
    verifyPass: '✅ 验证通过！所有文档均无未填写占位符，且所有来源引用真实有效。',
    verifyFail: (count) => `❌ 验证未通过，共发现 ${count} 项问题：`,
    unfilledPlaceholder: (file, line, token) => `[未填写占位符] ${file}:${line} -> 发现未替换模板标记 ${token}`,
    brokenRefFile: (file, line, ref) => `[无效文件引用] ${file}:${line} -> 找不到来源文件 ${ref}`,
    brokenRefLines: (file, line, ref, maxLine) => `[无效行号引用] ${file}:${line} -> 引用 ${ref} 超出文件实际行数 (共 ${maxLine} 行)`,
    commitStart: '📦 准备执行归档与安全 Git 同步 (commit)...',
    commitVerifyFailed: '⛔ 归档前 verify 检查未通过，已中止 commit。请先修正上述问题。',
    commitConflictDetected: '⚠️ 检测到 Git 合并冲突！为保护文件完整性，CLI 已安全停止（严禁自动删除 <<<<<<< 冲突标记）。请交由 AI 进行语义合并或人工处理以下冲突文件：',
    commitIndexUpdated: '✅ 已更新 project/index.md 状态表',
    commitExcludedSensitive: (files) => `🔒 已自动排除敏感配置文件：${files.join(', ')}`,
    commitSuccess: (hash) => `✅ 本地 Git commit 完成 (${hash})`,
    commitNothing: 'ℹ️ 工作区没有需要提交的变更。',
    commitPushSuccess: '✅ 已成功同步至远程 Git 仓库 (pull --no-rebase + push)',
    pdfStart: '📄 开始执行 0-Token Markdown 转 A4 PDF...',
    pdfSuccess: (out) => `✅ PDF 产出成功：${out}`,
    pdfNoEngine: '❌ 找不到可用的本地 PDF 转换引擎（需要 Chrome / Edge / Chromium / wkhtmltopdf / macOS cupsfilter）。',
    upgradeStart: (lang) => `🔄 开始执行无损升级 (upgrade)，保留现有项目语系：${lang}...`,
    upgradeDryRun: 'ℹ️ [Dry-Run 模式] 以下为预计更新的项目（未实际写入磁盘）：',
    upgradeDone: '✅ 工作区无损升级完成！（已保留 <claude-mem-context> 与现有产出文档）',
    statusTitle: '📊 项目状态与健康度报告',
    checkPass: '✅ 所有核心工作区文件与结构检查通过！',
    checkFail: (missing) => `❌ 缺少以下必要文件或目录：${missing.join(', ')}`,
    scaffoldStart: (name, mode, out) => `🚀 正在产出新 npm AI 工具套件 [${name}] (模式: ${mode}) -> ${out}`,
    scaffoldDone: (out, mode) => mode === 'conversational'
      ? `✅ 免指令对话式 npm AI 工具套件已产出于：${out}\n💡 此工具本身即为完整可发布的 npm 包（含 package.json 与 publish.yml），用户安装并 init 后无需输入任何 CLI 指令，直接开启 AI 对话即可开始（例如：“帮我规划东京五日游”）。`
      : `✅ 新 npm AI CLI 工具项目已产出于：${out}\n💡 可直接进入该目录执行 npm test 或发布至 npm！`,
    buildVerifyFailed: '⛔ 组装前 verify 检查未通过，请先填写完 project/ 中的 {{...}} 占位符并修正问题。',
    buildStart: (pkg, cli, mode, out) => `🔨 正在将工作区规格组装为可发布的 npm 套件 [${pkg}] (CLI: ${cli}, 模式: ${mode}) -> ${out}`,
    buildDone: (out, pkg, cli) => `✅ npm 套件组装完成 (${pkg} / ${cli})！\n  - 目录：${out}\n  - 已产出：package.json, bin/cli.js, src/, scripts/, .github/workflows/publish.yml, 5 语系 README`,
    packSuccess: (pkg) => `📦 [${pkg}] npm pack 封装验证通过！随时可通过 GitHub Release 自动发布或执行 npm publish --access public。`
  },
  'en': {
    langName: 'English (en)',
    banner: `${PACKAGE_NAME} (${CLI_NAME}) — Zero-Dependency AI Agent Workbench & Meta-Generator`,
    selectLangPrompt: 'Please select project language (1-5):',
    invalidLang: (lang) => `Unsupported language "${lang}". Supported: ${SUPPORTED_LANGS.join(', ')}`,
    initSuccess: (dir, lang, mode, features = { git: true, pdf: true, html: true, npm: true, hideSkillsRules: true }) => `✅ Workspace initialized!
  - Directory: ${dir}
  - Locked Language: ${lang}
  - Default Mode: ${mode}

🧰 Configured Capabilities (all can be added or changed later):
  • Git Archiving & Sync: ${features.git ? '✅ Enabled' : '⏸️ Disabled (--no-git)'}
  • 0-Token A4 PDF Export: ${features.pdf ? '✅ Enabled' : '⏸️ Disabled (--no-pdf)'}
  • HTML Report Export: ${features.html ? '✅ Enabled' : '⏸️ Disabled (--no-html)'} (${CLI_NAME} pdf --html)
  • npm Package Publishing: ${features.npm ? `✅ Enabled (skills/rules ${features.hideSkillsRules ? 'hidden in .' + CLI_NAME + '/ [OpenSpec style]' : 'visible at root'})` : '⏸️ Disabled (local workspace only, --no-npm)'}

🤖 ${mode === 'conversational'
      ? `Recommended Meeting Workflow (Zero-Command Conversational Mode / meetings/ ready):
  1. Drag audio (.mp3/.m4a), video (.mp4), or text notes into AI chat (or run ${CLI_NAME} new-meeting <Project> <Title>)
  2. AI creates meetings/<Project>/<YYYY-MM-DD_Title>/ with 01-transcript.md, 02-summary.md & 03-todos-and-discussion.md
  3. Mandatory Post-Creation Inspection reports 🟢/🟡/🔴 risk tiers, 🚨 Human-in-the-Loop items & ⚡ Cross-Meeting Conflicts
  4. Generate post-meeting artifacts from meetings/<Project>/templates/ into deliverables/
  5. Verify & export: ${CLI_NAME} verify meetings / ${CLI_NAME} inspect <dir> / ${CLI_NAME} pdf meetings --merge`
      : `Recommended Workflow (in your AI Chat):
  1. Open project/01-spec.md & 02-workflow.md (or project/index.md) and fill in your requirements & flow
  2. Type tool:propose (gtp) -> Let AI review, inspect gaps, and offer ideas/suggestions
  3. Type tool:analyze (gta) -> Draft full specifications & rules
  4. ${features.npm ? 'Type tool:scaffold (gts) -> Assemble the publishable npm package in-place and run npm test to test the entire AI tool!' : 'Test the entire AI tool conversation & output workflow directly!'}
  5. Verify & archive: ${CLI_NAME} verify / ${CLI_NAME} pdf --merge / ${CLI_NAME} commit`}`,
    gitInitDone: '✅ Initialized local Git repository (git init)',
    gitAlreadyExists: 'ℹ️ Existing Git repository detected',
    verifyStart: '🔍 Running 0-Token Anti-Hallucination & Integrity Check (verify)...',
    verifyPass: '✅ Verification passed! No unfilled placeholders and all source references are valid.',
    verifyFail: (count) => `❌ Verification failed with ${count} issue(s):`,
    unfilledPlaceholder: (file, line, token) => `[Unfilled Placeholder] ${file}:${line} -> Found template marker ${token}`,
    brokenRefFile: (file, line, ref) => `[Broken File Reference] ${file}:${line} -> Target file not found: ${ref}`,
    brokenRefLines: (file, line, ref, maxLine) => `[Out-of-Range Line Reference] ${file}:${line} -> Reference ${ref} exceeds file length (${maxLine} lines)`,
    commitStart: '📦 Archiving and executing safe Git sync (commit)...',
    commitVerifyFailed: '⛔ Pre-commit verify check failed. Commit aborted. Please fix the issues above first.',
    commitConflictDetected: '⚠️ Git merge conflict detected! CLI stopped safely (never blindly stripping <<<<<<< conflict markers). Resolve via AI semantic merge or manually in:',
    commitIndexUpdated: '✅ Updated project/index.md status table',
    commitExcludedSensitive: (files) => `🔒 Automatically excluded sensitive files: ${files.join(', ')}`,
    commitSuccess: (hash) => `✅ Local Git commit created (${hash})`,
    commitNothing: 'ℹ️ No changes to commit in workspace.',
    commitPushSuccess: '✅ Synced with remote Git repository (pull --no-rebase + push)',
    pdfStart: '📄 Running 0-Token Markdown to A4 PDF conversion...',
    pdfSuccess: (out) => `✅ PDF generated successfully: ${out}`,
    pdfNoEngine: '❌ No local PDF engine found (requires Chrome / Edge / Chromium / wkhtmltopdf / macOS cupsfilter).',
    upgradeStart: (lang) => `🔄 Running non-destructive upgrade, preserving locked language: ${lang}...`,
    upgradeDryRun: 'ℹ️ [Dry-Run Mode] Planned updates (no files modified):',
    upgradeDone: '✅ Workspace upgrade complete! (<claude-mem-context> and existing project docs preserved)',
    statusTitle: '📊 Project Status & Health Report',
    checkPass: '✅ All required workspace files and structures verified!',
    checkFail: (missing) => `❌ Missing required files or directories: ${missing.join(', ')}`,
    scaffoldStart: (name, mode, out) => `🚀 Scaffolding new npm AI tool package [${name}] (mode: ${mode}) -> ${out}`,
    scaffoldDone: (out, mode) => mode === 'conversational'
      ? `✅ Zero-Command Conversational npm AI Tool package generated at: ${out}\n💡 This tool is a full publishable npm package (with package.json & publish.yml). After installing and running init, users chat in natural language without typing any CLI commands!`
      : `✅ New npm AI CLI tool project generated at: ${out}\n💡 You can cd into the directory and run npm test or publish to npm!`,
    buildVerifyFailed: '⛔ Pre-build verify check failed. Please fill all {{...}} placeholders in project/ first.',
    buildStart: (pkg, cli, mode, out) => `🔨 Assembling workspace spec into publishable npm package [${pkg}] (CLI: ${cli}, mode: ${mode}) -> ${out}`,
    buildDone: (out, pkg, cli) => `✅ npm package assembled (${pkg} / ${cli})!\n  - Directory: ${out}\n  - Generated: package.json, bin/cli.js, src/, scripts/, .github/workflows/publish.yml, 5-lang READMEs`,
    packSuccess: (pkg) => `📦 [${pkg}] npm pack verification passed! Ready to publish via GitHub Release or npm publish --access public.`
  },
  'ja': {
    langName: '日本語 (ja)',
    banner: `${PACKAGE_NAME} (${CLI_NAME}) — ゼロ依存 AI Agent ワークベンチ＆ツール生成フレームワーク`,
    selectLangPrompt: 'プロジェクトの固定言語を選択してください / Please select project language (1-5):',
    invalidLang: (lang) => `未対応の言語 "${lang}" です。対応言語：${SUPPORTED_LANGS.join(', ')}`,
    initSuccess: (dir, lang, mode, features = { git: true, pdf: true, html: true, npm: true, hideSkillsRules: true }) => `✅ ワークスペースの初期化が完了しました！
  - ディレクトリ：${dir}
  - 固定言語：${lang}
  - デフォルトモード：${mode}

🧰 設定済み機能（後からいつでも追加・変更できます）：
  • Git アーカイブ・同期：${features.git ? '✅ 有効' : '⏸️ 無効（--no-git）'}
  • 0-Token A4 PDF 出力：${features.pdf ? '✅ 有効' : '⏸️ 無効（--no-pdf）'}
  • HTML レポート出力：${features.html ? '✅ 有効' : '⏸️ 無効（--no-html）'}（${CLI_NAME} pdf --html）
  • npm パッケージ化：${features.npm ? `✅ 有効（skills/rules は${features.hideSkillsRules ? ' .' + CLI_NAME + '/ に非表示 [OpenSpec方式]' : 'ルートに配置'}）` : '⏸️ 無効（ローカル専用、--no-npm）'}

🤖 推奨ワークフロー（AI チャット画面で実行）：
  1. project/01-spec.md、02-workflow.md（または project/index.md）に要件とフローを記入
  2. tool:propose (gtp) -> AI が要件をレビューして改善案・アイデアを提案
  3. tool:analyze (gta) -> 完全な仕様とルールを起草
  4. ${features.npm ? 'tool:scaffold (gts) -> 現在のディレクトリに npm パッケージをビルドし、npm test で全体をテスト！' : 'AI ツールの対話・出力フロー全体をそのままテスト！'}
  5. 検証とアーカイブ：${CLI_NAME} verify / ${CLI_NAME} pdf --merge / ${CLI_NAME} commit`,
    gitInitDone: '✅ ローカル Git リポジトリを初期化しました (git init)',
    gitAlreadyExists: 'ℹ️ 既存の Git リポジトリを検出しました',
    verifyStart: '🔍 0-Token ハルシネーション防止・整合性チェック (verify) を開始します...',
    verifyPass: '✅ 検証パス！未入力のプレースホルダーはなく、すべてのソース参照が有効です。',
    verifyFail: (count) => `❌ 検証失敗（${count} 件の問題が見つかりました）：`,
    unfilledPlaceholder: (file, line, token) => `[未入力プレースホルダー] ${file}:${line} -> テンプレート記号 ${token} が残っています`,
    brokenRefFile: (file, line, ref) => `[無効なファイル参照] ${file}:${line} -> 参照先ファイルが見つかりません：${ref}`,
    brokenRefLines: (file, line, ref, maxLine) => `[無効な行番号参照] ${file}:${line} -> 参照 ${ref} がファイルの総行数 (${maxLine} 行) を超えています`,
    commitStart: '📦 アーカイブと安全な Git 同期 (commit) を実行しています...',
    commitVerifyFailed: '⛔ コミット前の verify チェックに失敗したため中断しました。先に上記の問題を修正してください。',
    commitConflictDetected: '⚠️ Git マージ競合を検出しました！ファイル破損を防ぐため CLI を安全に停止しました（<<<<<<< 競合マーカーの自動削除は厳禁）。AI による意味的マージまたは手動で以下の競合ファイルを解決してください：',
    commitIndexUpdated: '✅ project/index.md のステータス表を更新しました',
    commitExcludedSensitive: (files) => `🔒 機密設定ファイルを自動除外しました：${files.join(', ')}`,
    commitSuccess: (hash) => `✅ ローカル Git commit が完了しました (${hash})`,
    commitNothing: 'ℹ️ コミットする変更がありません。',
    commitPushSuccess: '✅ リモート Git リポジトリへの同期が完了しました (pull --no-rebase + push)',
    pdfStart: '📄 0-Token Markdown → A4 PDF 変換を開始します...',
    pdfSuccess: (out) => `✅ PDF の出力に成功しました：${out}`,
    pdfNoEngine: '❌ 利用可能なローカル PDF エンジンが見つかりません（Chrome / Edge / Chromium / wkhtmltopdf / macOS cupsfilter が必要です）。',
    upgradeStart: (lang) => `🔄 非破壊アップグレード (upgrade) を開始します（固定言語を保持：${lang}）...`,
    upgradeDryRun: 'ℹ️ [Dry-Run モード] 更新予定の項目（ディスクへの書き込みなし）：',
    upgradeDone: '✅ ワークスペースの非破壊アップグレードが完了しました！（<claude-mem-context> と既存ドキュメントを保持）',
    statusTitle: '📊 プロジェクト進捗・ヘルスレポート',
    checkPass: '✅ すべての必須ワークスペースファイルと構造チェックに合格しました！',
    checkFail: (missing) => `❌ 以下の必須ファイルまたはディレクトリが不足しています：${missing.join(', ')}`,
    scaffoldStart: (name, mode, out) => `🚀 新しい npm AI ツールパッケージ [${name}] (モード: ${mode}) を生成中 -> ${out}`,
    scaffoldDone: (out, mode) => mode === 'conversational'
      ? `✅ コマンド不要の対話型 npm AI ツールパッケージを生成しました：${out}\n💡 このツール自体も公開可能な npm パッケージ（package.json ＆ publish.yml 同梱）です。インストールして init した後は CLI コマンド不要で自然言語チャットだけで利用できます。`
      : `✅ 新しい npm AI CLI ツールプロジェクトを生成しました：${out}\n💡 ディレクトリに移動して npm test の実行や npm 公開が可能です！`,
    buildVerifyFailed: '⛔ ビルド前の verify チェックに失敗しました。先に project/ 内の {{...}} プレースホルダーを入力してください。',
    buildStart: (pkg, cli, mode, out) => `🔨 ワークスペース仕様を公開可能な npm パッケージ [${pkg}] (CLI: ${cli}, モード: ${mode}) にビルド中 -> ${out}`,
    buildDone: (out, pkg, cli) => `✅ npm パッケージのビルドが完了しました (${pkg} / ${cli})！\n  - ディレクトリ：${out}\n  - 生成済み：package.json, bin/cli.js, src/, scripts/, .github/workflows/publish.yml, 5言語 README`,
    packSuccess: (pkg) => `📦 [${pkg}] npm pack 検証に合格しました！GitHub Release または npm publish --access public で公開可能です。`
  },
  'ko': {
    langName: '한국어 (ko)',
    banner: `${PACKAGE_NAME} (${CLI_NAME}) — 무의존성 AI Agent 워크벤치 및 도구 생성 프레임워크`,
    selectLangPrompt: '프로젝트 고정 언어를 선택하세요 / Please select project language (1-5):',
    invalidLang: (lang) => `지원하지 않는 언어 "${lang}"입니다. 지원 언어: ${SUPPORTED_LANGS.join(', ')}`,
    initSuccess: (dir, lang, mode, features = { git: true, pdf: true, html: true, npm: true, hideSkillsRules: true }) => `✅ 워크스페이스 초기화 완료!
  - 디렉터리: ${dir}
  - 고정 언어: ${lang}
  - 기본 모드: ${mode}

🧰 구성된 기능 (나중에도 언제든 추가/변경 가능):
  • Git 버전 관리 및 안전 아카이브: ${features.git ? '✅ 활성화됨' : '⏸️ 비활성화됨 (--no-git)'}
  • 0-Token A4 PDF 내보내기: ${features.pdf ? '✅ 활성화됨' : '⏸️ 비활성화됨 (--no-pdf)'}
  • HTML 보고서 내보내기: ${features.html ? '✅ 활성화됨' : '⏸️ 비활성화됨 (--no-html)'} (${CLI_NAME} pdf --html)
  • npm 패키지 배포 구조: ${features.npm ? `✅ 활성화됨 (skills/rules ${features.hideSkillsRules ? '.' + CLI_NAME + '/ 에 숨김 [OpenSpec 방식]' : '루트에 표시'})` : '⏸️ 비활성화됨 (로컬 전용, --no-npm)'}

🤖 권장 개발 워크플로우 (AI 대화창에서 진행):
  1. project/01-spec.md, 02-workflow.md (또는 project/index.md)에 요구사항과 흐름을 입력
  2. tool:propose (gtp) -> AI가 요구사항을 검토하고 보완 아이디어를 제안
  3. tool:analyze (gta) -> 전체 명세 및 규칙 초안 작성
  4. ${features.npm ? 'tool:scaffold (gts) -> 현재 디렉터리에 npm 패키지를 조립하고 npm test로 전체 흐름 테스트!' : '완성된 AI 도구 대화 및 산출물 전체 흐름 테스트!'}
  5. 검증 및 아카이브: ${CLI_NAME} verify / ${CLI_NAME} pdf --merge / ${CLI_NAME} commit`,
    gitInitDone: '✅ 로컬 Git 저장소 초기화 완료 (git init)',
    gitAlreadyExists: 'ℹ️ 기존 Git 저장소가 감지되었습니다',
    verifyStart: '🔍 0-Token 환각 방지 및 무결성 검사 (verify) 시작...',
    verifyPass: '✅ 검증 통과! 미작성 플레이스홀더가 없으며 모든 소스 참조가 유효합니다.',
    verifyFail: (count) => `❌ 검증 실패 (${count}개의 문제 발견):`,
    unfilledPlaceholder: (file, line, token) => `[미작성 플레이스홀더] ${file}:${line} -> 템플릿 마커 ${token} 발견`,
    brokenRefFile: (file, line, ref) => `[잘못된 파일 참조] ${file}:${line} -> 원본 파일을 찾을 수 없음: ${ref}`,
    brokenRefLines: (file, line, ref, maxLine) => `[잘못된 줄 번호 참조] ${file}:${line} -> 참조 ${ref}가 실제 파일 줄 수(${maxLine}줄)를 초과함`,
    commitStart: '📦 아카이브 및 안전한 Git 동기화 (commit) 실행 중...',
    commitVerifyFailed: '⛔ 커밋 전 verify 검사에 실패하여 중단되었습니다. 위의 문제를 먼저 수정하세요.',
    commitConflictDetected: '⚠️ Git 병합 충돌이 감지되었습니다! 파일 손상을 방지하기 위해 CLI가 안전하게 중지되었습니다(<<<<<<< 충돌 마커 강제 삭제 엄금). AI 시맨틱 병합 또는 수동으로 다음 충돌 파일을 해결하세요:',
    commitIndexUpdated: '✅ project/index.md 상태 표 업데이트 완료',
    commitExcludedSensitive: (files) => `🔒 민감한 설정 파일 자동 제외됨: ${files.join(', ')}`,
    commitSuccess: (hash) => `✅ 로컬 Git commit 완료 (${hash})`,
    commitNothing: 'ℹ️ 커밋할 변경 사항이 없습니다.',
    commitPushSuccess: '✅ 원격 Git 저장소 동기화 완료 (pull --no-rebase + push)',
    pdfStart: '📄 0-Token Markdown -> A4 PDF 변환 시작...',
    pdfSuccess: (out) => `✅ PDF 생성 완료: ${out}`,
    pdfNoEngine: '❌ 로컬 PDF 변환 엔진을 찾을 수 없습니다 (Chrome / Edge / Chromium / wkhtmltopdf / macOS cupsfilter 필요).',
    upgradeStart: (lang) => `🔄 무손실 업그레이드 (upgrade) 실행 중, 기존 언어 유지: ${lang}...`,
    upgradeDryRun: 'ℹ️ [Dry-Run 모드] 업데이트 예정 항목 (디스크에 쓰지 않음):',
    upgradeDone: '✅ 워크스페이스 무손실 업그레이드 완료! (<claude-mem-context> 및 기존 문서 유지됨)',
    statusTitle: '📊 프로젝트 상태 및 헬스 리포트',
    checkPass: '✅ 모든 필수 워크스페이스 파일 및 구조 검사 통과!',
    checkFail: (missing) => `❌ 다음 필수 파일 또는 디렉터리가 누락되었습니다: ${missing.join(', ')}`,
    scaffoldStart: (name, mode, out) => `🚀 새로운 npm AI 도구 패키지 [${name}] (모드: ${mode}) 생성 중 -> ${out}`,
    scaffoldDone: (out, mode) => mode === 'conversational'
      ? `✅ 명령어 없는 대화형 npm AI 도구 패키지가 생성되었습니다: ${out}\n💡 이 도구 자체도 배포 가능한 완전한 npm 패키지(package.json 및 publish.yml 포함)입니다. 설치 및 init 후 사용자는 CLI 명령어 없이 자연어 대화만으로 사용할 수 있습니다.`
      : `✅ 새로운 npm AI CLI 도구 프로젝트가 생성되었습니다: ${out}\n💡 해당 디렉터리로 이동하여 npm test 실행 및 npm 배포가 가능합니다!`,
    buildVerifyFailed: '⛔ 빌드 전 verify 검사에 실패했습니다. 먼저 project/ 내의 {{...}} 플레이스홀더를 모두 작성하세요.',
    buildStart: (pkg, cli, mode, out) => `🔨 워크스페이스 명세를 배포 가능한 npm 패키지 [${pkg}] (CLI: ${cli}, 모드: ${mode})로 빌드 중 -> ${out}`,
    buildDone: (out, pkg, cli) => `✅ npm 패키지 빌드 완료 (${pkg} / ${cli})!\n  - 디렉터리: ${out}\n  - 생성됨: package.json, bin/cli.js, src/, scripts/, .github/workflows/publish.yml, 5개 국어 README`,
    packSuccess: (pkg) => `📦 [${pkg}] npm pack 패키징 검증 통과! GitHub Release 또는 npm publish --access public으로 즉시 배포 가능합니다.`
  }
};

const INIT_PROMPTS = {
  'zh-TW': {
    header: '\n🛠️  初始化功能選項設定（之後也可以隨時補上）：',
    git: '1. 是否需要 Git 版本控制與安全歸檔功能？',
    pdf: '2. 是否需要 0-Token A4 PDF 匯出功能？',
    html: '3. 是否需要 HTML 報告匯出功能？',
    npm: '4. 是否需要打包為可發布的 npm 套件？',
    hideSkills: (cli) => `5. 是否將 skills 與 rules 隱藏於 .${cli}/（OpenSpec 作法）？`
  },
  'zh-CN': {
    header: '\n🛠️  初始化功能选项设置（之后也可以随时补上）：',
    git: '1. 是否需要 Git 版本控制与安全归档功能？',
    pdf: '2. 是否需要 0-Token A4 PDF 导出功能？',
    html: '3. 是否需要 HTML 报告导出功能？',
    npm: '4. 是否需要打包为可发布的 npm 套件？',
    hideSkills: (cli) => `5. 是否将 skills 与 rules 隐藏于 .${cli}/（OpenSpec 做法）？`
  },
  'en': {
    header: '\n🛠️  Configure Optional Features (can also be added later):',
    git: '1. Enable Git archiving & sync?',
    pdf: '2. Enable 0-Token A4 PDF export?',
    html: '3. Enable HTML report export?',
    npm: '4. Enable publishable npm package scaffolding?',
    hideSkills: (cli) => `5. Hide skills & rules inside .${cli}/ (OpenSpec style)?`
  },
  'ja': {
    header: '\n🛠️  初期化オプション設定（後からいつでも追加可能）：',
    git: '1. Git バージョン管理・安全アーカイブを有効にしますか？',
    pdf: '2. 0-Token A4 PDF 出力を有効にしますか？',
    html: '3. HTML レポート出力を有効にしますか？',
    npm: '4. 公開可能な npm パッケージ構成を有効にしますか？',
    hideSkills: (cli) => `5. skills と rules を .${cli}/ に非表示（OpenSpec 方式）にしますか？`
  },
  'ko': {
    header: '\n🛠️  초기화 옵션 기능 설정 (나중에도 언제든 추가 가능):',
    git: '1. Git 버전 관리 및 안전 아카이브 기능을 활성화할까요?',
    pdf: '2. 0-Token A4 PDF 내보내기 기능을 활성화할까요?',
    html: '3. HTML 보고서 내보내기 기능을 활성화할까요?',
    npm: '4. 배포 가능한 npm 패키지 구성을 활성화할까요?',
    hideSkills: (cli) => `5. skills 및 rules를 .${cli}/에 숨길까요 (OpenSpec 방식)?`
  }
};

function getInitPrompts(lang, cliName = CLI_NAME) {
  const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : DEFAULT_LANG;
  const p = INIT_PROMPTS[safeLang] || INIT_PROMPTS[DEFAULT_LANG];
  return {
    header: p.header,
    git: p.git,
    pdf: p.pdf,
    html: p.html,
    npm: p.npm,
    hideSkills: p.hideSkills(cliName)
  };
}

function t(lang, key, ...args) {
  const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : DEFAULT_LANG;
  const entry = DICT[safeLang][key] || DICT[DEFAULT_LANG][key] || key;
  if (typeof entry === 'function') {
    return entry(...args);
  }
  return entry;
}

module.exports = {
  DICT,
  INIT_PROMPTS,
  getInitPrompts,
  t
};
