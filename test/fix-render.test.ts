import { describe, expect, it } from "vitest";
import { renderFixResult } from "../src/fix-render.js";

describe("renderFixResult", () => {
  it("renders dry-run fix results in Chinese", () => {
    const markdown = renderFixResult({
      dryRun: true,
      committed: false,
      commitSha: "abc123",
      verificationCheckUrl: "https://github.com/bread-ovO/qiniu/runs/1",
      verificationWorkflowDispatched: true,
      fallbackReason: "dry-run 模式只生成修复计划。",
      plan: {
        summary: "修复空值判断。",
        confidence: 0.9,
        files: [{ path: "src/a.ts", reason: "补充空值保护", content: "export const a = 1;\n" }],
        verificationCommands: ["npm test"],
        risks: ["需要人工确认边界条件。"]
      }
    });

    expect(markdown).toContain("## AI 自动修复");
    expect(markdown).toContain("dry-run");
    expect(markdown).toContain("src/a.ts");
    expect(markdown).toContain("### 验证计划");
    expect(markdown).toContain("npm test");
    expect(markdown).toContain("**Check Run：** https://github.com/bread-ovO/qiniu/runs/1");
    expect(markdown).toContain("**Actions 验证：** 已触发");
    expect(markdown).toContain("需要人工确认边界条件");
  });
});
