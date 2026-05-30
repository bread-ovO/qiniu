import { describe, expect, it } from "vitest";
import { parseReport } from "../src/analyzer.js";
import { SYSTEM_PROMPT } from "../src/prompts.js";

describe("SYSTEM_PROMPT", () => {
  it("contains the required JSON output contract for chat-compatible models", () => {
    expect(SYSTEM_PROMPT).toContain("顶层对象必须严格包含");
    expect(SYSTEM_PROMPT).toContain("summary 和 changeType 必须是字符串");
    expect(SYSTEM_PROMPT).toContain("禁止把 summary 或建议项写成对象");
  });
});

describe("parseReport", () => {
  it("parses a valid review report", () => {
    const result = parseReport(
      JSON.stringify({
        summary: "更新本地调试说明。",
        changeType: "文档变更",
        riskLevel: "low",
        keyChanges: ["修正 Smee 命令"],
        riskFindings: [],
        reviewSuggestions: [],
        testSuggestions: [],
        inlineSuggestions: []
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.summary).toBe("更新本地调试说明。");
    }
  });

  it("returns a parse error for incompatible model output", () => {
    const result = parseReport(
      JSON.stringify({
        summary: { text: "结构错误" },
        reviewSuggestions: [{ text: "建议项错误" }]
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Expected string");
    }
  });
});
