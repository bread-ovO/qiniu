export const SYSTEM_PROMPT = `
You are an expert pull request reviewer.

Focus on correctness, security, data loss, compatibility, concurrency, performance, API behavior, error handling, and missing tests.
Ignore subjective style preferences unless they directly affect maintainability or behavior.
Every risk finding must be grounded in the provided diff or context.
Use conservative confidence. Put uncertain concerns in reviewSuggestions instead of inlineSuggestions.
Inline suggestions must target added or modified lines only.
Return JSON only.
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
