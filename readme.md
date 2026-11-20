# @loviusc/ai-meeting-notes (`meetnotes`) — 繁體中文說明書

[![npm version](https://img.shields.io/npm/v/@loviusc/ai-meeting-notes.svg)](https://www.npmjs.com/package/@loviusc/ai-meeting-notes)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

> 零外部依賴的免指令對話式 AI 週期性會議整理與知識庫工具（安裝並執行 `meetnotes init` 後，日常無需輸入任何 CLI 指令，直接用自然語言對話即可將文字、錄音、錄影轉化為語者分離逐字稿、摘要重點、待辦事項、跨期衝突提醒與會後範本文件）。

<p align="center">
  <b>🌐 Languages:</b>
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.zh-TW.md"><b>繁體中文</b></a> |
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.zh-CN.md"><b>简体中文</b></a> |
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.en.md"><b>English</b></a> |
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.ja.md"><b>日本語</b></a> |
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.ko.md"><b>한국어</b></a>
</p>

---

## 1. 核心設計思想與功能總覽 (Core Design Philosophy & Key Features)

### 1.1 四大核心設計思想 (Core Design Philosophy)
1. **免指令純自然語言對話 (`Zero-Command Conversational Mode`)**：
   - 終端使用者僅需在初次建立工作區時執行一次 `meetnotes init`，**日常使用完全不需記憶或輸入任何 `CLI` 指令**。
   - 無論是新建會議、匯入錄音/錄影、指認發言人、會後延伸討論，或是套用範本產出後續文件，100% 透過自然語言聊天即可完成。
2. **「非 LLM 專用轉錄 + AI 語意後處理」二階段解耦與極致省 Token (`ASR First, AI Second`)**：
   - **第一階段（非對話 AI 介入，0 LLM Token 取得初稿）**：面對動輒數十至數百 MB 的 `.mp3` / `.mp4` 長會議影音，不讓對話型 LLM 直接硬吃音訊（避免高昂多模態 Token 與長音訊漏字），而是支援直接匯入會議軟體/錄音筆現成字幕（`.srt/.vtt/.txt`），或呼叫本機離線語音引擎（如 `WhisperX` / `mlx_whisper` / `faster-whisper`）及專用 `STT API` 取得帶時間戳記與 `SPEAKER_00` 代號之文字初稿。
   - **第二階段（字典映射 + 本機 0-Token 批次替換）**：AI 讀完初稿後不重新逐字 Output 數萬字長文，而是輸出精簡的「語者實名映射表（`SPEAKER_00 -> 王經理`）與同音專有名詞校正表」，透過本機批次替換生成 `01-transcript.md`，**直接節省 90% 以上 Output Token**！
   - **滾動快照與按需局部讀取 ($O(1)$ 常數 Token 消耗)**：跨期衝突比對僅讀取專案 `index.md` 滾動快照（約 800 Tokens）與前次摘要，**嚴禁遍歷讀取歷次會議的 `01-transcript.md`**；會後討論與產出衍生文件時僅依 `#Lx-Ly` 局部讀取所需段落。
3. **零幻覺、三級可控風險與高不確定性主動請求人為介入 (`Zero-Hallucination & 3-Tier Risk Control`)**：
   - **🟢 已驗證事實（Verified Fact）**：100% 附帶指向 `01-transcript.md#Lx-Ly` 的真實行號範圍與 `[HH:MM:SS]` 時間戳記引用，杜絕憑空捏造。
   - **🟡 可控推論風險（Controllable Inferred Risk）**：依前後文或職責合理推斷之項目，強制標註 `🟡 [上下文推論 - 建議確認]` 並主動說明推論理由與潛在風險。
   - **🔴 高不確定性需人為介入（Human-in-the-Loop Required）**：當遇到「多人重疊發言無法確定是誰說的」、「雜訊或同音導致關鍵金額/日期/數據聽不清楚」、或「會議中爭論未拍板定案」時，**AI 絕對禁止硬猜或腦補**，強制於文件中標示 `⚠️ [需人為確認 - HH:MM:SS]`，並在對話中主動列出「🚨 需人為介入確認清單」請求使用者裁示。
4. **極簡純淨目錄與重要多媒體同目錄永久保存 (`Zero-Clutter Directory & Co-located Media`)**：
   - **零多餘外露系統檔**：所有底層 AI 引導配置（`AGENTS.md`、`skills/`、`rules/`）100% 隱藏收納於 `.meetnotes/` 隱藏目錄中，**使用者的工作區根目錄與會議資料夾內絕不出現 `skills/`、`rules/` 等雜項檔案**。
   - **重要影音隨會議目錄就近封裝**：原始錄音（`.mp3/.m4a/.wav`）與錄影（`.mp4/.mov/.mkv`）是關鍵會議憑證，直接保存在該場會議日期目錄下的 `media/` 子目錄內，並在 `01-transcript.md` 頂部記錄可點擊相對連結與 `SHA-256` 指紋，隨專案資料夾一併備份永不失聯；同時透過 `.gitignore` 自動排除大型影音檔，確保本機 100% 保留且不卡死 `Git`。

---

### 1.2 六大核心功能 (Key Features)
| 功能模組 | 說明 |
| :--- | :--- |
| **1. 多元輸入與語者分離 (`Speaker Diarization`)** | 支援文字筆記、錄音檔、錄影檔與外部字幕初稿，自動區分並實名標註每位發言者（`[HH:MM:SS] 發言人：內容`）。 |
| **2. 週期性「專案 -> 日期」雙層歸檔與三檔分離** | 以 `meetings/<專案主題>/<YYYY-MM-DD_會議名稱>/` 組織歷次會議，每次固定產出 `01-transcript.md`（逐字稿）、`02-summary.md`（摘要重點與決議）、`03-todos-and-discussion.md`（待辦事項與會後討論區）。 |
| **3. 跨場次歷史會議衝突偵測 (`Conflict Alert`)** | 整理新會議時自動比對同專案 `index.md` 與前次摘要；原生支援任意結構化 `- **欄位名**：值` 以及 5 語系自然語言散文之 **預計上線日（Launch Date）、預算（Budget）、負責人（Owner）** 絕對值與轉折宣告（如「預算 50 萬→改為 60 萬」、「負責人王經理→改由李工程師」），自動正規化同義數值（`50 萬 == 500000 元`、`12/15 == 2026-12-15`）並排除疑問句、假設句與「被否決／維持現狀」提案。註：針對「增加 10 萬／提前一週」等相對變動量或未指明角色之隱式換人，建議以 `- **預算**：60 萬` 結構化欄位記錄以確保 100% 精準比對。 |
| **4. 會後衍生文件與範本套用 (`Deliverables & Templates`)** | 支援根據會議結論與 `meetings/<專案>/templates/` 範本（如變更單、`PRD`、客戶確認信）自動產出文件至 `deliverables/`；**範本中未於會議提及之欄位強制標記 `⚠️ [會議未提及 - 需人工補填]`**。 |
| **5. 完稿後七維度強制檢核 `Rule`** | 每次所有會議文件建立或更新後，強制觸發隱藏的 `post-meeting-inspection.md` 檢核規則，自動檢查結構純淨度、語者完整度、`#Lx-Ly` 行號真實性、高風險不確定項與跨期衝突，並輸出檢核報告。 |
| **6. 0-Token 防幻覺驗證與 `A4 PDF / HTML` 匯出** | 內建 0-Token `meetnotes verify` 實體行號校驗、`meetnotes pdf --merge` 高品質 A4 PDF / HTML 報表匯出與 `meetnotes commit` 安全 Git 歸檔。 |

### 1.2.1 架構分工說明：Node.js CLI 確定性引擎 vs. 外部 ASR / AI Agent 協作邊界
本工具為**「零外部依賴的 AI 會議整理工作台與確定性防幻覺引擎」**（而非單機獨立語音辨識軟體），採三層解耦協作架構：

| 功能項目 | 執行引擎 | 實際運作機制 |
| :--- | :--- | :--- |
| **建立會議目錄、範本與 `.bak` 防覆蓋保護** | **Node.js CLI 核心（內建）** | 由 `meetnotes new-meeting` 與 `deliverable` 確定性執行（使用本地時區日期、多代 `.bak` 備份）。 |
| **媒體 `SHA-256` 串流雜湊與時長解析** | **Node.js CLI 核心（內建）** | 內建 64 KiB 串流 `SHA-256` 與原生 `.wav` 標頭時長解析；其他影音格式選配呼叫系統 `ffprobe`。 |
| **語者代號與專有名詞 0-Token 批次替換** | **Node.js CLI 核心（內建）** | 由 `applySpeakerMapping` 單次正則掃描解析 `.srt/.vtt/.txt` 並替換 `SPEAKER_00 -> 實名`。 |
| **`#Lx-Ly` 行號校驗、Stale Hash 與衝突規則檢核** | **Node.js CLI 核心（內建）** | 由 `meetnotes verify` 與 `meetnotes inspect` 驗證行號、逐字稿異動 Stale Hash 與結構化／三大欄位跨期衝突。 |
| **原始錄音／錄影轉文字與語者分離 (Stage 1 ASR)** | **外部 ASR / 會議軟體字幕** | 匯入 Zoom/Teams/Meet 現成 `.srt/.vtt` 字幕，或由本機 `WhisperX` / `mlx_whisper` / `faster-whisper` 轉出初稿。 |
| **深度語意摘要、行動項目提煉與跨期語意分析** | **外部 AI Agent（依賴 `.meetnotes/` 規則）** | 由 Claude / Gemini / Cursor / Codex / Antigravity 讀取 `.meetnotes/AGENTS.md` 與 `SKILL.md` 進行深度語意提煉。 |

---

### 1.3 支援語言與國際化規範 (Supported Languages & Multilingual ASR)
1. **工作區與產出文件鎖定語言（內建 5 國語言 i18n）**：
   - 原生支援 **`zh-TW`（繁體中文，預設）**、**`zh-CN`（简体中文）**、**`en`（English）**、**`ja`（日本語）**、**`ko`（한국어）**。
   - **單一語言純粹性與技術名詞保留**：鎖定語言後，所有會議摘要、待辦與報告 100% 使用該語言撰寫；業界標準技術專有名詞（如 `REST API`, `GraphQL`, `JWT`, `SQL`, `CI/CD`, `Docker`, `KPI`, `OKR` 等）強制保留原生英文，不生硬直譯。
2. **媒體檔案（錄音/錄影）轉逐字稿支援語言**：
   - **五大主力語言高精準度轉錄**：繁體中文、簡體中文、英文、日文、韓文。
   - **中英夾雜／多語穿插會議（Code-Switching）**：完美支援台灣與跨國團隊常見的「中文對話穿插英文技術術語」或「同一場會議有人講中文、有人講英文/日文」，Stage 2 AI 會自動將同音誤聽的英文術語校正回標準英文。
   - **99+ 種外語音訊與跨語系會議整理**：底層透過 `Whisper` / `WhisperX` / `mlx_whisper` 或專用 `STT API`，可辨識多達 **99+ 種語言**（含粵語、越語、泰語、德語、法語、西班牙語等），並支援**「外語會議音訊 -> 原文/雙語對照 `01-transcript.md` + 鎖定語系（如繁體中文）`02-summary.md` 與 `03-todos-and-discussion.md`」**！

---

## 2. 安裝說明 (Installation Guide)

### 環境需求
- **Node.js**：`>= 18.0.0`（內建 `npm`）
- **Git**：用於安全歸檔與遠端同步（`meetnotes commit`）
- **（選用）本機語音轉錄引擎**：如 `mlx_whisper`（Apple Silicon 推薦）、`faster-whisper`、`WhisperX` 或 `ffmpeg`（亦支援直接匯入 Teams / Meet / Zoom / 錄音筆已匯出的字幕初稿 + 原始影音檔）

先確認本機已安裝 Node.js 與 npm：

```bash
node --version
npm --version
```

### macOS / Linux 安裝

```bash
# 方式 A：透過 npm 全域安裝
npm install -g @loviusc/ai-meeting-notes

# 方式 B：在 clone 下來的專案中使用跨平台腳本安裝
./scripts/install.sh          # 全域安裝 (npm install -g)
./scripts/install.sh --local  # 本機開發連結 (npm link)
./scripts/update.sh           # 更新至最新版本
./scripts/uninstall.sh        # 完整移除工具
```

### Windows (PowerShell / CMD) 安裝

```powershell
# 方式 A：透過 npm 全域安裝
npm install -g @loviusc/ai-meeting-notes

# 方式 B：在 clone 下來的專案中使用批次腳本
scripts\install.bat
scripts\install.bat --local
scripts\update.bat
scripts\uninstall.bat
```

確認 CLI 可用：

```powershell
meetnotes --help
```

> **Windows `PATH` 排錯提示**：若 PowerShell 找不到 `meetnotes`，請執行 `npm prefix -g` 查詢全域路徑（常見為 `C:\Users\你的使用者名稱\AppData\Roaming\npm`），將該路徑加入 Windows 的使用者環境變數 `Path` 後重新開啟 PowerShell 即可。

---

## 3. 使用說明 (Usage Guide)

### 3.1 專案初始化與資料夾結構完整說明 (`meetnotes init` & Folder Structure)

在您存放會議資料的資料夾中執行一次初始化：

```bash
meetnotes init --full --lang zh-TW
```

#### 📂 資料夾結構詳解（極簡純淨目錄，零外露 `skills/` 或 `rules/`）

```text
my-meetings-workspace/
├── .gitignore                                    # 自動排除 .env 等敏感檔與 meetings/**/media/* 大型影音檔（本機保留、不卡死 Git）
├── .meetnotes.json                              # 鎖定語系 (zh-TW) 與 conversational 免指令互動模式設定檔
├── .meetnotes/                                  # 【隱藏系統設定目錄】所有 AI 規則皆收納於此，不弄髒外層資料夾
│     ├── AGENTS.md                               #   - 免指令會議整理主規則與雙軌驗證清單規範
│     ├── skills/meetnotes/SKILL.md              #   - 會議轉錄、三檔提煉、跨期衝突與省 Token 技能引導
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
```

| 資料夾 / 檔案路徑 | 核心職責與設計目的 |
| :--- | :--- |
| `.meetnotes/` | **隱藏規則引擎**：將 `AGENTS.md`、`skills/`、`rules/post-meeting-inspection.md` 完全隱藏，保持工作區乾淨無雜項。 |
| `meetings/<專案>/index.md` | **專案記憶中樞與省 Token 快照**：記錄固定與會成員表、歷次會議連結、當前有效決議基準與跨期未完成待辦；讓 AI 不必重讀舊逐字稿即可秒級比對跨期衝突。 |
| `meetings/<專案>/templates/` | **會後衍生文件範本庫**：放置 Markdown 範本，供會後一鍵套用產出業務文件。 |
| `.../<日期>/media/` | **重要原始影音同目錄封裝**：將龐大但重要的錄音/錄影直接保存在該場會議目錄下，備份資料夾時影音與文字永遠在一起。 |
| `.../<日期>/01-transcript.md` | **客觀語者分離逐字稿**：純客觀記錄「誰在什麼時間點說了什麼」，不摻雜 AI 主觀推論，作為 `#Lx-Ly` 唯一事實來源。 |
| `.../<日期>/02-summary.md` | **零幻覺摘要與決議**：提煉重點與決議，每一條皆標註 `01-transcript.md#Lx-Ly` 行號溯源與三級風險標籤（`🟢`/`🟡`/`🔴`）。 |
| `.../<日期>/03-todos-and-discussion.md` | **行動追蹤與雙向討論**：集中管理待辦事項（Action Items）、高不確定性人為介入清單（🚨）、跨期衝突提醒（⚡）與會後持續對話紀錄。 |
| `.../<日期>/deliverables/` | **會後交付物產出區**：存放會後衍生之確認信、變更單、報價單等，範本未提及欄位自動標記 `⚠️ [會議未提及 - 需人工補填]`。 |

---

### 3.2 與 AI Agents 日常免指令用法 (VS Code / Claude / Gemini / Cursor / Antigravity)

#### 免指令自然語言對話模式 (`conversational`)
完成 `meetnotes init` 後，您日常**完全不需要輸入任何終端機指令，也不必自己手動建立多層資料夾**：

1. **用法一：新建會議與匯入媒體（支援 3 種直覺手勢）**
   - **直接拖入 AI 對話框（最推薦）**：把桌面或下載資料夾的錄音（`.mp3/.m4a`）、錄影（`.mp4/.mov`）或文字筆記直接拖進對話視窗，說：*「這是今天 A 專案的進度會議，與會者有王經理跟李工程師，幫我整理」*。AI 會自動建立 `meetings/A專案/YYYY-MM-DD_進度會議/media/`、把影音檔複製/搬移歸位，並產出 `01`~`03` 三份文件。
   - **在檔案總管隨手丟入目錄**：把影音檔隨手丟進工作區根目錄或 `meetings/A專案/`，對 AI 說：*「幫我把剛放進去的那個錄影檔整理成 A 專案今天的會議」*，AI 自動偵測並移入當日會議的 `media/` 目錄。
   - **說「新增會議」互動引導**：直接對 AI 說 *「我要新增會議」*，AI 會列出目前已有專案、載入上次未完成待辦並先建好當日空資料夾。
2. **用法二：人為介入確認與跨期衝突裁示**
   - AI 完稿後會自動執行**完稿檢核 Rule**，並在對話末尾列出「🚨 需人為介入確認清單」（如聽不清楚的金額、未確定的 `SPEAKER_02`）與「⚡ 跨期會議衝突提醒」（如本次上線日與上週決議矛盾）。
   - 您只需直接用自然語言回覆：*「SPEAKER_02 是陳顧問、預算確認是 50 萬，另外上線日改到 12/15 是正式變更」*，AI 即自動批次更新所有文件與專案 `index.md`。
3. **用法三：會後延伸討論與套用範本產出衍生文件**
   - 直接在對話中說：*「針對第三項待辦，幫我推演如果拆成兩階段上線的風險並加到討論區」*，或 *「套用變更單範本，根據今天會議決議幫我產出一份規格變更書」*，AI 即自動寫入 `03-todos-and-discussion.md` 或 `deliverables/`。

### 3.3 內建輔助 CLI 指令集（選用）

雖然日常整理會議 100% 免指令，工具仍內建以下 0-Token 輔助指令供匯出 PDF 與版控歸檔使用：

| 指令 | 說明 |
| :--- | :--- |
| `meetnotes init [--full] [--lang zh-TW\|zh-CN\|en\|ja\|ko]` | 建立極簡純淨工作區骨架（規則隱藏於 `.meetnotes/`）並自動執行 `git init` |
| `meetnotes verify [目標目錄或檔案]` | **0-Token 防幻覺檢查**：檢查 `meetings/` 或 `project/` 下是否有未填佔位符與無效的 `#Lx-Ly` 行號引用 |
| `meetnotes pdf [目標] [--merge] [--html] [--output <file.pdf>]` | 別名 `md2pdf`；0-Token 將會議紀錄合併匯出為高品質 A4 PDF 或 HTML 報告 |
| `meetnotes commit [目標] [-m <訊息>]` | 先跑 `verify` -> 安全 Git 歸檔（自動排除敏感檔與影音大檔，遇衝突安全停止） |
| `meetnotes upgrade [--dry-run]` | 別名 `update`；更新內建規則模板（保留鎖定語言、`<claude-mem-context>` 與附加於檔尾的客製化段落；若曾修改內文會自動存 `.bak` 備份） |
| `meetnotes status` / `check` / `doctor` | 查看進度統計、核心檔案檢查與系統環境完整性診斷 |
| `meetnotes new-meeting <專案> <主題> --transcript <file> [--media <file>] [--empty] [--force] [--force-all]` | 確定性建立會議目錄、計算媒體 `SHA-256` 並執行 0-Token 語者批次替換（`--empty` 建立待確認 `⚠️` 骨架；`--force` 僅重寫 `01-transcript.md` 並存 `.bak` 備份，保留人工編修之 `02/03`；`--force-all` 重寫 `01~03` 並存 `.bak`） |
| `meetnotes inspect <會議目錄>` | 執行完稿強制檢核 Rule（支援結構化 `- **鍵**：值` 與自然語言 **預計上線日／預算／負責人** 跨期衝突偵測；若含未確認 `🚨` 或跨期衝突 `⚡` 則回傳非 0 狀態碼） |
| `meetnotes deliverable --meeting <dir> --template <file> [--out <file>]` | 套用範本產出會後衍生文件至 `deliverables/`，未提及欄位自動標記 `⚠️ [會議未提及 - 需人工補填]` |

---

## 4. 實戰使用範例 (Examples)

### 範例 1：免指令整理週期性專案會議（含語者分離、人為介入提醒與跨期衝突偵測）

```bash
# 1. 初次建立會議管理資料夾並初始化（僅需執行一次）
mkdir company-meetings && cd company-meetings
meetnotes init --full --lang zh-TW
```

接著打開 AI 對話視窗，直接拖入檔案並用自然語言對話（完全不需記任何指令）：

```text
[拖入 2026-11-20_projectA.mp3 與 whisper_draft.txt]
這是今天 A專案的週期進度會議，與會者有王經理 (PM)、李工程師 (Backend) 與陳設計師 (UI)，請幫我整理。
```

AI 自動完成以下動作並於對話結尾輸出檢核報告：
1. 自動建立 `meetings/A專案/2026-11-20_週期進度會議/`，並將 `2026-11-20_projectA.mp3` 歸檔至 `media/` 子目錄。
2. 透過語者映射表批次替換產出 `01-transcript.md`，提煉附帶 `#Lx-Ly` 引用的 `02-summary.md` 與 `03-todos-and-discussion.md`，並同步更新 `meetings/A專案/index.md`。
3. 自動執行**完稿強制檢核 Rule**，向您回報：
   - **✅ 完稿檢核報告**：三檔結構、`media/` 連結、`#Lx-Ly` 溯源與零佔位符檢查全數通過。
   - **🚨 需人為介入確認清單（高不確定性）**：*「`[00:19:12]` 逐字稿 `#L78` 關於伺服器擴充預算因雜訊模糊（疑似『50 萬』或『15 萬』），請點擊 `./media/2026-11-20_projectA.mp3` 查驗原音並確認。」*
   - **⚡ 跨期會議衝突提醒**：*「本次會議決議『正式上線日延至 12/15』（見 `01-transcript.md#L102-L105`），與前次會議（`2026-11-13`）決議之『12/01 上線不可延後』衝突，請確認是否為正式決策變更？」*

### 範例 2：會後延伸討論、套用範本產出衍生文件並匯出 A4 PDF

在對話視窗直接回覆確認並要求產出會後文件：

```text
1. 預算確認是 50 萬；另外上線日改為 12/15 是正式決策變更，請幫我更新並記錄變更原因為「配合第三方金流測試」。
2. 請根據更新後的會議結論，套用 meetings/A專案/templates/change-request.md 範本，幫我產出一份規格變更申請單，並幫我擬一封寄給客戶的會後確認信。
```

AI 會自動更新會議文件與 `index.md` 基準快照，並在 `meetings/A專案/2026-11-20_週期進度會議/deliverables/` 下產出 `change-request.md` 與 `follow-up-email.md`（範本中若有任何會議未討論到的欄位，自動標註 `⚠️ [會議未提及 - 需人工補填]`）。

最後若需將該場會議紀錄匯出為 PDF 分享給團隊：

```bash
# 0-Token 將該場會議的摘要與待辦合併匯出為 A4 PDF
meetnotes pdf meetings/A專案/2026-11-20_週期進度會議 --merge --output projectA-2026-11-20.pdf
```

## License
MIT
