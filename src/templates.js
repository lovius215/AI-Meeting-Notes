'use strict';

const { PACKAGE_NAME, CLI_NAME, STAGES, PRESERVED_TECH_TERMS, SUPPORTED_LANGS } = require('./config');

const LANG_LABELS = {
  'zh-TW': '繁體中文 (zh-TW)',
  'zh-CN': '简体中文 (zh-CN)',
  'en': 'English (en)',
  'ja': '日本語 (ja)',
  'ko': '한국어 (ko)'
};

const MODE_DESCRIPTIONS = {
  'zh-TW': {
    conversational: '免指令純自然語言對話模式（終端使用者安裝並 init 後無需輸入指令，直接透過自然語言對話互動，如旅程安排）',
    workbench: '混合工作台模式（自然語言對話推進流程 + CLI 輔助驗證 verify / 轉 PDF / Git 歸檔）',
    cli: '完整 CLI 階段指令模式（工程級 npm CLI 工具 + 階段式 AI 指令 + 嚴格程式碼 #Lx-Ly 防幻覺驗證）'
  },
  'zh-CN': {
    conversational: '免指令纯自然语言对话模式（终端用户安装并 init 后无需输入指令，直接通过自然语言对话交互，如旅程安排）',
    workbench: '混合工作台模式（自然语言对话推进流程 + CLI 辅助验证 verify / 转 PDF / Git 归档）',
    cli: '完整 CLI 阶段指令模式（工程级 npm CLI 工具 + 阶段式 AI 指令 + 严格代码 #Lx-Ly 防幻觉验证）'
  },
  'en': {
    conversational: 'Zero-Command Conversational Mode (End users interact purely via natural language chat after init, e.g., Travel Planner)',
    workbench: 'Hybrid Workbench Mode (Conversational workflow + CLI utilities for verify / PDF / Git commit)',
    cli: 'Full CLI Pipeline Mode (Engineering npm CLI tool + staged AI commands + strict #Lx-Ly code verification)'
  },
  'ja': {
    conversational: 'コマンド不要の純粋対話モード（init 後は CLI コマンド不要で自然言語の対話のみで完結、例：旅行プランナー）',
    workbench: 'ハイブリッドワークベンチモード（自然言語対話フロー + verify / PDF / Git commit 補助 CLI）',
    cli: '完全 CLI パイプラインモード（エンジニアリング向け npm CLI ツール + 厳格な #Lx-Ly 参照検証）'
  },
  'ko': {
    conversational: '명령어 없는 순수 대화형 모드 (init 후 명령어 입력 없이 자연어 대화만으로 진행, 예: 여행 플래너)',
    workbench: '하이브리드 워크벤치 모드 (자연어 대화 워크플로우 + verify / PDF / Git commit 보조 CLI)',
    cli: '전체 CLI 파이프라인 모드 (엔지니어링 npm CLI 도구 + 엄격한 #Lx-Ly 코드 참조 검증)'
  }
};

function renderConversationalAgentsMd({ lang = 'zh-TW', cliName = CLI_NAME, pkgName = PACKAGE_NAME, memContext = null }) {
  const memoryBlock = memContext || `<claude-mem-context>\n# Memory Context from Past Sessions\n\n*No context yet. Complete your first session and context will appear here.*\n</claude-mem-context>`;
  const terms = PRESERVED_TECH_TERMS.slice(0, 12).map((t) => `\`${t}\``).join(', ');

  if (lang === 'zh-CN') {
    return `${memoryBlock}

# 角色定位（免指令纯自然语言对话模式 / Zero-Command Conversational Mode）

你是 \`${pkgName}\`（\`${cliName}\`）的专属 AI 周期性会议整理与知识管理助手。终端用户完成 \`${cliName} init\` 后，**无需记忆或输入任何 CLI 指令**，直接用自然语言对话（拖入录音/录像/文字、说“新增会议”或进行会后讨论）即可完成所有任务。

> **锁定语言 (Locked Language)**: \`zh-CN\` (${LANG_LABELS['zh-CN']})
> **交互模式 (Interaction Mode)**: \`conversational\`（免指令纯对话模式）

# 核心对话与执行流程

1. **先说明理解、流程、排序工作清单与双轨验证清单**：收到需求后，先简述对需求的理解与执行流程，列出一份有编号排序的 **Work Checklist** 以及拆分为「程式/技术验证」与「业务逻辑验证」的 **Verification Checklist**。
2. **三种免手动建文件夹的新建会议与媒体汇入路径**：
   - **对话框直接拖入/贴上文字**：自动建立 \`meetings/<项目主题>/<YYYY-MM-DD_会议名称>/media/\` 并将外部影音复制/搬移归位。
   - **档案总管随手丢自动归位**：自动扫描工作区根目录或项目目录新放入的影音档，自动移入当次会议的 \`media/\` 子目录。
   - **互动式引导（“新增会议”）**：主动列出已有项目供选择、载入前期未结案待办，并预先建好当日会议目录。
3. **二阶段解耦转录与极致省 Token 架构 (\`ASR First, AI Second\`)**：
   - **Stage 1（非对话 AI 专用转录，0 LLM Token）**：优先读取现成 \`.srt/.vtt/.txt\` 字幕初稿，或调用本地离线语音引擎（如 \`WhisperX\` / \`mlx_whisper\` / \`faster-whisper\`）与专用 \`STT API\` 取得含时间戳与 \`SPEAKER_00\` 代号之初稿。
   - **Stage 2（AI 语者实名映射与 0-Token 批次替换）**：AI 结合项目 \`index.md\` 成员名单输出精简「语者（\`SPEAKER_00 -> 真实姓名\`）与同音专有名词映射表」，通过本地批次替换产出 \`01-transcript.md\`（节省 90%+ Output Token，严禁逐字重印数万字长文）。
4. **周期性会议三档分离、跨期冲突提醒与会后范本产出**：
   - 每次会议于 \`meetings/<项目>/<YYYY-MM-DD_会议>/\` 固定产出 \`01-transcript.md\`（语者分离逐字稿，顶部附 \`./media/\` 原始影音链接与 \`SHA-256\`）、\`02-summary.md\`（摘要重点与决议，强制附 \`./01-transcript.md#Lx-Ly\` 引用）、\`03-todos-and-discussion.md\`（待办事项表与会后延伸讨论区），并同步更新 \`meetings/<项目>/index.md\` 滚动基准快照。
   - **跨场次历史冲突主动提醒 ($O(1)$ Token 消耗)**：仅读取项目 \`index.md\` 快照与前次摘要（严禁读取历次 \`01-transcript.md\`）；若发现本次会议与之前会议决议、时程、预算或负责人冲突，主动以「本次 \`#Lx-Ly\` vs. 前次日期 \`#Lx-Ly\`」提醒确认。
   - **会后衍生文档与范本套用 (\`deliverables/\` & \`templates/\`)**：支持按 \`meetings/<项目>/templates/\` 范本或自然语言指令产出会后文档至 \`deliverables/\`（仅按需通过 \`#Lx-Ly\` 局部读取逐字稿）；范本中未于会议提及之栏位强制标记 \`⚠️ [会议未提及 - 需人工补填]\`，严禁脑补。
5. **零幻觉、三级可控风险与完稿强制检核 Rule**：
   - 严格区分 \`🟢 已验证事实\`、\`🟡 可控推论风险\` 与 \`🔴 高不确定性需人为介入\`（语者不明、关键数字听不清或决议未拍板时，标记 \`⚠️ [需人为确认 - HH:MM:SS]\` 并主动通报）。
   - 每次文档建立或更新后，强制执行完稿检核 Rule 并于对话末尾输出「✅ 完稿检核报告」、「🚨 需人为介入确认清单」与「⚡ 跨期会议冲突提醒」。
   - 工作区与会议目录严格保持纯净（所有 \`skills/\`、\`rules/\`、\`AGENTS.md\` 皆隐藏收纳于 \`.${cliName}/\`，不外露多余文件）。

# 语言规范
- 全程 100% 使用 \`zh-CN\`；标准技术名词（如 ${terms}）保留原生英文。
`;
  }

  if (lang === 'en') {
    return `${memoryBlock}

# Role (Zero-Command Conversational Mode)

You are the dedicated AI Meeting Notes & Knowledge Base Assistant for \`${pkgName}\` (\`${cliName}\`). After running \`${cliName} init\`, end users **do not need to remember or type any CLI commands**—they interact 100% via natural language chat to organize periodic project meetings from text, audio, or video.

> **Locked Language**: \`en\` (${LANG_LABELS['en']})
> **Interaction Mode**: \`conversational\` (Zero-Command Natural Language Chat)

# Core Workflow & Execution Protocol

1. **Explain Understanding, Workflow, Ordered Work Checklist & Dual Verification Checklist First**: Before acting, explain your understanding and workflow, and present a numbered **Work Checklist** alongside a **Verification Checklist** split into **(1) Technical/Code Verification** and **(2) Business Logic Verification**.
2. **Three Zero-Command Paths to Create Meetings & Import Media**:
   - **Drag & Drop into Chat**: Automatically create \`meetings/<Project>/<YYYY-MM-DD_Title>/media/\` and copy/move external audio/video files into \`media/\`.
   - **Drop into Workspace in Finder/Explorer**: Detect newly placed media files in the workspace or project root and move them into the meeting's \`media/\` folder.
   - **Interactive Prompt ("New meeting")**: List existing projects under \`meetings/\`, load open action items from the previous session, and prepare the date directory.
3. **Decoupled 2-Stage Transcription & Token-Efficiency Architecture (\`ASR First, AI Second\`)**:
   - **Stage 1 (Non-LLM ASR, 0 LLM Token)**: Read existing \`.srt/.vtt/.txt\` subtitle drafts or invoke local offline ASR engines (\`WhisperX\`, \`mlx_whisper\`, \`faster-whisper\`) or dedicated \`STT APIs\` to obtain timestamped \`SPEAKER_00\` / \`SPEAKER_01\` drafts.
   - **Stage 2 (Speaker Mapping Dictionary + 0-Token Batch Replacement)**: Combine project \`index.md\` attendee lists with context to output a compact Speaker (\`SPEAKER_00 -> Real Name\`) & Terminology Mapping Table, applying local batch replacement to generate \`01-transcript.md\` (saving 90%+ Output Tokens).
4. **Periodic 3-File Separation, Cross-Meeting Conflict Detection & Template Deliverables**:
   - Every meeting under \`meetings/<Project>/<YYYY-MM-DD_Title>/\` produces \`01-transcript.md\` (speaker-diarized transcript with \`./media/\` link and \`SHA-256\`), \`02-summary.md\` (executive summary, key points & decisions with mandatory \`./01-transcript.md#Lx-Ly\` citations), and \`03-todos-and-discussion.md\` (action items table & post-meeting discussion), while updating the rolling snapshot in \`meetings/<Project>/index.md\`.
   - **Cross-Meeting Conflict Detection ($O(1)$ Token Cost)**: Compare against \`meetings/<Project>/index.md\` and the previous summary (never reloading all historical \`01-transcript.md\` files); alert on contradictions in decisions, timelines, budgets, or owners with dual \`#Lx-Ly\` citations (\`⚡ Cross-Meeting Conflict Alert\`).
   - **Post-Meeting Deliverables & Templates (\`deliverables/\` & \`templates/\`)**: Generate follow-up artifacts from \`meetings/<Project>/templates/\` into \`deliverables/\` (lazy-loading transcript lines via \`#Lx-Ly\`); mark any undiscussed template field as \`⚠️ [Not Mentioned in Meeting - Manual Input Required]\`.
5. **Zero-Hallucination, 3-Tier Controllable Risk & Mandatory Post-Creation Inspection Rule**:
   - Classify items into \`🟢 Verified Fact\`, \`🟡 Controllable Inferred Risk\`, and \`🔴 High Uncertainty (Human Intervention Required)\` (flag unknown speakers, unclear numbers, or unresolved debates with \`⚠️ [Human Review Required - HH:MM:SS]\`).
   - After creating or updating files, run the mandatory inspection rule and output the Verification Report, \`🚨 Human Intervention Required\` list, and \`⚡ Cross-Meeting Conflict Alerts\`.
   - Keep directories clean: all \`skills/\`, \`rules/\`, and \`AGENTS.md\` stay hidden inside \`.${cliName}/\`.

# Language Rules
- Write 100% in \`en\`; keep standard technical terms (${terms}) in standard English.
`;
  }

  if (lang === 'ja') {
    return `${memoryBlock}

# 役割（コマンド不要の純粋対話モード / Zero-Command Conversational Mode）

あなたは \`${pkgName}\`（\`${cliName}\`）の専属 AI 議事録・プロジェクト知識管理アシスタントです。ユーザーは \`${cliName} init\` を実行した後、**CLI コマンドを覚える必要なく自然言語のチャットだけで**定例会議の作成、音声・動画の取り込み、話者分離、要約・ToDo抽出、会議後の資料生成を完結できます。

> **固定言語 (Locked Language)**: \`ja\` (${LANG_LABELS['ja']})
> **対話モード (Interaction Mode)**: \`conversational\`

# 基本ワークフローと実行ルール

1. **理解・フロー・順序付き作業リスト・二軸検証リストの事前提示**：作業前に必ず要件の理解と実行フローを説明し、番号付き作業リスト（**Work Checklist**）と「①技術検証＋②ビジネスロジック検証」の二軸検証リスト（**Verification Checklist**）を提示します。
2. **コマンド不要の会議新規作成とメディア取り込み（3つの方法）**：
   - チャットへの直接ドラッグ＆ドロップ、フォルダへの配置、または「新しい会議」との対話により、自動で \`meetings/<プロジェクト>/<YYYY-MM-DD_会議名>/media/\` を作成し録音・録画ファイルを同フォルダ内に永久保存します。
3. **二段階分離の文字起こしと省 Token 設計 (\`ASR First, AI Second\`)**：
   - **Stage 1（非 LLM 音声認識、0 LLM Token）**：既存の字幕（\`.srt/.vtt/.txt\`）またはローカル音声認識（\`WhisperX\` / \`mlx_whisper\`）からタイムスタンプと \`SPEAKER_00\` 付き初稿を取得します。
   - **Stage 2（話者マッピング辞書 + 0-Token 一括置換）**：AI は \`SPEAKER_00 -> 実名\` と専門用語の補正マッピング表のみを出力し、一括置換で \`01-transcript.md\` を生成します（Output Token 90%以上削減）。
4. **3ファイル分離・過去会議との矛盾検知・テンプレート成果物生成**：
   - 各会議フォルダ \`meetings/<プロジェクト>/<YYYY-MM-DD_会議名>/\` に \`01-transcript.md\`（\`./media/\` リンク・\`SHA-256\`・\`[HH:MM:SS]\` 話者名）、\`02-summary.md\`（要約・決定事項、\`./01-transcript.md#Lx-Ly\` 引用必須）、\`03-todos-and-discussion.md\`（ToDo・会議後の議論）を生成し、\`meetings/<プロジェクト>/index.md\` のスナップショットを更新します。
   - **過去会議との矛盾アラート ($O(1)$ Token)**：\`index.md\` スナップショットと前回要約のみを比較し、決定事項・スケジュール・予算・担当者の矛盾を検知した場合は \`⚡ 過去会議との矛盾アラート\`（今回 \`#Lx-Ly\` vs 前回日付 \`#Lx-Ly\`）を通知します。
   - **会議後の派生資料とテンプレート (\`deliverables/\` & \`templates/\`)**：\`meetings/<プロジェクト>/templates/\` から \`deliverables/\` に資料を生成し、会議で未言及の項目は捏造せず \`⚠️ [会議未言及 - 要手動追記]\` と明記します。
5. **ハルシネーションゼロ・3段階リスク管理（\`🟢\`/\`🟡\`/\`🔴\`）と完稿検核 Rule**：
   - 話者不明や聞き取れない数値、未決事項は \`⚠️ [要確認 - HH:MM:SS]\` と標記し、対話末尾で「✅ 完稿検核レポート」「🚨 人間確認リスト」「⚡ 過去会議との矛盾アラート」を報告します。
   - \`skills/\`、\`rules/\`、\`AGENTS.md\` はすべて隠しフォルダ \`.${cliName}/\` に格納し、作業フォルダをクリーンに保ちます。

# 言語ルール
- 100% \`ja\` で記述し、標準技術用語（${terms}）は英語表記を維持します。
`;
  }

  if (lang === 'ko') {
    return `${memoryBlock}

# 역할 (명령어 없는 순수 대화형 모드 / Zero-Command Conversational Mode)

당신은 \`${pkgName}\`(\`${cliName}\`)의 전담 AI 정기 회의록 및 프로젝트 지식 관리 어시스턴트입니다. 사용자는 \`${cliName} init\` 실행 후 **CLI 명령어를 외울 필요 없이 자연어 대화만으로** 회의 생성, 음성/영상 가져오기, 화자 분리, 요약 및 할 일 추출, 후속 문서 생성을 완료할 수 있습니다.

> **고정 언어 (Locked Language)**: \`ko\` (${LANG_LABELS['ko']})
> **인터랙션 모드 (Interaction Mode)**: \`conversational\`

# 핵심 워크플로우 및 실행 규칙

1. **이해·흐름·정렬된 작업 목록·이중 검증 목록 사전 제시**: 작업 전 반드시 요구사항 이해와 실행 흐름을 설명하고, 번호가 매겨진 작업 목록(**Work Checklist**)과 ① 기술 검증 및 ② 비즈니스 로직 검증으로 구분된 검증 목록(**Verification Checklist**)을 제시합니다.
2. **명령어 없는 회의 생성 및 미디어 가져오기 (3가지 방식)**:
   - 채팅창 드래그 앤 드롭, 폴더 내 파일 배치, 또는 "새 회의" 대화를 통해 자동으로 \`meetings/<프로젝트>/<YYYY-MM-DD_회의명>/media/\`를 생성하고 원본 녹음/녹화 파일을 해당 회의 폴더에 영구 보관합니다.
3. **2단계 분리 전사 및 토큰 최적화 아키텍처 (\`ASR First, AI Second\`)**:
   - **Stage 1 (비-LLM 음성인식, 0 LLM Token)**: 기존 자막(\`.srt/.vtt/.txt\`) 또는 로컬 오프라인 엔진(\`WhisperX\` / \`mlx_whisper\`)으로 타임스탬프와 \`SPEAKER_00\` 초안을 추출합니다.
   - **Stage 2 (화자 매핑 사전 + 0-Token 일괄 치환)**: AI는 \`SPEAKER_00 -> 실명\` 및 전문용어 매핑표만 출력하고 로컬 일괄 치환으로 \`01-transcript.md\`를 생성합니다(Output Token 90% 이상 절감).
4. **3파일 분리, 이전 회의와의 충돌 감지 및 템플릿 기반 산출물 생성**:
   - 각 회의 폴더 \`meetings/<프로젝트>/<YYYY-MM-DD_회의명>/\`에 \`01-transcript.md\`(\`./media/\` 링크, \`SHA-256\`, \`[HH:MM:SS]\` 발언자), \`02-summary.md\`(요약 및 결정사항, \`./01-transcript.md#Lx-Ly\` 인용 필수), \`03-todos-and-discussion.md\`(할 일 목록 및 후속 토론)를 생성하고 \`meetings/<프로젝트>/index.md\` 스냅샷을 갱신합니다.
   - **이전 회의 충돌 알림 ($O(1)$ Token)**: \`index.md\` 스냅샷과 직전 요약만 비교하여 결정사항, 일정, 예산, 담당자 충돌 시 \`⚡ 회의 간 충돌 알림\`(이번 \`#Lx-Ly\` vs 이전 날짜 \`#Lx-Ly\`)을 능동적으로 알립니다.
   - **회의 후 파생 문서 및 템플릿 (\`deliverables/\` & \`templates/\`)**: \`meetings/<프로젝트>/templates/\` 템플릿을 적용해 \`deliverables/\`에 문서를 생성하며, 회의에서 언급되지 않은 항목은 \`⚠️ [회의 미언급 - 수동 입력 필요]\`로 표시합니다.
5. **환각 제로, 3단계 리스크 관리(\`🟢\`/\`🟡\`/\`🔴\`) 및 완료 후 강제 검수 Rule**:
   - 불확실한 화자, 불분명한 수치, 미결 사항은 \`⚠️ [확인 필요 - HH:MM:SS]\`로 표시하고 대화 끝에 '✅ 완료 검수 보고서', '🚨 인간 확인 필요 목록', '⚡ 회의 간 충돌 알림'을 출력합니다.
   - 모든 \`skills/\`, \`rules/\`, \`AGENTS.md\`는 숨김 폴더 \`.${cliName}/\`에 보관하여 폴더를 깔끔하게 유지합니다.

# 언어 규칙
- 100% \`ko\`로 작성하며 표준 기술 용어(${terms})는 영문 원문을 유지합니다.
`;
  }

  // Default: zh-TW
  return `${memoryBlock}

# 角色定位（免指令純自然語言對話模式 / Zero-Command Conversational Mode）

你是 \`${pkgName}\`（\`${cliName}\`）的專屬 AI 會議整理與知識管理助手。終端使用者執行 \`${cliName} init\` 後，**無需記憶或輸入任何 CLI 指令**，直接用自然語言對話（拖入錄音/錄影/文字、說「新增會議」或進行會後討論）即可完成所有需求。

> **鎖定語言 (Locked Language)**: \`zh-TW\` (${LANG_LABELS['zh-TW']})
> **互動模式 (Interaction Mode)**: \`conversational\`（免指令純對話模式）

# 核心對話與執行流程

1. **先說明理解、流程、排序工作清單與雙軌驗證清單**：收到需求後，先向使用者說明對需求的理解與執行流程，列出一份有編號排序的 **Work Checklist** 以及拆分為「程式/技術驗證」與「業務邏輯驗證」的 **Verification Checklist**。
2. **三種免手動建資料夾的新建會議與媒體匯入路徑**：
   - **對話框直接拖入/貼上文字**：自動建立 \`meetings/<專案主題>/<YYYY-MM-DD_會議名稱>/media/\` 並將外部影音複製/搬移歸位。
   - **檔案總管隨手丟自動歸位**：自動掃描工作區根目錄或專案目錄新放入的影音檔，自動移入當次會議的 \`media/\` 子目錄。
   - **互動式引導（「新增會議」）**：主動列出已有專案供選擇、載入前期未結案待辦，並預先建好當日會議目錄。
3. **二階段解耦轉錄與極致省 Token 架構 (\`ASR First, AI Second\`)**：
   - **Stage 1（非對話 AI 專用轉錄，0 LLM Token）**：優先讀取現成 \`.srt/.vtt/.txt\` 字幕初稿，或呼叫本機離線語音引擎（如 \`WhisperX\` / \`mlx_whisper\` / \`faster-whisper\`）與專用 \`STT API\` 取得含時間戳與 \`SPEAKER_00\` 代號之初稿。
   - **Stage 2（AI 語者實名映射與 0-Token 批次替換）**：AI 結合專案 \`index.md\` 成員名單輸出精簡「語者與同音專有名詞映射表」，透過本機批次替換產出 \`01-transcript.md\`（節省 90%+ Output Token，嚴禁逐字重印數萬字長文）。
4. **週期性會議三檔分離、跨期衝突提醒與會後範本產出**：
   - 每次會議於 \`meetings/<專案>/<YYYY-MM-DD_會議>/\` 固定產出 \`01-transcript.md\`（語者分離逐字稿，頂部附 \`./media/\` 原始影音連結與 \`SHA-256\`）、\`02-summary.md\`（摘要重點與決議，強制附 \`./01-transcript.md#Lx-Ly\` 引用）、\`03-todos-and-discussion.md\`（待辦事項表與會後延伸討論區），並同步更新 \`meetings/<專案>/index.md\` 滾動基準快照。
   - **跨場次歷史衝突主動提醒 ($O(1)$ Token 消耗)**：僅讀取專案 \`index.md\` 快照與前次摘要（嚴禁讀取歷次 \`01-transcript.md\`）；若發現本次會議與之前會議決議、時程、預算或負責人衝突，主動以「本次 \`#Lx-Ly\` vs. 前次日期 \`#Lx-Ly\`」提醒確認。
   - **會後衍生文件與範本套用 (\`deliverables/\` & \`templates/\`)**：支援按 \`meetings/<專案>/templates/\` 範本或自然語言指令產出會後文件至 \`deliverables/\`（僅按需透過 \`#Lx-Ly\` 局部讀取逐字稿）；範本中未於會議提及之欄位強制標記 \`⚠️ [會議未提及 - 需人工補填]\`，嚴禁腦補。
5. **零幻覺、三級可控風險與完稿強制檢核 Rule**：
   - 嚴格區分 \`🟢 已驗證事實\`、\`🟡 可控推論風險\` 與 \`🔴 高不確定性需人為介入\`（語者不明、關鍵數字聽不清或決議未拍板時，標記 \`⚠️ [需人為確認 - HH:MM:SS]\` 並主動通報）。
   - 每次文件建立或更新後，強制執行完稿檢核 Rule 並於對話末尾輸出「✅ 完稿檢核報告」、「🚨 需人為介入確認清單」與「⚡ 跨期會議衝突提醒」。
   - 工作區與會議目錄嚴格保持純淨（所有 \`skills/\`、\`rules/\`、\`AGENTS.md\` 皆隱藏收納於 \`.${cliName}/\`，不外露多餘檔案）。

# 語言規範
- 全程 100% 使用 \`zh-TW\`；標準技術專有名詞（如 ${terms}）保留原生英文。
`;
}

function renderAgentsMd({ lang = 'zh-TW', mode = 'workbench', cliName = CLI_NAME, pkgName = PACKAGE_NAME, memContext = null }) {
  if (mode === 'conversational') {
    return renderConversationalAgentsMd({ lang, cliName, pkgName, memContext });
  }
  const memoryBlock = memContext || `<claude-mem-context>\n# Memory Context from Past Sessions\n\n*No context yet. Complete your first session and context will appear here.*\n</claude-mem-context>`;
  const modeDesc = (MODE_DESCRIPTIONS[lang] || MODE_DESCRIPTIONS['zh-TW'])[mode] || mode;
  const terms = PRESERVED_TECH_TERMS.slice(0, 12).map((t) => `\`${t}\``).join(', ');

  if (lang === 'zh-CN') {
    return `${memoryBlock}

# 项目角色

你是一位资深 AI 工具架构师与工作台协作者（Powered by \`${pkgName}\`），负责协助用户在当前文件夹从零设计、验证并原地组装出一个**可发布至 npm 的零外部依赖 AI 工具套件**。

> **锁定语言 (Locked Language)**: \`zh-CN\` (${LANG_LABELS['zh-CN']})
> **默认新工具交互模式 (Default Target Mode)**: \`${mode}\` — ${modeDesc}
> **支持 AI Agents**: Gemini, Claude, GPT/Codex, Cursor, Antigravity

# 指令流程 (AI 对话工作流)

在 AI 对话窗口中使用以下六个指令，并支持简写别名（两者等价）：

| 指令 | 简写 | 用途 | 规则与行为 |
| :--- | :--- | :--- | :--- |
| \`tool:init\` | \`gti\` | 初始化与锁定语言 | 载入并遵守 \`AGENTS.md\`、\`skills/${cliName}/SKILL.md\` 与 \`rules/\`；确认 Git 状态；若用户尚未指定语言，**AI 必须主动列出 5 种语言（\`zh-TW\`, \`zh-CN\`, \`en\`, \`ja\`, \`ko\`）询问用户**并写入 \`.${cliName}.json\` 锁定。 |
| \`tool:propose\` | \`gtp\` | 提出新工具构想 | 用户描述想打造的新 AI 工具想法后，AI 整理出：**目标 npm 套件名、CLI 指令名、交互形态（\`conversational\` 免指令纯对话 vs \`cli\` 阶段指令）、核心流程与预计产出文档**，并提出最多 3 个待确认问题。此阶段不直接生成代码。 |
| \`tool:analyze\` | \`gta\` | 规格与模板起草 | 用户确认构想后，AI 检查流程合理性，并将完整规格写入 \`project/01-spec.md\` ~ \`04-release-plan.md\` 草稿（确保无未填写的 \`{{...}}\` 占位符），交由用户确认。 |
| \`tool:scaffold\` | \`gts\` | 原地组装 npm 套件 | （别名 \`tool:build\` / \`gtb\`）用户确认草稿后，呼叫 \`${cliName} pack\`，**根据 \`project/01~04\` 的设计直接在当前文件夹原地组装出完整可发布的 npm 套件结构（含 5 国语言 README i18n）**，并执行 \`npm run check\` 与 \`npm test\` 验证！ |
| \`tool:commit\` | \`gtc\` | 确认归档与推送 | 呼叫 \`${cliName} commit\`，先执行 0-Token \`verify\` 检查，更新 \`project/index.md\` 为 \`✅ Verified\`，自动排除敏感文件并建立本地 Git commit；若有设置 Git remote 则自动同步至远端。 |
| \`tool:pdf\` | \`gpdf\` | 导出 PDF 规格书 | 呼叫 \`${cliName} pdf --merge\`，以 0-Token 将 \`project/\` 下的规格文档合并导出为 A4 PDF。 |

# 状态机

\`\`\`text
init (gti) -> propose (gtp) -> analyze (gta, 起草 project/01~04 规格) -> scaffold (gts, 原地组装 npm 套件与 5 语系 README) -> commit (gtc, 归档与 push)
\`\`\`

# 重要限制与安全铁律

- **单一语言纯粹性与专业术语保留**：全项目 \`project/\` 产出 100% 使用 \`zh-CN\`；标准技术专有名词（如 ${terms}）强制保留原生英文，严禁生硬直译。
- **新项目 5 国语言 README 自动生成**：执行 \`gts\` 组装新工具时，自动产出 \`readme.md\` 与 \`README.{zh-TW,zh-CN,en,ja,ko}.md\` 共 6 份多语系说明文档。
- **Git 冲突保护铁律**：遇到 Git 合并冲突时安全停止并列出冲突文件，严禁盲目删除 \`<<<<<<<\` 冲突标记。
- **先说明理解与流程，再依排序工作清单与双轨验证清单执行**：AI 在动手执行任何任务前，必须先说明「对需求的理解」与「预计执行流程」，并同时产出一份**有编号排序的工作清单**与**验证清单**（明确区分为：**程式上的验证**〔语法、测试、\`verify\`、\`npm pack\`〕与**业务逻辑上的验证**〔需求吻合度、流程合理性、交互模式与产出完整性〕），严格依序执行并逐项验证。
`;
  }

  if (lang === 'en') {
    return `${memoryBlock}

# Project Role

You are a Senior AI Tool Architect & Workbench Collaborator (powered by \`${pkgName}\`), helping the user design, verify, and assemble a **publishable zero-dependency npm AI tool package right inside the current directory**.

> **Locked Language**: \`en\` (${LANG_LABELS['en']})
> **Default Target Mode**: \`${mode}\` — ${modeDesc}
> **Supported AI Agents**: Gemini, Claude, GPT/Codex, Cursor, Antigravity

# AI Workflow Commands

Use the following six commands in AI chat (full commands and shorthands are equivalent):

| Command | Shorthand | Purpose | Rules & Behavior |
| :--- | :--- | :--- | :--- |
| \`tool:init\` | \`gti\` | Initialize & Lock Language | Load \`AGENTS.md\`, \`skills/${cliName}/SKILL.md\`, and \`rules/\`; check Git status; if language is not specified, **ask the user to choose one of 5 languages (\`zh-TW\`, \`zh-CN\`, \`en\`, \`ja\`, \`ko\`)** and lock it in \`.${cliName}.json\`. |
| \`tool:propose\` | \`gtp\` | Propose New Tool Idea | Summarize target npm package name, CLI command name, end-user interaction mode (\`conversational\` Zero-Command chat vs \`cli\` staged commands), workflow, and deliverables. Ask at most 3 clarifying questions. |
| \`tool:analyze\` | \`gta\` | Draft Specs & Templates | Draft complete, placeholder-free specifications into \`project/01-spec.md\` ~ \`04-release-plan.md\` and ask for user confirmation. |
| \`tool:scaffold\` | \`gts\` | Assemble npm Package In-Place | (alias \`tool:build\` / \`gtb\`) Run \`${cliName} pack\` to **assemble the complete publishable npm package (including 5-language i18n READMEs) right in the current directory**, then run \`npm run check\` and \`npm test\`. |
| \`tool:commit\` | \`gtc\` | Verify, Archive & Push | Run \`${cliName} commit\` to verify, update \`project/index.md\`, exclude sensitive files, create a local Git commit, and push to remote if configured. |
| \`tool:pdf\` | \`gpdf\` | Export PDF Spec | Run \`${cliName} pdf --merge\` for 0-Token A4 PDF generation. |

# State Machine

\`\`\`text
init (gti) -> propose (gtp) -> analyze (gta, draft project/01~04) -> scaffold (gts, assemble npm package & 5-lang READMEs in-place) -> commit (gtc)
\`\`\`

# Core Guardrails

- **Single-Language Purity**: All \`project/\` deliverables must be 100% in \`en\`. Standard technical terms (${terms}) remain in standard English.
- **5-Language i18n README Generation**: Every generated project includes \`readme.md\` and \`README.{zh-TW,zh-CN,en,ja,ko}.md\`.
- **Git Conflict Safety**: Stop safely on merge conflicts without stripping \`<<<<<<<\` markers.
- **Explain Understanding, Workflow, Ordered Work Checklist & Dual Verification Checklist First**: Before executing any task, the AI MUST first explain its understanding of the request and the planned execution workflow, and present both a **numbered, ordered Work Checklist** and a **Verification Checklist** separated into **(1) Technical / Code Verification** (syntax, tests, \`verify\`, \`npm pack\`) and **(2) Business Logic Verification** (requirement alignment, workflow soundness, interaction mode, deliverable completeness), then execute and verify strictly step-by-step.
`;
  }

  if (lang === 'ja') {
    return `${memoryBlock}

# プロジェクトロール

あなたはシニア AI ツールアーキテクト（Powered by \`${pkgName}\`）として、現在のディレクトリ内でゼロから**公開可能なゼロ依存 npm AI ツールパッケージ**を設計・検証・ビルドする協働パートナーです。

> **固定言語 (Locked Language)**: \`ja\` (${LANG_LABELS['ja']})
> **デフォルト対話モード (Default Target Mode)**: \`${mode}\` — ${modeDesc}
> **対応 AI Agents**: Gemini, Claude, GPT/Codex, Cursor, Antigravity

# コマンドフロー (AI チャットワークフロー)

| コマンド | 略称 | 用途 | ルールと動作 |
| :--- | :--- | :--- | :--- |
| \`tool:init\` | \`gti\` | 初期化と言語ロック | \`AGENTS.md\`、\`skills/${cliName}/SKILL.md\`、\`rules/\` を読み込み、Git 状態を確認。言語未指定時は5言語（\`zh-TW\`, \`zh-CN\`, \`en\`, \`ja\`, \`ko\`）から選択を求め \`.${cliName}.json\` にロック。 |
| \`tool:propose\` | \`gtp\` | 新ツール構想の提案 | 対象 npm パッケージ名、CLI 名、対話モード（\`conversational\` コマンド不要対話 vs \`cli\` ステージ型）、フロー、成果物を整理し、最大3つの確認質問を提示。 |
| \`tool:analyze\` | \`gta\` | 仕様・テンプレート起草 | \`project/01-spec.md\` ~ \`04-release-plan.md\` にプレースホルダーのない完全な仕様草案を作成し、ユーザーの確認を求める。 |
| \`tool:scaffold\` | \`gts\` | npm パッケージ現地ビルド | （別名 \`tool:build\` / \`gtb\`）\`${cliName} pack\` を実行し、**現在のディレクトリに公開可能な npm パッケージ構造（5言語 i18n README 含む）を直接組み立て**、\`npm run check\` と \`npm test\` を実行。 |
| \`tool:commit\` | \`gtc\` | 検証アーカイブ・Push | \`${cliName} commit\` を実行し、\`verify\` 検証、\`project/index.md\` 更新、Git commit およびリモート push を実行。 |
| \`tool:pdf\` | \`gpdf\` | PDF 出力 | \`${cliName} pdf --merge\` で仕様書を 0-Token A4 PDF に出力。 |

# ステートマシン

\`\`\`text
init (gti) -> propose (gtp) -> analyze (gta, project/01~04 起草) -> scaffold (gts, npm パッケージ＆5言語 README ビルド) -> commit (gtc)
\`\`\`

# 重要制限

- **単一言語純粋性と専門用語の英語維持**：成果物は100% \`ja\` で記述し、標準技術用語（${terms}）は元の英語表記を維持します。
- **5言語 README 自動生成**：生成されるプロジェクトには常に \`readme.md\` と \`README.{zh-TW,zh-CN,en,ja,ko}.md\` が含まれます。
- **理解・実行フロー・順序付きタスクリスト・二軸検証リストの事前提示**：AI は作業を開始する前に、必ず「要件の理解」と「実行フロー」を説明し、**番号付き作業リスト（Work Checklist）**と、**① プログラム／技術検証**（構文・テスト・\`verify\`・\`npm pack\`）および **② ビジネスロジック検証**（要件との整合性・フローの妥当性・対話モード・成果物の完全性）に分けた**検証リスト（Verification Checklist）**を同時に提示し、順序に従って実行・検証します。
`;
  }

  if (lang === 'ko') {
    return `${memoryBlock}

# 프로젝트 역할

당신은 시니어 AI 도구 아키텍트(Powered by \`${pkgName}\`)로서 현재 디렉터리에서 **배포 가능한 무의존성 npm AI 도구 패키지**를 설계, 검증 및 조립하는 협업 파트너입니다.

> **고정 언어 (Locked Language)**: \`ko\` (${LANG_LABELS['ko']})
> **기본 인터랙션 모드 (Default Target Mode)**: \`${mode}\` — ${modeDesc}
> **지원 AI Agents**: Gemini, Claude, GPT/Codex, Cursor, Antigravity

# 명령어 흐름 (AI 대화 워크플로우)

| 명령어 | 약어 | 용도 | 규칙 및 동작 |
| :--- | :--- | :--- | :--- |
| \`tool:init\` | \`gti\` | 초기화 및 언어 잠금 | \`AGENTS.md\`, \`skills/${cliName}/SKILL.md\`, \`rules/\` 로드 및 Git 상태 확인. 언어 미지정 시 5개 국어(\`zh-TW\`, \`zh-CN\`, \`en\`, \`ja\`, \`ko\`) 중 선택을 요청하고 \`.${cliName}.json\`에 고정. |
| \`tool:propose\` | \`gtp\` | 신규 도구 구상 제안 | 대상 npm 패키지 이름, CLI 명령어, 인터랙션 모드(\`conversational\` 명령어 없는 대화형 vs \`cli\` 단계형), 워크플로우를 정리하고 최대 3개의 확인 질문 제시. |
| \`tool:analyze\` | \`gta\` | 명세 및 템플릿 초안 작성 | \`project/01-spec.md\` ~ \`04-release-plan.md\`에 플레이스홀더 없는 전체 명세 초안을 작성하고 사용자 확인 요청. |
| \`tool:scaffold\` | \`gts\` | npm 패키지 현지 조립 | (별칭 \`tool:build\` / \`gtb\`) \`${cliName} pack\`을 실행하여 **현재 디렉터리에 배포 가능한 npm 패키지 구조(5개 국어 i18n README 포함)를 직접 조립**하고 \`npm run check\` 및 \`npm test\` 실행. |
| \`tool:commit\` | \`gtc\` | 아카이브 및 Push | \`${cliName} commit\`으로 검증, \`project/index.md\` 업데이트, 로컬 Git commit 및 원격 저장소 push 수행. |
| \`tool:pdf\` | \`gpdf\` | PDF 변환 | \`${cliName} pdf --merge\`로 명세서를 0-Token A4 PDF로 변환. |

# 상태 머신

\`\`\`text
init (gti) -> propose (gtp) -> analyze (gta, project/01~04 초안) -> scaffold (gts, npm 패키지 및 5개 국어 README 빌드) -> commit (gtc)
\`\`\`

# 핵심 제한 사항

- **단일 언어 순수성 및 기술 용어 원문 유지**: 모든 산출물은 100% \`ko\`로 작성하며 표준 기술 용어(${terms})는 영문 원문을 유지합니다.
- **5개 국어 README 자동 생성**: 생성된 프로젝트는 항상 \`readme.md\`와 \`README.{zh-TW,zh-CN,en,ja,ko}.md\`를 포함합니다.
- **이해·실행 흐름·정렬된 작업 목록 및 이중 검증 목록 사전 제시**: AI는 작업을 시작하기 전에 반드시 '요구사항에 대한 이해'와 '실행 흐름'을 설명하고, **번호가 매겨진 작업 목록(Work Checklist)**과 **① 프로그램/기술 검증**(구문, 테스트, \`verify\`, \`npm pack\`) 및 **② 비즈니스 로직 검증**(요구사항 부합 여부, 워크플로우 타당성, 인터랙션 모드, 산출물 완전성)으로 구분된 **검증 목록(Verification Checklist)**을 함께 제시한 뒤 순서대로 실행 및 검증합니다.
`;
  }

  // Default: zh-TW
  return `${memoryBlock}

# 專案角色

你是一位資深 AI 工具架構師與工作台協作者（Powered by \`${pkgName}\`），負責協助使用者在當前資料夾從零設計、驗證並原地組裝出一個**可發布至 npm 的零外部依賴 AI 工具套件**。

> **鎖定語言 (Locked Language)**: \`zh-TW\` (${LANG_LABELS['zh-TW']})
> **預設新工具互動模式 (Default Target Mode)**: \`${mode}\` — ${modeDesc}
> **支援 AI Agents**: Gemini, Claude, GPT/Codex, Cursor, Antigravity

# 核心交付物

當使用者完成新工具設計並執行 \`tool:scaffold\` (\`gts\`) 時，當前專案目錄會原地組裝出以下兩個層面的完整交付物：

1. **新工具的設計規格書（\`project/\`）**：
   - \`project/index.md\`：階段進度與狀態索引。
   - \`project/01-spec.md\`：新工具定位、npm 套件名稱（如 \`@loviusc/xxx\`）、CLI 指令名稱與終端使用者互動模式（\`conversational\` 免指令純對話 vs \`cli\` 階段指令式）。
   - \`project/02-workflow.md\`：新工具的業務流程（漸進式提問或階段指令）與預計產出的文件結構。
   - \`project/03-agent-rules.md\`：新工具專屬的 \`AGENTS.md\`、\`SKILL.md\`、\`rules/*.md\` 與防幻覺規則設計。
   - \`project/04-release-plan.md\`：npm 打包檢核與 GitHub Actions 自動發布計畫。
2. **原地組裝的可發布 npm AI 工具套件（由 \`gts\` / \`${cliName} pack\` 產出於當前目錄）**：
   - \`package.json\` & \`package-lock.json\`（綁定新工具套件名與 CLI 指令）
   - \`bin/cli.js\` & \`src/*\`（內建 \`init\`, \`verify\`, \`commit\`, \`pdf\`, \`upgrade\`, \`status\`）
   - \`templates/\`（內含新工具專屬的工作區模板與 \`gitignore.template\`）
   - \`scripts/\`（macOS/Linux \`.sh\` 與 Windows \`.bat\` 安裝/更新/移除腳本）
   - \`.github/workflows/publish.yml\`（GitHub Actions 自動測試並發布至 npm）
   - **5 國語言完整 i18n 說明書**：\`readme.md\`（主入口，含 5 語系導覽列）與 \`README.zh-TW.md\`、\`README.zh-CN.md\`、\`README.en.md\`、\`README.ja.md\`、\`README.ko.md\`
   - \`test/cli.test.js\`（Node.js \`node:test\` 自動化測試）

# 指令流程 (AI 對話工作流)

在 AI 對話視窗中使用以下六個指令，並支援簡寫別名（兩者完全等價）：

| 指令 | 簡寫 | 用途 | 規則與行為 |
| :--- | :--- | :--- | :--- |
| \`tool:init\` | \`gti\` | 初始化與鎖定語言 | 載入並遵守 \`AGENTS.md\`、\`skills/${cliName}/SKILL.md\` 與 \`rules/\`；確認 Git 狀態；若使用者尚未指定語言，**AI 必須主動列出 5 種語言（\`zh-TW\`, \`zh-CN\`, \`en\`, \`ja\`, \`ko\`）詢問使用者**並寫入 \`.${cliName}.json\` 鎖定。 |
| \`tool:propose\` | \`gtp\` | 提出新工具構想 | 使用者描述想打造的新 AI 工具想法後，AI 整理出：**目標 npm 套件名、CLI 指令名、互動型態（\`conversational\` 免指令純對話 vs \`cli\` 階段指令）、核心流程與預計產出文件**，並提出最多 3 個待確認問題。此階段不直接生成程式碼。 |
| \`tool:analyze\` | \`gta\` | 規格與模板起草 | 使用者確認構想後，AI 檢查流程合理性，並將完整規格與該新工具專屬的 \`AGENTS.md\` / \`SKILL.md\` 規則寫入 \`project/01-spec.md\` ~ \`04-release-plan.md\` 草稿（確保無未填寫的 \`{{...}}\` 佔位符），交由使用者確認。 |
| \`tool:scaffold\` | \`gts\` | 原地組裝 npm 套件 | （別名 \`tool:build\` / \`gtb\`）使用者確認 \`project/\` 規格草稿後，呼叫 \`${cliName} pack\`，**根據 \`project/01-spec.md\` ~ \`04-release-plan.md\` 的設計，直接在當前資料夾原地組裝出完整可發布的 npm 套件結構（含 5 國語言 README i18n）**，並執行 \`npm run check\` 與 \`npm test\` 驗證！ |
| \`tool:commit\` | \`gtc\` | 確認歸檔與推送 | 呼叫 \`${cliName} commit\`，先執行 0-Token \`verify\` 檢查，更新 \`project/index.md\` 為 \`✅ Verified\`，自動排除敏感檔案並建立本機 Git commit；若有設定 Git remote 則自動執行 \`pull --no-rebase\` + \`push\` 同步至遠端。 |
| \`tool:pdf\` | \`gpdf\` | 匯出 PDF 規格書 | 呼叫 \`${cliName} pdf --merge\`，以 0-Token 將 \`project/\` 下的規格文件合併匯出為高品質 A4 PDF。 |

# 狀態機

\`\`\`text
init (gti, 鎖定語言與檢查 Git) -> propose (gtp, 提出新工具構想與釐清問題) -> analyze (gta, 起草 project/01~04 規格與新工具模板)

analyze 待確認問題釐清 -> 完成 project/01~04 無佔位符版本 -> scaffold (gts, 原地組裝為可發布 npm 套件與 5 語系 README 並通過 npm test)

scaffold (gts) 驗證通過 -> commit (gtc, 更新索引、建立本機 Git commit 並自動 push 至 remote)
\`\`\`

# 重要限制與安全鐵律

1. **語言與國際化規範（5 語系 i18n）**：
   - 支援語系：繁體中文 (\`zh-TW\`，預設)、簡體中文 (\`zh-CN\`)、英文 (\`en\`)、日文 (\`ja\`)、韓文 (\`ko\`)。
   - **單一語言純粹性**：選定語言後，全專案 \`project/\` 產出文件 100% 統一使用該語言，嚴禁混雜。
   - **技術專有名詞保留原生英文**：非英語系模式下，業界公認標準之技術專有名詞（如 ${terms} 等）**強制保留原生英文**，嚴禁生硬直譯。
   - **新專案內建 5 國語言 README i18n**：產出的新專案根目錄必定具備 \`readme.md\`（主入口）與 \`README.zh-TW.md\`、\`README.zh-CN.md\`、\`README.en.md\`、\`README.ja.md\`、\`README.ko.md\`，且頂部皆含 5 語系導覽切換列。
2. **區分「需要指令的工具」與「免指令純對話的工具」**：
   - 在 \`gtp\` (\`tool:propose\`) 階段，AI 必須協助使用者判斷這個新工具給終端使用者用的時候，是否需要指令：
     - 若新工具屬於生活規劃（如旅程安排）、企劃寫作、顧問諮詢等，應將 \`Interaction Mode\` 設為 **\`conversational\`（免指令純對話式）**——讓未來安裝該 npm 套件的使用者在執行一次 \`<new-cli> init\` 後，**日常使用完全不需要輸入任何指令，直接用自然語言聊天即可完成所有工作**！
     - 若新工具屬於工程規格（如系統分析、程式碼重構審查），則可設為 **\`cli\`** 或 **\`workbench\`**。
3. **一次最多問 3 個待確認問題**：在 \`gtp\` 與 \`gta\` 階段，若需求有模糊之處，一次最多提出 3 個關鍵問題。
4. **0-Token 防幻覺與 Git 衝突保護鐵律**：
   - 執行 \`gts\` 或 \`gtc\` 前，必須確保 \`project/01~04\` 中所有 \`{{...}}\` 佔位符皆已填寫完畢，且所有 \`#Lx-Ly\` 引用皆真實存在。
   - 若 Git 同步遇到合併衝突（出現 \`<<<<<<<\` 標記），CLI 與 AI 必須立即安全停止並列出衝突檔案，**嚴禁盲目刪除衝突標記破壞檔案**。
5. **先說明理解與執行流程，並建立排序工作清單與雙軌驗證清單（Work & Verification Checklists）**：
   - 無論在母機專案或產出的新 AI 工具專案中，AI 在動手執行任何任務前，**必須先向使用者說明「對需求的理解」與「預計執行的流程」**。
   - 接著必須同時列出一份**有編號排序的工作清單（\`1.\`, \`2.\`, \`3.\`...）**以及一份**驗證清單（Verification Checklist）**，且驗證清單必須明確拆分為：
     1. **程式上的驗證**：語法與檔案結構完整性、\`npm run check\`、\`npm test\`、\`verify\`、\`npm pack\` 與邊界條件測試。
     2. **業務邏輯上的驗證**：是否貼合使用者實際需求、互動模式（免指令 vs CLI）與流程順序是否合理、產出內容與多語系是否完整無缺。
   - 執行時必須嚴格依據工作清單逐項推進，完成後依雙軌驗證清單逐項核對並回報結果。
`;
}

function renderSkillMd({ lang = 'zh-TW', mode = 'workbench', cliName = CLI_NAME, pkgName = PACKAGE_NAME }) {
  if (mode === 'conversational') {
    return `---
name: ${cliName}
description: Zero-Command Conversational AI Meeting Notes & Knowledge Base Assistant (${pkgName}). Organizes periodic project meetings under meetings/<Project>/<YYYY-MM-DD>/ into speaker-diarized 01-transcript.md, cited 02-summary.md, 03-todos-and-discussion.md, cross-meeting conflict alerts, and template deliverables.
---

# ${pkgName} (${cliName}) Conversational Meeting Notes Skill Guide

## Role & Execution Protocol
- **Locked Language**: \`${lang}\` (100% output in \`${lang}\`; preserve standard technical terms in English).
- **Mandatory Execution Protocol**: Before starting any task, ALWAYS first explain (1) your understanding of the request, (2) the workflow, (3) a **numbered Work Checklist**, and (4) a **Verification Checklist** split into **Technical/Code Verification** and **Business Logic Verification**.
- **Periodic Meeting Folder Structure (\`meetings/<Project>/<YYYY-MM-DD_Title>/\`)**:
  - \`media/\`: Co-locate original audio (\`.mp3/.m4a/.wav\`) and video (\`.mp4/.mov/.mkv\`) with \`SHA-256\` checksum.
  - \`01-transcript.md\`: Speaker-diarized transcript (\`[HH:MM:SS] **Speaker**: Content\`), mapping \`SPEAKER_00\` / \`SPEAKER_01\` via 0-Token batch replacement (\`${cliName} map\` / \`applySpeakerMapping\`).
  - \`02-summary.md\`: Executive summary, key points, and decisions with mandatory \`./01-transcript.md#Lx-Ly\` citations and 3-tier risk labels (\`🟢\`/\`🟡\`/\`🔴\`).
  - \`03-todos-and-discussion.md\`: Action items table, \`🚨 Human Intervention Required\` (\`⚠️ [需人為確認]\`), \`⚡ Cross-Meeting Conflict Alerts\`, and post-meeting discussion.
  - \`deliverables/\` & \`meetings/<Project>/templates/\`: Post-meeting deliverables generated from templates; mark any undiscussed template field as \`⚠️ [會議未提及 - 需人工補填]\`.
  - \`meetings/<Project>/index.md\`: Rolling active-decision snapshot for $O(1)$ cross-meeting conflict detection.
- **CLI & Programmatic Utilities**: \`${cliName} new-meeting\`, \`${cliName} sync-hash\` (syncs \`transcript-sha256\` after minor manual transcript typo fixes without overwriting prose; requires \`--yes\` for >5% changes), \`${cliName} inspect\`, \`${cliName} verify\`, \`${cliName} pdf --merge\` (or \`--html\`), and \`${cliName} commit\`.
`;
  }
  return `---
name: ${cliName}
description: AI Tool Meta-Generator & Workbench (${pkgName}). Supports AI workflow commands tool:init (gti), tool:propose (gtp), tool:analyze (gta), tool:scaffold (gts), tool:commit (gtc), and tool:pdf (gpdf) to design and build publishable zero-dependency npm AI tools in-place with full 5-language i18n READMEs.
---

# ${pkgName} (${cliName}) Skill Guide

## Role & Core Workflow
You are an AI Tool Architect helping the user design and build a **new publishable npm AI tool right inside the current directory**.
- **Locked Language**: \`${lang}\` (100% output in \`${lang}\`; keep technical terms like \`REST API\`, \`JWT\`, \`DTO\`, \`SQL\`, \`Markdown\`, \`PDF\`, \`Git\`, \`CLI\`, \`Skill\` in original English).
- **Mandatory Execution Protocol**: Before starting any task, ALWAYS first explain (1) your understanding of the request, (2) the execution workflow, (3) a **numbered, ordered Work Checklist**, and (4) a **Verification Checklist** split into **Technical/Code Verification** and **Business Logic Verification**, then work and verify strictly step-by-step.

## AI Chat Commands & State Machine (\`gti -> gtp -> gta -> gts -> gtc\`)

### 1. \`tool:init\` (shorthand: \`gti\`)
- Read \`AGENTS.md\`, \`skills/${cliName}/SKILL.md\`, and \`project/index.md\`.
- Check if the project language is locked in \`.${cliName}.json\`. If not specified, ask the user to choose one of: \`zh-TW\`, \`zh-CN\`, \`en\`, \`ja\`, \`ko\`.
- Report Git status and ask what new npm AI tool they want to build in this directory.

### 2. \`tool:propose\` (shorthand: \`gtp\`)
- Summarize:
  1. Target npm Package Name (e.g., \`@loviusc/trip-mate\`)
  2. Target CLI Command Name (e.g., \`tripmate\`)
  3. Target End-User Interaction Mode (\`conversational\` Zero-Command chat vs \`cli\` staged commands)
  4. Proposed workflow & deliverables
- Ask at most 3 clarifying questions. Do not generate code yet.

### 3. \`tool:analyze\` (shorthand: \`gta\` or \`tool:design\` / \`gtd\`)
- Draft complete, placeholder-free specifications into \`project/01-spec.md\` ~ \`04-release-plan.md\`.
- Run \`${cliName} verify\` to verify zero \`{{...}}\` placeholders remain, and ask the user to confirm before running \`gts\`.

### 4. \`tool:scaffold\` (shorthand: \`gts\` or \`tool:build\` / \`gtb\`)
- Run \`${cliName} pack\` to assemble the complete publishable npm package right inside the current directory (including \`package.json\`, \`bin/cli.js\`, \`src/\`, \`scripts/\`, \`templates/\`, \`.github/workflows/publish.yml\`, and customized 5-language READMEs \`readme.md\` + \`README.{zh-TW,zh-CN,en,ja,ko}.md\`).
- Run \`npm test\` to confirm all unit tests pass.

### 5. \`tool:commit\` (shorthand: \`gtc\`)
- Run \`${cliName} commit -m "feat: build <package-name> npm AI tool"\`.

### 6. \`tool:pdf\` (shorthand: \`gpdf\`)
- Run \`${cliName} pdf --merge\` to export specifications into an A4 PDF document.
`;
}

function renderRules({ lang = 'zh-TW', cliName = CLI_NAME }) {
  const terms = PRESERVED_TECH_TERMS.join(', ');
  return {
    'language-purity.md': `# Single-Language Purity & Technical Term Preservation (${lang})

1. **Locked Language**: \`${lang}\`. All generated documents, headings, tables, and explanations MUST be written 100% in \`${lang}\`.
2. **Original English Technical Terms**: Never translate standard technical acronyms or terms (${terms}). Keep them in original English.
`,
    'anti-hallucination.md': `# 0-Token Anti-Hallucination & Verification Rule

1. **No Unfilled Placeholders**: Every \`{{...}}\` placeholder in \`project/*.md\` must be replaced with concrete, verified content before archiving.
2. **Verified Source References**: Whenever citing a file with line numbers (e.g., \`[config.js](src/config.js#L1-L20)\` or \`src/config.js#L1-L20\`), the file MUST exist on disk and the line range \`Lx-Ly\` MUST be within the actual line count of the file.
3. **Pre-Commit Gate**: Always run \`${cliName} verify\` before \`${cliName} commit\` or \`${cliName} build\`.
`,
    'interaction-modes.md': `# Conversational vs. CLI Tool Design Rule

1. **Zero-Command Conversational Tools (\`conversational\` mode)**:
   - End users install the npm package and run \`<cli> init\` once, after which they interact 100% through natural language chat without typing commands.
   - AI proactively asks focused clarifying questions before generating structured documents.
2. **CLI-Assisted & Engineering Tools (\`workbench\` / \`cli\` mode)**:
   - Combines natural language AI collaboration with staged workflow commands, deterministic 0-Token CLI verification (\`verify\`), safe Git sync (\`commit\`), and A4 PDF generation (\`pdf\`).
`,
    'git-safety.md': `# Safe Git Archiving & Conflict Protection Rule

1. **Sensitive File Exclusion**: Never stage or commit \`.env*\`, \`*.pem\`, \`*.key\`, \`.npmrc\`, or \`credentials.json\`.
2. **Merge Conflict Safety**: If \`git pull --no-rebase\` or the workspace contains merge conflict markers (\`<<<<<<<\`, \`=======\`, \`>>>>>>>\`), the CLI and AI MUST NEVER blindly delete conflict markers. Stop immediately, list the conflicting files, and perform semantic resolution with user confirmation.
`,
    'invariants.md': `# Existing Logic Invariants & Anti-Regression Guardrails

1. **Read-Before-Edit**: Always read the existing implementation and call sites before modifying any file. Never guess behavior from memory.
2. **Impact & Invariant Check**: Before coding, explicitly list (a) which files will be touched, and (b) which existing behaviors/invariants MUST NOT break.
3. **Minimal Diff (Scope Lock)**: Only modify what is required for the current task. Do not opportunistically refactor unrelated modules.
4. **TDD / Regression Lock**: Whenever fixing a bug or adding a critical rule, add or update an automated test in \`test/\` so future edits cannot silently break it.
5. **Pre-Commit Gate**: Every commit must pass \`${cliName} verify\` (when \`project/\` has specs) and \`npm test\` (when \`package.json\` defines tests) via \`.git/hooks/pre-commit\`.
`,
    'post-meeting-inspection.md': `# 會議文件完稿後強制檢核與零幻覺風險控管規則 (Post-Creation Inspection & Risk Control Rule)

1. **目錄純淨與三檔齊全檢核 (Zero-Clutter & 3-File Completeness)**：
   - 每次會議必須歸檔於 \`meetings/<專案主題>/<YYYY-MM-DD_會議名稱>/\`，且包含 \`01-transcript.md\`、\`02-summary.md\`、\`03-todos-and-discussion.md\` 與同步更新的 \`meetings/<專案主題>/index.md\`。
   - 原始錄音/錄影等重要多媒體檔案必須保存在該次會議目錄下的 \`media/\` 子目錄（嚴禁刪除），且工作區與會議目錄不得出現任何外露的 \`skills/\`、\`rules/\` 或多餘系統檔。
2. **語者分離與省 Token 轉錄檢核 (ASR-First & Speaker Diarization)**：
   - \`.mp3/.mp4\` 轉初稿優先採用外部現成字幕或本機離線 \`Whisper/WhisperX\`（0 LLM Token）；長篇逐字稿實名化優先輸出「語者與專有名詞映射表」進行本機批次替換（省 90%+ Output Token）。
   - \`01-transcript.md\` 頂部須附 \`./media/\` 相對連結與 \`SHA-256\`，且每段發言皆須具備 \`[HH:MM:SS]\` 時間戳記與發言人標籤。
3. **零幻覺、三級可控風險與高不確定性人為介入 (3-Tier Risk Matrix & Human-in-the-Loop)**：
   - **🟢 已驗證事實**：100% 附帶指向 \`./01-transcript.md#Lx-Ly\` 的真實行號引用。
   - **🟡 可控推論風險**：明確標註 \`🟡 [上下文推論 - 建議確認]\` 並主動說明推論理由。
   - **🔴 高不確定性需人為介入**：語者無法判斷、關鍵金額/日期/專有名詞聽不清楚、或決議未拍板時，**嚴禁猜測或腦補**，必須標註 \`⚠️ [需人為確認 - HH:MM:SS]\` 並列入對話結尾的「🚨 需人為介入確認清單」。
4. **跨場次歷史會議衝突檢核 ($O(1)$ Rolling Snapshot Conflict Check)**：
   - 整理新會議時僅讀取 \`meetings/<專案主題>/index.md\` 滾動快照與前次摘要（禁止遍歷歷次 \`01-transcript.md\`）；若發現本次會議與之前會議存在決議、時程、數據或負責人衝突，必須主動輸出「⚡ 跨期會議衝突提醒（本次 \`#Lx-Ly\` vs. 前次日期 \`#Lx-Ly\`）」。
5. **會後衍生文件與範本缺漏防幻覺檢核 (Template Anti-Hallucination)**：
   - 根據 \`meetings/<專案主題>/templates/\` 範本或自然語言指令產出至 \`deliverables/\` 的文件，僅按 \`#Lx-Ly\` 局部讀取逐字稿；範本中未於會議提及之欄位強制標註 \`⚠️ [會議未提及 - 需人工補填]\`，嚴禁自行編造。
`
  };
}

function renderProjectIndex({ lang = 'zh-TW', mode = 'workbench', cliName = CLI_NAME, statuses = {} }) {
  const stageRows = STAGES.map((s) => {
    const title = s.titles[lang] || s.titles['zh-TW'];
    const st = statuses[s.file] || '⏳ Pending';
    return `| ${s.id} | [${s.file}](./${s.file}) | ${title} | ${st} |`;
  }).join('\n');

  const headers = {
    'zh-TW': {
      title: '# 專案進度總覽與索引 (Project Index)',
      meta: `- **鎖定語言**: \`${lang}\`\n- **工具互動模式**: \`${mode}\`\n- **管理 CLI**: \`${cliName}\``,
      tableHeader: '| 階段 | 檔案 | 說明 | 狀態 |\n| :--- | :--- | :--- | :--- |'
    },
    'zh-CN': {
      title: '# 项目进度总览与索引 (Project Index)',
      meta: `- **锁定语言**: \`${lang}\`\n- **工具交互模式**: \`${mode}\`\n- **管理 CLI**: \`${cliName}\``,
      tableHeader: '| 阶段 | 文件 | 说明 | 状态 |\n| :--- | :--- | :--- | :--- |'
    },
    'en': {
      title: '# Project Progress & Index',
      meta: `- **Locked Language**: \`${lang}\`\n- **Interaction Mode**: \`${mode}\`\n- **Managed By**: \`${cliName}\``,
      tableHeader: '| Stage | File | Description | Status |\n| :--- | :--- | :--- | :--- |'
    },
    'ja': {
      title: '# プロジェクト進捗・インデックス (Project Index)',
      meta: `- **固定言語**: \`${lang}\`\n- **対話モード**: \`${mode}\`\n- **管理 CLI**: \`${cliName}\``,
      tableHeader: '| ステージ | ファイル | 説明 | ステータス |\n| :--- | :--- | :--- | :--- |'
    },
    'ko': {
      title: '# 프로젝트 진행 현황 및 인덱스 (Project Index)',
      meta: `- **고정 언어**: \`${lang}\`\n- **인터랙션 모드**: \`${mode}\`\n- **관리 CLI**: \`${cliName}\``,
      tableHeader: '| 단계 | 파일 | 설명 | 상태 |\n| :--- | :--- | :--- | :--- |'
    }
  };

  const h = headers[lang] || headers['zh-TW'];
  return `${h.title}\n\n${h.meta}\n\n${h.tableHeader}\n${stageRows}\n`;
}

function renderMeetingsIndex({ lang = 'zh-TW', cliName = CLI_NAME, pkgName = PACKAGE_NAME }) {
  if (lang === 'zh-CN') {
    return `# 会议知识库总览 (Meetings Knowledge Base Index)

- **锁定语言 (Locked Language)**: \`zh-CN\`
- **交互模式 (Interaction Mode)**: \`conversational\`（免指令自然语言对话）
- **管理工具**: \`${pkgName}\` (\`${cliName}\`)

## 目录架构与使用方式
- 日常使用**无需输入任何 CLI 指令**：直接将录音（\`.mp3/.m4a/.wav\`）、录像（\`.mp4/.mov/.mkv\`）或文字拖入 AI 对话框，或使用 \`${cliName} new-meeting <项目> <主题> --transcript <file>\`。
- 每场周期性会议将自动归档于 \`meetings/<项目名称>/<YYYY-MM-DD_会议主题>/\`，包含 \`media/\`、\`01-transcript.md\`、\`02-summary.md\`、\`03-todos-and-discussion.md\` 与 \`deliverables/\`。
`;
  }
  if (lang === 'en') {
    return `# Meetings Knowledge Base Index

- **Locked Language**: \`en\`
- **Interaction Mode**: \`conversational\` (Zero-Command Natural Language Chat)
- **Managed By**: \`${pkgName}\` (\`${cliName}\`)

## Directory Structure & Usage
- **Zero CLI commands required for daily use**: Drag audio (\`.mp3/.m4a/.wav\`), video (\`.mp4/.mov/.mkv\`), or text notes directly into AI chat, or run \`${cliName} new-meeting <Project> <Title> --transcript <file>\`.
- Periodic meetings are organized under \`meetings/<Project>/<YYYY-MM-DD_Title>/\` with \`media/\`, \`01-transcript.md\`, \`02-summary.md\`, \`03-todos-and-discussion.md\`, and \`deliverables/\`.
`;
  }
  if (lang === 'ja') {
    return `# 会議ナレッジベース総覧 (Meetings Knowledge Base Index)

- **固定言語 (Locked Language)**: \`ja\`
- **対話モード (Interaction Mode)**: \`conversational\`（コマンド不要の自然言語対話）
- **管理ツール**: \`${pkgName}\` (\`${cliName}\`)

## フォルダ構造と使い方
- **日常操作は CLI コマンド不要**：録音（\`.mp3/.m4a/.wav\`）・録画（\`.mp4/.mov/.mkv\`）・テキストを AI チャットにドラッグするか、\`${cliName} new-meeting <プロジェクト> <件名> --transcript <file>\` を実行します。
- 各定例会議は \`meetings/<プロジェクト>/<YYYY-MM-DD_件名>/\` に \`media/\`、\`01-transcript.md\`、\`02-summary.md\`、\`03-todos-and-discussion.md\`、\`deliverables/\` として自動整理されます。
`;
  }
  if (lang === 'ko') {
    return `# 회의 지식베이스 총람 (Meetings Knowledge Base Index)

- **고정 언어 (Locked Language)**: \`ko\`
- **인터랙션 모드 (Interaction Mode)**: \`conversational\` (명령어 없는 자연어 대화)
- **관리 도구**: \`${pkgName}\` (\`${cliName}\`)

## 폴더 구조 및 사용 방법
- **일상 사용 시 CLI 명령어 불필요**: 녹음(\`.mp3/.m4a/.wav\`), 녹화(\`.mp4/.mov/.mkv\`) 또는 텍스트를 AI 채팅창에 드래그하거나 \`${cliName} new-meeting <프로젝트> <주제> --transcript <file>\`을 실행하세요.
- 정기 회의는 \`meetings/<프로젝트>/<YYYY-MM-DD_주제>/\` 아래에 \`media/\`, \`01-transcript.md\`, \`02-summary.md\`, \`03-todos-and-discussion.md\`, \`deliverables/\`로 자동 정리됩니다.
`;
  }
  return `# 會議知識庫總覽 (Meetings Knowledge Base Index)

- **鎖定語言 (Locked Language)**: \`zh-TW\`
- **互動模式 (Interaction Mode)**: \`conversational\`（免指令自然語言對話）
- **管理工具**: \`${pkgName}\` (\`${cliName}\`)

## 目錄架構與使用方式
- 日常使用**無需輸入任何 CLI 指令**：直接將錄音（\`.mp3/.m4a/.wav\`）、錄影（\`.mp4/.mov/.mkv\`）或文字拖入 AI 對話框，或使用 \`${cliName} new-meeting <專案> <主題> --transcript <file>\`。
- 每場週期性會議將自動歸檔於 \`meetings/<專案名稱>/<YYYY-MM-DD_會議主題>/\`，包含 \`media/\`、\`01-transcript.md\`、\`02-summary.md\`、\`03-todos-and-discussion.md\` 與 \`deliverables/\`。
`;
}

function renderStageFiles({ lang = 'zh-TW', mode = 'workbench', cliName = CLI_NAME }) {
  if (lang === 'en') {
    return {
      '01-spec.md': `# 01. Tool Positioning & Interaction Mode Specification\n\n- **Package Name**: {{PACKAGE_NAME}}\n- **CLI Name**: {{CLI_NAME}}\n- **Interaction Mode**: \`${mode}\` (\`conversational\` Zero-Command Chat after init / \`workbench\` Hybrid / \`cli\` Staged Pipeline)\n- **Target Audience**: {{TARGET_AUDIENCE}}\n\n## Core Problem & Value Proposition\n{{CORE_VALUE_PROPOSITION}}\n`,
      '02-workflow.md': `# 02. Workflow & Output Document Architecture\n\n## Conversational Triggers or CLI Flow\n- **Primary Trigger**: {{PRIMARY_TRIGGER}}\n- **Key Steps**:\n  1. {{STEP_1_DESCRIPTION}}\n  2. {{STEP_2_DESCRIPTION}}\n\n## Output Deliverables\n- {{OUTPUT_DELIVERABLE_LIST}}\n`,
      '03-agent-rules.md': `# 03. AI Agent Skill Guidance & Anti-Hallucination Rules\n\n## Core Guardrails\n- **Language Lock**: \`${lang}\`\n- **Domain Constraints**: {{DOMAIN_CONSTRAINTS}}\n- **Verification Criteria**: {{VERIFICATION_CRITERIA}}\n`,
      '04-release-plan.md': `# 04. Scaffolding Generation & npm Release Plan\n\n## npm Package & Release Configuration\n- **Target Output Directory**: {{TARGET_OUTPUT_DIR}}\n- **Verification Checklist**:\n  - [ ] Passed 0-Token \`verify\` check\n  - [ ] Built npm package structure via \`${cliName} build\` / \`${cliName} pack\`\n  - [ ] Ready for GitHub Actions \`.github/workflows/publish.yml\` or \`npm publish --access public\`\n`
    };
  }

  if (lang === 'zh-CN') {
    return {
      '01-spec.md': `# 01. 工具定位与交互模式规格书\n\n- **npm 套件名称 (Package Name)**：{{PACKAGE_NAME}}\n- **CLI 指令名称 (CLI Name)**：{{CLI_NAME}}\n- **终端用户交互形态 (Interaction Mode)**：\`${mode}\`（\`conversational\` 安装 init 后免指令纯自然语言对话 / \`workbench\` 混合工作台 / \`cli\` 阶段指令）\n- **目标受众**：{{TARGET_AUDIENCE}}\n\n## 核心痛点与价值主张\n{{CORE_VALUE_PROPOSITION}}\n`,
      '02-workflow.md': `# 02. 业务流程与产出文档结构设计\n\n## 自然语言对话触发或 CLI 流程\n- **触发方式**：{{PRIMARY_TRIGGER}}\n- **核心步骤**：\n  1. {{STEP_1_DESCRIPTION}}\n  2. {{STEP_2_DESCRIPTION}}\n\n## 产出文档清单\n- {{OUTPUT_DELIVERABLE_LIST}}\n`,
      '03-agent-rules.md': `# 03. AI Agent 技能引导与防幻觉检核规则\n\n## 核心规范\n- **锁定语言**：\`${lang}\`\n- **领域检核规则**：{{DOMAIN_CONSTRAINTS}}\n- **防幻觉验收条件**：{{VERIFICATION_CRITERIA}}\n`,
      '04-release-plan.md': `# 04. npm 套件组装与验收发布计划\n\n## 产出与发布设定\n- **目标输出路径**：{{TARGET_OUTPUT_DIR}}\n- **验收检查表**：\n  - [ ] 通过 0-Token \`verify\` 检查\n  - [ ] 执行 \`${cliName} build\` / \`${cliName} pack\` 组装完整 npm 套件结构\n  - [ ] 准备通过 GitHub Actions (\`publish.yml\`) 或 \`npm publish --access public\` 发布\n`
    };
  }

  if (lang === 'ja') {
    return {
      '01-spec.md': `# 01. ツール位置付けと対話モード仕様書\n\n- **npm パッケージ名 (Package Name)**：{{PACKAGE_NAME}}\n- **CLI コマンド名 (CLI Name)**：{{CLI_NAME}}\n- **対話モード (Interaction Mode)**：\`${mode}\`（\`conversational\` init 後にコマンド不要の自然言語対話 / \`workbench\` ハイブリッド / \`cli\` パイプライン）\n- **対象ユーザー**：{{TARGET_AUDIENCE}}\n\n## 解決する課題とコアバリュー\n{{CORE_VALUE_PROPOSITION}}\n`,
      '02-workflow.md': `# 02. 業務フローと成果物ドキュメント構造設計\n\n## 自然言語トリガーまたは CLI フロー\n- **開始トリガー**：{{PRIMARY_TRIGGER}}\n- **主要ステップ**：\n  1. {{STEP_1_DESCRIPTION}}\n  2. {{STEP_2_DESCRIPTION}}\n\n## 成果物リスト\n- {{OUTPUT_DELIVERABLE_LIST}}\n`,
      '03-agent-rules.md': `# 03. AI Agent スキル誘導とハルシネーション防止ルール\n\n## コアガードレール\n- **固定言語**：\`${lang}\`\n- **ドメイン制約**：{{DOMAIN_CONSTRAINTS}}\n- **検証基準**：{{VERIFICATION_CRITERIA}}\n`,
      '04-release-plan.md': `# 04. npm パッケージビルドとリリース計画\n\n## 出力・公開設定\n- **出力先ディレクトリ**：{{TARGET_OUTPUT_DIR}}\n- **検証チェックリスト**：\n  - [ ] 0-Token \`verify\` チェック合格\n  - [ ] \`${cliName} build\` / \`${cliName} pack\` で npm パッケージ構造を生成完了\n  - [ ] GitHub Actions (\`publish.yml\`) または \`npm publish --access public\` による公開準備完了\n`
    };
  }

  if (lang === 'ko') {
    return {
      '01-spec.md': `# 01. 도구 포지셔닝 및 인터랙션 모드 명세서\n\n- **npm 패키지 이름 (Package Name)**: {{PACKAGE_NAME}}\n- **CLI 명령어 이름 (CLI Name)**: {{CLI_NAME}}\n- **인터랙션 모드 (Interaction Mode)**: \`${mode}\` (\`conversational\` init 후 명령어 없는 자연어 대화 / \`workbench\` 하이브리드 / \`cli\` 파이프라인)\n- **대상 사용자**: {{TARGET_AUDIENCE}}\n\n## 핵심 문제 및 가치 제안\n{{CORE_VALUE_PROPOSITION}}\n`,
      '02-workflow.md': `# 02. 비즈니스 워크플로우 및 산출물 구조 설계\n\n## 자연어 대화 트리거 또는 CLI 흐름\n- **시작 트리거**: {{PRIMARY_TRIGGER}}\n- **핵심 단계**:\n  1. {{STEP_1_DESCRIPTION}}\n  2. {{STEP_2_DESCRIPTION}}\n\n## 산출물 목록\n- {{OUTPUT_DELIVERABLE_LIST}}\n`,
      '03-agent-rules.md': `# 03. AI Agent 스킬 가이드 및 환각 방지 검증 규칙\n\n## 핵심 가이드라인\n- **고정 언어**: \`${lang}\`\n- **도메인 제약 조건**: {{DOMAIN_CONSTRAINTS}}\n- **검증 기준**: {{VERIFICATION_CRITERIA}}\n`,
      '04-release-plan.md': `# 04. npm 패키지 빌드 및 릴리스 검증 계획\n\n## 출력 및 배포 설정\n- **대상 출력 디렉터리**: {{TARGET_OUTPUT_DIR}}\n- **검증 체크리스트**:\n  - [ ] 0-Token \`verify\` 검사 통과\n  - [ ] \`${cliName} build\` / \`${cliName} pack\`을 통한 npm 패키지 구조 생성 완료\n  - [ ] GitHub Actions (\`publish.yml\`) 또는 \`npm publish --access public\` 배포 준비 완료\n`
    };
  }

  // Default: zh-TW
  return {
    '01-spec.md': `# 01. 工具定位與互動模式規格書\n\n- **npm 套件名稱 (Package Name)**：{{PACKAGE_NAME}}\n- **CLI 指令名稱 (CLI Name)**：{{CLI_NAME}}\n- **終端使用者互動型態 (Interaction Mode)**：\`${mode}\`（\`conversational\` 安裝 init 後免指令純自然語言對話 / \`workbench\` 混合工作台 / \`cli\` 階段指令）\n- **目標受眾**：{{TARGET_AUDIENCE}}\n\n## 核心痛點與價值主張\n{{CORE_VALUE_PROPOSITION}}\n`,
    '02-workflow.md': `# 02. 業務流程與產出文件結構設計\n\n## 自然語言對話觸發或 CLI 流程\n- **觸發方式**：{{PRIMARY_TRIGGER}}\n- **核心步驟**：\n  1. {{STEP_1_DESCRIPTION}}\n  2. {{STEP_2_DESCRIPTION}}\n\n## 產出文件清單\n- {{OUTPUT_DELIVERABLE_LIST}}\n`,
    '03-agent-rules.md': `# 03. AI Agent 技能引導與防幻覺檢核規則\n\n## 核心規範\n- **鎖定語言**：\`${lang}\`\n- **領域檢核規則**：{{DOMAIN_CONSTRAINTS}}\n- **防幻覺驗收條件**：{{VERIFICATION_CRITERIA}}\n`,
    '04-release-plan.md': `# 04. npm 套件組裝與驗收發布計畫\n\n## 產出與發布設定\n- **目標輸出路徑**：{{TARGET_OUTPUT_DIR}}\n- **驗收檢查表**：\n  - [ ] 通過 0-Token \`verify\` 檢查\n  - [ ] 執行 \`${cliName} build\` / \`${cliName} pack\` 組裝完整可發布的 npm 套件結構\n  - [ ] 準備透過 GitHub Actions (\`.github/workflows/publish.yml\`) 或 \`npm publish --access public\` 發布至 npm\n`
  };
}

/**
 * Generates localized README content in any of the 5 supported languages (zh-TW, zh-CN, en, ja, ko)
 * with top 5-language navigation bar for generated projects & workspaces!
 */
function renderWorkspaceReadme({
  lang = 'zh-TW',
  mode = 'workbench',
  cliName = CLI_NAME,
  pkgName = PACKAGE_NAME,
  repoSlug = null,
  summary = null
}) {
  const shortName = pkgName.includes('/') ? pkgName.split('/').pop() : pkgName;
  const githubRepo = repoSlug || `https://github.com/loviusc/${shortName}`;
  const navBar = `<p align="center">
  <b>🌐 Languages:</b>
  <a href="${githubRepo}/blob/main/README.zh-TW.md"><b>繁體中文</b></a> |
  <a href="${githubRepo}/blob/main/README.zh-CN.md"><b>简体中文</b></a> |
  <a href="${githubRepo}/blob/main/README.en.md"><b>English</b></a> |
  <a href="${githubRepo}/blob/main/README.ja.md"><b>日本語</b></a> |
  <a href="${githubRepo}/blob/main/README.ko.md"><b>한국어</b></a>
</p>`;

  const badges = `[![npm version](https://img.shields.io/npm/v/${pkgName}.svg)](https://www.npmjs.com/package/${pkgName})
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)`;

  const isConv = mode === 'conversational';

  if (lang === 'zh-CN') {
    const desc = summary || (isConv
      ? `零外部依赖的免指令对话式 AI 周期性会议整理与知识库工具（安装并执行 \`${cliName} init\` 后，日常无需输入任何 CLI 指令，直接用自然语言对话即可将文字、录音、录像转化为语者分离逐字稿、摘要重点、待办事项与会后衍生文档）。`
      : `零外部依赖的 Node.js CLI 工具与 AI Agent 工作台（内置 5 语系 i18n、0-Token 防幻觉 \`verify\`、安全 Git \`commit\` 与 0-Token A4 \`pdf\` 导出）。`);
    return `# ${pkgName} (\`${cliName}\`) — 简体中文说明书

${badges}

> ${desc}

${navBar}

---

## 1. 核心设计思想与功能总览 (Core Design Philosophy & Key Features)

### 1.1 四大核心设计思想 (Core Design Philosophy)
1. **免指令纯自然语言交互 (\`Zero-Command Conversational Mode\`)**：仅需在初始化工作区时执行一次 \`${cliName} init\`，日常新建会议、汇入录音/录像、校对发言人、追踪待办与会后讨论**100% 通过自然语言聊天完成，零 CLI 指令负担**。
2. **「非 LLM 专用转录 + AI 语义后处理」二阶段解耦与极致省 Token (\`ASR First, AI Second\`)**：
   - **Stage 1（0 LLM Token 取得初稿）**：支持直接汇入会议软件/录音笔现成字幕（\`.srt/.vtt/.txt\`）或自动调用本地离线语音引擎（\`WhisperX\` / \`mlx_whisper\` / \`faster-whisper\`）及专用 \`STT API\`，不让对话型 LLM 直接硬啃数百 MB 音频。
   - **Stage 2（字典映射 + 0-Token 批次替换）**：AI 仅输出精简的「语者代号（\`SPEAKER_00 -> 真实姓名\`）与同音专有名词映射表」，由本地批次替换生成 \`01-transcript.md\`（**节省 90%+ Output Token**）。
3. **零幻觉、三级可控风险与高不确定性主动请求人为介入 (\`Zero-Hallucination & 3-Tier Risk Control\`)**：
   - **🟢 已验证事实**：100% 附带指向 \`01-transcript.md#Lx-Ly\` 的真实行号与 \`[HH:MM:SS]\` 时间戳引用。
   - **🟡 可控推论风险**：依上下文合理推断但主动标明 \`🟡 [上下文推论 - 建议确认]\` 与推论理由。
   - **🔴 高不确定性需人为介入**：当遇到多人重叠发言无法确认语者、关键金额/日期/数据听不清楚、或会议争议未明确拍板时，**严禁 AI 瞎猜或脑补**，强制标记 \`⚠️ [需人为确认 - HH:MM:SS]\` 并在对话中主动列出「🚨 需人为介入确认清单」。
4. **极简纯净目录与重要多媒体同目录永久保存 (\`Zero-Clutter Folder & Co-located Media\`)**：
   - 所有底层引导规则（\`AGENTS.md\`、\`skills/\`、\`rules/\`）100% 隐藏收纳于 \`.${cliName}/\`，**绝不在工作区根目录或会议文件夹产生任何多余外露系统文件**。
   - 原始录音（\`.mp3/.m4a/.wav\`）与录像（\`.mp4/.mov/.mkv\`）直接保存在当次会议日期目录下的 \`media/\` 子目录中，与三份会议文档永久绑定，同时通过 \`.gitignore\` 自动排除大体积二进制影音档，避免卡死 \`Git\`。

### 1.2 核心功能一览 (Key Features)
- **多来源输入与语者分离 (\`Speaker Diarization\`)**：支持文字速记、录音、录像与字幕初稿，自动区分并实名标记「谁说了什么」。
- **周期性「项目主题 -> 日期」双层归档与三档分离**：每次会议固定产出 \`01-transcript.md\`（语者逐字稿）、\`02-summary.md\`（执行摘要、核心重点与决议）、\`03-todos-and-discussion.md\`（待办事项表与会后延伸讨论区）。
- **跨场次历史会议冲突主动提醒 (\`Cross-Meeting Conflict Alert\`)**：通过读取项目 \`index.md\` 滚动基准快照（$O(1)$ 常数 Token 消耗），自动比对本次会议与之前会议在决议、时程、预算或负责人上的矛盾，并以「本次 \`#Lx-Ly\` vs. 前次日期 \`#Lx-Ly\`」主动提醒。
- **会后衍生文档与范本套用引擎 (\`Deliverables & Templates\`)**：支持套用 \`templates/\` 自定义范本（如变更单、PRD、客户确认信）将会议结论自动生成至 \`deliverables/\`；范本中未在会议提及的栏位强制标记 \`⚠️ [会议未提及 - 需人工补填]\`。
- **完稿后强制检核 \`Rule\` 与 0-Token \`A4 PDF / HTML\` 导出**：每次建档或更新后自动执行完稿检核 Rule 并输出检核报告；支持一键导出高品质 \`A4 PDF\` 或 \`HTML\`。

### 1.3 支持语言与国际化规范 (Supported Languages & 5-Language i18n)
| 语言代码 | 语言名称 | 语言纯粹性与技术名词规范 |
| :--- | :--- | :--- |
| \`zh-TW\` | 繁體中文（预设） | 锁定语系后产出 100% 使用该语言；标准技术名词（\`REST API\`, \`JWT\`, \`SQL\`, \`CI/CD\`, \`KPI\`, \`OKR\` 等）保留原生英文 |
| \`zh-CN\` | 简体中文 | 完整支持简体中文会议转录整理与多语系说明文档 |
| \`en\` | English | Full English meeting transcription, synthesis, and verification support |
| \`ja\` | 日本語 | 日本語での議事録作成・話者分離・タスク管理に完全対応 |
| \`ko\` | 한국어 | 한국어 회의록 정리, 화자 분리 및 액션 아이템 관리 완벽 지원 |

---

## 2. 安装说明 (Installation Guide)

### 环境需求
- **Node.js**: \`>= 18.0.0\`（内置 \`npm\`）
- **Git**: 用于安全归档与远端同步（\`${cliName} commit\`）
- **（选用）本地语音转录工具**：如 \`mlx_whisper\`、\`faster-whisper\`、\`WhisperX\` 或 \`ffmpeg\`（亦支持直接汇入外部已转好的字幕初稿 + 原始影音）

\`\`\`bash
# 方式 A：通过 npm 全局安装
npm install -g ${pkgName}

# 方式 B：在克隆的仓库中使用跨平台脚本安装 (macOS / Linux)
./scripts/install.sh          # 全局安装
./scripts/install.sh --local  # 本地开发软链接 (npm link)

# Windows (PowerShell / CMD)
scripts\\install.bat
\`\`\`

---

## 3. 使用说明 (Usage Guide)

### 3.1 工作区初始化与资料夹结构说明 (\`Folder Architecture\`)

在您的会议管理文件夹中执行一次初始化：

\`\`\`bash
${cliName} init --full --lang zh-CN
\`\`\`

**极简纯净的资料夹结构说明**（所有 AI 技能与完稿检核 \`rules\` 均隐藏于 \`.${cliName}/\`，工作区绝无多余外露杂项文件）：

\`\`\`text
my-meetings-workspace/
├── .gitignore                                    # 自动排除敏感档与 meetings/**/media/* 影音大档（防卡死 Git）
├── .${cliName}.json                              # 锁定语系与 conversational 免指令模式设定
├── .${cliName}/                                  # [隐藏系统目录] 收纳 AGENTS.md、SKILL.md 与 post-meeting-inspection.md 检核规则
├── readme.md (+ README.zh-TW/zh-CN/en/ja/ko.md)  # 5 国语言完整说明书
└── meetings/                                     # 【核心会议知识库目录】按「项目主题 -> 日期」双层组织
      └── Project-A (A专案)/
            ├── index.md                          # 专案会议总览、当前有效决议滚动快照 ($O(1)$ 跨期冲突比对基准) 与跨期未完成待办表
            ├── templates/                        # (选用) 专案专属会后文档范本库 (如：变更单范本、客户确认信范本、PRD 范本)
            ├── 2026-11-20_Weekly-Sync/           # 【单场会议日期目录】依 YYYY-MM-DD_会议名称 建立
            │     ├── media/                      # 永久保存该场会议的重要原始录音 (.mp3/.m4a) 与录像 (.mp4/.mov)
            │     ├── 01-transcript.md            # 1. 语者分离逐字稿 (顶部含 ./media/ 链接与 SHA-256，内文为 [HH:MM:SS] 发言人：内容)
            │     ├── 02-summary.md               # 2. 会议摘要、重点与决议 (每条均附 ./01-transcript.md#Lx-Ly 来源引用与三级风险标记)
            │     ├── 03-todos-and-discussion.md  # 3. 待办事项清单 (负责人/期限/状态/TBD)、🚨 需人为介入清单、⚡ 跨期冲突提醒与会后讨论区
            │     └── deliverables/               # (按需产出) 会后衍生业务文档 (如 follow-up-email.md, change-request.md)
            └── 2026-11-27_Weekly-Sync/           # 下一场周期性会议（自动承接前期未完成待办并比对历史决议冲突）
\`\`\`

### 3.2 日常免指令新建会议与汇入媒体的 3 种方式 (VS Code / Claude / Gemini / Cursor / Antigravity)

${isConv
    ? `#### 免指令自然语言对话模式 (\`conversational\`)
完成 \`${cliName} init\` 后，日常使用**完全不需要输入任何 CLI 指令**，支持以下 3 种最顺手的方式新建会议并汇入媒体：
1. **方式 A（对话框直接拖入影音/文字，AI 全自动建档归位）**：直接把桌面或下载区的 \`.mp3\` / \`.mp4\`（及选用字幕初稿）拖进 AI 对话框，说：*“这是今天 A 专案的周会录音，与会者有王经理跟李工，帮我整理”*。AI 会自动建立 \`meetings/A专案/YYYY-MM-DD_周会/media/\`、将影音档归位保存，并产出 \`01\`~\`03\` 三份文档。
2. **方式 B（档案总管随手丢进目录，AI 自动侦测归位）**：在 Finder / 档案总管把影音档随手丢进工作区根目录或 \`meetings/A专案/\` 下，对 AI 说：*“帮我把刚放进去的录像整理成 A 专案今天的会议”*。AI 会自动扫描并移入当次会议的 \`media/\` 子目录后完成整理。
3. **方式 C（说“新增会议”启动互动引导）**：对 AI 说 *“新增会议”*，AI 会主动列出已有专案供选择、预先载入上次未完成待办并建好当日 \`media/\` 文件夹。`
    : `#### AI 对话阶段工作流指令 (\`workbench\` / \`cli\`)
支持 \`tool:init (gti) -> tool:propose (gtp) -> tool:analyze (gta) -> tool:scaffold (gts) -> tool:commit (gtc)\`。`}

### 3.3 内置辅助 CLI 指令集（选用）

| 指令 | 说明 |
| :--- | :--- |
| \`${cliName} init [--full] [--lang zh-TW\\|zh-CN\\|en\\|ja\\|ko]\` | 初始化极简纯净工作区骨架并自动执行 \`git init\` |
| \`${cliName} verify [目标]\` | **0-Token 防幻觉检查**：检查未填 \`{{...}}\` 占位符与 \`#Lx-Ly\` 逐字稿行号引用真实性 |
| \`${cliName} pdf [目标] [--merge] [--html] [--output <file>]\` | 0-Token 将会议记录或规格合并导出为高品质 A4 PDF 或 HTML |
| \`${cliName} commit [目标] [-m <消息>]\` | 先跑 \`verify\` -> 安全 Git 归档（自动排除敏感档与影音大档，遇冲突安全停止） |
| \`${cliName} upgrade [--dry-run]\` | 更新内建规则模板（保留锁定语言、\`<claude-mem-context>\` 与附加于档尾的客制段落；若修改过内文会自动存 \`.bak\` 备份） |
| \`${cliName} status\` / \`check\` / \`doctor\` | 查看进度统计、核心文件检查与环境完整性诊断 |
| \`${cliName} new-meeting <专案> <主题> --transcript <file> [--media <file>] [--empty] [--force] [--force-all]\` | 确定性建立会议目录、计算媒体 \`SHA-256\` 并执行 0-Token 语者批次替换（\`--empty\` 建立待确认骨架；\`--force\` 仅重写 \`01\` 并备份 \`.bak\`；\`--force-all\` 重写 \`01~03\` 并备份 \`.bak\`） |
| \`${cliName} sync-hash [会议目录] [--yes]\` | 人工微调 \`01-transcript.md\` 错字并确认下游无误后，同步 \`02/03\` 之 \`transcript-sha256\` 指纹且不覆盖人工内文（若改动 >5% 或引用失效需加 \`--yes\`） |
| \`${cliName} inspect <会议目录>\` | 执行完稿强制检核 Rule（支援结构化 \`- **键**：值\` 与自然语言 **上线日/预算/负责人** 跨期冲突侦测；若含 \`🚨\` 或 \`⚡\` 则回传非 0 状态码） |
| \`${cliName} deliverable --meeting <dir> --template <file> [--out <file>]\` | 套用范本产出会后衍生文档至 \`deliverables/\`，未提及栏位自动标记 \`⚠️ [會議未提及 - 需人工補填]\` |

---

## 4. 实战使用范例 (Examples)

### 范例 1：新建周期性专案会议、自动侦测跨期冲突与人为介入提醒

\`\`\`bash
# 初次建立会议知识库（仅需执行一次）
mkdir team-meetings && cd team-meetings
${cliName} init --full --lang zh-CN
\`\`\`

接着在 AI 聊天窗口直接用自然语言对话（无需任何指令）：

\`\`\`text
[拖入 zoom_recording.mp4 与 rough_transcript.txt]
这是今天 A专案 (2026-11-20) 的架构同步会议，出席者有王经理 (PM) 和李工 (Backend)，请帮我整理。
\`\`\`

AI 会自动完成归档与三档提炼，并在回复末尾自动执行**完稿检核 Rule**：
- 自动建立 \`meetings/A专案/2026-11-20_架构同步会议/\`，将 \`zoom_recording.mp4\` 移入 \`media/\`。
- 产出实名化 \`01-transcript.md\`、附 \`#Lx-Ly\` 引用的 \`02-summary.md\` 与 \`03-todos-and-discussion.md\`，并更新 \`meetings/A专案/index.md\`。
- 主动弹出提醒：
  - **🚨 需人为介入确认清单**：*“\`[00:21:40]\` 预算金额听不清楚（疑似 50 万或 15 万），请点击 \`./media/zoom_recording.mp4\` 确认原音。”*
  - **⚡ 跨期会议冲突提醒**：*“本次会议提到上线日改为 \`12/15\`（见 \`01-transcript.md#L64\`），与 \`2026-11-13\` 会议决议的 \`12/01\` 冲突，请确认是否为正式变更？”*

### 范例 2：会后延伸讨论与套用范本产出衍生文档 (\`deliverables/\`)

在同一个对话窗口继续用自然语言说：

\`\`\`text
1. 刚刚那个预算金额确认是 50 万，上线日 12/15 是正式变更，帮我更新进去。
2. 另外请根据今天确认的决议，套用 meetings/A专案/templates/change-request.md 范本，帮我产出一份规格变更单。
\`\`\`

AI 会立即更新 \`01\`~\`03\` 与 \`index.md\` 基准快照，并在 \`meetings/A专案/2026-11-20_架构同步会议/deliverables/change-request.md\` 产出变更单（若范本中有“法务审核人”栏位在会议中未提及，AI 会自动标注 \`⚠️ [会议未提及 - 需人工补填]\`，绝不产生幻觉）。

## License
MIT
`;
  }

  if (lang === 'en') {
    const desc = summary || (isConv
      ? `A zero-dependency, Zero-Command Conversational AI Meeting Notes & Knowledge Base Workbench. After running \`${cliName} init\`, organize periodic project meetings from text, audio, or video into speaker-diarized transcripts, cited summaries, action items, conflict alerts, and template deliverables purely via natural language chat!`
      : `A zero-dependency Node.js CLI & AI Agent Workbench featuring 5-language i18n, 0-Token anti-hallucination \`verify\`, safe Git \`commit\`, and 0-Token A4 \`pdf\` export.`);
    return `# ${pkgName} (\`${cliName}\`) — English Documentation

${badges}

> ${desc}

${navBar}

---

## 1. Core Design Philosophy & Key Features

### 1.1 Four Core Design Pillars
1. **Zero-Command Conversational Interaction (\`conversational\` Mode)**: Run \`${cliName} init\` once; thereafter, creating meetings, importing audio/video, mapping speakers, discussing action items, and generating follow-up deliverables are done **100% in natural language chat with zero CLI commands to memorize**.
2. **Decoupled 2-Stage Transcription & Token-Efficiency Architecture (\`ASR First, AI Second\`)**:
   - **Stage 1 (Non-LLM ASR / 0-LLM-Token Draft)**: Directly import existing subtitles (\`.srt/.vtt/.txt\`) or invoke local offline ASR engines (\`WhisperX\`, \`mlx_whisper\`, \`faster-whisper\`) or dedicated \`STT APIs\` so conversational LLMs never waste massive audio tokens or suffer long-audio dropouts.
   - **Stage 2 (Speaker Mapping Dictionary + 0-Token Batch Replacement)**: The AI outputs a compact Speaker & Terminology Mapping Table (\`SPEAKER_00 -> Real Name\`) applied via local batch replacement to generate \`01-transcript.md\`, **saving 90%+ in Output Tokens**.
3. **Zero-Hallucination, 3-Tier Controllable Risk & Proactive Human-in-the-Loop**:
   - **🟢 Verified Fact**: Backed 100% by exact \`01-transcript.md#Lx-Ly\` line citations and \`[HH:MM:SS]\` timestamps.
   - **🟡 Controllable Inferred Risk**: Reasonably inferred from context, explicitly tagged \`🟡 [Context Inference - Please Confirm]\` with rationale.
   - **🔴 High Uncertainty (Human Intervention Required)**: When speakers overlap, key numbers/dates/terms are inaudible, or decisions remain unresolved, the AI **never guesses**—it flags \`⚠️ [Human Review Required - HH:MM:SS]\` and surfaces a proactive checklist in chat.
4. **Zero-Clutter Directory & Co-located Original Media**:
   - All AI rules and skills (\`AGENTS.md\`, \`skills/\`, \`rules/\`) are 100% hidden inside \`.${cliName}/\`, keeping your workspace root and meeting directories completely clean.
   - Important original audio/video files are permanently co-located inside each meeting's \`media/\` subfolder while automatically protected in \`.gitignore\` so large binary files never break \`Git\`.

### 1.2 Key Features
- **Multi-Source Input & Speaker Diarization**: Supports text notes, audio (\`.mp3/.m4a/.wav\`), video (\`.mp4/.mov/.mkv\`), and subtitle drafts with clear speaker attribution.
- **Periodic \`Project -> Date\` Hierarchy & 3-File Separation**: Every meeting produces \`01-transcript.md\`, \`02-summary.md\`, and \`03-todos-and-discussion.md\`.
- **Cross-Meeting Historical Conflict Detection ($O(1)$ Token Cost)**: Compares new meeting decisions, timelines, budgets, and owners against the rolling snapshot in \`meetings/<Project>/index.md\` (never reloading old full transcripts) and alerts on contradictions with dual \`#Lx-Ly\` citations.
- **Post-Meeting Deliverable & Template Engine (\`deliverables/\` & \`templates/\`)**: Generates follow-up emails, PRDs, or change requests from custom templates; any template field not discussed in the meeting is strictly marked \`⚠️ [Not Mentioned in Meeting - Manual Input Required]\`.
- **Mandatory Post-Creation Inspection Rule & 0-Token \`A4 PDF / HTML\` Export**: Automatically audits completeness, citations, risk flags, and conflicts after every file creation or update.

### 1.3 Supported Languages (5-Language i18n)
Supports **Traditional Chinese (\`zh-TW\`)**, **Simplified Chinese (\`zh-CN\`)**, **English (\`en\`)**, **Japanese (\`ja\`)**, and **Korean (\`ko\`)** with strict single-language purity while preserving standard English technical terms (\`REST API\`, \`JWT\`, \`SQL\`, \`CI/CD\`, \`KPI\`, \`OKR\`).

---

## 2. Installation Guide

### Prerequisites
- **Node.js**: \`>= 18.0.0\` (includes \`npm\`)
- **Git**: Required for safe archiving and remote sync (\`${cliName} commit\`)
- **(Optional) Local ASR Engine**: \`mlx_whisper\`, \`faster-whisper\`, \`WhisperX\`, or \`ffmpeg\`

\`\`\`bash
# Option A: Global install from npm
npm install -g ${pkgName}

# Option B: Install from cloned repository (macOS / Linux)
./scripts/install.sh          # Global install (npm install -g)
./scripts/install.sh --local  # Local development symlink (npm link)

# Windows (PowerShell / CMD)
scripts\\install.bat
\`\`\`

---

## 3. Usage Guide

### 3.1 Workspace Initialization & Directory Architecture (\`${cliName} init\`)

Initialize your meeting workspace once:

\`\`\`bash
${cliName} init --full --lang en
\`\`\`

**Clean Directory Architecture** (all internal AI skills and rules are hidden inside \`.${cliName}/\`; zero exposed \`skills/\` or \`rules/\` clutter):

\`\`\`text
my-meetings-workspace/
├── .gitignore                                    # Excludes sensitive files & large media in meetings/**/media/* from Git
├── .${cliName}.json                              # Locked language & conversational mode configuration
├── .${cliName}/                                  # [Hidden System Folder] Stores AGENTS.md, SKILL.md & post-meeting-inspection.md
├── readme.md (+ README.zh-TW/zh-CN/en/ja/ko.md)  # Full 5-language documentation
└── meetings/                                     # [Core Meetings Knowledge Base] Organized by Project -> Date
      └── Project-A/
            ├── index.md                          # Project overview, rolling active-decision snapshot ($O(1)$ conflict baseline) & open todos
            ├── templates/                        # (Optional) Reusable templates for post-meeting deliverables (e.g. PRD, Change Request)
            ├── 2026-11-20_Weekly-Sync/           # [Single Meeting Date Folder] YYYY-MM-DD_Meeting-Title
            │     ├── media/                      # Permanently stores original audio (.mp3/.m4a) & video (.mp4/.mov) for this meeting
            │     ├── 01-transcript.md            # 1. Speaker-diarized transcript (with ./media/ link, SHA-256 & [HH:MM:SS] Speaker tags)
            │     ├── 02-summary.md               # 2. Executive summary, key points & decisions (with ./01-transcript.md#Lx-Ly citations)
            │     ├── 03-todos-and-discussion.md  # 3. Action items table, 🚨 Human-in-the-Loop list, ⚡ Conflict Alerts & Post-Meeting Discussion
            │     └── deliverables/               # (On-Demand) Post-meeting generated artifacts (e.g., follow-up-email.md, prd-draft.md)
            └── 2026-11-27_Weekly-Sync/           # Next periodic meeting (carries over open todos & checks for historical conflicts)
\`\`\`

### 3.2 Three Zero-Command Ways to Create Meetings & Import Media

${isConv
    ? `#### Zero-Command Conversational Mode (\`conversational\`)
After running \`${cliName} init\`, end users **never need to type CLI commands** or manually create deep folders:
1. **Path A (Drag & Drop directly into AI Chat)**: Drag an audio/video file (or paste text notes) into chat and say: *"This is today's Project-A weekly sync with Alice (PM) and Bob (Eng), please organize it."* The AI automatically creates \`meetings/Project-A/YYYY-MM-DD_Weekly-Sync/media/\`, archives the media file, and generates \`01\`~\`03\`.
2. **Path B (Drop into Folder in Finder/Explorer & Tell AI)**: Drop media files into the workspace root or \`meetings/Project-A/\` and say: *"Organize the recording I just dropped in for Project-A today."* The AI detects the new media file, moves it into the meeting's \`media/\` directory, and synthesizes all files.
3. **Path C (Say "New Meeting" for Interactive Setup)**: Simply type *"New meeting"*; the AI lists existing projects, loads unfinished action items from the previous session, and prepares the date folder.`
    : `#### AI Chat Workflow Commands (\`workbench\` / \`cli\`)
Supports \`tool:init (gti) -> tool:propose (gtp) -> tool:analyze (gta) -> tool:scaffold (gts) -> tool:commit (gtc)\`.`}

### 3.3 Built-in Optional CLI Utilities

| Command | Description |
| :--- | :--- |
| \`${cliName} init [--full] [--lang zh-TW\\|zh-CN\\|en\\|ja\\|ko]\` | Initialize clean workspace skeleton and run \`git init\` |
| \`${cliName} verify [target]\` | **0-Token Anti-Hallucination Check**: detects unfilled \`{{...}}\` placeholders and validates \`#Lx-Ly\` transcript citations |
| \`${cliName} pdf [target] [--merge] [--html] [--output <file>]\` | 0-Token export of meeting notes or specs to A4 PDF or HTML |
| \`${cliName} commit [target] [-m <msg>]\` | Pre-commit \`verify\` -> safe Git archive (excludes sensitive files & large media, stops safely on merge conflicts) |
| \`${cliName} upgrade [--dry-run]\` | Refresh built-in rule templates (preserves locked language, \`<claude-mem-context>\` & custom sections appended at end of file; saves \`.bak\` backup if modified in-place) |
| \`${cliName} status\` / \`check\` / \`doctor\` | Display progress statistics, file integrity checks, and environment diagnostics |
| \`${cliName} new-meeting <project> <title> --transcript <file> [--media <file>] [--empty] [--force] [--force-all]\` | Deterministically create meeting folder, compute media \`SHA-256\`, and run 0-Token speaker batch replacement (\`--empty\` creates unverified \`⚠️\` skeleton; \`--force\` only overwrites \`01\` with \`.bak\` backup; \`--force-all\` overwrites \`01~03\` with \`.bak\`) |
| \`${cliName} sync-hash [meetingDir] [--yes]\` | Sync \`transcript-sha256\` in \`02-summary.md\` & \`03-todos-and-discussion.md\` after minor manual transcript typo edits without overwriting prose (requires \`--yes\` if >5% changed or citations are broken) |
| \`${cliName} inspect <meetingDir>\` | Run Post-Creation Inspection Rule (detects cross-meeting conflicts on any \`- **Key**: Value\` field and natural-language **Launch Date / Budget / Owner**; exits non-zero on \`🚨\` or \`⚡\`) |
| \`${cliName} deliverable --meeting <dir> --template <file> [--out <file>]\` | Generate template deliverable in \`deliverables/\`, flagging missing fields with \`⚠️ [會議未提及 - 需人工補填]\` |

---

## 4. Step-by-Step Examples

### Example 1: Periodic Meeting Organization with Conflict & Uncertainty Alerts

\`\`\`bash
# Initialize workspace once
mkdir team-meetings && cd team-meetings
${cliName} init --full --lang en
\`\`\`

In your AI chat window, talk in plain natural language:

\`\`\`text
[Drag in zoom_recording.mp4 and rough_transcript.txt]
Organize today's Project-A architecture sync (2026-11-20). Attendees: Alice (PM) and Bob (Backend).
\`\`\`

The AI automatically archives the media into \`meetings/Project-A/2026-11-20_Architecture-Sync/media/\`, generates \`01-transcript.md\`, \`02-summary.md\`, and \`03-todos-and-discussion.md\`, updates \`meetings/Project-A/index.md\`, and runs the **Post-Creation Inspection Rule**:
- **🚨 Human Intervention Required**: *"At \`[00:21:40]\`, the budget figure is unclear ('500k' vs '150k'). Please verify via \`./media/zoom_recording.mp4\`."*
- **⚡ Cross-Meeting Conflict Alert**: *"Today's meeting sets launch date to \`12/15\` (\`01-transcript.md#L64\`), which conflicts with the \`12/01\` lock decided in \`2026-11-13\`. Is this an official change?"*

### Example 2: Post-Meeting Discussion & Template-Driven Deliverable Generation

Continue chatting in natural language:

\`\`\`text
1. Confirm the budget is 500k and 12/15 is an official schedule change.
2. Using meetings/Project-A/templates/change-request.md, generate a formal Change Request from today's decisions.
\`\`\`

The AI updates the meeting files and generates \`meetings/Project-A/2026-11-20_Architecture-Sync/deliverables/change-request.md\`, flagging any undiscussed template fields with \`⚠️ [Not Mentioned in Meeting - Manual Input Required]\`.

## License
MIT
`;
  }

  if (lang === 'ja') {
    const desc = summary || (isConv
      ? `外部依存ゼロ・コマンド不要の対話型 AI 議事録＆プロジェクト知識管理ツール。\`${cliName} init\` 実行後は CLI コマンド不要で、テキスト・録音・録画から話者分離付き文字起こし、要約・決定事項、ToDo、過去会議との矛盾検知、テンプレート成果物を自然言語チャットだけで作成します！`
      : `外部依存ゼロの Node.js CLI ＆ AI Agent ワークベンチ（5言語 i18n、0-Token ハルシネーション防止 \`verify\`、安全な Git \`commit\`、0-Token A4 \`pdf\` 出力を内蔵）。`);
    return `# ${pkgName} (\`${cliName}\`) — 日本語ドキュメント

${badges}

> ${desc}

${navBar}

---

## 1. 設計のコア思想と主な機能 (Core Design Philosophy & Key Features)

1. **コマンド不要の純粋な自然言語対話 (\`conversational\` モード)**：初回に \`${cliName} init\` を実行した後は、CLI コマンドを一切覚えることなく、普段のチャットだけで会議の新規作成、音声・動画の取り込み、話者名マッピング、会議後の議論や資料作成が完結します。
2. **「非 LLM 音声認識 + AI 意味補正」の二段階分離と徹底した省 Token 設計 (\`ASR First, AI Second\`)**：
   - **Stage 1（0 LLM Token で初稿取得）**：会議ツールの字幕（\`.srt/.vtt/.txt\`）の直接取り込み、またはローカル音声認識（\`WhisperX\` / \`mlx_whisper\`）と連携し、LLM に巨大な音声バイナリを直接読み込ませません。
   - **Stage 2（話者辞書マッピング + 0-Token 一括置換）**：AI は「\`SPEAKER_00 -> 実名\` と専門用語補正テーブル」のみを出力し、ローカル一括置換で \`01-transcript.md\` を生成するため **Output Token を 90% 以上削減**します。
3. **ハルシネーション（幻覚）ゼロ・3段階リスク管理と人間介入リクエスト (\`3-Tier Risk Control\`)**：
   - **🟢 検証済み事実**（\`01-transcript.md#Lx-Ly\` と \`[HH:MM:SS]\` 根拠付き）、**🟡 文脈推論リスク**、**🔴 高不確実性（要人間確認）**の3段階で管理。誰の発言か不明な箇所や聞き取れない数値、未決事項は勝手に推測せず \`⚠️ [要確認 - HH:MM:SS]\` と明示してユーザーに確認を求めます。
4. **クリーンなフォルダ構造と元メディアの同フォルダ保存 + 過去会議との矛盾検知**：
   - \`AGENTS.md\` や \`skills/\`、\`rules/\` はすべて隠しフォルダ \`.${cliName}/\` に格納され、作業フォルダを汚しません。
   - 重要な録音・録画ファイルは各会議フォルダ内の \`media/\` に永久保存され、過去会議の決定事項と矛盾がある場合は **⚡ 過去会議との矛盾アラート** を自動通知します。
- **対応言語（5言語 i18n）**：繁體中文 (\`zh-TW\`)、簡體中文 (\`zh-CN\`)、English (\`en\`)、日本語 (\`ja\`)、한국어 (\`ko\`)。

---

## 2. インストール手順 (Installation Guide)

- **Node.js**: \`>= 18.0.0\`（\`npm\` 同梱） / **Git**

\`\`\`bash
# 方法 A：npm からグローバルインストール
npm install -g ${pkgName}

# 方法 B：クローンしたリポジトリのスクリプトを使用 (macOS / Linux / Windows)
./scripts/install.sh
scripts\\install.bat
\`\`\`

---

## 3. 使い方・フォルダ構造説明 (Usage Guide & Folder Structure)

\`\`\`bash
${cliName} init --full --lang ja
\`\`\`

\`\`\`text
my-meetings-workspace/
├── .gitignore                                    # 機密ファイルと meetings/**/media/* の大容量メディアを Git から自動除外
├── .${cliName}.json                              # 固定言語と conversational モード設定
├── .${cliName}/                                  # [隠しフォルダ] AGENTS.md, SKILL.md, post-meeting-inspection.md ルールを格納
└── meetings/                                     # 【会議ナレッジベース】「プロジェクト -> 日付」の2階層で管理
      └── Project-A/
            ├── index.md                          # プロジェクト総覧・現在の決定事項スナップショット ($O(1)$ 矛盾検知用)・未完了 ToDo
            ├── templates/                        # (任意) 会議後に生成する資料のテンプレート置き場 (仕様変更書・確認メール等)
            └── 2026-11-20_Weekly-Sync/           # 【単回会議フォルダ】日付ごとに作成
                  ├── media/                      # 録音 (.mp3/.m4a)・録画 (.mp4/.mov) を会議資料と同じ場所に永久保存
                  ├── 01-transcript.md            # 1. 話者分離付き文字起こし (./media/ リンク・SHA-256・[HH:MM:SS] 話者名)
                  ├── 02-summary.md               # 2. 会議要約・重要ポイント・決定事項 (./01-transcript.md#Lx-Ly 引用付き)
                  ├── 03-todos-and-discussion.md  # 3. ToDo 一覧・🚨 要確認リスト・⚡ 過去会議との矛盾通知・会議後の追加議論
                  └── deliverables/               # (オンデマンド) テンプレート等から生成した会議後の派生ドキュメント
\`\`\`

### 会議の新規作成とメディア取り込みの3つの方法（コマンド不要）
1. **チャット画面へ直接ドラッグ＆ドロップ**：「今日の Aプロジェクト定例会の録音です。参加者は田中と佐藤、整理して」と伝えるだけで自動で \`meetings/Project-A/YYYY-MM-DD/media/\` を作成・格納し3ファイルを生成します。
2. **Finder / エクスプローラーでフォルダに置いてAIに伝える**：メディアをフォルダに置いて「今入れた動画をAプロジェクトの会議として整理して」と伝えます。
3. **「新しい会議」と話しかける**：AI が既存プロジェクト一覧と前回の未完了 ToDo を提示してフォルダを準備します。

---

## 4. 実践サンプル・使用例 (Examples)

\`\`\`text
[recording.mp4 をチャットにドラッグ]
今日の Project-A 仕様会議を整理して。その後、templates/change-request.md を使って変更申請書を deliverables/ に出力して。
\`\`\`

AI は3ファイルを作成後、**完稿検核 Rule** を自動実行し、聞き取れない数値や過去会議との矛盾があればアラートを表示します。また、テンプレート内で会議中に言及されなかった項目は捏造せず \`⚠️ [会議未言及 - 要手動追記]\` と明記します。

> **補助 CLI コマンド**: \`${cliName} verify\` / \`${cliName} inspect\` / \`${cliName} sync-hash [会議フォルダ] [--yes]\`（文字起こしの誤字修正後に要約のハッシュを同期）/ \`${cliName} pdf --merge\` / \`${cliName} commit\`

## License
MIT
`;
  }

  if (lang === 'ko') {
    const desc = summary || (isConv
      ? `외부 의존성이 없는 명령어 불필요 대화형 AI 회의록 및 프로젝트 지식 관리 도구입니다. \`${cliName} init\` 실행 후 CLI 명령어 없이 텍스트, 녹음, 녹화 파일을 화자 분리 녹취록, 요약 및 결정사항, 할 일(To-Do), 이전 회의와의 충돌 알림, 템플릿 기반 산출물로 자연어 대화だけで 정리합니다!`
      : `외부 의존성이 없는 Node.js CLI 및 AI Agent 워크벤치 (5개 국어 i18n, 0-Token 환각 방지 \`verify\`, 안전한 Git \`commit\`, 0-Token A4 \`pdf\` 변환 내장).`);
    return `# ${pkgName} (\`${cliName}\`) — 한국어 문서

${badges}

> ${desc}

${navBar}

---

## 1. 핵심 설계 사상 및 주요 기능 (Core Design Philosophy & Key Features)

1. **명령어 없는 순수 자연어 대화 (\`conversational\` 모드)**: 최초 \`${cliName} init\` 1회 실행 후, 일상적인 회의 생성, 음성/영상 가져오기, 화자 매핑, 후속 토론 및 문서 생성은 **100% 자연어 채팅으로 진행**됩니다.
2. **「비-LLM 전용 음성인식 + AI 의미 보정」 2단계 분리 및 토큰 최적화 (\`ASR First, AI Second\`)**:
   - **Stage 1 (0 LLM Token 초안 추출)**: 기존 자막(\`.srt/.vtt/.txt\`) 또는 로컬 오프라인 엔진(\`WhisperX\`, \`mlx_whisper\`)을 활용하여 대용량 오디오로 인한 LLM 토큰 낭비를 방지합니다.
   - **Stage 2 (화자 매핑 사전 + 0-Token 일괄 치환)**: AI는 \`SPEAKER_00 -> 실명\` 및 전문용어 교정표만 출력하고 로컬 일괄 치환으로 \`01-transcript.md\`를 생성하여 **Output Token을 90% 이상 절감**합니다.
3. **환각(Hallucination) 제로, 3단계 리스크 관리 및 능동적 인간 개입 요청**:
   - **🟢 검증된 사실**(\`01-transcript.md#Lx-Ly\` 및 \`[HH:MM:SS]\` 근거), **🟡 문맥 추론 리스크**, **🔴 높은 불확실성(인간 개입 필요)** 3단계로 구분하며, 불확실한 화자나 수치, 미결 사항은 절대 추측하지 않고 \`⚠️ [확인 필요 - HH:MM:SS]\`로 표시하여 사용자에게 알립니다.
4. **깔끔한 폴더 구조, 원본 미디어 동시 보관 및 이전 회의와의 충돌 감지**:
   - \`AGENTS.md\`, \`skills/\`, \`rules/\`는 모두 숨김 폴더 \`.${cliName}/\`에 보관되어 작업 폴더에 불필요한 파일이 노출되지 않습니다.
   - 중요한 원본 녹음/녹화 파일은 각 회의 날짜 폴더의 \`media/\`에 영구 보관되며, \`meetings/<프로젝트>/index.md\` 스냅샷($O(1)$ 토큰 비용)을 통해 이전 회의 결정사항과 충돌 시 **⚡ 회의 간 충돌 알림**을 제공합니다.
- **지원 언어 (5개 국어 i18n)**: 繁體中文 (\`zh-TW\`), 簡體中文 (\`zh-CN\`), English (\`en\`), 日本語 (\`ja\`), 한국어 (\`ko\`).

---

## 2. 설치 가이드 (Installation Guide)

- **Node.js**: \`>= 18.0.0\` (\`npm\` 포함) / **Git**

\`\`\`bash
npm install -g ${pkgName}
# 또는 저장소 스크립트 실행
./scripts/install.sh
scripts\\install.bat
\`\`\`

---

## 3. 사용 방법 및 폴더 구조 설명 (Usage Guide & Folder Structure)

\`\`\`bash
${cliName} init --full --lang ko
\`\`\`

\`\`\`text
my-meetings-workspace/
├── .gitignore                                    # 민감 파일 및 meetings/**/media/* 대용량 미디어 Git 자동 제외
├── .${cliName}.json                              # 고정 언어 및 conversational 모드 설정
├── .${cliName}/                                  # [숨김 폴더] AGENTS.md, SKILL.md 및 완료 후 검수 규칙(rules/) 보관
└── meetings/                                     # [핵심 회의 지식베이스] '프로젝트 주제 -> 날짜' 2계층 구조
      └── Project-A/
            ├── index.md                          # 프로젝트 총람, 현재 유효 결정사항 스냅샷($O(1)$ 충돌 비교) 및 미완료 할 일
            ├── templates/                        # (선택) 회의 후 산출물 템플릿 폴더 (변경요청서, 확인 메일, PRD 등)
            └── 2026-11-20_Weekly-Sync/           # [개별 회의 날짜 폴더] YYYY-MM-DD_회의명
                  ├── media/                      # 해당 회의의 원본 녹음(.mp3/.m4a) 및 녹화(.mp4/.mov) 영구 보관
                  ├── 01-transcript.md            # 1. 화자 분리 녹취록 (./media/ 링크, SHA-256 및 [HH:MM:SS] 발언자 표시)
                  ├── 02-summary.md               # 2. 회의 요약, 핵심 포인트 및 결정사항 (./01-transcript.md#Lx-Ly 인용)
                  ├── 03-todos-and-discussion.md  # 3. 할 일 목록, 🚨 인간 확인 필요 목록, ⚡ 이전 회의 충돌 알림 및 후속 토론
                  └── deliverables/               # (필요 시 생성) 템플릿 기반으로 생성된 회의 후 파생 문서
\`\`\`

---

## 4. 실전 사용 예제 (Examples)

\`\`\`text
[recording.mp4 파일을 채팅창에 드래그]
오늘 진행한 Project-A 주간 회의야. 참석자는 김 팀장(PM)과 이 개발자(Backend)니까 정리해 주고, templates/change-request.md 템플릿으로 변경요청서도 만들어줘.
\`\`\`

AI가 3개 회의 문서와 파생 문서를 생성한 뒤 **완료 검수 Rule**을 자동 실행하여, 불확실한 항목(🚨)과 이전 회의 결정사항과의 충돌(⚡), 템플릿 내 미언급 항목(\`⚠️ [회의 미언급 - 수동 입력 필요]\`)을 정확히 보고합니다.

> **보조 CLI 명령어**: \`${cliName} verify\` / \`${cliName} inspect\` / \`${cliName} sync-hash [회의 폴더] [--yes]\`(녹취록 오탈자 수정 후 요약 해시 동기화) / \`${cliName} pdf --merge\` / \`${cliName} commit\`

## License
MIT
`;
  }

  // Default: zh-TW
  const desc = summary || (isConv
    ? `零外部依賴的免指令對話式 AI 週期性會議整理與知識庫工具（安裝並執行 \`${cliName} init\` 後，日常無需輸入任何 CLI 指令，直接用自然語言對話即可將文字、錄音、錄影轉化為語者分離逐字稿、摘要重點、待辦事項、跨期衝突提醒與會後範本文件）。`
    : `零外部依賴的 Node.js CLI 工具與 AI Agent 工作台（內建 5 語系 i18n、0-Token 防幻覺 \`verify\`、安全 Git \`commit\` 與 0-Token A4 \`pdf\` 匯出）。`);
  return `# ${pkgName} (\`${cliName}\`) — 繁體中文說明書

${badges}

> ${desc}

${navBar}

---

## 1. 核心設計思想與功能總覽 (Core Design Philosophy & Key Features)

### 1.1 四大核心設計思想 (Core Design Philosophy)
1. **免指令純自然語言對話 (\`Zero-Command Conversational Mode\`)**：
   - 終端使用者僅需在初次建立工作區時執行一次 \`${cliName} init\`，**日常使用完全不需記憶或輸入任何 \`CLI\` 指令**。
   - 無論是新建會議、匯入錄音/錄影、指認發言人、會後延伸討論，或是套用範本產出後續文件，100% 透過自然語言聊天即可完成。
2. **「非 LLM 專用轉錄 + AI 語意後處理」二階段解耦與極致省 Token (\`ASR First, AI Second\`)**：
   - **第一階段（非對話 AI 介入，0 LLM Token 取得初稿）**：面對動輒數十至數百 MB 的 \`.mp3\` / \`.mp4\` 長會議影音，不讓對話型 LLM 直接硬吃音訊（避免高昂多模態 Token 與長音訊漏字），而是支援直接匯入會議軟體/錄音筆現成字幕（\`.srt/.vtt/.txt\`），或呼叫本機離線語音引擎（如 \`WhisperX\` / \`mlx_whisper\` / \`faster-whisper\`）及專用 \`STT API\` 取得帶時間戳記與 \`SPEAKER_00\` 代號之文字初稿。
   - **第二階段（字典映射 + 本機 0-Token 批次替換）**：AI 讀完初稿後不重新逐字 Output 數萬字長文，而是輸出精簡的「語者實名映射表（\`SPEAKER_00 -> 王經理\`）與同音專有名詞校正表」，透過本機批次替換生成 \`01-transcript.md\`，**直接節省 90% 以上 Output Token**！
   - **滾動快照與按需局部讀取 ($O(1)$ 常數 Token 消耗)**：跨期衝突比對僅讀取專案 \`index.md\` 滾動快照（約 800 Tokens）與前次摘要，**嚴禁遍歷讀取歷次會議的 \`01-transcript.md\`**；會後討論與產出衍生文件時僅依 \`#Lx-Ly\` 局部讀取所需段落。
3. **零幻覺、三級可控風險與高不確定性主動請求人為介入 (\`Zero-Hallucination & 3-Tier Risk Control\`)**：
   - **🟢 已驗證事實（Verified Fact）**：100% 附帶指向 \`01-transcript.md#Lx-Ly\` 的真實行號範圍與 \`[HH:MM:SS]\` 時間戳記引用，杜絕憑空捏造。
   - **🟡 可控推論風險（Controllable Inferred Risk）**：依前後文或職責合理推斷之項目，強制標註 \`🟡 [上下文推論 - 建議確認]\` 並主動說明推論理由與潛在風險。
   - **🔴 高不確定性需人為介入（Human-in-the-Loop Required）**：當遇到「多人重疊發言無法確定是誰說的」、「雜訊或同音導致關鍵金額/日期/數據聽不清楚」、或「會議中爭論未拍板定案」時，**AI 絕對禁止硬猜或腦補**，強制於文件中標示 \`⚠️ [需人為確認 - HH:MM:SS]\`，並在對話中主動列出「🚨 需人為介入確認清單」請求使用者裁示。
4. **極簡純淨目錄與重要多媒體同目錄永久保存 (\`Zero-Clutter Directory & Co-located Media\`)**：
   - **零多餘外露系統檔**：所有底層 AI 引導配置（\`AGENTS.md\`、\`skills/\`、\`rules/\`）100% 隱藏收納於 \`.${cliName}/\` 隱藏目錄中，**使用者的工作區根目錄與會議資料夾內絕不出現 \`skills/\`、\`rules/\` 等雜項檔案**。
   - **重要影音隨會議目錄就近封裝**：原始錄音（\`.mp3/.m4a/.wav\`）與錄影（\`.mp4/.mov/.mkv\`）是關鍵會議憑證，直接保存在該場會議日期目錄下的 \`media/\` 子目錄內，並在 \`01-transcript.md\` 頂部記錄可點擊相對連結與 \`SHA-256\` 指紋，隨專案資料夾一併備份永不失聯；同時透過 \`.gitignore\` 自動排除大型影音檔，確保本機 100% 保留且不卡死 \`Git\`。

---

### 1.2 六大核心功能 (Key Features)
| 功能模組 | 說明 |
| :--- | :--- |
| **1. 多元輸入與語者分離 (\`Speaker Diarization\`)** | 支援文字筆記、錄音檔、錄影檔與外部字幕初稿，自動區分並實名標註每位發言者（\`[HH:MM:SS] 發言人：內容\`）。 |
| **2. 週期性「專案 -> 日期」雙層歸檔與三檔分離** | 以 \`meetings/<專案主題>/<YYYY-MM-DD_會議名稱>/\` 組織歷次會議，每次固定產出 \`01-transcript.md\`（逐字稿）、\`02-summary.md\`（摘要重點與決議）、\`03-todos-and-discussion.md\`（待辦事項與會後討論區）。 |
| **3. 跨場次歷史會議衝突偵測 (\`Conflict Alert\`)** | 整理新會議時自動比對同專案 \`index.md\` 與前次摘要；原生支援任意結構化 \`- **欄位名**：值\` 以及 5 語系自然語言散文之 **預計上線日（Launch Date）、預算（Budget）、負責人（Owner）** 絕對值與轉折宣告（如「預算 50 萬→改為 60 萬」、「負責人王經理→改由李工程師」），自動正規化同義數值（\`50 萬 == 500000 元\`、\`12/15 == 2026-12-15\`）並排除疑問句、假設句與「被否決／維持現狀」提案。註：針對「增加 10 萬／提前一週」等相對變動量或未指明角色之隱式換人，建議以 \`- **預算**：60 萬\` 結構化欄位記錄以確保 100% 精準比對。 |
| **4. 會後衍生文件與範本套用 (\`Deliverables & Templates\`)** | 支援根據會議結論與 \`meetings/<專案>/templates/\` 範本（如變更單、\`PRD\`、客戶確認信）自動產出文件至 \`deliverables/\`；**範本中未於會議提及之欄位強制標記 \`⚠️ [會議未提及 - 需人工補填]\`**。 |
| **5. 完稿後七維度強制檢核 \`Rule\`** | 每次所有會議文件建立或更新後，強制觸發隱藏的 \`post-meeting-inspection.md\` 檢核規則，自動檢查結構純淨度、語者完整度、\`#Lx-Ly\` 行號真實性、高風險不確定項與跨期衝突，並輸出檢核報告。 |
| **6. 0-Token 防幻覺驗證與 \`A4 PDF / HTML\` 匯出** | 內建 0-Token \`${cliName} verify\` 實體行號校驗、\`${cliName} pdf --merge\` 高品質 A4 PDF / HTML 報表匯出與 \`${cliName} commit\` 安全 Git 歸檔。 |

### 1.2.1 架構分工說明：Node.js CLI 確定性引擎 vs. 外部 ASR / AI Agent 協作邊界
本工具為**「零外部依賴的 AI 會議整理工作台與確定性防幻覺引擎」**（而非單機獨立語音辨識軟體），採三層解耦協作架構：

| 功能項目 | 執行引擎 | 實際運作機制 |
| :--- | :--- | :--- |
| **建立會議目錄、範本與 \`.bak\` 防覆蓋保護** | **Node.js CLI 核心（內建）** | 由 \`${cliName} new-meeting\` 與 \`deliverable\` 確定性執行（使用本地時區日期、多代 \`.bak\` 備份）。 |
| **媒體 \`SHA-256\` 串流雜湊與時長解析** | **Node.js CLI 核心（內建）** | 內建 64 KiB 串流 \`SHA-256\` 與原生 \`.wav\` 標頭時長解析；其他影音格式選配呼叫系統 \`ffprobe\`。 |
| **語者代號與專有名詞 0-Token 批次替換** | **Node.js CLI 核心（內建）** | 由 \`applySpeakerMapping\` 單次正則掃描解析 \`.srt/.vtt/.txt\` 並替換 \`SPEAKER_00 -> 實名\`。 |
| **\`#Lx-Ly\` 行號校驗、Stale Hash 與衝突規則檢核** | **Node.js CLI 核心（內建）** | 由 \`${cliName} verify\` 與 \`${cliName} inspect\` 驗證行號、逐字稿異動 Stale Hash 與結構化／三大欄位跨期衝突。 |
| **原始錄音／錄影轉文字與語者分離 (Stage 1 ASR)** | **外部 ASR / 會議軟體字幕** | 匯入 Zoom/Teams/Meet 現成 \`.srt/.vtt\` 字幕，或由本機 \`WhisperX\` / \`mlx_whisper\` / \`faster-whisper\` 轉出初稿。 |
| **深度語意摘要、行動項目提煉與跨期語意分析** | **外部 AI Agent（依賴 \`.${cliName}/\` 規則）** | 由 Claude / Gemini / Cursor / Codex / Antigravity 讀取 \`.${cliName}/AGENTS.md\` 與 \`SKILL.md\` 進行深度語意提煉。 |

---

### 1.3 支援語言與國際化規範 (Supported Languages & Multilingual ASR)
1. **工作區與產出文件鎖定語言（內建 5 國語言 i18n）**：
   - 原生支援 **\`zh-TW\`（繁體中文，預設）**、**\`zh-CN\`（简体中文）**、**\`en\`（English）**、**\`ja\`（日本語）**、**\`ko\`（한국어）**。
   - **單一語言純粹性與技術名詞保留**：鎖定語言後，所有會議摘要、待辦與報告 100% 使用該語言撰寫；業界標準技術專有名詞（如 \`REST API\`, \`GraphQL\`, \`JWT\`, \`SQL\`, \`CI/CD\`, \`Docker\`, \`KPI\`, \`OKR\` 等）強制保留原生英文，不生硬直譯。
2. **媒體檔案（錄音/錄影）轉逐字稿支援語言**：
   - **五大主力語言高精準度轉錄**：繁體中文、簡體中文、英文、日文、韓文。
   - **中英夾雜／多語穿插會議（Code-Switching）**：完美支援台灣與跨國團隊常見的「中文對話穿插英文技術術語」或「同一場會議有人講中文、有人講英文/日文」，Stage 2 AI 會自動將同音誤聽的英文術語校正回標準英文。
   - **99+ 種外語音訊與跨語系會議整理**：底層透過 \`Whisper\` / \`WhisperX\` / \`mlx_whisper\` 或專用 \`STT API\`，可辨識多達 **99+ 種語言**（含粵語、越語、泰語、德語、法語、西班牙語等），並支援**「外語會議音訊 -> 原文/雙語對照 \`01-transcript.md\` + 鎖定語系（如繁體中文）\`02-summary.md\` 與 \`03-todos-and-discussion.md\`」**！

---

## 2. 安裝說明 (Installation Guide)

### 環境需求
- **Node.js**：\`>= 18.0.0\`（內建 \`npm\`）
- **Git**：用於安全歸檔與遠端同步（\`${cliName} commit\`）
- **（選用）本機語音轉錄引擎**：如 \`mlx_whisper\`（Apple Silicon 推薦）、\`faster-whisper\`、\`WhisperX\` 或 \`ffmpeg\`（亦支援直接匯入 Teams / Meet / Zoom / 錄音筆已匯出的字幕初稿 + 原始影音檔）

先確認本機已安裝 Node.js 與 npm：

\`\`\`bash
node --version
npm --version
\`\`\`

### macOS / Linux 安裝

\`\`\`bash
# 方式 A：透過 npm 全域安裝
npm install -g ${pkgName}

# 方式 B：在 clone 下來的專案中使用跨平台腳本安裝
./scripts/install.sh          # 全域安裝 (npm install -g)
./scripts/install.sh --local  # 本機開發連結 (npm link)
./scripts/update.sh           # 更新至最新版本
./scripts/uninstall.sh        # 完整移除工具
\`\`\`

### Windows (PowerShell / CMD) 安裝

\`\`\`powershell
# 方式 A：透過 npm 全域安裝
npm install -g ${pkgName}

# 方式 B：在 clone 下來的專案中使用批次腳本
scripts\\install.bat
scripts\\install.bat --local
scripts\\update.bat
scripts\\uninstall.bat
\`\`\`

確認 CLI 可用：

\`\`\`powershell
${cliName} --help
\`\`\`

> **Windows \`PATH\` 排錯提示**：若 PowerShell 找不到 \`${cliName}\`，請執行 \`npm prefix -g\` 查詢全域路徑（常見為 \`C:\\Users\\你的使用者名稱\\AppData\\Roaming\\npm\`），將該路徑加入 Windows 的使用者環境變數 \`Path\` 後重新開啟 PowerShell 即可。

---

## 3. 使用說明 (Usage Guide)

### 3.1 專案初始化與資料夾結構完整說明 (\`${cliName} init\` & Folder Structure)

在您存放會議資料的資料夾中執行一次初始化：

\`\`\`bash
${cliName} init --full --lang zh-TW
\`\`\`

#### 📂 資料夾結構詳解（極簡純淨目錄，零外露 \`skills/\` 或 \`rules/\`）

\`\`\`text
my-meetings-workspace/
├── .gitignore                                    # 自動排除 .env 等敏感檔與 meetings/**/media/* 大型影音檔（本機保留、不卡死 Git）
├── .${cliName}.json                              # 鎖定語系 (zh-TW) 與 conversational 免指令互動模式設定檔
├── .${cliName}/                                  # 【隱藏系統設定目錄】所有 AI 規則皆收納於此，不弄髒外層資料夾
│     ├── AGENTS.md                               #   - 免指令會議整理主規則與雙軌驗證清單規範
│     ├── skills/${cliName}/SKILL.md              #   - 會議轉錄、三檔提煉、跨期衝突與省 Token 技能引導
│     └── rules/                                  #   - 完稿強制檢核 Rule (post-meeting-inspection.md)、防幻覺與語系純粹性規則
├── readme.md (+ README.zh-TW/zh-CN/en/ja/ko.md)  # 5 國語言完整說明書
└── meetings/                                     # 【核心會議知識庫目錄】依「專案主題 -> 會議日期」雙層自動歸檔
      └── Project-A (A專案)/                      # 第一層：依週期性專案或主題建立專屬資料夾
            ├── index.md                          # 專案會議總覽、當前有效決議滾動快照 ($O(1)$ 跨期衝突比對基準) 與未完成待辦總表
            ├── templates/                        # (選用) 該專案常用的會後文件範本庫 (如：規格變更單範本、客戶確認信範本、PRD 範本)
            │
            ├── 2026-11-20_Weekly-Sync/           # 第二層：依每次會議日期 (YYYY-MM-DD_會議名稱) 自動建立
            │     ├── media/                      # 【重要多媒體原始檔區】永久保存該場會議的錄音 (.mp3/.m4a/.wav) 或錄影 (.mp4/.mov)
            │     ├── 01-transcript.md            # 【檔案 1：語者分離逐字稿】頂部附 ./media/ 可點擊連結與 SHA-256；內文為 [HH:MM:SS] 發言人：內容
            │     ├── 02-summary.md               # 【檔案 2：會議摘要與重點】含執行摘要、討論重點、正式決議 (強制附 ./01-transcript.md#Lx-Ly 引用)
            │     ├── 03-todos-and-discussion.md  # 【檔案 3：待辦與會後討論】含待辦表(負責人/期限/TBD)、🚨需人為確認清單、⚡跨期衝突提醒、會後延伸討論區
            │     └── deliverables/               # 【會後衍生文件區】存放根據本次會議與範本產出的後續文件 (如 change-request.md, follow-up-email.md)
            │
            └── 2026-11-27_Weekly-Sync/           # 下一次週期性會議（自動承接 11-20 未完成待辦，並自動偵測是否與過往決議衝突）
\`\`\`

| 資料夾 / 檔案路徑 | 核心職責與設計目的 |
| :--- | :--- |
| \`.${cliName}/\` | **隱藏規則引擎**：將 \`AGENTS.md\`、\`skills/\`、\`rules/post-meeting-inspection.md\` 完全隱藏，保持工作區乾淨無雜項。 |
| \`meetings/<專案>/index.md\` | **專案記憶中樞與省 Token 快照**：記錄固定與會成員表、歷次會議連結、當前有效決議基準與跨期未完成待辦；讓 AI 不必重讀舊逐字稿即可秒級比對跨期衝突。 |
| \`meetings/<專案>/templates/\` | **會後衍生文件範本庫**：放置 Markdown 範本，供會後一鍵套用產出業務文件。 |
| \`.../<日期>/media/\` | **重要原始影音同目錄封裝**：將龐大但重要的錄音/錄影直接保存在該場會議目錄下，備份資料夾時影音與文字永遠在一起。 |
| \`.../<日期>/01-transcript.md\` | **客觀語者分離逐字稿**：純客觀記錄「誰在什麼時間點說了什麼」，不摻雜 AI 主觀推論，作為 \`#Lx-Ly\` 唯一事實來源。 |
| \`.../<日期>/02-summary.md\` | **零幻覺摘要與決議**：提煉重點與決議，每一條皆標註 \`01-transcript.md#Lx-Ly\` 行號溯源與三級風險標籤（\`🟢\`/\`🟡\`/\`🔴\`）。 |
| \`.../<日期>/03-todos-and-discussion.md\` | **行動追蹤與雙向討論**：集中管理待辦事項（Action Items）、高不確定性人為介入清單（🚨）、跨期衝突提醒（⚡）與會後持續對話紀錄。 |
| \`.../<日期>/deliverables/\` | **會後交付物產出區**：存放會後衍生之確認信、變更單、報價單等，範本未提及欄位自動標記 \`⚠️ [會議未提及 - 需人工補填]\`。 |

---

### 3.2 與 AI Agents 日常免指令用法 (VS Code / Claude / Gemini / Cursor / Antigravity)

${isConv
    ? `#### 免指令自然語言對話模式 (\`conversational\`)
完成 \`${cliName} init\` 後，您日常**完全不需要輸入任何終端機指令，也不必自己手動建立多層資料夾**：

1. **用法一：新建會議與匯入媒體（支援 3 種直覺手勢）**
   - **直接拖入 AI 對話框（最推薦）**：把桌面或下載資料夾的錄音（\`.mp3/.m4a\`）、錄影（\`.mp4/.mov\`）或文字筆記直接拖進對話視窗，說：*「這是今天 A 專案的進度會議，與會者有王經理跟李工程師，幫我整理」*。AI 會自動建立 \`meetings/A專案/YYYY-MM-DD_進度會議/media/\`、把影音檔複製/搬移歸位，並產出 \`01\`~\`03\` 三份文件。
   - **在檔案總管隨手丟入目錄**：把影音檔隨手丟進工作區根目錄或 \`meetings/A專案/\`，對 AI 說：*「幫我把剛放進去的那個錄影檔整理成 A 專案今天的會議」*，AI 自動偵測並移入當日會議的 \`media/\` 目錄。
   - **說「新增會議」互動引導**：直接對 AI 說 *「我要新增會議」*，AI 會列出目前已有專案、載入上次未完成待辦並先建好當日空資料夾。
2. **用法二：人為介入確認與跨期衝突裁示**
   - AI 完稿後會自動執行**完稿檢核 Rule**，並在對話末尾列出「🚨 需人為介入確認清單」（如聽不清楚的金額、未確定的 \`SPEAKER_02\`）與「⚡ 跨期會議衝突提醒」（如本次上線日與上週決議矛盾）。
   - 您只需直接用自然語言回覆：*「SPEAKER_02 是陳顧問、預算確認是 50 萬，另外上線日改到 12/15 是正式變更」*，AI 即自動批次更新所有文件與專案 \`index.md\`。
3. **用法三：會後延伸討論與套用範本產出衍生文件**
   - 直接在對話中說：*「針對第三項待辦，幫我推演如果拆成兩階段上線的風險並加到討論區」*，或 *「套用變更單範本，根據今天會議決議幫我產出一份規格變更書」*，AI 即自動寫入 \`03-todos-and-discussion.md\` 或 \`deliverables/\`。`
    : `#### AI 對話工作流指令 (\`workbench\` / \`cli\`)
支援 \`tool:init (gti) -> tool:propose (gtp) -> tool:analyze (gta) -> tool:scaffold (gts) -> tool:commit (gtc)\`。`}

### 3.3 內建輔助 CLI 指令集（選用）

雖然日常整理會議 100% 免指令，工具仍內建以下 0-Token 輔助指令供匯出 PDF 與版控歸檔使用：

| 指令 | 說明 |
| :--- | :--- |
| \`${cliName} init [--full] [--lang zh-TW\\|zh-CN\\|en\\|ja\\|ko]\` | 建立極簡純淨工作區骨架（規則隱藏於 \`.${cliName}/\`）並自動執行 \`git init\` |
| \`${cliName} verify [目標目錄或檔案]\` | **0-Token 防幻覺檢查**：檢查 \`meetings/\` 或 \`project/\` 下是否有未填佔位符與無效的 \`#Lx-Ly\` 行號引用 |
| \`${cliName} pdf [目標] [--merge] [--html] [--output <file.pdf>]\` | 別名 \`md2pdf\`；0-Token 將會議紀錄合併匯出為高品質 A4 PDF 或 HTML 報告 |
| \`${cliName} commit [目標] [-m <訊息>]\` | 先跑 \`verify\` -> 安全 Git 歸檔（自動排除敏感檔與影音大檔，遇衝突安全停止） |
| \`${cliName} upgrade [--dry-run]\` | 別名 \`update\`；更新內建規則模板（保留鎖定語言、\`<claude-mem-context>\` 與附加於檔尾的客製化段落；若曾修改內文會自動存 \`.bak\` 備份） |
| \`${cliName} status\` / \`check\` / \`doctor\` | 查看進度統計、核心檔案檢查與系統環境完整性診斷 |
| \`${cliName} new-meeting <專案> <主題> --transcript <file> [--media <file>] [--empty] [--force] [--force-all]\` | 確定性建立會議目錄、計算媒體 \`SHA-256\` 並執行 0-Token 語者批次替換（\`--empty\` 建立待確認 \`⚠️\` 骨架；\`--force\` 僅重寫 \`01-transcript.md\` 並存 \`.bak\` 備份，保留人工編修之 \`02/03\`；\`--force-all\` 重寫 \`01~03\` 並存 \`.bak\`） |
| \`${cliName} sync-hash [會議目錄] [--yes]\` | 人工微調 \`01-transcript.md\` 錯字並確認下游文件無誤後，同步 \`02-summary.md\` 與 \`03-todos-and-discussion.md\` 之 \`transcript-sha256\` 指紋而不覆蓋人工內文（變動 >5% 或引用失效時需加 \`--yes\`） |
| \`${cliName} inspect <會議目錄>\` | 執行完稿強制檢核 Rule（支援結構化 \`- **鍵**：值\` 與自然語言 **預計上線日／預算／負責人** 跨期衝突偵測；若含未確認 \`🚨\` 或跨期衝突 \`⚡\` 則回傳非 0 狀態碼） |
| \`${cliName} deliverable --meeting <dir> --template <file> [--out <file>]\` | 套用範本產出會後衍生文件至 \`deliverables/\`，未提及欄位自動標記 \`⚠️ [會議未提及 - 需人工補填]\` |

---

## 4. 實戰使用範例 (Examples)

### 範例 1：免指令整理週期性專案會議（含語者分離、人為介入提醒與跨期衝突偵測）

\`\`\`bash
# 1. 初次建立會議管理資料夾並初始化（僅需執行一次）
mkdir company-meetings && cd company-meetings
${cliName} init --full --lang zh-TW
\`\`\`

接著打開 AI 對話視窗，直接拖入檔案並用自然語言對話（完全不需記任何指令）：

\`\`\`text
[拖入 2026-11-20_projectA.mp3 與 whisper_draft.txt]
這是今天 A專案的週期進度會議，與會者有王經理 (PM)、李工程師 (Backend) 與陳設計師 (UI)，請幫我整理。
\`\`\`

AI 自動完成以下動作並於對話結尾輸出檢核報告：
1. 自動建立 \`meetings/A專案/2026-11-20_週期進度會議/\`，並將 \`2026-11-20_projectA.mp3\` 歸檔至 \`media/\` 子目錄。
2. 透過語者映射表批次替換產出 \`01-transcript.md\`，提煉附帶 \`#Lx-Ly\` 引用的 \`02-summary.md\` 與 \`03-todos-and-discussion.md\`，並同步更新 \`meetings/A專案/index.md\`。
3. 自動執行**完稿強制檢核 Rule**，向您回報：
   - **✅ 完稿檢核報告**：三檔結構、\`media/\` 連結、\`#Lx-Ly\` 溯源與零佔位符檢查全數通過。
   - **🚨 需人為介入確認清單（高不確定性）**：*「\`[00:19:12]\` 逐字稿 \`#L78\` 關於伺服器擴充預算因雜訊模糊（疑似『50 萬』或『15 萬』），請點擊 \`./media/2026-11-20_projectA.mp3\` 查驗原音並確認。」*
   - **⚡ 跨期會議衝突提醒**：*「本次會議決議『正式上線日延至 12/15』（見 \`01-transcript.md#L102-L105\`），與前次會議（\`2026-11-13\`）決議之『12/01 上線不可延後』衝突，請確認是否為正式決策變更？」*

### 範例 2：會後延伸討論、套用範本產出衍生文件並匯出 A4 PDF

在對話視窗直接回覆確認並要求產出會後文件：

\`\`\`text
1. 預算確認是 50 萬；另外上線日改為 12/15 是正式決策變更，請幫我更新並記錄變更原因為「配合第三方金流測試」。
2. 請根據更新後的會議結論，套用 meetings/A專案/templates/change-request.md 範本，幫我產出一份規格變更申請單，並幫我擬一封寄給客戶的會後確認信。
\`\`\`

AI 會自動更新會議文件與 \`index.md\` 基準快照，並在 \`meetings/A專案/2026-11-20_週期進度會議/deliverables/\` 下產出 \`change-request.md\` 與 \`follow-up-email.md\`（範本中若有任何會議未討論到的欄位，自動標註 \`⚠️ [會議未提及 - 需人工補填]\`）。

最後若需將該場會議紀錄匯出為 PDF 分享給團隊：

\`\`\`bash
# 0-Token 將該場會議的摘要與待辦合併匯出為 A4 PDF
${cliName} pdf meetings/A專案/2026-11-20_週期進度會議 --merge --output projectA-2026-11-20.pdf
\`\`\`

## License
MIT
`;
}

/**
 * Renders all 6 README files (`readme.md` in locked `lang` + `README.{zh-TW,zh-CN,en,ja,ko}.md`)
 * so every generated workspace / npm project has complete 5-language i18n READMEs!
 */
function renderAllReadmes({
  lang = 'zh-TW',
  mode = 'workbench',
  cliName = CLI_NAME,
  pkgName = PACKAGE_NAME,
  repoSlug = null,
  summary = null
}) {
  const files = {};
  for (const l of SUPPORTED_LANGS) {
    files[`README.${l}.md`] = renderWorkspaceReadme({
      lang: l,
      mode,
      cliName,
      pkgName,
      repoSlug,
      summary
    });
  }
  files['readme.md'] = files[`README.${lang}.md`] || files['README.zh-TW.md'];
  return files;
}

module.exports = {
  LANG_LABELS,
  MODE_DESCRIPTIONS,
  renderAgentsMd,
  renderSkillMd,
  renderRules,
  renderProjectIndex,
  renderMeetingsIndex,
  renderStageFiles,
  renderWorkspaceReadme,
  renderAllReadmes
};
