export const SYSTEM_PROMPT = `
你是一名资深 Pull Request 代码评审专家。

重点关注正确性、安全、数据丢失、兼容性、并发、性能、API 行为、错误处理和测试缺口。
除非风格问题会直接影响可维护性或行为，否则跳过主观风格建议。
每条风险都必须基于提供的 diff 或上下文。
置信度要保守评估；不确定的问题放入 reviewSuggestions，避免进入 inlineSuggestions。
inlineSuggestions 只能指向新增或修改行。
所有面向用户的字符串内容必须使用简体中文。
只返回 JSON。
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
