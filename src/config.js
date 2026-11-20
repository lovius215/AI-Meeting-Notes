'use strict';

/**
 * Central Configuration for @loviusc/genaitool
 * Extracted as variables so derived tools can modify a single file.
 */
const PACKAGE_NAME = process.env.GENAITOOL_PACKAGE_NAME || '@loviusc/ai-meeting-notes';
const CLI_NAME = process.env.GENAITOOL_CLI_NAME || 'meetnotes';
const VERSION = '1.1.0';
const GITHUB_REPO = 'https://github.com/loviusc/ai-meeting-notes';

const DEFAULT_LANG = 'zh-TW';
const SUPPORTED_LANGS = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'];

const CONFIG_FILENAME = `.${CLI_NAME}.json`;
const HIDDEN_DIR = `.${CLI_NAME}`;
const DEFAULT_HIDE_SKILLS = true;

/**
 * Supported AI Tool Interaction Modes:
 * - conversational: Zero-command natural language AI Agent Skill / Workbench (e.g., Travel Planner, Copywriting Coach)
 * - workbench: Conversational workflow + CLI utilities (init, verify, pdf, commit) without rigid stage CLI commands
 * - cli: Full CLI-driven staged pipeline + strict #Lx-Ly source verification (like @loviusc/refactor-analyze & @loviusc/sa-spec)
 */
const TOOL_MODES = ['conversational', 'workbench', 'cli'];
const DEFAULT_MODE = 'conversational';

/**
 * Technical terms that MUST remain in original English across all non-English languages
 */
const PRESERVED_TECH_TERMS = [
  'REST API',
  'GraphQL',
  'gRPC',
  'JWT',
  'OAuth',
  'DTO',
  'DAO',
  'ORM',
  'SQL',
  'NoSQL',
  'JSON',
  'YAML',
  'Markdown',
  'HTML',
  'CSS',
  'PDF',
  'CLI',
  'SDK',
  'npm',
  'Node.js',
  'Git',
  'GitHub Actions',
  'Token',
  'Prompt',
  'Agent',
  'Skill',
  'Webhook',
  'CI/CD'
];

/**
 * Sensitive file patterns automatically excluded during `<cli> commit`
 */
const SENSITIVE_PATTERNS = [
  /^\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /^\.npmrc$/i,
  /^credentials\.json$/i,
  /^secrets?(\..+)?\.(json|ya?ml|env)$/i,
  /^id_rsa(\..+)?$/i
];

/**
 * Default project stages in `project/`
 */
const STAGES = [
  {
    id: '01',
    file: '01-spec.md',
    key: 'stage01',
    titles: {
      'zh-TW': '工具定位與互動模式規格書',
      'zh-CN': '工具定位与交互模式规格书',
      'en': 'Tool Positioning & Interaction Mode Specification',
      'ja': 'ツール位置付けと対話モード仕様書',
      'ko': '도구 포지셔닝 및 인터랙션 모드 명세서'
    }
  },
  {
    id: '02',
    file: '02-workflow.md',
    key: 'stage02',
    titles: {
      'zh-TW': '業務流程與產出文件結構設計',
      'zh-CN': '业务流程与产出文档结构设计',
      'en': 'Workflow & Output Document Architecture',
      'ja': '業務フローと成果物ドキュメント構造設計',
      'ko': '비즈니스 워크플로우 및 산출물 구조 설계'
    }
  },
  {
    id: '03',
    file: '03-agent-rules.md',
    key: 'stage03',
    titles: {
      'zh-TW': 'AI Agent 技能引導與防幻覺檢核規則',
      'zh-CN': 'AI Agent 技能引导与防幻觉检核规则',
      'en': 'AI Agent Skill Guidance & Anti-Hallucination Rules',
      'ja': 'AI Agent スキル誘導とハルシネーション防止ルール',
      'ko': 'AI Agent 스킬 가이드 및 환각 방지 검증 규칙'
    }
  },
  {
    id: '04',
    file: '04-release-plan.md',
    key: 'stage04',
    titles: {
      'zh-TW': '腳手架生成與驗收發布計畫',
      'zh-CN': '脚手架生成与验收发布计划',
      'en': 'Scaffolding Generation & Release Plan',
      'ja': 'スキャフォールド生成とリリーステスト計画',
      'ko': '스캐폴딩 생성 및 릴리스 검증 계획'
    }
  }
];

module.exports = {
  PACKAGE_NAME,
  CLI_NAME,
  VERSION,
  GITHUB_REPO,
  DEFAULT_LANG,
  SUPPORTED_LANGS,
  CONFIG_FILENAME,
  HIDDEN_DIR,
  DEFAULT_HIDE_SKILLS,
  TOOL_MODES,
  DEFAULT_MODE,
  PRESERVED_TECH_TERMS,
  SENSITIVE_PATTERNS,
  STAGES
};
