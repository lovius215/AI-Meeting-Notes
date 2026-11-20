# @loviusc/ai-meeting-notes (`meetnotes`) — 한국어 문서

[![npm version](https://img.shields.io/npm/v/@loviusc/ai-meeting-notes.svg)](https://www.npmjs.com/package/@loviusc/ai-meeting-notes)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

> 외부 의존성이 없는 명령어 불필요 대화형 AI 회의록 및 프로젝트 지식 관리 도구입니다. `meetnotes init` 실행 후 CLI 명령어 없이 텍스트, 녹음, 녹화 파일을 화자 분리 녹취록, 요약 및 결정사항, 할 일(To-Do), 이전 회의와의 충돌 알림, 템플릿 기반 산출물로 자연어 대화だけで 정리합니다!

<p align="center">
  <b>🌐 Languages:</b>
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.zh-TW.md"><b>繁體中文</b></a> |
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.zh-CN.md"><b>简体中文</b></a> |
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.en.md"><b>English</b></a> |
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.ja.md"><b>日本語</b></a> |
  <a href="https://github.com/loviusc/ai-meeting-notes/blob/main/README.ko.md"><b>한국어</b></a>
</p>

---

## 1. 핵심 설계 사상 및 주요 기능 (Core Design Philosophy & Key Features)

1. **명령어 없는 순수 자연어 대화 (`conversational` 모드)**: 최초 `meetnotes init` 1회 실행 후, 일상적인 회의 생성, 음성/영상 가져오기, 화자 매핑, 후속 토론 및 문서 생성은 **100% 자연어 채팅으로 진행**됩니다.
2. **「비-LLM 전용 음성인식 + AI 의미 보정」 2단계 분리 및 토큰 최적화 (`ASR First, AI Second`)**:
   - **Stage 1 (0 LLM Token 초안 추출)**: 기존 자막(`.srt/.vtt/.txt`) 또는 로컬 오프라인 엔진(`WhisperX`, `mlx_whisper`)을 활용하여 대용량 오디오로 인한 LLM 토큰 낭비를 방지합니다.
   - **Stage 2 (화자 매핑 사전 + 0-Token 일괄 치환)**: AI는 `SPEAKER_00 -> 실명` 및 전문용어 교정표만 출력하고 로컬 일괄 치환으로 `01-transcript.md`를 생성하여 **Output Token을 90% 이상 절감**합니다.
3. **환각(Hallucination) 제로, 3단계 리스크 관리 및 능동적 인간 개입 요청**:
   - **🟢 검증된 사실**(`01-transcript.md#Lx-Ly` 및 `[HH:MM:SS]` 근거), **🟡 문맥 추론 리스크**, **🔴 높은 불확실성(인간 개입 필요)** 3단계로 구분하며, 불확실한 화자나 수치, 미결 사항은 절대 추측하지 않고 `⚠️ [확인 필요 - HH:MM:SS]`로 표시하여 사용자에게 알립니다.
4. **깔끔한 폴더 구조, 원본 미디어 동시 보관 및 이전 회의와의 충돌 감지**:
   - `AGENTS.md`, `skills/`, `rules/`는 모두 숨김 폴더 `.meetnotes/`에 보관되어 작업 폴더에 불필요한 파일이 노출되지 않습니다.
   - 중요한 원본 녹음/녹화 파일은 각 회의 날짜 폴더의 `media/`에 영구 보관되며, `meetings/<프로젝트>/index.md` 스냅샷($O(1)$ 토큰 비용)을 통해 이전 회의 결정사항과 충돌 시 **⚡ 회의 간 충돌 알림**을 제공합니다.
- **지원 언어 (5개 국어 i18n)**: 繁體中文 (`zh-TW`), 簡體中文 (`zh-CN`), English (`en`), 日本語 (`ja`), 한국어 (`ko`).

---

## 2. 설치 가이드 (Installation Guide)

- **Node.js**: `>= 18.0.0` (`npm` 포함) / **Git**

```bash
npm install -g @loviusc/ai-meeting-notes
# 또는 저장소 스크립트 실행
./scripts/install.sh
scripts\install.bat
```

---

## 3. 사용 방법 및 폴더 구조 설명 (Usage Guide & Folder Structure)

```bash
meetnotes init --full --lang ko
```

```text
my-meetings-workspace/
├── .gitignore                                    # 민감 파일 및 meetings/**/media/* 대용량 미디어 Git 자동 제외
├── .meetnotes.json                              # 고정 언어 및 conversational 모드 설정
├── .meetnotes/                                  # [숨김 폴더] AGENTS.md, SKILL.md 및 완료 후 검수 규칙(rules/) 보관
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
```

---

## 4. 실전 사용 예제 (Examples)

```text
[recording.mp4 파일을 채팅창에 드래그]
오늘 진행한 Project-A 주간 회의야. 참석자는 김 팀장(PM)과 이 개발자(Backend)니까 정리해 주고, templates/change-request.md 템플릿으로 변경요청서도 만들어줘.
```

AI가 3개 회의 문서와 파생 문서를 생성한 뒤 **완료 검수 Rule**을 자동 실행하여, 불확실한 항목(🚨)과 이전 회의 결정사항과의 충돌(⚡), 템플릿 내 미언급 항목(`⚠️ [회의 미언급 - 수동 입력 필요]`)을 정확히 보고합니다.

## License
MIT
