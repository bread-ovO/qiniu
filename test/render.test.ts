import { describe, expect, it } from "vitest";
import { renderProcessingComment, renderReport } from "../src/render.js";
import type { AnalysisResult } from "../src/types.js";

describe("render", () => {
  it("renders visible report text in Chinese", () => {
    const result: AnalysisResult = {
      durationMs: 1234,
      scannedFiles: 2,
      skippedFiles: [],
      options: {
        mode: "all",
        maxInlineComments: 3,
        minInlineConfidence: 0.8,
        maxDiffChars: 50000,
        policy: { ignorePaths: [], reviewInstructions: [] }
      },
      report: {
        summary: "修复登录校验。",
        changeType: "缺陷修复",
        riskLevel: "medium",
        keyChanges: ["调整 token 校验逻辑"],
        riskFindings: [],
        reviewSuggestions: ["确认过期 token 的处理路径"],
        testSuggestions: ["补充 token 过期用例"],
        inlineSuggestions: []
      }
    };

    const markdown = renderReport(result);

    expect(markdown).toContain("## AI 代码评审");
    expect(markdown).toContain("风险等级");
    expect(markdown).toContain("评审建议");
    expect(markdown).toContain("未发现高置信度风险");
    expect(markdown).toContain("报告 + 行内建议");
  });

  it("renders processing text in Chinese", () => {
    expect(renderProcessingComment()).toContain("正在分析，请稍候。");
  });
});
