import { describe, expect, it } from "vitest";
import { buildDiffIndex, filterInlineSuggestions, shouldSkipFile } from "../src/diff.js";

describe("diff helpers", () => {
  it("indexes added lines from a unified diff", () => {
    const index = buildDiffIndex([
      {
        filename: "src/example.ts",
        status: "modified",
        additions: 2,
        deletions: 1,
        changes: 3,
        patch: [
          "@@ -10,3 +10,4 @@ export function demo() {",
          " const a = 1;",
          "-return a;",
          "+const b = 2;",
          "+return a + b;",
          "}"
        ].join("\n")
      }
    ]);

    expect(index.addedLinesByFile.get("src/example.ts")).toEqual(new Set([11, 12]));
  });

  it("keeps high-confidence inline comments on added lines", () => {
    const index = buildDiffIndex([
      {
        filename: "src/example.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        changes: 1,
        patch: ["@@ -1,1 +1,2 @@", " const a = 1;", "+const token = input;"].join("\n")
      }
    ]);

    const suggestions = filterInlineSuggestions(
      [
        { file: "src/example.ts", line: 2, severity: "high", confidence: 0.9, body: "Validate input." },
        { file: "src/example.ts", line: 1, severity: "high", confidence: 0.9, body: "Old line." },
        { file: "src/example.ts", line: 2, severity: "high", confidence: 0.6, body: "Low confidence." }
      ],
      index,
      5,
      0.75
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].body).toBe("Validate input.");
  });

  it("skips generated files", () => {
    expect(shouldSkipFile("package-lock.json")).toBe(true);
    expect(shouldSkipFile("src/generated/client.ts", ["src/generated/**"])).toBe(true);
    expect(shouldSkipFile("src/index.ts")).toBe(false);
  });
});
