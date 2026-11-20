# 04. npm 套件組裝與驗收發布計畫

## 產出與發布設定
- **目標輸出路徑**：`.`（直接在當前工作區根目錄原地組裝 `@loviusc/ai-meeting-notes` 可發布套件與免指令會議整理工作區模板）
- **套件與模式設定**：
  - **Package Name**：`@loviusc/ai-meeting-notes`
  - **CLI Bootstrap Command**：`meetnotes`（僅供初次 `init` 建立工作區或選用 `verify` / `pdf` / `commit` 輔助，日常會議整理為 100% `conversational` 免指令自然語言對話模式）
  - **預設會議結構模板**：內建 `meetings/<專案主題>/<YYYY-MM-DD_會議名稱>/`（含 `media/`、`01-transcript.md`、`02-summary.md`、`03-todos-and-discussion.md`、會後衍生文件區 `deliverables/`，以及專案級 `index.md` 與選用範本庫 `templates/`），支援二階段影音轉錄（非 LLM 專用 `ASR + Speaker Diarization` 與 AI 語意校正）及三級可控風險主動揭露引導規則
  - **純淨目錄封裝 (`hideSkillsRules: true` + `full: true`)**：啟用完整檢核規則集（包含會議文件建立後的五維度強制檢核 `rule`），並將所有底層 `skills/`、`rules/` 與 `AGENTS.md` 100% 隱藏收納於隱藏設定目錄內，不外露於使用者工作區根目錄或會議資料夾內，確保會議工具資料夾乾淨無多餘檔案
- **驗收檢查表**：
  - [ ] 通過 0-Token `verify` 檢查（確認 `project/01-spec.md` ~ `04-release-plan.md` 無任何未填佔位符且引用真實有效）
  - [ ] 執行 `genaitool build` / `genaitool pack` 組裝完整可發布的 npm 套件結構（含 5 語系 `README`、`AGENTS.md`、`SKILL.md` 與 `templates/`）
  - [ ] 執行 `npm test` 確認所有自動化測試通過
  - [ ] 準備透過 GitHub Actions (`.github/workflows/publish.yml`) 或 `npm publish --access public` 發布至 npm
