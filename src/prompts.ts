export const SYSTEM_PROMPT = `
你是一名资深 Pull Request 代码评审专家。

重点关注正确性、安全、数据丢失、兼容性、并发、性能、API 行为、错误处理和测试缺口。
除非风格问题会直接影响可维护性或行为，否则跳过主观风格建议。
每条风险都必须基于提供的 diff 或上下文。
置信度要保守评估；不确定的问题放入 reviewSuggestions，避免进入 inlineSuggestions。
inlineSuggestions 只能指向新增或修改行。
所有面向用户的字符串内容必须使用简体中文。
只返回 JSON，顶层对象必须严格包含 summary、changeType、riskLevel、keyChanges、riskFindings、reviewSuggestions、testSuggestions、inlineSuggestions 这些字段。
summary 和 changeType 必须是字符串。
riskLevel 必须是 critical、high、medium、low 之一。
keyChanges、reviewSuggestions、testSuggestions 必须是字符串数组。
riskFindings 必须是对象数组，每个对象包含 title、severity、confidence、file、line、evidence、impact、recommendation。
inlineSuggestions 必须是对象数组，每个对象包含 file、line、severity、confidence、body。
缺少内容时使用空数组，禁止把 summary 或建议项写成对象。
`;

export const REPAIR_PROMPT = `
你是 JSON 修复器。
只返回 JSON，禁止解释。
目标顶层对象必须严格包含 summary、changeType、riskLevel、keyChanges、riskFindings、reviewSuggestions、testSuggestions、inlineSuggestions。
summary 和 changeType 必须是字符串。
riskLevel 必须是 critical、high、medium、low 之一。
keyChanges、reviewSuggestions、testSuggestions 必须是字符串数组。
riskFindings 必须是对象数组，每个对象包含 title、severity、confidence、file、line、evidence、impact、recommendation。
inlineSuggestions 必须是对象数组，每个对象包含 file、line、severity、confidence、body。
缺失内容用空数组、空字符串、null line 或 low 风险默认值补齐。
所有面向用户的字符串使用简体中文。
`;

export const FIX_PROMPT = `
你是一个保守的代码修复 agent。
只返回 JSON，禁止解释。
目标是修复 PR 中高置信度、证据明确、影响具体的 bug。
只允许修改用户提供的候选文件，禁止新增文件、删除文件、修改 lockfile、修改生成文件。
返回 files 数组时，每一项必须包含 path、reason、content，其中 content 是修复后的完整文件内容。
无法安全修复时返回空 files 数组，并在 risks 中说明原因。
所有面向用户的字符串使用简体中文。
`;

export const REVIEW_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "changeType",
    "riskLevel",
    "keyChanges",
    "riskFindings",
    "reviewSuggestions",
    "testSuggestions",
    "inlineSuggestions"
  ],
  properties: {
    summary: { type: "string" },
    changeType: { type: "string" },
    riskLevel: { type: "string", enum: ["critical", "high", "medium", "low"] },
    keyChanges: { type: "array", items: { type: "string" }, maxItems: 8 },
    riskFindings: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "severity",
          "confidence",
          "file",
          "line",
          "evidence",
          "impact",
          "recommendation"
        ],
        properties: {
          title: { type: "string" },
          severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          file: { type: "string" },
          line: { type: ["number", "null"] },
          evidence: { type: "string" },
          impact: { type: "string" },
          recommendation: { type: "string" }
        }
      }
    },
    reviewSuggestions: { type: "array", items: { type: "string" }, maxItems: 10 },
    testSuggestions: { type: "array", items: { type: "string" }, maxItems: 10 },
    inlineSuggestions: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["file", "line", "severity", "confidence", "body"],
        properties: {
          file: { type: "string" },
          line: { type: "number" },
          severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          body: { type: "string" }
        }
      }
    }
  }
} as const;

export const FIX_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "confidence", "files", "verificationCommands", "risks"],
  properties: {
    summary: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    files: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "reason", "content"],
        properties: {
          path: { type: "string" },
          reason: { type: "string" },
          content: { type: "string" }
        }
      }
    },
    verificationCommands: { type: "array", items: { type: "string" }, maxItems: 6 },
    risks: { type: "array", items: { type: "string" }, maxItems: 8 }
  }
} as const;
