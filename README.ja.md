# @loviusc/ai-meeting-notes (`meetnotes`) — 日本語ドキュメント

[![npm version](https://img.shields.io/npm/v/@loviusc/ai-meeting-notes.svg)](https://www.npmjs.com/package/@loviusc/ai-meeting-notes)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

> 外部依存ゼロ・コマンド不要の対話型 AI 議事録＆プロジェクト知識管理ツール。`meetnotes init` 実行後は CLI コマンド不要で、テキスト・録音・録画から話者分離付き文字起こし、要約・決定事項、ToDo、過去会議との矛盾検知、テンプレート成果物を自然言語チャットだけで作成します！

<p align="center">
  <b>🌐 Languages:</b>
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.zh-TW.md"><b>繁體中文</b></a> |
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.zh-CN.md"><b>简体中文</b></a> |
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.en.md"><b>English</b></a> |
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.ja.md"><b>日本語</b></a> |
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.ko.md"><b>한국어</b></a>
</p>

---

## 1. 設計のコア思想と主な機能 (Core Design Philosophy & Key Features)

1. **コマンド不要の純粋な自然言語対話 (`conversational` モード)**：初回に `meetnotes init` を実行した後は、CLI コマンドを一切覚えることなく、普段のチャットだけで会議の新規作成、音声・動画の取り込み、話者名マッピング、会議後の議論や資料作成が完結します。
2. **「非 LLM 音声認識 + AI 意味補正」の二段階分離と徹底した省 Token 設計 (`ASR First, AI Second`)**：
   - **Stage 1（0 LLM Token で初稿取得）**：会議ツールの字幕（`.srt/.vtt/.txt`）の直接取り込み、またはローカル音声認識（`WhisperX` / `mlx_whisper`）と連携し、LLM に巨大な音声バイナリを直接読み込ませません。
   - **Stage 2（話者辞書マッピング + 0-Token 一括置換）**：AI は「`SPEAKER_00 -> 実名` と専門用語補正テーブル」のみを出力し、ローカル一括置換で `01-transcript.md` を生成するため **Output Token を 90% 以上削減**します。
3. **ハルシネーション（幻覚）ゼロ・3段階リスク管理と人間介入リクエスト (`3-Tier Risk Control`)**：
   - **🟢 検証済み事実**（`01-transcript.md#Lx-Ly` と `[HH:MM:SS]` 根拠付き）、**🟡 文脈推論リスク**、**🔴 高不確実性（要人間確認）**の3段階で管理。誰の発言か不明な箇所や聞き取れない数値、未決事項は勝手に推測せず `⚠️ [要確認 - HH:MM:SS]` と明示してユーザーに確認を求めます。
4. **クリーンなフォルダ構造と元メディアの同フォルダ保存 + 過去会議との矛盾検知**：
   - `AGENTS.md` や `skills/`、`rules/` はすべて隠しフォルダ `.meetnotes/` に格納され、作業フォルダを汚しません。
   - 重要な録音・録画ファイルは各会議フォルダ内の `media/` に永久保存され、過去会議の決定事項と矛盾がある場合は **⚡ 過去会議との矛盾アラート** を自動通知します。
- **対応言語（5言語 i18n）**：繁體中文 (`zh-TW`)、簡體中文 (`zh-CN`)、English (`en`)、日本語 (`ja`)、한국어 (`ko`)。

---

## 2. インストール手順 (Installation Guide)

- **Node.js**: `>= 18.0.0`（`npm` 同梱） / **Git**

```bash
# 方法 A：npm からグローバルインストール
npm install -g @loviusc/ai-meeting-notes

# 方法 B：クローンしたリポジトリのスクリプトを使用 (macOS / Linux / Windows)
./scripts/install.sh
scripts\install.bat
```

---

## 3. 使い方・フォルダ構造説明 (Usage Guide & Folder Structure)

```bash
meetnotes init --full --lang ja
```

```text
my-meetings-workspace/
├── .gitignore                                    # 機密ファイルと meetings/**/media/* の大容量メディアを Git から自動除外
├── .meetnotes.json                              # 固定言語と conversational モード設定
├── .meetnotes/                                  # [隠しフォルダ] AGENTS.md, SKILL.md, post-meeting-inspection.md ルールを格納
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
```

### 会議の新規作成とメディア取り込みの3つの方法（コマンド不要）
1. **チャット画面へ直接ドラッグ＆ドロップ**：「今日の Aプロジェクト定例会の録音です。参加者は田中と佐藤、整理して」と伝えるだけで自動で `meetings/Project-A/YYYY-MM-DD/media/` を作成・格納し3ファイルを生成します。
2. **Finder / エクスプローラーでフォルダに置いてAIに伝える**：メディアをフォルダに置いて「今入れた動画をAプロジェクトの会議として整理して」と伝えます。
3. **「新しい会議」と話しかける**：AI が既存プロジェクト一覧と前回の未完了 ToDo を提示してフォルダを準備します。

---

## 4. 実践サンプル・使用例 (Examples)

```text
[recording.mp4 をチャットにドラッグ]
今日の Project-A 仕様会議を整理して。その後、templates/change-request.md を使って変更申請書を deliverables/ に出力して。
```

AI は3ファイルを作成後、**完稿検核 Rule** を自動実行し、聞き取れない数値や過去会議との矛盾があればアラートを表示します。また、テンプレート内で会議中に言及されなかった項目は捏造せず `⚠️ [会議未言及 - 要手動追記]` と明記します。

> **補助 CLI コマンド**: `meetnotes verify` / `meetnotes inspect` / `meetnotes sync-hash [会議フォルダ] [--yes]`（文字起こしの誤字修正後に要約のハッシュを同期）/ `meetnotes pdf --merge` / `meetnotes commit`

## License
MIT
