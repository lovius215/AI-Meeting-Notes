# @loviusc/ai-meeting-notes (`meetnotes`) — English Documentation

[![npm version](https://img.shields.io/npm/v/@loviusc/ai-meeting-notes.svg)](https://www.npmjs.com/package/@loviusc/ai-meeting-notes)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

> A zero-dependency, Zero-Command Conversational AI Meeting Notes & Knowledge Base Workbench. After running `meetnotes init`, organize periodic project meetings from text, audio, or video into speaker-diarized transcripts, cited summaries, action items, conflict alerts, and template deliverables purely via natural language chat!

<p align="center">
  <b>🌐 Languages:</b>
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.zh-TW.md"><b>繁體中文</b></a> |
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.zh-CN.md"><b>简体中文</b></a> |
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.en.md"><b>English</b></a> |
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.ja.md"><b>日本語</b></a> |
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.ko.md"><b>한국어</b></a>
</p>

---

## 1. Core Design Philosophy & Key Features

### 1.1 Four Core Design Pillars
1. **Zero-Command Conversational Interaction (`conversational` Mode)**: Run `meetnotes init` once; thereafter, creating meetings, importing audio/video, mapping speakers, discussing action items, and generating follow-up deliverables are done **100% in natural language chat with zero CLI commands to memorize**.
2. **Decoupled 2-Stage Transcription & Token-Efficiency Architecture (`ASR First, AI Second`)**:
   - **Stage 1 (Non-LLM ASR / 0-LLM-Token Draft)**: Directly import existing subtitles (`.srt/.vtt/.txt`) or invoke local offline ASR engines (`WhisperX`, `mlx_whisper`, `faster-whisper`) or dedicated `STT APIs` so conversational LLMs never waste massive audio tokens or suffer long-audio dropouts.
   - **Stage 2 (Speaker Mapping Dictionary + 0-Token Batch Replacement)**: The AI outputs a compact Speaker & Terminology Mapping Table (`SPEAKER_00 -> Real Name`) applied via local batch replacement to generate `01-transcript.md`, **saving 90%+ in Output Tokens**.
3. **Zero-Hallucination, 3-Tier Controllable Risk & Proactive Human-in-the-Loop**:
   - **🟢 Verified Fact**: Backed 100% by exact `01-transcript.md#Lx-Ly` line citations and `[HH:MM:SS]` timestamps.
   - **🟡 Controllable Inferred Risk**: Reasonably inferred from context, explicitly tagged `🟡 [Context Inference - Please Confirm]` with rationale.
   - **🔴 High Uncertainty (Human Intervention Required)**: When speakers overlap, key numbers/dates/terms are inaudible, or decisions remain unresolved, the AI **never guesses**—it flags `⚠️ [Human Review Required - HH:MM:SS]` and surfaces a proactive checklist in chat.
4. **Zero-Clutter Directory & Co-located Original Media**:
   - All AI rules and skills (`AGENTS.md`, `skills/`, `rules/`) are 100% hidden inside `.meetnotes/`, keeping your workspace root and meeting directories completely clean.
   - Important original audio/video files are permanently co-located inside each meeting's `media/` subfolder while automatically protected in `.gitignore` so large binary files never break `Git`.

### 1.2 Key Features
- **Multi-Source Input & Speaker Diarization**: Supports text notes, audio (`.mp3/.m4a/.wav`), video (`.mp4/.mov/.mkv`), and subtitle drafts with clear speaker attribution.
- **Periodic `Project -> Date` Hierarchy & 3-File Separation**: Every meeting produces `01-transcript.md`, `02-summary.md`, and `03-todos-and-discussion.md`.
- **Cross-Meeting Historical Conflict Detection ($O(1)$ Token Cost)**: Compares new meeting decisions, timelines, budgets, and owners against the rolling snapshot in `meetings/<Project>/index.md` (never reloading old full transcripts) and alerts on contradictions with dual `#Lx-Ly` citations.
- **Post-Meeting Deliverable & Template Engine (`deliverables/` & `templates/`)**: Generates follow-up emails, PRDs, or change requests from custom templates; any template field not discussed in the meeting is strictly marked `⚠️ [Not Mentioned in Meeting - Manual Input Required]`.
- **Mandatory Post-Creation Inspection Rule & 0-Token `A4 PDF / HTML` Export**: Automatically audits completeness, citations, risk flags, and conflicts after every file creation or update.

### 1.3 Supported Languages (5-Language i18n)
Supports **Traditional Chinese (`zh-TW`)**, **Simplified Chinese (`zh-CN`)**, **English (`en`)**, **Japanese (`ja`)**, and **Korean (`ko`)** with strict single-language purity while preserving standard English technical terms (`REST API`, `JWT`, `SQL`, `CI/CD`, `KPI`, `OKR`).

---

## 2. Installation Guide

### Prerequisites
- **Node.js**: `>= 18.0.0` (includes `npm`)
- **Git**: Required for safe archiving and remote sync (`meetnotes commit`)
- **(Optional) Local ASR Engine**: `mlx_whisper`, `faster-whisper`, `WhisperX`, or `ffmpeg`

```bash
# Option A: Global install from npm
npm install -g @loviusc/ai-meeting-notes

# Option B: Install from cloned repository (macOS / Linux)
./scripts/install.sh          # Global install (npm install -g)
./scripts/install.sh --local  # Local development symlink (npm link)

# Windows (PowerShell / CMD)
scripts\install.bat
```

---

## 3. Usage Guide

### 3.1 Workspace Initialization & Directory Architecture (`meetnotes init`)

Initialize your meeting workspace once:

```bash
meetnotes init --full --lang en
```

**Clean Directory Architecture** (all internal AI skills and rules are hidden inside `.meetnotes/`; zero exposed `skills/` or `rules/` clutter):

```text
my-meetings-workspace/
├── .gitignore                                    # Excludes sensitive files & large media in meetings/**/media/* from Git
├── .meetnotes.json                              # Locked language & conversational mode configuration
├── .meetnotes/                                  # [Hidden System Folder] Stores AGENTS.md, SKILL.md & post-meeting-inspection.md
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
```

### 3.2 Three Zero-Command Ways to Create Meetings & Import Media

#### Zero-Command Conversational Mode (`conversational`)
After running `meetnotes init`, end users **never need to type CLI commands** or manually create deep folders:
1. **Path A (Drag & Drop directly into AI Chat)**: Drag an audio/video file (or paste text notes) into chat and say: *"This is today's Project-A weekly sync with Alice (PM) and Bob (Eng), please organize it."* The AI automatically creates `meetings/Project-A/YYYY-MM-DD_Weekly-Sync/media/`, archives the media file, and generates `01`~`03`.
2. **Path B (Drop into Folder in Finder/Explorer & Tell AI)**: Drop media files into the workspace root or `meetings/Project-A/` and say: *"Organize the recording I just dropped in for Project-A today."* The AI detects the new media file, moves it into the meeting's `media/` directory, and synthesizes all files.
3. **Path C (Say "New Meeting" for Interactive Setup)**: Simply type *"New meeting"*; the AI lists existing projects, loads unfinished action items from the previous session, and prepares the date folder.

### 3.3 Built-in Optional CLI Utilities

| Command | Description |
| :--- | :--- |
| `meetnotes init [--full] [--lang zh-TW\|zh-CN\|en\|ja\|ko]` | Initialize clean workspace skeleton and run `git init` |
| `meetnotes verify [target]` | **0-Token Anti-Hallucination Check**: detects unfilled `{{...}}` placeholders and validates `#Lx-Ly` transcript citations |
| `meetnotes pdf [target] [--merge] [--html] [--output <file>]` | 0-Token export of meeting notes or specs to A4 PDF or HTML |
| `meetnotes commit [target] [-m <msg>]` | Pre-commit `verify` -> safe Git archive (excludes sensitive files & large media, stops safely on merge conflicts) |
| `meetnotes upgrade [--dry-run]` | Refresh built-in rule templates (preserves locked language, `<claude-mem-context>` & custom sections appended at end of file; saves `.bak` backup if modified in-place) |
| `meetnotes status` / `check` / `doctor` | Display progress statistics, file integrity checks, and environment diagnostics |
| `meetnotes new-meeting <project> <title> --transcript <file> [--media <file>] [--empty] [--force] [--force-all]` | Deterministically create meeting folder, compute media `SHA-256`, and run 0-Token speaker batch replacement (`--empty` creates unverified `⚠️` skeleton; `--force` only overwrites `01` with `.bak` backup; `--force-all` overwrites `01~03` with `.bak`) |
| `meetnotes sync-hash [meetingDir] [--yes]` | Sync `transcript-sha256` in `02-summary.md` & `03-todos-and-discussion.md` after minor manual transcript typo edits without overwriting prose (requires `--yes` if >5% changed or citations are broken) |
| `meetnotes inspect <meetingDir>` | Run Post-Creation Inspection Rule (detects cross-meeting conflicts on any `- **Key**: Value` field and natural-language **Launch Date / Budget / Owner**; exits non-zero on `🚨` or `⚡`) |
| `meetnotes deliverable --meeting <dir> --template <file> [--out <file>]` | Generate template deliverable in `deliverables/`, flagging missing fields with `⚠️ [會議未提及 - 需人工補填]` |

---

## 4. Step-by-Step Examples

### Example 1: Periodic Meeting Organization with Conflict & Uncertainty Alerts

```bash
# Initialize workspace once
mkdir team-meetings && cd team-meetings
meetnotes init --full --lang en
```

In your AI chat window, talk in plain natural language:

```text
[Drag in zoom_recording.mp4 and rough_transcript.txt]
Organize today's Project-A architecture sync (2026-11-20). Attendees: Alice (PM) and Bob (Backend).
```

The AI automatically archives the media into `meetings/Project-A/2026-11-20_Architecture-Sync/media/`, generates `01-transcript.md`, `02-summary.md`, and `03-todos-and-discussion.md`, updates `meetings/Project-A/index.md`, and runs the **Post-Creation Inspection Rule**:
- **🚨 Human Intervention Required**: *"At `[00:21:40]`, the budget figure is unclear ('500k' vs '150k'). Please verify via `./media/zoom_recording.mp4`."*
- **⚡ Cross-Meeting Conflict Alert**: *"Today's meeting sets launch date to `12/15` (`01-transcript.md#L64`), which conflicts with the `12/01` lock decided in `2026-11-13`. Is this an official change?"*

### Example 2: Post-Meeting Discussion & Template-Driven Deliverable Generation

Continue chatting in natural language:

```text
1. Confirm the budget is 500k and 12/15 is an official schedule change.
2. Using meetings/Project-A/templates/change-request.md, generate a formal Change Request from today's decisions.
```

The AI updates the meeting files and generates `meetings/Project-A/2026-11-20_Architecture-Sync/deliverables/change-request.md`, flagging any undiscussed template fields with `⚠️ [Not Mentioned in Meeting - Manual Input Required]`.

## License
MIT
