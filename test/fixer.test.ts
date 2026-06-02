import { describe, expect, it } from "vitest";
import { parseFixPlan, validateFixPlan } from "../src/fixer.js";

describe("fixer helpers", () => {
  it("parses a valid fix plan", () => {
    const plan = parseFixPlan(
      JSON.stringify({
        summary: "修复空值判断。",
        confidence: 0.9,
        files: [{ path: "src/a.ts", reason: "补充空值保护", content: "export const a = 1;\n" }],
        verificationCommands: ["npm test"],
        risks: []
      })
    );

    expect(plan.files[0].path).toBe("src/a.ts");
  });

  it("filters files outside allowed snapshots and applies maxFiles", () => {
    const plan = validateFixPlan(
      {
        summary: "修复多个文件。",
        confidence: 0.9,
        files: [
          { path: "src/a.ts", reason: "允许", content: "a" },
          { path: "src/b.ts", reason: "允许", content: "b" },
          { path: "src/c.ts", reason: "越界", content: "c" }
        ],
        verificationCommands: ["npm test", "npm run build"],
        risks: []
      },
      [
        { path: "src/a.ts", content: "old" },
        { path: "src/b.ts", content: "old" }
      ],
      { dryRun: false, maxFiles: 1 }
    );

    expect(plan.files).toEqual([{ path: "src/a.ts", reason: "允许", content: "a" }]);
  });

  it("adds deterministic verification commands from package metadata", () => {
    const plan = validateFixPlan(
      {
        summary: "修复空值判断。",
        confidence: 0.9,
        files: [{ path: "src/a.ts", reason: "允许", content: "a" }],
        verificationCommands: ["npm test", "rm -rf dist"],
        risks: []
      },
      [{ path: "src/a.ts", content: "old" }],
      { dryRun: false, maxFiles: 1 },
      [{ path: "package.json", content: JSON.stringify({ scripts: { test: "vitest run", typecheck: "tsc --noEmit" } }) }]
    );

    expect(plan.verificationCommands).toEqual(["npm test", "npm run typecheck"]);
  });
});
