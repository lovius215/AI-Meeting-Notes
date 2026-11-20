# @loviusc/ai-meeting-notes (`meetnotes`) — 简体中文说明书

[![npm version](https://img.shields.io/npm/v/@loviusc/ai-meeting-notes.svg)](https://www.npmjs.com/package/@loviusc/ai-meeting-notes)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

> 零外部依赖的免指令对话式 AI 周期性会议整理与知识库工具（安装并执行 `meetnotes init` 后，日常无需输入任何 CLI 指令，直接用自然语言对话即可将文字、录音、录像转化为语者分离逐字稿、摘要重点、待办事项与会后衍生文档）。

<p align="center">
  <b>🌐 Languages:</b>
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.zh-TW.md"><b>繁體中文</b></a> |
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.zh-CN.md"><b>简体中文</b></a> |
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.en.md"><b>English</b></a> |
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.ja.md"><b>日本語</b></a> |
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.ko.md"><b>한국어</b></a>
</p>

---

## 1. 核心设计思想与功能总览 (Core Design Philosophy & Key Features)

### 1.1 四大核心设计思想 (Core Design Philosophy)
1. **免指令纯自然语言交互 (`Zero-Command Conversational Mode`)**：仅需在初始化工作区时执行一次 `meetnotes init`，日常新建会议、汇入录音/录像、校对发言人、追踪待办与会后讨论**100% 通过自然语言聊天完成，零 CLI 指令负担**。
2. **「非 LLM 专用转录 + AI 语义后处理」二阶段解耦与极致省 Token (`ASR First, AI Second`)**：
   - **Stage 1（0 LLM Token 取得初稿）**：支持直接汇入会议软件/录音笔现成字幕（`.srt/.vtt/.txt`）或自动调用本地离线语音引擎（`WhisperX` / `mlx_whisper` / `faster-whisper`）及专用 `STT API`，不让对话型 LLM 直接硬啃数百 MB 音频。
   - **Stage 2（字典映射 + 0-Token 批次替换）**：AI 仅输出精简的「语者代号（`SPEAKER_00 -> 真实姓名`）与同音专有名词映射表」，由本地批次替换生成 `01-transcript.md`（**节省 90%+ Output Token**）。
3. **零幻觉、三级可控风险与高不确定性主动请求人为介入 (`Zero-Hallucination & 3-Tier Risk Control`)**：
   - **🟢 已验证事实**：100% 附带指向 `01-transcript.md#Lx-Ly` 的真实行号与 `[HH:MM:SS]` 时间戳引用。
   - **🟡 可控推论风险**：依上下文合理推断但主动标明 `🟡 [上下文推论 - 建议确认]` 与推论理由。
   - **🔴 高不确定性需人为介入**：当遇到多人重叠发言无法确认语者、关键金额/日期/数据听不清楚、或会议争议未明确拍板时，**严禁 AI 瞎猜或脑补**，强制标记 `⚠️ [需人为确认 - HH:MM:SS]` 并在对话中主动列出「🚨 需人为介入确认清单」。
4. **极简纯净目录与重要多媒体同目录永久保存 (`Zero-Clutter Folder & Co-located Media`)**：
   - 所有底层引导规则（`AGENTS.md`、`skills/`、`rules/`）100% 隐藏收纳于 `.meetnotes/`，**绝不在工作区根目录或会议文件夹产生任何多余外露系统文件**。
   - 原始录音（`.mp3/.m4a/.wav`）与录像（`.mp4/.mov/.mkv`）直接保存在当次会议日期目录下的 `media/` 子目录中，与三份会议文档永久绑定，同时通过 `.gitignore` 自动排除大体积二进制影音档，避免卡死 `Git`。

### 1.2 核心功能一览 (Key Features)
- **多来源输入与语者分离 (`Speaker Diarization`)**：支持文字速记、录音、录像与字幕初稿，自动区分并实名标记「谁说了什么」。
- **周期性「项目主题 -> 日期」双层归档与三档分离**：每次会议固定产出 `01-transcript.md`（语者逐字稿）、`02-summary.md`（执行摘要、核心重点与决议）、`03-todos-and-discussion.md`（待办事项表与会后延伸讨论区）。
- **跨场次历史会议冲突主动提醒 (`Cross-Meeting Conflict Alert`)**：通过读取项目 `index.md` 滚动基准快照（$O(1)$ 常数 Token 消耗），自动比对本次会议与之前会议在决议、时程、预算或负责人上的矛盾，并以「本次 `#Lx-Ly` vs. 前次日期 `#Lx-Ly`」主动提醒。
- **会后衍生文档与范本套用引擎 (`Deliverables & Templates`)**：支持套用 `templates/` 自定义范本（如变更单、PRD、客户确认信）将会议结论自动生成至 `deliverables/`；范本中未在会议提及的栏位强制标记 `⚠️ [会议未提及 - 需人工补填]`。
- **完稿后强制检核 `Rule` 与 0-Token `A4 PDF / HTML` 导出**：每次建档或更新后自动执行完稿检核 Rule 并输出检核报告；支持一键导出高品质 `A4 PDF` 或 `HTML`。

### 1.3 支持语言与国际化规范 (Supported Languages & 5-Language i18n)
| 语言代码 | 语言名称 | 语言纯粹性与技术名词规范 |
| :--- | :--- | :--- |
| `zh-TW` | 繁體中文（预设） | 锁定语系后产出 100% 使用该语言；标准技术名词（`REST API`, `JWT`, `SQL`, `CI/CD`, `KPI`, `OKR` 等）保留原生英文 |
| `zh-CN` | 简体中文 | 完整支持简体中文会议转录整理与多语系说明文档 |
| `en` | English | Full English meeting transcription, synthesis, and verification support |
| `ja` | 日本語 | 日本語での議事録作成・話者分離・タスク管理に完全対応 |
| `ko` | 한국어 | 한국어 회의록 정리, 화자 분리 및 액션 아이템 관리 완벽 지원 |

---

## 2. 安装说明 (Installation Guide)

### 环境需求
- **Node.js**: `>= 18.0.0`（内置 `npm`）
- **Git**: 用于安全归档与远端同步（`meetnotes commit`）
- **（选用）本地语音转录工具**：如 `mlx_whisper`、`faster-whisper`、`WhisperX` 或 `ffmpeg`（亦支持直接汇入外部已转好的字幕初稿 + 原始影音）

```bash
# 方式 A：通过 npm 全局安装
npm install -g @loviusc/ai-meeting-notes

# 方式 B：在克隆的仓库中使用跨平台脚本安装 (macOS / Linux)
./scripts/install.sh          # 全局安装
./scripts/install.sh --local  # 本地开发软链接 (npm link)

# Windows (PowerShell / CMD)
scripts\install.bat
```

---

## 3. 使用说明 (Usage Guide)

### 3.1 工作区初始化与资料夹结构说明 (`Folder Architecture`)

在您的会议管理文件夹中执行一次初始化：

```bash
meetnotes init --full --lang zh-CN
```

**极简纯净的资料夹结构说明**（所有 AI 技能与完稿检核 `rules` 均隐藏于 `.meetnotes/`，工作区绝无多余外露杂项文件）：

```text
my-meetings-workspace/
├── .gitignore                                    # 自动排除敏感档与 meetings/**/media/* 影音大档（防卡死 Git）
├── .meetnotes.json                              # 锁定语系与 conversational 免指令模式设定
├── .meetnotes/                                  # [隐藏系统目录] 收纳 AGENTS.md、SKILL.md 与 post-meeting-inspection.md 检核规则
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
```

### 3.2 日常免指令新建会议与汇入媒体的 3 种方式 (VS Code / Claude / Gemini / Cursor / Antigravity)

#### 免指令自然语言对话模式 (`conversational`)
完成 `meetnotes init` 后，日常使用**完全不需要输入任何 CLI 指令**，支持以下 3 种最顺手的方式新建会议并汇入媒体：
1. **方式 A（对话框直接拖入影音/文字，AI 全自动建档归位）**：直接把桌面或下载区的 `.mp3` / `.mp4`（及选用字幕初稿）拖进 AI 对话框，说：*“这是今天 A 专案的周会录音，与会者有王经理跟李工，帮我整理”*。AI 会自动建立 `meetings/A专案/YYYY-MM-DD_周会/media/`、将影音档归位保存，并产出 `01`~`03` 三份文档。
2. **方式 B（档案总管随手丢进目录，AI 自动侦测归位）**：在 Finder / 档案总管把影音档随手丢进工作区根目录或 `meetings/A专案/` 下，对 AI 说：*“帮我把刚放进去的录像整理成 A 专案今天的会议”*。AI 会自动扫描并移入当次会议的 `media/` 子目录后完成整理。
3. **方式 C（说“新增会议”启动互动引导）**：对 AI 说 *“新增会议”*，AI 会主动列出已有专案供选择、预先载入上次未完成待办并建好当日 `media/` 文件夹。

### 3.3 内置辅助 CLI 指令集（选用）

| 指令 | 说明 |
| :--- | :--- |
| `meetnotes init [--full] [--lang zh-TW\|zh-CN\|en\|ja\|ko]` | 初始化极简纯净工作区骨架并自动执行 `git init` |
| `meetnotes verify [目标]` | **0-Token 防幻觉检查**：检查未填 `{{...}}` 占位符与 `#Lx-Ly` 逐字稿行号引用真实性 |
| `meetnotes pdf [目标] [--merge] [--html] [--output <file>]` | 0-Token 将会议记录或规格合并导出为高品质 A4 PDF 或 HTML |
| `meetnotes commit [目标] [-m <消息>]` | 先跑 `verify` -> 安全 Git 归档（自动排除敏感档与影音大档，遇冲突安全停止） |
| `meetnotes status` / `check` / `doctor` | 查看进度统计、核心文件检查与环境完整性诊断 |

---

## 4. 实战使用范例 (Examples)

### 范例 1：新建周期性专案会议、自动侦测跨期冲突与人为介入提醒

```bash
# 初次建立会议知识库（仅需执行一次）
mkdir team-meetings && cd team-meetings
meetnotes init --full --lang zh-CN
```

接着在 AI 聊天窗口直接用自然语言对话（无需任何指令）：

```text
[拖入 zoom_recording.mp4 与 rough_transcript.txt]
这是今天 A专案 (2026-11-20) 的架构同步会议，出席者有王经理 (PM) 和李工 (Backend)，请帮我整理。
```

AI 会自动完成归档与三档提炼，并在回复末尾自动执行**完稿检核 Rule**：
- 自动建立 `meetings/A专案/2026-11-20_架构同步会议/`，将 `zoom_recording.mp4` 移入 `media/`。
- 产出实名化 `01-transcript.md`、附 `#Lx-Ly` 引用的 `02-summary.md` 与 `03-todos-and-discussion.md`，并更新 `meetings/A专案/index.md`。
- 主动弹出提醒：
  - **🚨 需人为介入确认清单**：*“`[00:21:40]` 预算金额听不清楚（疑似 50 万或 15 万），请点击 `./media/zoom_recording.mp4` 确认原音。”*
  - **⚡ 跨期会议冲突提醒**：*“本次会议提到上线日改为 `12/15`（见 `01-transcript.md#L64`），与 `2026-11-13` 会议决议的 `12/01` 冲突，请确认是否为正式变更？”*

### 范例 2：会后延伸讨论与套用范本产出衍生文档 (`deliverables/`)

在同一个对话窗口继续用自然语言说：

```text
1. 刚刚那个预算金额确认是 50 万，上线日 12/15 是正式变更，帮我更新进去。
2. 另外请根据今天确认的决议，套用 meetings/A专案/templates/change-request.md 范本，帮我产出一份规格变更单。
```

AI 会立即更新 `01`~`03` 与 `index.md` 基准快照，并在 `meetings/A专案/2026-11-20_架构同步会议/deliverables/change-request.md` 产出变更单（若范本中有“法务审核人”栏位在会议中未提及，AI 会自动标注 `⚠️ [会议未提及 - 需人工补填]`，绝不产生幻觉）。

## License
MIT
